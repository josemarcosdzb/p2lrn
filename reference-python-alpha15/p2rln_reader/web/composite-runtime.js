import {dispatchRuntimeEvent} from './runtime-events.js';
import {NATIVE_COMPOSITE_STATE_VERSION, resolveCompositeChildren, sanitizeCompositeState, validateNativeComposite} from './native-composite-core.js';

function titleOf(entity) {
  const title = entity?.title ?? {};
  return title.es ?? title.en ?? Object.values(title)[0] ?? entity?.id ?? 'Actividad';
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export class CompositeRuntime {
  constructor(payload, {
    container,
    entity,
    package: pkg,
    renderActivity,
    eventTarget = null,
    adapter = null,
    context = {},
    clock = () => Date.now(),
  } = {}) {
    this.payload = validateNativeComposite(payload);
    this.container = container;
    this.entity = entity;
    this.package = pkg;
    this.children = resolveCompositeChildren(entity, pkg);
    this.childIds = this.children.map((child) => child.id);
    this.renderActivity = renderActivity;
    this.eventTarget = eventTarget;
    this.adapter = adapter;
    this.context = context;
    this.clock = clock;
    this.state = sanitizeCompositeState(null, this.childIds, {mode: this.payload.mode});
    this.saveQueue = Promise.resolve();
    this.destroyed = false;
    this.childStage = null;
    this.status = null;
    this.nav = null;
    this.prevButton = null;
    this.nextButton = null;
    this._onComplete = (event) => this.#childComplete(event);
    this._onScore = (event) => this.#childScore(event);
  }

  #emit(type, payload = {}) {
    return dispatchRuntimeEvent(this.eventTarget, type, payload, this.context, {clock: this.clock, adapter: this.adapter});
  }

  async mount() {
    if (typeof this.renderActivity !== 'function') throw new Error('El renderer composite necesita el callback de host renderActivity().');
    if (this.adapter?.loadState) {
      try {
        const loaded = await this.adapter.loadState(this.context);
        this.state = sanitizeCompositeState(loaded, this.childIds, {mode: this.payload.mode});
      } catch (error) {
        this.#emit('p2rln:error', {phase: 'loadState', error: String(error?.message ?? error)});
      }
    }
    this.#normalizeCompletion();
    this.#buildUi();
    this.eventTarget?.addEventListener?.('p2rln:complete', this._onComplete);
    this.eventTarget?.addEventListener?.('p2rln:score', this._onScore);
    await this.#renderCurrent();
    this.#emit('p2rln:activityready', {
      kind: 'native-composite',
      rendererId: this.context.rendererId ?? null,
      title: this.payload.title ?? titleOf(this.entity),
      childCount: this.children.length,
    });
    this.#emitProgress();
    return this;
  }

  destroy() {
    this.destroyed = true;
    this.eventTarget?.removeEventListener?.('p2rln:complete', this._onComplete);
    this.eventTarget?.removeEventListener?.('p2rln:score', this._onScore);
  }

  #buildUi() {
    this.container.replaceChildren();
    const shell = document.createElement('section'); shell.className = 'p2rln-composite';
    const heading = document.createElement('div'); heading.className = 'p2rln-composite__heading';
    const h2 = document.createElement('h2'); h2.textContent = this.payload.title ?? titleOf(this.entity);
    heading.append(h2);
    if (this.payload.description) { const p = document.createElement('p'); p.textContent = this.payload.description; heading.append(p); }
    const status = document.createElement('p'); status.className = 'p2rln-composite__status'; status.setAttribute('role', 'status'); heading.append(status); this.status = status;
    const nav = document.createElement('nav'); nav.className = 'p2rln-composite__nav'; nav.setAttribute('aria-label', 'Actividades del bloque'); this.nav = nav;
    const stage = document.createElement('div'); stage.className = 'p2rln-composite__stage'; this.childStage = stage;
    const actions = document.createElement('div'); actions.className = 'p2rln-composite__actions';
    const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = 'Anterior'; prev.addEventListener('click', () => void this.previous()); this.prevButton = prev;
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Siguiente'; next.addEventListener('click', () => void this.next()); this.nextButton = next;
    actions.append(prev, next);
    shell.append(heading, nav, stage, actions);
    this.container.append(shell);
    this.#refreshUi();
  }

  #index() {
    const index = this.childIds.indexOf(this.state.currentChild);
    return index >= 0 ? index : 0;
  }

  #canVisit(index) {
    if (this.payload.mode === 'free') return index >= 0 && index < this.children.length;
    if (index < 0 || index >= this.children.length) return false;
    if (index === 0) return true;
    const completed = new Set(this.state.completedChildren);
    for (let i = 0; i < index; i += 1) if (!completed.has(this.childIds[i])) return false;
    return true;
  }

  #refreshUi() {
    if (!this.nav) return;
    this.nav.replaceChildren();
    const completed = new Set(this.state.completedChildren);
    this.children.forEach((child, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${index + 1}. ${titleOf(child)}${completed.has(child.id) ? ' ✓' : ''}`;
      button.disabled = !this.#canVisit(index);
      if (child.id === this.state.currentChild) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => void this.goTo(child.id));
      this.nav.append(button);
    });
    const index = this.#index();
    if (this.prevButton) this.prevButton.disabled = this.payload.mode === 'free' || index <= 0;
    if (this.nextButton) {
      const atEnd = index >= this.children.length - 1;
      const currentDone = completed.has(this.childIds[index]);
      this.nextButton.disabled = this.payload.mode === 'free' || atEnd || !currentDone || !this.#canVisit(index + 1);
    }
    if (this.status) {
      this.status.textContent = this.state.completed
        ? `Bloque completado · ${completed.size}/${this.children.length} actividades.`
        : `${completed.size}/${this.children.length} actividades completadas.`;
    }
  }

  async #renderCurrent() {
    if (this.destroyed) return;
    const child = this.children[this.#index()];
    if (!child) return;
    this.state.currentChild = child.id;
    this.#refreshUi();
    await this.renderActivity(child.id, this.childStage, {parentContext: this.context});
  }

  async goTo(childId) {
    const index = this.childIds.indexOf(String(childId));
    if (!this.#canVisit(index)) return false;
    this.state.currentChild = this.childIds[index];
    this.#save();
    await this.#renderCurrent();
    return true;
  }

  async previous() {
    const index = this.#index();
    if (index <= 0) return false;
    return this.goTo(this.childIds[index - 1]);
  }

  async next() {
    const index = this.#index();
    if (index >= this.childIds.length - 1) return false;
    return this.goTo(this.childIds[index + 1]);
  }

  #isDirectChildEvent(event) {
    const entityId = event?.detail?.context?.entityId;
    if (typeof entityId !== 'string' || !this.childIds.includes(entityId)) return false;
    if (this.payload.mode === 'sequence' && entityId !== this.state.currentChild) return false;
    return true;
  }

  #childScore(event) {
    if (!this.#isDirectChildEvent(event)) return;
    const childId = event.detail.context.entityId;
    const payload = event.detail.event?.payload ?? event.detail;
    this.state.scores[childId] = clone(payload);
    this.#save();
  }

  #childComplete(event) {
    if (!this.#isDirectChildEvent(event)) return;
    const childId = event.detail.context.entityId;
    if (!this.state.completedChildren.includes(childId)) this.state.completedChildren.push(childId);
    this.#normalizeCompletion('children');
    this.#save();
    this.#refreshUi();
    this.#emitProgress();
  }

  #normalizeCompletion(reason = 'restored') {
    const count = this.state.completedChildren.length;
    const shouldComplete = this.payload.completion === 'all' ? count === this.children.length : count > 0;
    if (shouldComplete && !this.state.completed) {
      this.state.completed = true;
      this.state.completionReason = reason;
      this.#emit('p2rln:complete', {
        completedChildren: [...this.state.completedChildren],
        totalChildren: this.children.length,
        reason,
      });
    } else if (!shouldComplete) {
      this.state.completed = false;
      this.state.completionReason = null;
    }
  }

  #emitProgress() {
    this.#emit('p2rln:progress', {
      value: this.children.length ? this.state.completedChildren.length / this.children.length : 0,
      completed: this.state.completedChildren.length,
      total: this.children.length,
      kind: 'native-composite',
    });
  }

  #save() {
    const snapshot = clone({...this.state, version: NATIVE_COMPOSITE_STATE_VERSION});
    this.#emit('p2rln:statechange', {state: snapshot, kind: 'native-composite'});
    if (!this.adapter?.saveState) return;
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.adapter.saveState(snapshot, this.context)).catch((error) => {
      this.#emit('p2rln:error', {phase: 'saveState', error: String(error?.message ?? error)});
    });
  }
}

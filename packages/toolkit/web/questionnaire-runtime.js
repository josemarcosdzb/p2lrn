import {answerIsMeaningful, QuestionnaireSession} from './questionnaire-session.js';

function el(tag, attrs = {}, text = null) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else if (name === 'type') node.type = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else if (name.startsWith('aria-')) node.setAttribute(name, String(value));
    else node.setAttribute(name, String(value));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultAnswer(question) {
  if (question.type === 'ordering') return {order: [...question.items].reverse().map((item) => item.id)};
  if (question.type === 'matching') return {pairs: {}};
  if (question.type === 'classification') return {classifications: {}};
  if (question.type === 'fill-blanks') return {blanks: {}};
  if (['single-choice', 'multiple-choice', 'true-false'].includes(question.type)) return {choiceIds: []};
  if (question.type === 'text') return {text: ''};
  return {};
}

function disableControls(node) {
  if (node?.matches?.('input, textarea, select, button')) node.disabled = true;
  node?.querySelectorAll?.('input, textarea, select, button').forEach((control) => { control.disabled = true; });
}

export class QuestionnaireRuntime {
  constructor(payload, {eventTarget = null, adapter = null, context = {}, clock, autoTiming = true} = {}) {
    this.eventTarget = eventTarget;
    this.context = context;
    this.container = null;
    this.destroyed = false;
    this.notice = null;
    this.session = new QuestionnaireSession(payload, {
      eventTarget,
      adapter,
      context,
      clock,
      autoTiming,
      supportsQuestionTiming: true,
      activityKind: 'native-questionnaire',
      onTimingChange: () => { if (this.container && !this.destroyed) this.render(); },
    });
    this.payload = this.session.payload;
  }

  get state() { return this.session.state; }

  async mount(container) {
    this.container = container;
    await this.session.mount();
    this.render();
    return this;
  }

  destroy() {
    this.destroyed = true;
    this.session.destroy();
    if (this.container) this.container.replaceChildren();
  }

  getAnswer(question) {
    const stored = this.session.answer(question.id);
    return Object.keys(stored).length ? stored : defaultAnswer(question);
  }

  setAnswer(question, answer) {
    return this.session.replaceAnswer(question.id, answer);
  }

  answeredCount() { return this.session.answeredCount(); }
  progress() { return this.session.progress(); }

  async finish(options) {
    const score = await this.session.finish(options);
    if (!score) {
      const expired = new Set(this.state.timing?.expiredQuestions ?? []);
      const missing = this.payload.questions.filter((question) => question.required && !expired.has(question.id) && !answerIsMeaningful(question, this.state.answers[question.id]));
      this.notice = missing.length ? `Faltan ${missing.length} pregunta${missing.length === 1 ? '' : 's'} obligatoria${missing.length === 1 ? '' : 's'}.` : 'No se pudo finalizar la actividad.';
    } else {
      this.notice = null;
    }
    this.render();
    return score;
  }

  reset() {
    if (!this.session.reset()) return false;
    this.notice = null;
    this.render();
    return true;
  }

  render() {
    if (!this.container || this.destroyed) return;
    this.container.replaceChildren();
    const shell = el('section', {class: 'p2lrn-q-shell'});
    const header = el('header', {class: 'p2lrn-q-header'});
    header.append(el('h2', {}, this.payload.title));
    if (this.payload.description) header.append(el('p', {class: 'p2lrn-q-description'}, this.payload.description));
    const timing = this.session.timingSnapshot();
    if (!this.state.completed && (timing.attemptRemainingSeconds !== null || timing.questionRemainingSeconds !== null)) {
      const parts = [];
      if (timing.attemptRemainingSeconds !== null) parts.push(`Actividad: ${timing.attemptRemainingSeconds}s`);
      if (timing.questionRemainingSeconds !== null) parts.push(`Pregunta: ${timing.questionRemainingSeconds}s`);
      header.append(el('p', {class: 'p2lrn-q-timer', role: 'timer', 'aria-live': 'polite'}, parts.join(' · ')));
    }
    shell.append(header);
    if (this.notice) shell.append(el('p', {class: 'p2lrn-q-notice', role: 'alert'}, this.notice));

    if (this.state.completed && this.state.score) {
      shell.append(this.#renderResult());
      this.container.append(shell);
      return;
    }

    const mode = this.payload.presentation?.questionMode ?? 'one-at-a-time';
    if (mode === 'all') {
      const list = el('div', {class: 'p2lrn-q-list'});
      this.session.questionsInOrder().forEach((question, index) => list.append(this.#renderQuestion(question, index)));
      const actions = el('div', {class: 'p2lrn-q-actions'});
      actions.append(this.#finishButton());
      shell.append(list, actions);
    } else {
      const index = this.state.currentQuestion;
      const question = this.session.questionsInOrder()[index];
      const progress = el('div', {class: 'p2lrn-q-progress'});
      progress.append(el('strong', {}, `Pregunta ${index + 1} de ${this.payload.questions.length}`));
      const meter = el('progress', {
        class: 'p2lrn-q-progress-meter',
        max: this.payload.questions.length,
        value: index + 1,
        'aria-label': `Progreso: pregunta ${index + 1} de ${this.payload.questions.length}`,
      });
      progress.append(meter);
      shell.append(progress, this.#renderQuestion(question, index), this.#navigation());
    }
    this.container.append(shell);
  }

  #renderQuestion(question, index) {
    const card = el('article', {class: 'p2lrn-q-card'});
    const meta = el('div', {class: 'p2lrn-q-meta'}, `${index + 1}. ${question.type} · ${question.points} pt${Number(question.points) === 1 ? '' : 's'}`);
    card.append(meta, el('h3', {class: 'p2lrn-q-prompt'}, question.prompt));
    if (question.type === 'fill-blanks' && question.body) card.append(el('p', {class: 'p2lrn-q-body'}, question.body));
    const input = this.#renderInput(question);
    if (this.session.isQuestionExpired(question.id)) {
      card.append(el('p', {class: 'p2lrn-q-notice', role: 'status'}, 'Tiempo agotado para esta pregunta.'));
      disableControls(input);
    }
    card.append(input);
    return card;
  }

  #renderInput(question) {
    const answer = this.getAnswer(question);
    if (['single-choice', 'multiple-choice', 'true-false'].includes(question.type)) {
      const group = el('fieldset', {class: 'p2lrn-q-options'});
      group.append(el('legend', {class: 'p2lrn-sr-only'}, question.prompt));
      const selected = new Set(answer.choiceIds ?? []);
      question.choices.forEach((choice) => {
        const label = el('label', {class: 'p2lrn-q-option'});
        const input = el('input', {type: question.type === 'multiple-choice' ? 'checkbox' : 'radio'});
        input.name = `p2lrn-${question.id}`;
        input.value = choice.id;
        input.checked = selected.has(choice.id);
        input.addEventListener('change', () => {
          let choiceIds;
          if (question.type === 'multiple-choice') {
            const next = new Set(this.getAnswer(question).choiceIds ?? []);
            if (input.checked) next.add(choice.id); else next.delete(choice.id);
            choiceIds = [...next];
          } else {
            choiceIds = [choice.id];
          }
          this.setAnswer(question, {choiceIds});
        });
        label.append(input, el('span', {}, choice.text));
        group.append(label);
      });
      return group;
    }

    if (question.type === 'text') {
      const textarea = el('textarea', {class: 'p2lrn-q-text', 'aria-label': 'Respuesta escrita'});
      textarea.value = answer.text ?? '';
      textarea.addEventListener('input', () => this.setAnswer(question, {text: textarea.value}));
      return textarea;
    }

    if (question.type === 'fill-blanks') {
      const list = el('div', {class: 'p2lrn-q-fields'});
      question.blanks.forEach((blank, index) => {
        const row = el('label', {class: 'p2lrn-q-field'});
        row.append(el('span', {}, blank.label || `Hueco ${index + 1}`));
        const values = isRecord(answer.blanks) ? answer.blanks : {};
        let input;
        if (Array.isArray(blank.options) && blank.options.length) {
          input = el('select');
          input.append(el('option', {value: ''}, 'Selecciona…'));
          blank.options.forEach((option) => input.append(el('option', {value: option}, option)));
          input.value = values[blank.id] ?? '';
          input.addEventListener('change', () => {
            const current = this.getAnswer(question);
            const blanks = isRecord(current.blanks) ? current.blanks : {};
            this.setAnswer(question, {blanks: {...blanks, [blank.id]: input.value}});
          });
        } else {
          input = el('input', {type: 'text'});
          input.value = values[blank.id] ?? '';
          input.addEventListener('input', () => {
            const current = this.getAnswer(question);
            const blanks = isRecord(current.blanks) ? current.blanks : {};
            this.setAnswer(question, {blanks: {...blanks, [blank.id]: input.value}});
          });
        }
        row.append(input);
        list.append(row);
      });
      return list;
    }

    if (question.type === 'ordering') {
      const order = Array.isArray(answer.order) && answer.order.length === question.items.length ? [...answer.order] : [...question.items].reverse().map((item) => item.id);
      const byId = new Map(question.items.map((item) => [item.id, item]));
      const list = el('ol', {class: 'p2lrn-q-order'});
      order.forEach((id, index) => {
        const item = el('li', {class: 'p2lrn-q-order-item'});
        item.append(el('span', {}, byId.get(id)?.text ?? id));
        const controls = el('span', {class: 'p2lrn-q-order-controls'});
        const up = el('button', {type: 'button', disabled: index === 0, 'aria-label': 'Mover arriba'}, '↑');
        const down = el('button', {type: 'button', disabled: index === order.length - 1, 'aria-label': 'Mover abajo'}, '↓');
        up.addEventListener('click', () => this.#moveOrder(question, order, index, index - 1));
        down.addEventListener('click', () => this.#moveOrder(question, order, index, index + 1));
        controls.append(up, down);
        item.append(controls);
        list.append(item);
      });
      return list;
    }

    if (question.type === 'classification') {
      const fields = el('div', {class: 'p2lrn-q-fields'});
      const classifications = isRecord(answer.classifications) ? answer.classifications : {};
      question.items.forEach((item) => {
        const row = el('label', {class: 'p2lrn-q-field'});
        row.append(el('span', {}, item.text));
        const select = el('select');
        select.append(el('option', {value: ''}, 'Selecciona categoría…'));
        question.categories.forEach((category) => select.append(el('option', {value: category.id}, category.text)));
        select.value = classifications[item.id] ?? '';
        select.addEventListener('change', () => {
          const current = this.getAnswer(question);
          const currentClassifications = isRecord(current.classifications) ? current.classifications : {};
          this.setAnswer(question, {classifications: {...currentClassifications, [item.id]: select.value}});
        });
        row.append(select);
        fields.append(row);
      });
      return fields;
    }

    if (question.type === 'matching') {
      const fields = el('div', {class: 'p2lrn-q-fields'});
      const pairs = isRecord(answer.pairs) ? answer.pairs : {};
      question.left.forEach((left) => {
        const row = el('label', {class: 'p2lrn-q-field'});
        row.append(el('span', {}, left.text));
        const select = el('select');
        select.append(el('option', {value: ''}, 'Selecciona…'));
        question.right.forEach((right) => select.append(el('option', {value: right.id}, right.text)));
        select.value = pairs[left.id] ?? '';
        select.addEventListener('change', () => {
          const current = this.getAnswer(question);
          const currentPairs = isRecord(current.pairs) ? current.pairs : {};
          this.setAnswer(question, {pairs: {...currentPairs, [left.id]: select.value}});
        });
        row.append(select);
        fields.append(row);
      });
      return fields;
    }

    return el('p', {}, 'Tipo de pregunta no soportado.');
  }

  #moveOrder(question, order, from, to) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    this.setAnswer(question, {order: next});
    this.render();
  }

  #navigation() {
    const nav = el('div', {class: 'p2lrn-q-actions'});
    const previous = el('button', {type: 'button', disabled: this.state.currentQuestion === 0}, 'Anterior');
    previous.addEventListener('click', () => {
      this.session.setCurrentQuestion(this.state.currentQuestion - 1);
      this.render();
    });
    nav.append(previous);
    if (this.state.currentQuestion < this.payload.questions.length - 1) {
      const next = el('button', {type: 'button', class: 'primary'}, 'Siguiente');
      next.addEventListener('click', () => {
        this.session.setCurrentQuestion(this.state.currentQuestion + 1);
        this.render();
      });
      nav.append(next);
    } else {
      nav.append(this.#finishButton());
    }
    return nav;
  }

  #finishButton() {
    const button = el('button', {type: 'button', class: 'primary'}, 'Finalizar');
    button.addEventListener('click', () => void this.finish());
    return button;
  }

  #renderResult() {
    const score = this.state.score;
    const wrap = el('div', {class: 'p2lrn-q-result'});
    wrap.append(el('h3', {}, score.graded ? 'Resultado' : 'Respuestas enviadas'));
    if (this.state.completionReason === 'time-limit' || this.state.completionReason === 'question-time-limit') {
      wrap.append(el('p', {class: 'p2lrn-q-notice'}, 'La actividad se cerró al agotarse el tiempo declarado por el paquete.'));
    }
    if (score.graded) {
      wrap.append(el('p', {class: 'p2lrn-q-score'}, `${score.raw} / ${score.max} puntos`));
    } else {
      wrap.append(el('p', {}, 'Este cuestionario usa corrección del host. El paquete no inventa una nota local.'));
    }
    if ((this.payload.presentation?.showFeedback ?? 'after-submit') !== 'never') {
      const resultById = new Map(score.questions.map((result) => [result.questionId, result]));
      const list = el('ol', {class: 'p2lrn-q-results'});
      this.session.questionsInOrder().forEach((q) => {
        const result = resultById.get(q.id);
        const item = el('li');
        let status = 'Sin corrección local';
        if (result?.graded) status = result.correct ? 'Correcta' : `${result.pointsAwarded} / ${result.pointsPossible} pts`;
        item.append(el('strong', {}, q.prompt), el('span', {}, status));
        if (q.explanation) item.append(el('p', {}, q.explanation));
        list.append(item);
      });
      wrap.append(list);
    }
    const maxAttempts = this.payload.attemptPolicy?.maxAttempts;
    const completed = Number(this.state.attemptsCompleted ?? 0);
    if (!Number.isInteger(maxAttempts) || completed < maxAttempts) {
      const repeat = el('button', {type: 'button'}, 'Repetir');
      repeat.addEventListener('click', () => this.reset());
      wrap.append(repeat);
    } else {
      wrap.append(el('p', {class: 'p2lrn-q-attempts'}, `Intentos agotados (${completed}/${maxAttempts}).`));
    }
    return wrap;
  }
}

export async function renderQuestionnaire(container, payload, options = {}) {
  const runtime = new QuestionnaireRuntime(payload, options);
  await runtime.mount(container);
  return runtime;
}

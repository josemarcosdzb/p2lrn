import {fillBlankInputMode,fillBlankParts,fillBlankPromptLeaksAnswer,fillBlankWordBank} from './fill-blanks-core.js';
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
  if (question.type === 'true-false' && question.trueFalseMode === 'multiple') return {booleans: {}};
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
    const fill = question.type === 'fill-blanks' ? fillBlankParts(question) : null;
    const visiblePrompt = fill && (fill.usesPrompt || fillBlankPromptLeaksAnswer(question)) ? 'Completa los huecos' : question.prompt;
    card.append(meta, el('h3', {class: 'p2lrn-q-prompt'}, visiblePrompt));
    if (question.type !== 'fill-blanks' && question.body) card.append(el('p', {class: 'p2lrn-q-body'}, question.body));
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
    if (question.type === 'true-false' && question.trueFalseMode === 'multiple') {
      const group = el('div', {class: 'p2lrn-tf-statements'});
      const values = answer.booleans && typeof answer.booleans === 'object' && !Array.isArray(answer.booleans) ? {...answer.booleans} : {};
      question.statements.forEach((statement,index) => {
        const row = el('fieldset', {class: 'p2lrn-tf-statement'});
        row.append(el('legend', {class: 'p2lrn-tf-statement-text'}, `${index + 1}. ${statement.text}`));
        const actions = el('div', {class: 'p2lrn-tf-statement-actions'});
        for (const [value,labelText] of [[true,'Verdadero'],[false,'Falso']]) {
          const label = el('label', {class: 'p2lrn-q-option p2lrn-tf-choice'});
          const input = el('input', {type:'radio'});
          input.name = `p2lrn-${question.id}-${statement.id}`;
          input.checked = values[statement.id] === value;
          input.addEventListener('change', () => {
            const next = this.getAnswer(question).booleans && typeof this.getAnswer(question).booleans === 'object' ? {...this.getAnswer(question).booleans} : {};
            next[statement.id] = value;
            this.setAnswer(question, {booleans: next});
          });
          label.append(input, el('span', {}, labelText));
          actions.append(label);
        }
        row.append(actions);group.append(row);
      });
      return group;
    }

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
      const wrapper = el('div', {class: 'p2lrn-fill'});
      const template = el('div', {class: 'p2lrn-fill-template'});
      const details = fillBlankParts(question);
      const values = isRecord(answer.blanks) ? {...answer.blanks} : {};
      const blankById = new Map(question.blanks.map((blank,index)=>[String(blank.id),{blank,index}]));
      const write = () => this.setAnswer(question, {blanks: {...values}});

      if (fillBlankInputMode(question) === 'text') {
        for (const part of details.parts) {
          if (part.type === 'text') { template.append(document.createTextNode(part.text)); continue; }
          const info=blankById.get(part.id);if(!info)continue;
          const input=el('input',{type:'text',class:'p2lrn-fill-input','aria-label':info.blank.label||`Hueco ${info.index+1}`});
          input.value=values[part.id]??'';
          input.addEventListener('input',()=>{values[part.id]=input.value;write();});
          template.append(input);
        }
        wrapper.append(template);
        return wrapper;
      }

      const bank=fillBlankWordBank(question);
      const bankNode=el('div',{class:'p2lrn-fill-bank','aria-label':'Palabras disponibles'});
      const slots=new Map();
      const chips=[];
      let selectedId=null;
      const norm=(value)=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('es');

      const refresh=()=>{
        for(const [id,slot] of slots){
          const value=String(values[id]??'').trim();
          slot.textContent=value||'Arrastra o selecciona';
          slot.classList.toggle('is-filled',Boolean(value));
          slot.classList.toggle('is-target',Boolean(selectedId&&!value));
          slot.setAttribute('aria-label',value?`${slot.dataset.label}: ${value}. Pulsa para quitarlo.`:`${slot.dataset.label}. ${selectedId?'Pulsa para colocar la palabra seleccionada.':'Arrastra o selecciona una palabra.'}`);
        }
        const used=new Map();for(const value of Object.values(values)){const key=norm(value);if(key)used.set(key,(used.get(key)??0)+1);}
        const occurrence=new Map();
        for(const entry of chips){
          const key=norm(entry.text);const n=(occurrence.get(key)??0)+1;occurrence.set(key,n);
          const consumed=n<=(used.get(key)??0);
          entry.button.hidden=consumed;entry.button.disabled=consumed;
          entry.button.classList.toggle('is-selected',entry.id===selectedId);
          entry.button.setAttribute('aria-pressed',String(entry.id===selectedId));
        }
      };

      const assign=(blankId,wordId)=>{
        const entry=bank.find((item)=>item.id===wordId);if(!entry)return;
        values[blankId]=entry.text;selectedId=null;write();refresh();
      };

      for (const part of details.parts) {
        if (part.type === 'text') { template.append(document.createTextNode(part.text)); continue; }
        const info=blankById.get(part.id);if(!info)continue;
        const slot=el('button',{type:'button',class:'p2lrn-fill-slot'});
        slot.dataset.blankId=part.id;slot.dataset.label=info.blank.label||`Hueco ${info.index+1}`;
        slot.addEventListener('dragover',(event)=>{event.preventDefault();event.dataTransfer.dropEffect='move';slot.classList.add('is-over');});
        slot.addEventListener('dragleave',()=>slot.classList.remove('is-over'));
        slot.addEventListener('drop',(event)=>{event.preventDefault();slot.classList.remove('is-over');const wordId=event.dataTransfer.getData('application/x-p2lrn-fill-word')||event.dataTransfer.getData('text/plain');if(wordId)assign(part.id,wordId);});
        slot.addEventListener('click',()=>{if(selectedId){assign(part.id,selectedId);return;}if(values[part.id]){delete values[part.id];write();refresh();}});
        slots.set(part.id,slot);template.append(slot);
      }

      bank.forEach((entry)=>{
        const chip=el('button',{type:'button',class:'p2lrn-fill-chip','aria-pressed':'false'},entry.text);
        chip.draggable=true;
        chip.addEventListener('dragstart',(event)=>{selectedId=entry.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-p2lrn-fill-word',entry.id);event.dataTransfer.setData('text/plain',entry.id);refresh();});
        chip.addEventListener('dragend',()=>{selectedId=null;refresh();});
        chip.addEventListener('click',()=>{selectedId=selectedId===entry.id?null:entry.id;refresh();});
        chips.push({...entry,button:chip});bankNode.append(chip);
      });
      wrapper.append(template,bankNode);refresh();
      return wrapper;
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

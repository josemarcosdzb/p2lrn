import {mergeAnswerPatch} from './questionnaire-games-core.js';
import {QuestionnaireSession} from './questionnaire-session.js';

export class QuestionnaireGameRuntime {
  constructor(payload, {rendererId, eventTarget = null, adapter = null, context = {}, clock, autoTiming = true} = {}) {
    this.rendererId = rendererId;
    this.container = null;
    this.session = new QuestionnaireSession(payload, {
      rendererId,
      eventTarget,
      adapter,
      context,
      clock,
      autoTiming,
      supportsQuestionTiming: false,
      activityKind: 'native-questionnaire-game',
    });
    this.payload = this.session.payload;
  }

  get state() { return this.session.state; }

  async mount(container) {
    this.container = container;
    await this.session.mount();
    return this;
  }

  destroy() {
    this.session.destroy();
    if (this.container) this.container.replaceChildren();
  }

  answer(questionId) { return this.session.answer(questionId); }

  applyPatch(questionId, patch, {complete = false} = {}) {
    const key = String(questionId);
    const next = mergeAnswerPatch(this.answer(key), patch);
    const accepted = this.session.replaceAnswer(key, next);
    if (accepted && complete && this.answeredCount() === this.payload.questions.length) void this.finish();
    return accepted ? next : this.answer(key);
  }

  replaceAnswer(questionId, answer) { return this.session.replaceAnswer(questionId, answer); }
  getGameState(key, fallback = null) { return this.session.getGameState(key, fallback); }
  setGameState(key, value) { return this.session.setGameState(key, value); }
  answeredCount() { return this.session.answeredCount(); }
  progress() { return this.session.progress(); }
  timingSnapshot() { return this.session.timingSnapshot(); }
  finish(options) { return this.session.finish(options); }
  reset() { return this.session.reset(); }
}

export async function createQuestionnaireGameRuntime(container, payload, options) {
  const runtime = new QuestionnaireGameRuntime(payload, options);
  await runtime.mount(container);
  return runtime;
}

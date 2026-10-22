import {scoreQuestionnaire, validateQuestionnaire} from './questionnaire-core.js';
import {dispatchRuntimeEvent} from './runtime-events.js';

export const QUESTIONNAIRE_STATE_VERSION = 'p2lrn-questionnaire-state/0.2';
export const QUESTIONNAIRE_STATE_LEGACY_VERSIONS = Object.freeze([
  'p2rln-questionnaire-state/0.2',
  'p2rln-questionnaire-state/0.1',
]);
export const QUESTIONNAIRE_STATE_LEGACY_VERSION = QUESTIONNAIRE_STATE_LEGACY_VERSIONS[1];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function emit(target, name, detail, adapter = null) {
  const raw = detail && typeof detail === 'object' && !Array.isArray(detail) ? {...detail} : {};
  const context = raw.context && typeof raw.context === 'object' ? raw.context : {};
  delete raw.context;
  return dispatchRuntimeEvent(target, name, raw, context, {adapter});
}

function hashText(value) {
  let hash = 2166136261;
  for (const ch of String(value ?? '')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffledQuestionIds(payload, context, attemptNumber) {
  const ids = payload.questions.map((question) => question.id);
  if (!payload.presentation?.shuffleQuestions) return ids;
  const random = seededRandom(hashText(`${context?.contentRoot ?? ''}|${context?.entityId ?? ''}|attempt:${attemptNumber}`));
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [ids[index], ids[next]] = [ids[next], ids[index]];
  }
  return ids;
}

function validQuestionOrder(payload, value) {
  if (!Array.isArray(value) || value.length !== payload.questions.length) return false;
  const expected = new Set(payload.questions.map((question) => question.id));
  return new Set(value).size === expected.size && value.every((id) => expected.has(id));
}

export function answerIsMeaningful(question, answer) {
  if (!isRecord(answer)) return false;
  if (question.type === 'true-false' && question.trueFalseMode === 'multiple') return isRecord(answer.booleans) && question.statements.every((statement) => typeof answer.booleans[statement.id] === 'boolean');
  if (['single-choice', 'multiple-choice', 'true-false'].includes(question.type)) return Array.isArray(answer.choiceIds) && answer.choiceIds.length > 0;
  if (question.type === 'text') return typeof answer.text === 'string' && answer.text.trim().length > 0;
  if (question.type === 'fill-blanks') return isRecord(answer.blanks) && Object.values(answer.blanks).some((value) => String(value ?? '').trim());
  if (question.type === 'ordering') return Array.isArray(answer.order) && answer.order.length === question.items.length;
  if (question.type === 'matching') return isRecord(answer.pairs) && Object.values(answer.pairs).filter(Boolean).length === question.left.length;
  if (question.type === 'classification') return isRecord(answer.classifications) && Object.values(answer.classifications).filter(Boolean).length === question.items.length;
  return false;
}

function emptyTiming() {
  return {
    attemptStartedAt: null,
    attemptDeadlineAt: null,
    questionStartedAt: {},
    questionDeadlineAt: {},
    expiredQuestions: [],
  };
}

function safeTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sanitizeTiming(value, payload) {
  const raw = isRecord(value) ? value : {};
  const known = new Set(payload.questions.map((question) => question.id));
  const started = {};
  const deadlines = {};
  if (isRecord(raw.questionStartedAt)) {
    for (const [id, ts] of Object.entries(raw.questionStartedAt)) if (known.has(id) && safeTimestamp(ts) !== null) started[id] = ts;
  }
  if (isRecord(raw.questionDeadlineAt)) {
    for (const [id, ts] of Object.entries(raw.questionDeadlineAt)) if (known.has(id) && safeTimestamp(ts) !== null) deadlines[id] = ts;
  }
  return {
    attemptStartedAt: safeTimestamp(raw.attemptStartedAt),
    attemptDeadlineAt: safeTimestamp(raw.attemptDeadlineAt),
    questionStartedAt: started,
    questionDeadlineAt: deadlines,
    expiredQuestions: Array.isArray(raw.expiredQuestions) ? [...new Set(raw.expiredQuestions.filter((id) => typeof id === 'string' && known.has(id)))] : [],
  };
}

function timingRequired(payload) {
  return Number.isInteger(payload.attemptPolicy?.timeLimitSeconds) || payload.questions.some((question) => Number.isInteger(question.timeLimitSeconds));
}

function hasQuestionTiming(payload) {
  return payload.questions.some((question) => Number.isInteger(question.timeLimitSeconds));
}

export class QuestionnaireSession {
  constructor(payload, {
    rendererId = null,
    eventTarget = null,
    adapter = null,
    context = {},
    clock = () => Date.now(),
    supportsQuestionTiming = false,
    autoTiming = true,
    activityKind = 'native-questionnaire',
    onTimingChange = null,
  } = {}) {
    this.payload = validateQuestionnaire(payload);
    this.rendererId = rendererId;
    this.eventTarget = eventTarget;
    this.adapter = adapter;
    this.context = rendererId ? {...context, rendererId} : context;
    this.clock = typeof clock === 'function' ? clock : () => Date.now();
    this.supportsQuestionTiming = supportsQuestionTiming;
    this.autoTiming = autoTiming;
    this.activityKind = activityKind;
    this.onTimingChange = typeof onTimingChange === 'function' ? onTimingChange : null;
    this.state = this.#newState();
    this.saveQueue = Promise.resolve();
    this.timerHandle = null;
    this.destroyed = false;
    this.finishing = false;
    this.lastTimingSecondKey = '';
  }

  #emit(name, detail = {}) {
    return emit(this.eventTarget, name, detail, this.adapter);
  }

  #newState({attemptsCompleted = 0} = {}) {
    const attemptNumber = attemptsCompleted + 1;
    return {
      version: QUESTIONNAIRE_STATE_VERSION,
      currentQuestion: 0,
      questionOrder: shuffledQuestionIds(this.payload, this.context, attemptNumber),
      answers: {},
      completed: false,
      attemptsCompleted,
      completionReason: null,
      gameState: {},
      timing: emptyTiming(),
    };
  }

  #sanitizeState(value) {
    const attemptsCompleted = Number.isInteger(value.attemptsCompleted) && value.attemptsCompleted >= 0 ? value.attemptsCompleted : 0;
    const expectedIds = this.payload.questions.map((question) => question.id);
    const maxIndex = Math.max(0, expectedIds.length - 1);
    const state = {
      version: QUESTIONNAIRE_STATE_VERSION,
      currentQuestion: Number.isInteger(value.currentQuestion) ? Math.max(0, Math.min(maxIndex, value.currentQuestion)) : 0,
      questionOrder: validQuestionOrder(this.payload, value.questionOrder) ? [...value.questionOrder] : shuffledQuestionIds(this.payload, this.context, attemptsCompleted + 1),
      answers: isRecord(value.answers) ? clone(value.answers) : {},
      completed: Boolean(value.completed),
      attemptsCompleted,
      completionReason: typeof value.completionReason === 'string' ? value.completionReason : null,
      score: isRecord(value.score) ? clone(value.score) : undefined,
      gameState: isRecord(value.gameState) ? clone(value.gameState) : {},
      timing: sanitizeTiming(value.timing, this.payload),
    };
    // v0.1 had no timing namespace; migration is intentionally lossless for answers/order/score.
    if (QUESTIONNAIRE_STATE_LEGACY_VERSIONS.includes(value.version) && !isRecord(value.timing)) state.timing = emptyTiming();
    return state;
  }

  async mount() {
    if (hasQuestionTiming(this.payload) && !this.supportsQuestionTiming) {
      const error = new Error(`Renderer ${this.rendererId ?? 'desconocido'} no implementa límites de tiempo por pregunta.`);
      error.code = 'P2LRN_TIMING_UNSUPPORTED';
      throw error;
    }
    if (this.adapter?.loadState) {
      try {
        const loaded = await this.adapter.loadState(this.context);
        if (isRecord(loaded)) this.state = this.#sanitizeState(loaded);
      } catch (error) {
        this.#emit('p2lrn:error', {phase: 'loadState', error: String(error?.message ?? error), context: this.context});
      }
    }
    if (!this.state.completed) {
      const changed = this.#ensureTiming();
      if (changed) this.save();
      await this.checkTiming();
      if (!this.state.completed && this.autoTiming && timingRequired(this.payload)) this.#startTimer();
    }
    this.#emit('p2lrn:activityready', {kind: this.activityKind, rendererId: this.rendererId, title: this.payload.title, context: this.context});
    return this;
  }

  destroy() {
    this.destroyed = true;
    if (this.timerHandle !== null) clearInterval(this.timerHandle);
    this.timerHandle = null;
  }

  questionsInOrder() {
    const byId = new Map(this.payload.questions.map((question) => [question.id, question]));
    return this.state.questionOrder.map((id) => byId.get(id)).filter(Boolean);
  }

  currentQuestion() {
    return this.questionsInOrder()[this.state.currentQuestion] ?? null;
  }

  answer(questionId) {
    const value = this.state.answers[String(questionId)] ?? this.state.answers[questionId];
    return isRecord(value) ? clone(value) : {};
  }

  isQuestionExpired(questionId) {
    return this.state.timing.expiredQuestions.includes(String(questionId));
  }

  replaceAnswer(questionId, answer) {
    const key = String(questionId);
    if (this.state.completed || this.isAttemptExpired() || this.isQuestionExpired(key)) {
      this.#emit('p2lrn:error', {phase: 'answer-after-timeout', questionId: key, context: this.context});
      return false;
    }
    this.state.answers[key] = clone(answer);
    delete this.state.score;
    this.state.completed = false;
    this.state.completionReason = null;
    this.#emit('p2lrn:answer', {questionId: key, answer: clone(answer), rendererId: this.rendererId, context: this.context});
    this.#emit('p2lrn:progress', {value: this.progress(), answered: this.answeredCount(), total: this.payload.questions.length, rendererId: this.rendererId, context: this.context});
    this.save();
    return true;
  }

  answeredCount() {
    return this.payload.questions.filter((question) => answerIsMeaningful(question, this.state.answers[String(question.id)] ?? this.state.answers[question.id])).length;
  }

  progress() {
    return this.payload.questions.length ? this.answeredCount() / this.payload.questions.length : 0;
  }

  getGameState(key, fallback = null) {
    return key in this.state.gameState ? clone(this.state.gameState[key]) : fallback;
  }

  setGameState(key, value) {
    this.state.gameState[key] = clone(value);
    this.save();
  }

  setCurrentQuestion(index) {
    const maxIndex = Math.max(0, this.payload.questions.length - 1);
    const next = Math.max(0, Math.min(maxIndex, Number(index) || 0));
    this.state.currentQuestion = next;
    const question = this.currentQuestion();
    if (question) this.#ensureQuestionTiming(question.id);
    this.save();
    return question;
  }

  timingSnapshot() {
    const now = this.clock();
    const question = this.currentQuestion();
    const attemptRemainingMs = this.state.timing.attemptDeadlineAt === null ? null : Math.max(0, this.state.timing.attemptDeadlineAt - now);
    const questionDeadline = question ? this.state.timing.questionDeadlineAt[question.id] : null;
    const questionRemainingMs = Number.isSafeInteger(questionDeadline) ? Math.max(0, questionDeadline - now) : null;
    return {
      now,
      attemptRemainingMs,
      attemptRemainingSeconds: attemptRemainingMs === null ? null : Math.ceil(attemptRemainingMs / 1000),
      questionId: question?.id ?? null,
      questionRemainingMs,
      questionRemainingSeconds: questionRemainingMs === null ? null : Math.ceil(questionRemainingMs / 1000),
      expiredQuestions: [...this.state.timing.expiredQuestions],
    };
  }

  isAttemptExpired() {
    const deadline = this.state.timing.attemptDeadlineAt;
    return Number.isSafeInteger(deadline) && this.clock() >= deadline;
  }

  async checkTiming() {
    if (this.state.completed || this.finishing) return this.timingSnapshot();
    const now = this.clock();
    if (Number.isSafeInteger(this.state.timing.attemptDeadlineAt) && now >= this.state.timing.attemptDeadlineAt) {
      await this.finish({reason: 'time-limit', allowMissingRequired: true});
      this.#emit('p2lrn:timeout', {scope: 'attempt', rendererId: this.rendererId, context: this.context});
      const timing = this.timingSnapshot();
      this.#emit('p2lrn:timeupdate', {...timing, rendererId: this.rendererId, context: this.context});
      if (this.onTimingChange) { try { this.onTimingChange(timing); } catch {} }
      return timing;
    }

    if (this.supportsQuestionTiming) {
      const expiredSet = new Set(this.state.timing.expiredQuestions);
      const mode = this.payload.presentation?.questionMode ?? 'one-at-a-time';
      const candidates = mode === 'all' ? this.payload.questions : [this.currentQuestion()].filter(Boolean);
      let changed = false;
      for (const question of candidates) {
        const deadline = this.state.timing.questionDeadlineAt[question.id];
        if (!Number.isSafeInteger(deadline) || now < deadline || expiredSet.has(question.id)) continue;
        expiredSet.add(question.id);
        changed = true;
        this.#emit('p2lrn:timeout', {scope: 'question', questionId: question.id, rendererId: this.rendererId, context: this.context});
      }
      if (changed) {
        this.state.timing.expiredQuestions = [...expiredSet];
        if (mode === 'one-at-a-time') {
          const current = this.currentQuestion();
          if (current && expiredSet.has(current.id)) {
            if (this.state.currentQuestion < this.payload.questions.length - 1) {
              this.state.currentQuestion += 1;
              const next = this.currentQuestion();
              if (next) this.#ensureQuestionTiming(next.id);
              this.save();
            } else {
              await this.finish({reason: 'question-time-limit', allowMissingRequired: true});
            }
          }
        } else {
          this.save();
        }
      }
    }

    const timing = this.timingSnapshot();
    const secondKey = `${timing.attemptRemainingSeconds ?? '-'}|${timing.questionId ?? '-'}|${timing.questionRemainingSeconds ?? '-'}`;
    if (secondKey !== this.lastTimingSecondKey) {
      this.lastTimingSecondKey = secondKey;
      this.#emit('p2lrn:timeupdate', {...timing, rendererId: this.rendererId, context: this.context});
      if (this.onTimingChange) {
        try { this.onTimingChange(timing); } catch {}
      }
    }
    return timing;
  }

  async finish({reason = 'submitted', allowMissingRequired = false} = {}) {
    if (this.state.completed && this.state.score) return this.state.score;
    if (this.finishing) return null;
    const expired = new Set(this.state.timing.expiredQuestions);
    const missing = this.payload.questions.filter((question) => question.required && !expired.has(question.id) && !answerIsMeaningful(question, this.state.answers[String(question.id)] ?? this.state.answers[question.id]));
    if (missing.length && !allowMissingRequired) {
      this.#emit('p2lrn:error', {phase: 'required-answers', questionIds: missing.map((question) => question.id), rendererId: this.rendererId, context: this.context});
      return null;
    }
    this.finishing = true;
    try {
      const score = scoreQuestionnaire(this.payload, this.state.answers);
      this.state.completed = true;
      this.state.attemptsCompleted = Number(this.state.attemptsCompleted ?? 0) + 1;
      this.state.completionReason = reason;
      this.state.score = score;
      if (this.timerHandle !== null) clearInterval(this.timerHandle);
      this.timerHandle = null;
      this.save();
      this.#emit('p2lrn:score', {...score, rendererId: this.rendererId, context: this.context});
      if (this.adapter?.reportScore) {
        try { await this.adapter.reportScore(score, this.context); }
        catch (error) { this.#emit('p2lrn:error', {phase: 'reportScore', error: String(error?.message ?? error), context: this.context}); }
      }
      this.#emit('p2lrn:complete', {score, answers: clone(this.state.answers), reason, rendererId: this.rendererId, context: this.context});
      return score;
    } finally {
      this.finishing = false;
    }
  }

  reset() {
    const completed = Number(this.state.attemptsCompleted ?? 0);
    const maxAttempts = this.payload.attemptPolicy?.maxAttempts;
    if (Number.isInteger(maxAttempts) && completed >= maxAttempts) return false;
    if (this.timerHandle !== null) clearInterval(this.timerHandle);
    this.timerHandle = null;
    this.state = this.#newState({attemptsCompleted: completed});
    this.#ensureTiming();
    this.save();
    if (this.autoTiming && timingRequired(this.payload)) this.#startTimer();
    return true;
  }

  save() {
    const snapshot = clone(this.state);
    this.#emit('p2lrn:statechange', {state: snapshot, rendererId: this.rendererId, context: this.context});
    if (!this.adapter?.saveState) return;
    this.saveQueue = this.saveQueue.catch(() => undefined).then(() => this.adapter.saveState(snapshot, this.context)).catch((error) => {
      this.#emit('p2lrn:error', {phase: 'saveState', error: String(error?.message ?? error), context: this.context});
    });
  }

  #ensureTiming() {
    if (!timingRequired(this.payload)) return false;
    const now = this.clock();
    let changed = false;
    if (Number.isInteger(this.payload.attemptPolicy?.timeLimitSeconds)) {
      if (this.state.timing.attemptStartedAt === null) {
        this.state.timing.attemptStartedAt = now;
        changed = true;
      }
      const expectedDeadline = this.state.timing.attemptStartedAt + this.payload.attemptPolicy.timeLimitSeconds * 1000;
      if (this.state.timing.attemptDeadlineAt !== expectedDeadline) {
        this.state.timing.attemptDeadlineAt = expectedDeadline;
        changed = true;
      }
    }
    if (this.supportsQuestionTiming) {
      const mode = this.payload.presentation?.questionMode ?? 'one-at-a-time';
      if (mode === 'all') {
        for (const question of this.payload.questions) changed = this.#ensureQuestionTiming(question.id, now) || changed;
      } else {
        const question = this.currentQuestion();
        if (question) changed = this.#ensureQuestionTiming(question.id, now) || changed;
      }
    }
    return changed;
  }

  #ensureQuestionTiming(questionId, now = this.clock()) {
    const question = this.payload.questions.find((item) => item.id === String(questionId));
    if (!question || !Number.isInteger(question.timeLimitSeconds)) return false;
    let changed = false;
    if (!Number.isSafeInteger(this.state.timing.questionStartedAt[question.id])) {
      this.state.timing.questionStartedAt[question.id] = now;
      changed = true;
    }
    const expectedDeadline = this.state.timing.questionStartedAt[question.id] + question.timeLimitSeconds * 1000;
    if (this.state.timing.questionDeadlineAt[question.id] !== expectedDeadline) {
      this.state.timing.questionDeadlineAt[question.id] = expectedDeadline;
      changed = true;
    }
    return changed;
  }

  #startTimer() {
    if (this.timerHandle !== null || this.destroyed) return;
    this.timerHandle = setInterval(() => { void this.checkTiming(); }, 250);
  }
}

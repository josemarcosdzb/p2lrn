import {identifierIs} from './identifiers.js';
export const NATIVE_QUESTIONNAIRE_PROFILE = 'https://p2lrn.org/profile/native-questionnaire';
export const NATIVE_QUESTIONNAIRE_SCHEMA = 'https://p2lrn.org/schema/native-questionnaire/0.4.0';
export const NATIVE_QUESTIONNAIRE_MEDIA_TYPE = 'application/vnd.p2lrn.questionnaire+json';

const QUESTION_TYPES = new Set([
  'single-choice',
  'multiple-choice',
  'true-false',
  'text',
  'fill-blanks',
  'ordering',
  'matching',
  'classification',
]);
const SCORING_MODES = new Set(['all-or-nothing', 'partial-per-item', 'partial-with-penalty']);
const QUESTION_MODES = new Set(['one-at-a-time', 'all']);
const FEEDBACK_MODES = new Set(['after-submit', 'never']);
const LANGUAGE_RE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function invariant(condition, message) {
  if (!condition) throw new Error(`Invalid native questionnaire: ${message}`);
}

function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    invariant(item && typeof item === 'object' && !Array.isArray(item), `${label} item must be an object`);
    invariant(typeof item.id === 'string' && TOKEN_RE.test(item.id), `${label} has an invalid id`);
    invariant(typeof item.text === 'string' && item.text.trim(), `${label} ${item.id} requires text`);
    invariant(!ids.has(item.id), `${label} repeats id ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function positiveInteger(value, label) {
  invariant(Number.isInteger(value) && value >= 1, `${label} must be a positive integer`);
}

export function validateQuestionnaire(payload) {
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'payload must be an object');
  invariant(identifierIs(payload.schema, NATIVE_QUESTIONNAIRE_SCHEMA), 'unsupported schema');
  invariant(payload.version === '0.4.0', 'unsupported version');
  invariant(typeof payload.title === 'string' && payload.title.trim(), 'title is required');
  invariant(payload.grading?.mode === 'embedded-key' || payload.grading?.mode === 'host', 'grading.mode must be embedded-key or host');
  if (payload.language !== undefined) invariant(typeof payload.language === 'string' && LANGUAGE_RE.test(payload.language), 'language is invalid');
  if (payload.presentation !== undefined) {
    invariant(payload.presentation && typeof payload.presentation === 'object' && !Array.isArray(payload.presentation), 'presentation must be an object');
    if (payload.presentation.questionMode !== undefined) invariant(QUESTION_MODES.has(payload.presentation.questionMode), 'presentation.questionMode is invalid');
    if (payload.presentation.shuffleQuestions !== undefined) invariant(typeof payload.presentation.shuffleQuestions === 'boolean', 'presentation.shuffleQuestions must be boolean');
    if (payload.presentation.showFeedback !== undefined) invariant(FEEDBACK_MODES.has(payload.presentation.showFeedback), 'presentation.showFeedback is invalid');
  }
  if (payload.attemptPolicy !== undefined) {
    invariant(payload.attemptPolicy && typeof payload.attemptPolicy === 'object' && !Array.isArray(payload.attemptPolicy), 'attemptPolicy must be an object');
    if (payload.attemptPolicy.maxAttempts !== undefined) positiveInteger(payload.attemptPolicy.maxAttempts, 'attemptPolicy.maxAttempts');
    if (payload.attemptPolicy.timeLimitSeconds !== undefined) positiveInteger(payload.attemptPolicy.timeLimitSeconds, 'attemptPolicy.timeLimitSeconds');
  }
  invariant(Array.isArray(payload.questions) && payload.questions.length > 0, 'questions must be a non-empty array');

  const qids = new Set();
  for (const question of payload.questions) {
    invariant(question && typeof question === 'object' && !Array.isArray(question), 'question must be an object');
    invariant(typeof question.id === 'string' && TOKEN_RE.test(question.id), 'question id is invalid');
    invariant(!qids.has(question.id), `duplicate question id ${question.id}`);
    qids.add(question.id);
    invariant(QUESTION_TYPES.has(question.type), `${question.id}: unsupported type ${question.type}`);
    invariant(typeof question.prompt === 'string' && question.prompt.trim(), `${question.id}: prompt is required`);
    invariant(Number.isFinite(question.points) && question.points >= 0, `${question.id}: points must be non-negative`);
    if (question.penalty !== undefined) invariant(Number.isFinite(question.penalty) && question.penalty >= 0, `${question.id}: penalty must be non-negative`);
    if (question.scoring !== undefined) invariant(SCORING_MODES.has(question.scoring), `${question.id}: invalid scoring mode`);
    if (question.timeLimitSeconds !== undefined) positiveInteger(question.timeLimitSeconds, `${question.id}: timeLimitSeconds`);
    if (question.required !== undefined) invariant(typeof question.required === 'boolean', `${question.id}: required must be boolean`);
    if (payload.grading.mode === 'embedded-key') invariant(question.solution, `${question.id}: embedded-key grading requires solution`);
    validateQuestionSemantics(question);
  }
  return payload;
}

function validateQuestionSemantics(question) {
  const solution = question.solution;
  if (question.type === 'true-false') {
    const mode = question.trueFalseMode ?? 'single';
    invariant(['single','multiple'].includes(mode), `${question.id}: trueFalseMode must be single or multiple`);
    if (mode === 'multiple') {
      invariant(Array.isArray(question.statements) && question.statements.length >= 2, `${question.id}: multiple true-false requires at least two statements`);
      const ids = uniqueIds(question.statements, `${question.id} statement`);
      if (solution) {
        invariant(solution.answers && typeof solution.answers === 'object' && !Array.isArray(solution.answers), `${question.id}: solution.answers is required`);
        const answerIds = new Set(Object.keys(solution.answers));
        invariant(answerIds.size === ids.size && [...ids].every((id) => answerIds.has(id)), `${question.id}: every true-false statement requires an answer`);
        for (const [id,value] of Object.entries(solution.answers)) invariant(ids.has(id) && typeof value === 'boolean', `${question.id}: true-false answer ${id} must be boolean`);
      }
      return;
    }
  }
  if (['single-choice', 'multiple-choice', 'true-false'].includes(question.type)) {
    invariant(Array.isArray(question.choices) && question.choices.length >= 2, `${question.id}: choices are required`);
    const ids = uniqueIds(question.choices, `${question.id} choice`);
    if (question.type === 'true-false') invariant(ids.size === 2, `${question.id}: true-false requires exactly two choices`);
    if (solution) {
      invariant(Array.isArray(solution.choiceIds) && solution.choiceIds.length > 0, `${question.id}: solution.choiceIds is required`);
      invariant(new Set(solution.choiceIds).size === solution.choiceIds.length, `${question.id}: solution.choiceIds contains duplicates`);
      for (const id of solution.choiceIds) invariant(ids.has(id), `${question.id}: solution references unknown choice ${id}`);
      if (question.type !== 'multiple-choice') invariant(solution.choiceIds.length === 1, `${question.id}: exactly one correct choice is required`);
    }
    return;
  }
  if (question.type === 'text') {
    if (solution) {
      invariant(Array.isArray(solution.acceptedAnswers) && solution.acceptedAnswers.length > 0, `${question.id}: acceptedAnswers is required`);
      invariant(solution.acceptedAnswers.every((value) => typeof value === 'string' && value.length > 0), `${question.id}: acceptedAnswers must contain non-empty strings`);
    }
    return;
  }
  if (question.type === 'fill-blanks') {
    if (question.body !== undefined) invariant(typeof question.body === 'string' && question.body.length <= 20000, `${question.id}: body must be a string`);
    if (question.inputMode !== undefined) invariant(['text','drag'].includes(question.inputMode), `${question.id}: inputMode must be text or drag`);
    invariant(Array.isArray(question.blanks) && question.blanks.length > 0, `${question.id}: blanks are required`);
    const ids = new Set();
    for (const blank of question.blanks) {
      invariant(blank && typeof blank === 'object' && !Array.isArray(blank), `${question.id}: blank must be an object`);
      invariant(typeof blank.id === 'string' && TOKEN_RE.test(blank.id), `${question.id}: blank has an invalid id`);
      invariant(!ids.has(blank.id), `${question.id}: blank repeats id ${blank.id}`);
      if (blank.options !== undefined) invariant(Array.isArray(blank.options) && blank.options.every((value) => typeof value === 'string' && value.length > 0), `${question.id}: blank options must be strings`);
      ids.add(blank.id);
    }
    if (solution) {
      invariant(solution.answers && typeof solution.answers === 'object' && !Array.isArray(solution.answers), `${question.id}: solution.answers is required`);
      const answerIds = new Set(Object.keys(solution.answers));
      invariant(answerIds.size === ids.size && [...ids].every((id) => answerIds.has(id)), `${question.id}: blank solution ids must match blanks`);
      for (const accepted of Object.values(solution.answers)) {
        invariant(Array.isArray(accepted) && accepted.length > 0 && accepted.every((value) => typeof value === 'string' && value.length > 0), `${question.id}: every blank solution requires accepted strings`);
      }
    }
    return;
  }
  if (question.type === 'ordering') {
    invariant(Array.isArray(question.items) && question.items.length >= 2, `${question.id}: items are required`);
    const ids = uniqueIds(question.items, `${question.id} ordering item`);
    if (solution) {
      invariant(Array.isArray(solution.order) && solution.order.length === ids.size, `${question.id}: solution.order is incomplete`);
      invariant(new Set(solution.order).size === ids.size && solution.order.every((id) => ids.has(id)), `${question.id}: solution.order must contain every item once`);
    }
    return;
  }
  if (question.type === 'classification') {
    invariant(Array.isArray(question.items) && question.items.length >= 2, `${question.id}: classification items are required`);
    invariant(Array.isArray(question.categories) && question.categories.length >= 2, `${question.id}: classification categories are required`);
    const items = uniqueIds(question.items, `${question.id} classification item`);
    const categories = uniqueIds(question.categories, `${question.id} classification category`);
    if (solution) {
      invariant(Array.isArray(solution.assignments) && solution.assignments.length === items.size, `${question.id}: solution.assignments is incomplete`);
      const seen = new Set();
      for (const assignment of solution.assignments) {
        invariant(items.has(assignment.item) && categories.has(assignment.category), `${question.id}: classification solution references unknown item or category`);
        invariant(!seen.has(assignment.item), `${question.id}: classification solution repeats item ${assignment.item}`);
        seen.add(assignment.item);
      }
    }
    return;
  }
  if (question.type === 'matching') {
    invariant(Array.isArray(question.left) && question.left.length > 0, `${question.id}: left items are required`);
    invariant(Array.isArray(question.right) && question.right.length > 0, `${question.id}: right items are required`);
    const left = uniqueIds(question.left, `${question.id} left item`);
    const right = uniqueIds(question.right, `${question.id} right item`);
    if (solution) {
      invariant(Array.isArray(solution.pairs) && solution.pairs.length === left.size, `${question.id}: solution.pairs is incomplete`);
      const seen = new Set();
      for (const pair of solution.pairs) {
        invariant(left.has(pair.left) && right.has(pair.right), `${question.id}: solution pair references unknown item`);
        invariant(!seen.has(pair.left), `${question.id}: solution repeats left item ${pair.left}`);
        seen.add(pair.left);
      }
    }
  }
}

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

function defaultScoring(question) {
  if (question.type === 'true-false' && question.trueFalseMode === 'multiple') return 'partial-per-item';
  return ['single-choice', 'true-false', 'text'].includes(question.type) ? 'all-or-nothing' : 'partial-per-item';
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function boundedScore(question, hits, errors, total) {
  const points = Number(question.points ?? 0);
  if (total <= 0 || points <= 0) return 0;
  const mode = question.scoring ?? defaultScoring(question);
  let raw;
  if (mode === 'all-or-nothing') {
    raw = hits === total && errors === 0 ? points : 0;
  } else {
    raw = hits * (points / total);
    if (mode === 'partial-with-penalty') raw -= errors * Number(question.penalty ?? 0);
  }
  const floor = mode === 'partial-with-penalty' ? -points : 0;
  return round2(Math.min(points, Math.max(floor, raw)));
}

export function scoreQuestion(question, answer) {
  const points = round2(Number(question.points ?? 0));
  if (!question.solution) {
    return {questionId: question.id, graded: false, correct: null, hits: 0, errors: 0, pointsAwarded: 0, pointsPossible: points};
  }
  const supplied = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  let hits = 0;
  let errors = 0;
  let total = 1;

  if (question.type === 'true-false' && question.trueFalseMode === 'multiple') {
    const values = supplied.booleans && typeof supplied.booleans === 'object' && !Array.isArray(supplied.booleans) ? supplied.booleans : {};
    const expected = question.solution.answers;
    total = Object.keys(expected).length;
    for (const [statementId, correctValue] of Object.entries(expected)) {
      if (typeof values[statementId] === 'boolean' && values[statementId] === correctValue) hits += 1;
      else errors += 1;
    }
  } else if (['single-choice', 'multiple-choice', 'true-false'].includes(question.type)) {
    const selected = new Set(Array.isArray(supplied.choiceIds) ? supplied.choiceIds.map(String) : []);
    const correct = new Set(question.solution.choiceIds.map(String));
    hits = [...selected].filter((id) => correct.has(id)).length;
    errors = [...selected].filter((id) => !correct.has(id)).length;
    total = question.type === 'multiple-choice' ? correct.size : 1;
  } else if (question.type === 'text') {
    const actual = normalizeText(supplied.text);
    const accepted = new Set(question.solution.acceptedAnswers.map(normalizeText));
    hits = actual && accepted.has(actual) ? 1 : 0;
    errors = hits ? 0 : 1;
  } else if (question.type === 'fill-blanks') {
    const values = supplied.blanks && typeof supplied.blanks === 'object' && !Array.isArray(supplied.blanks) ? supplied.blanks : {};
    const expected = question.solution.answers;
    total = Object.keys(expected).length;
    for (const [blankId, acceptedRaw] of Object.entries(expected)) {
      const actual = normalizeText(values[blankId]);
      const accepted = new Set(acceptedRaw.map(normalizeText));
      if (actual && accepted.has(actual)) hits += 1;
      else errors += 1;
    }
  } else if (question.type === 'ordering') {
    const order = Array.isArray(supplied.order) ? supplied.order.map(String) : [];
    const expected = question.solution.order.map(String);
    total = expected.length;
    hits = expected.reduce((count, item, index) => count + (order[index] === item ? 1 : 0), 0);
    errors = total - hits;
  } else if (question.type === 'classification') {
    const classifications = supplied.classifications && typeof supplied.classifications === 'object' && !Array.isArray(supplied.classifications) ? supplied.classifications : {};
    const expected = new Map(question.solution.assignments.map((assignment) => [String(assignment.item), String(assignment.category)]));
    total = expected.size;
    for (const [item, category] of expected.entries()) {
      if (String(classifications[item] ?? '') === category) hits += 1;
      else errors += 1;
    }
  } else if (question.type === 'matching') {
    const pairs = supplied.pairs && typeof supplied.pairs === 'object' && !Array.isArray(supplied.pairs) ? supplied.pairs : {};
    const expected = new Map(question.solution.pairs.map((pair) => [String(pair.left), String(pair.right)]));
    total = expected.size;
    for (const [left, right] of expected.entries()) {
      if (String(pairs[left] ?? '') === right) hits += 1;
      else errors += 1;
    }
  }

  const scoringMode = question.scoring ?? defaultScoring(question);
  const effectiveHits = question.type === 'multiple-choice' && scoringMode === 'partial-per-item' ? Math.max(0, hits - errors) : hits;
  const pointsAwarded = boundedScore(question, effectiveHits, errors, total);
  const correct = Math.abs(pointsAwarded - points) < 1e-9 && errors === 0;
  return {questionId: question.id, graded: true, correct, hits, errors, pointsAwarded, pointsPossible: points};
}

export function scoreQuestionnaire(payload, answers = {}) {
  validateQuestionnaire(payload);
  if (payload.grading.mode === 'host') {
    const questions = payload.questions.map((question) => ({
      questionId: question.id,
      graded: false,
      correct: null,
      hits: 0,
      errors: 0,
      pointsAwarded: 0,
      pointsPossible: round2(Number(question.points ?? 0)),
    }));
    return {graded: false, raw: 0, max: round2(questions.reduce((sum, item) => sum + item.pointsPossible, 0)), normalized: null, questions};
  }
  const questions = payload.questions.map((question) => scoreQuestion(question, answers?.[question.id]));
  const max = round2(questions.reduce((sum, item) => sum + item.pointsPossible, 0));
  const summed = round2(questions.reduce((sum, item) => sum + item.pointsAwarded, 0));
  const raw = round2(Math.max(0, Math.min(max, summed)));
  const graded = questions.every((item) => item.graded);
  const normalized = !graded || max <= 0 ? null : Math.round((raw / max) * 1_000_000) / 1_000_000;
  return {graded, raw, max, normalized, questions};
}

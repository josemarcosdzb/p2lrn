// One boundary for normal courses, hosted LMS use and offline deliveries.
// In deferred grading, no answer key or answer explanation can be shipped to
// learners. This is not merely a UI choice to hide feedback.
export const QUESTIONNAIRE_GRADING_MODES=Object.freeze(['embedded-key','host']);

export function questionnaireForLearner(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw new TypeError('El cuestionario debe ser un objeto.');
  const copy=structuredClone(payload);
  if(copy.grading?.mode!=='host')return copy;
  if(!Array.isArray(copy.questions))throw new TypeError('El cuestionario debe contener preguntas.');
  for(const question of copy.questions){
    if(!question||typeof question!=='object')throw new TypeError('La pregunta no es válida.');
    delete question.solution;
    delete question.explanation;
  }
  copy.presentation??={};
  copy.presentation.showFeedback='never';
  return copy;
}

export function setQuestionnaireGradingMode(payload,mode){
  if(!QUESTIONNAIRE_GRADING_MODES.includes(mode))
    throw new TypeError('Modo de corrección no admitido.');
  const changed=structuredClone(payload);
  changed.grading={...changed.grading,mode};
  return questionnaireForLearner(changed);
}

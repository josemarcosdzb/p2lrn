import {buildQuestionnaireGame} from '../questionnaire-games-core.js';
import {createQuestionnaireGameRuntime} from '../questionnaire-game-runtime.js';
import {validateQuestionnaire} from '../questionnaire-core.js';
import {playerUiText,playerDiagnosticText} from './ui-i18n.js';

const gameStyleUrl = new URL('../questionnaire-games.css', import.meta.url);
gameStyleUrl.search = new URL(import.meta.url).search;
export const stylesheets = [gameStyleUrl.href];

export function el(tag, attrs = {}, text = null) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (name === 'class') node.className = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else if (name === 'checked') node.checked = Boolean(value);
    else if (name === 'value') node.value = value;
    else if (name.startsWith('aria-') || name === 'role') node.setAttribute(name, String(value));
    else node.setAttribute(name, String(value));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

export async function setupGame({container, bytes, decodeJson, rendererId, eventTarget, adapter, context}) {
  const payload = decodeJson(bytes, 'native questionnaire');
  validateQuestionnaire(payload);
  if(payload.questions.some((question)=>Number.isInteger(question.timeLimitSeconds))){const error=new Error(playerUiText('El renderer de juego no implementa tiempo por pregunta; se requiere el renderer estándar.'));error.code='P2LRN_TIMING_UNSUPPORTED';throw error;}
  const game = buildQuestionnaireGame(payload, rendererId, {seedSource: context?.contentRoot ?? ''});
  if (!game.compatible) { const error = new Error(playerUiText(game.name)+(playerUiText(' no puede representar fielmente este cuestionario completo. '))+game.reasons.map((reason)=>playerDiagnosticText(reason)).join(' ')); error.code = 'P2LRN_RENDERER_INCOMPATIBLE'; throw error; }
  const runtime = await createQuestionnaireGameRuntime(container, payload, {rendererId, eventTarget, adapter, context});
  container.replaceChildren();
  const shell = el('section', {class: 'p2lrn-game-shell'});
  const header = el('header', {class: 'p2lrn-game-header'});
  header.append(el('p', {class: 'p2lrn-game-kicker'}, playerUiText(game.name)), el('h2', {}, payload.title));
  if (payload.description) header.append(el('p', {class: 'p2lrn-game-description'}, payload.description));
  const initialTiming = runtime.timingSnapshot();
  let timingNode = null;
  if (initialTiming.attemptRemainingSeconds !== null) {
    timingNode = el('p', {class: 'p2lrn-game-timer', role: 'timer', 'aria-live': 'polite'});
    const updateTiming = (timing) => {
      if (!timingNode) return;
      if (runtime.state.completed && runtime.state.completionReason === 'time-limit') {
        timingNode.textContent = playerUiText('Tiempo agotado · actividad finalizada');
        shell.querySelectorAll('button, input, textarea, select').forEach((control) => { control.disabled = true; });
        return;
      }
      timingNode.textContent = playerUiText(`Tiempo restante: ${timing.attemptRemainingSeconds ?? 0}s`);
    };
    runtime.session.onTimingChange = updateTiming;
    updateTiming(initialTiming);
    header.append(timingNode);
  }
  shell.append(header);
  container.append(shell);
  return {payload, game, runtime, shell, timingNode};
}

export function statusNode(initial = '') {
  return el('p', {class: 'p2lrn-game-status', role: 'status', 'aria-live': 'polite'}, playerUiText(initial));
}

export function actionButton(text, onClick, className = 'p2lrn-game-button') {
  const button = el('button', {type: 'button', class: className}, playerUiText(text));
  button.addEventListener('click', onClick);
  return button;
}

export function finishPanel(runtime, shell, {
  label = 'Finalizar actividad', checkPending = null, onIncomplete = null,
} = {}) {
  const actions = el('div', {class: 'p2lrn-game-actions'});
  const status = statusNode('');
  const pendingNote=typeof checkPending==='function'?statusNode(''):null;
  let submitting=false;
  const finish = actionButton(label, async () => {
    if(submitting||runtime.state.completed)return;
    const pending=checkPending?.()??[];
    if(pending.length){
      status.textContent=playerUiText('No puedes finalizar: quedan pruebas sin completar.');
      onIncomplete?.(pending[0]);
      refresh();
      return;
    }
    submitting=true;
    try{
      const score = await runtime.finish();
      if (!score) {
        status.textContent = playerUiText('Faltan respuestas obligatorias.');
        return;
      }
      const reveal=(runtime.payload?.presentation?.showFeedback ?? 'never') !== 'never';
      status.textContent = playerUiText(reveal && score.graded !== false
        ? `Resultado: ${score.raw} / ${score.max} puntos (${Math.round((score.normalized ?? 0) * 100)}%).`
        : 'Actividad entregada. La corrección no está disponible para el alumno.');
      finish.disabled = true;
      shell.querySelectorAll('button,input,textarea,select').forEach(control=>{control.disabled=true;});
    }finally{submitting=false;}
  });
  function refresh(){
    if(!pendingNote||runtime.state.completed)return;
    const pending=checkPending?.()??[];
    finish.textContent=playerUiText(pending.length?'Revisar pendientes':label);
    pendingNote.textContent=pending.length
      ?playerUiText('Pruebas pendientes: ')+pending.map(p=>`${p.index+1}. ${p.label} (${p.remaining})`).join(' · ')
      :playerUiText('Todas las pruebas completadas. Ya puedes finalizar.');
  }
  actions.append(finish);
  if(pendingNote)shell.append(pendingNote);
  shell.append(actions, status);
  refresh();
  return {actions, status, finish, refresh};
}

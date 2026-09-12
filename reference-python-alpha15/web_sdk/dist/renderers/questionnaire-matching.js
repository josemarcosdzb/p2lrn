import {MATCHING_RENDERER} from '../renderer-registry.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function derange(items) {
  if (items.length < 2) return [...items];
  const result = [...items];
  for (let i = 0; i + 1 < result.length; i += 2) [result[i], result[i + 1]] = [result[i + 1], result[i]];
  if (result.length % 2 === 1 && result.length >= 3) {
    const n = result.length; [result[n-3], result[n-2], result[n-1]] = [result[n-2], result[n-1], result[n-3]];
  }
  return result;
}

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: MATCHING_RENDERER});
  const pairs = game.data.pairs;
  const board = el('div', {class: 'p2rln-match-grid'});
  const left = el('div', {class: 'p2rln-match-column'}); const right = el('div', {class: 'p2rln-match-column'});
  const status = statusNode('Selecciona una pista y después su respuesta.');
  let selected = null; const solved = new Set();
  const leftButtons = new Map(); const rightButtons = new Map();
  for (const pair of pairs) {
    const button = el('button', {type: 'button', class: 'p2rln-game-card'}, pair.left);
    button.addEventListener('click', () => {
      if (solved.has(pair.id)) return;
      leftButtons.forEach((node) => node.classList.remove('is-selected'));
      selected = pair; button.classList.add('is-selected');
    });
    leftButtons.set(pair.id, button); left.append(button);
  }
  for (const pair of derange(pairs)) {
    const button = el('button', {type: 'button', class: 'p2rln-game-card'}, pair.right);
    button.addEventListener('click', () => {
      if (!selected) { status.textContent = 'Selecciona primero un elemento de la izquierda.'; return; }
      if (selected.id !== pair.id) { status.textContent = 'Esa relación no es correcta.'; return; }
      solved.add(pair.id); runtime.applyPatch(pair.questionId, pair.patch);
      const l = leftButtons.get(pair.id); l?.classList.add('is-solved'); if (l) l.disabled = true;
      button.classList.add('is-solved'); button.disabled = true; selected = null;
      leftButtons.forEach((node) => node.classList.remove('is-selected'));
      status.textContent = `Relación correcta. ${solved.size}/${pairs.length}.`;
      if (solved.size === pairs.length) void runtime.finish().then((score) => { if (score) status.textContent = `Emparejamiento completado: ${score.pointsEarned}/${score.pointsPossible} puntos.`; });
    });
    rightButtons.set(pair.id, button); right.append(button);
  }
  board.append(left, right); shell.append(board, status); return runtime;
}

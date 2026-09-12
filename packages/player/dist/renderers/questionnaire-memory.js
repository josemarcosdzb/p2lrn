import {MEMORY_RENDERER} from '../renderer-registry.js';
import {hashText, shuffleDeterministic} from '../questionnaire-games-core.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: MEMORY_RENDERER});
  const pairs = game.data.pairs;
  const cards = pairs.flatMap((pair) => [
    {key: `${pair.id}:l`, pairId: pair.id, side: 'l', text: pair.left, patch: pair.patch, questionId: pair.questionId},
    {key: `${pair.id}:r`, pairId: pair.id, side: 'r', text: pair.right, patch: pair.patch, questionId: pair.questionId},
  ]);
  const shuffled = shuffleDeterministic(cards, hashText(`${options.context?.contentRoot ?? ''}|memory-layout`));
  const board = el('div', {class: 'p2lrn-memory-grid'});
  const status = statusNode('Encuentra las parejas de pista y respuesta.');
  let first = null;
  const solved = new Set();
  let locked = false;

  for (const card of shuffled) {
    const button = el('button', {type: 'button', class: 'p2lrn-game-card', 'aria-label': 'Carta oculta'}, '?');
    button.dataset.cardKey = card.key;
    button.addEventListener('click', () => {
      if (locked || solved.has(card.pairId) || first?.card.key === card.key) return;
      button.textContent = card.text;
      button.setAttribute('aria-label', card.text);
      button.classList.add('is-selected');
      if (!first) { first = {card, button}; return; }
      const previous = first;
      first = null;
      locked = true;
      if (previous.card.pairId === card.pairId && previous.card.side !== card.side) {
        solved.add(card.pairId);
        previous.button.classList.remove('is-selected');
        button.classList.remove('is-selected');
        previous.button.classList.add('is-solved'); button.classList.add('is-solved');
        previous.button.disabled = true; button.disabled = true;
        runtime.applyPatch(card.questionId, card.patch);
        status.textContent = `Pareja correcta. ${solved.size}/${pairs.length}.`;
        locked = false;
        if (solved.size === pairs.length) void runtime.finish().then((score) => { if (score) status.textContent = `Memoria completada: ${score.pointsEarned}/${score.pointsPossible} puntos.`; });
        return;
      }
      status.textContent = 'No forman pareja.';
      window.setTimeout(() => {
        previous.button.textContent = '?'; button.textContent = '?';
        previous.button.setAttribute('aria-label', 'Carta oculta'); button.setAttribute('aria-label', 'Carta oculta');
        previous.button.classList.remove('is-selected'); button.classList.remove('is-selected');
        locked = false;
      }, 550);
    });
    board.append(button);
  }
  shell.append(board, status);
  return runtime;
}

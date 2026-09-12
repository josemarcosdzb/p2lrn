import {TRUE_FALSE_RENDERER} from '../renderer-registry.js';
import {el, finishPanel, setupGame, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: TRUE_FALSE_RENDERER});
  const list = el('div', {class: 'p2lrn-vf-list'});
  for (const item of game.data.questions) {
    const card = el('section', {class: 'p2lrn-vf-card'}); card.append(el('h3', {}, item.prompt));
    const actions = el('div', {class: 'p2lrn-game-actions'});
    for (const [label, choiceId] of [['Verdadero', item.trueId], ['Falso', item.falseId]]) {
      const button = el('button', {type: 'button', class: 'p2lrn-game-choice'}, label);
      button.addEventListener('click', () => {
        actions.querySelectorAll('button').forEach((node) => node.classList.remove('is-selected'));
        button.classList.add('is-selected'); runtime.applyPatch(item.questionId, {kind: 'choice-set', choiceId});
      });
      actions.append(button);
    }
    card.append(actions); list.append(card);
  }
  shell.append(list); finishPanel(runtime, shell); return runtime;
}

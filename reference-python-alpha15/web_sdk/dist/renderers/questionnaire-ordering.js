import {ORDERING_RENDERER} from '../renderer-registry.js';
import {el, finishPanel, setupGame, stylesheets} from './game-common.js';
export {stylesheets};

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: ORDERING_RENDERER});
  const board = el('div', {class: 'p2rln-game-board'});
  for (const sequence of game.data.sequences) {
    const card = el('section', {class: 'p2rln-order-card'}); card.append(el('h3', {}, sequence.title));
    let current = [...sequence.items].reverse();
    const list = el('div');
    const redraw = () => {
      list.replaceChildren();
      current.forEach((item, index) => {
        const row = el('div', {class: 'p2rln-order-row'}); row.append(el('span', {}, item.text));
        const controls = el('div', {class: 'p2rln-order-controls'});
        const up = el('button', {type: 'button', class: 'p2rln-game-button', disabled: index === 0, 'aria-label': `Subir ${item.text}`}, '↑');
        const down = el('button', {type: 'button', class: 'p2rln-game-button', disabled: index === current.length - 1, 'aria-label': `Bajar ${item.text}`}, '↓');
        up.addEventListener('click', () => { [current[index-1], current[index]] = [current[index], current[index-1]]; runtime.replaceAnswer(sequence.questionId, {order: current.map((x) => x.id)}); redraw(); });
        down.addEventListener('click', () => { [current[index+1], current[index]] = [current[index], current[index+1]]; runtime.replaceAnswer(sequence.questionId, {order: current.map((x) => x.id)}); redraw(); });
        controls.append(up, down); row.append(controls); list.append(row);
      });
    };
    runtime.replaceAnswer(sequence.questionId, {order: current.map((x) => x.id)}); redraw(); card.append(list); board.append(card);
  }
  shell.append(board); finishPanel(runtime, shell); return runtime;
}

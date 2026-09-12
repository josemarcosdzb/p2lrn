import {WORD_SEARCH_RENDERER} from '../renderer-registry.js';
import {el, setupGame, statusNode, stylesheets} from './game-common.js';
export {stylesheets};

function key(row, col) { return `${row}:${col}`; }

export async function render(options) {
  const {game, runtime, shell} = await setupGame({...options, rendererId: WORD_SEARCH_RENDERER});
  const {grid, words} = game.data; const found = new Set(); const foundCells = new Set(); let start = null;
  const status = statusNode('Selecciona la primera y la última letra de una respuesta.');
  const table = el('table', {class: 'p2rln-word-grid', 'aria-label': 'Sopa de letras'}); const body = document.createElement('tbody');
  const buttons = new Map();
  const clearStart = () => { buttons.forEach((button) => button.classList.remove('is-start')); start = null; };
  const redrawSolved = () => { for (const cell of foundCells) buttons.get(cell)?.classList.add('is-solved'); };
  grid.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((letter, c) => {
      const td = document.createElement('td'); const button = el('button', {type: 'button', class: 'p2rln-game-cell', 'aria-label': `Fila ${r+1}, columna ${c+1}, ${letter}`}, letter);
      buttons.set(key(r,c), button);
      button.addEventListener('click', () => {
        if (!start) { start = {row:r,col:c}; button.classList.add('is-start'); status.textContent = 'Ahora selecciona la última letra.'; return; }
        const match = words.find((word) => !found.has(word.id) && ((word.start.row === start.row && word.start.col === start.col && word.end.row === r && word.end.col === c) || (word.end.row === start.row && word.end.col === start.col && word.start.row === r && word.start.col === c)));
        clearStart();
        if (!match) { status.textContent = 'Ese tramo no corresponde a una respuesta completa.'; return; }
        found.add(match.id); match.cells.forEach((cell) => foundCells.add(key(cell.row,cell.col))); redrawSolved(); runtime.applyPatch(match.questionId, match.patch);
        status.textContent = `Respuesta encontrada. ${found.size}/${words.length}.`;
        if (found.size === words.length) void runtime.finish().then((score) => { if (score) status.textContent = `Sopa completada: ${score.pointsEarned}/${score.pointsPossible} puntos.`; });
      });
      td.append(button); tr.append(td);
    }); body.append(tr);
  }); table.append(body);
  const scroll = el('div', {class: 'p2rln-grid-scroll'}); scroll.append(table);
  const clues = el('div', {class: 'p2rln-clues'}); const group = document.createElement('div'); group.append(el('h3', {}, 'Pistas'));
  const ol = document.createElement('ol'); words.forEach((word) => { const li = document.createElement('li'); li.textContent = word.clue; ol.append(li); }); group.append(ol); clues.append(group);
  shell.append(scroll, clues, status); return runtime;
}

import {normalizeText, validateQuestionnaire} from './questionnaire-core.js';
import {
  MEMORY_RENDERER,
  MATCHING_RENDERER,
  ORDERING_RENDERER,
  CLASSIFICATION_RENDERER,
  TRUE_FALSE_RENDERER,
  WORD_SEARCH_RENDERER,
  CROSSWORD_RENDERER,
  ROSCO_RENDERER,
  THREE_D_RENDERER,
} from './renderer-registry.js';

export const SPANISH_ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
const GENERIC_ANSWERS = new Set(['verdadero', 'falso', 'true', 'false', 'si', 'sí', 'no']);

function invariant(condition, message) { if (!condition) throw new Error(message); }
function unique(items) { return [...new Set(items)]; }
function byId(items = []) { return new Map(items.map((item) => [String(item.id), item])); }

export function hashText(value) {
  let result = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    result ^= String(value).charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function seededRandom(seed) {
  let state = Number(seed) >>> 0 || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic(items, seed) {
  const output = [...items];
  const random = seededRandom(seed);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

export function normalizeWord(value) {
  const marker = '\uE000';
  return String(value ?? '')
    .toLocaleUpperCase('es-ES')
    .replace(/Ñ/g, marker)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(new RegExp(marker, 'g'), 'Ñ')
    .replace(/[^A-ZÑ0-9]/g, '');
}

function validSingleAnswer(values) {
  const normalized = unique((values ?? []).map((item) => String(item ?? '').trim()).filter(Boolean));
  return normalized.length === 1 ? normalized[0] : null;
}

function choiceSolutions(question) {
  if (!question.solution || !Array.isArray(question.solution.choiceIds)) return [];
  const choices = byId(question.choices);
  return question.solution.choiceIds
    .map((id) => choices.get(String(id)))
    .filter(Boolean)
    .map((choice) => ({id: String(choice.id), text: String(choice.text)}));
}

function clueForBlank(question, blankId, index) {
  const blank = (question.blanks ?? []).find((item) => String(item.id) === String(blankId));
  if (blank?.label) return `${question.prompt} — ${blank.label}`;
  if (question.body) return `${question.body} — hueco ${index + 1}`;
  return `${question.prompt} — hueco ${index + 1}`;
}

function lexicalEntriesForQuestion(question, {allowMultipleChoices = false} = {}) {
  const entries = [];
  const add = (suffix, clue, answer, patch) => {
    const cleanAnswer = String(answer ?? '').trim();
    const word = normalizeWord(cleanAnswer);
    if (!cleanAnswer || word.length < 2 || GENERIC_ANSWERS.has(normalizeText(cleanAnswer))) return;
    entries.push({id: `${question.id}:${suffix}`, questionId: question.id, clue: String(clue ?? '').trim(), answer: cleanAnswer, word, patch});
  };

  if (['single-choice', 'multiple-choice'].includes(question.type)) {
    const correct = choiceSolutions(question);
    if (question.type === 'single-choice' && correct.length !== 1) return [];
    if (question.type === 'multiple-choice' && (!correct.length || (!allowMultipleChoices && correct.length !== 1))) return [];
    correct.forEach((choice) => add(`choice:${choice.id}`, question.prompt, choice.text, {kind: 'choice-add', choiceId: choice.id}));
    return entries;
  }

  if (question.type === 'text') {
    const answer = validSingleAnswer(question.solution?.acceptedAnswers);
    if (answer) add('text', question.prompt, answer, {kind: 'text', text: answer});
    return entries;
  }

  if (question.type === 'fill-blanks') {
    const solutions = question.solution?.answers;
    if (!solutions || typeof solutions !== 'object' || Array.isArray(solutions)) return [];
    const blankIds = (question.blanks ?? []).map((item) => String(item.id));
    for (let index = 0; index < blankIds.length; index += 1) {
      const blankId = blankIds[index];
      const answer = validSingleAnswer(solutions[blankId]);
      if (!answer) return [];
      add(`blank:${blankId}`, clueForBlank(question, blankId, index), answer, {kind: 'blank-set', blankId, value: answer});
    }
    return entries;
  }

  if (question.type === 'matching') {
    const left = byId(question.left);
    const right = byId(question.right);
    const pairs = question.solution?.pairs;
    if (!Array.isArray(pairs) || !pairs.length) return [];
    for (const pair of pairs) {
      const l = left.get(String(pair.left));
      const r = right.get(String(pair.right));
      if (!l || !r) return [];
      add(`pair:${l.id}:${r.id}`, l.text, r.text, {kind: 'pair-set', leftId: String(l.id), rightId: String(r.id)});
    }
    return entries;
  }

  return [];
}

function pairEntriesForQuestion(question) {
  const lexical = lexicalEntriesForQuestion(question, {allowMultipleChoices: true});
  return lexical.map((entry) => ({...entry, left: entry.clue, right: entry.answer}));
}

function orderingForQuestion(question) {
  if (question.type !== 'ordering' || !Array.isArray(question.items) || question.items.length < 3) return null;
  const map = byId(question.items);
  const order = question.solution?.order?.map(String) ?? [];
  if (order.length !== question.items.length || new Set(order).size !== order.length || order.some((id) => !map.has(id))) return null;
  const texts = order.map((id) => String(map.get(id).text).trim());
  if (texts.some((text) => !text) || new Set(texts.map(normalizeText)).size !== texts.length) return null;
  return {
    id: `${question.id}:order`, questionId: question.id, title: question.prompt,
    itemIds: order, items: order.map((id) => ({id, text: map.get(id).text})),
    patch: {kind: 'order', order},
  };
}

function trueFalseForQuestion(question) {
  if (question.type !== 'true-false') return null;
  const correct = choiceSolutions(question);
  if (correct.length !== 1 || (question.choices ?? []).length !== 2) return null;
  const values = new Map((question.choices ?? []).map((choice) => [normalizeText(choice.text), String(choice.id)]));
  const trueId = values.get('verdadero') ?? values.get('true');
  const falseId = values.get('falso') ?? values.get('false');
  if (!trueId || !falseId || trueId === falseId) return null;
  return {
    id: `${question.id}:tf`, questionId: question.id, prompt: question.prompt,
    correct: String(correct[0].id) === trueId,
    trueId, falseId,
  };
}

function duplicateConflicts(entries, keyFn) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const ids = new Set();
  for (const group of groups.values()) if (group.length > 1) group.forEach((item) => ids.add(item.questionId));
  return ids;
}

function result(renderer, name, compatible, data = null, reasons = []) {
  return Object.freeze({renderer, name, compatible, data, reasons: Object.freeze([...reasons])});
}

function seedFor(payload, salt, seedSource = '') {
  return hashText(`${seedSource}|${payload.title}|${payload.questions.map((q) => q.id).join('|')}|${salt}`);
}

function requireEmbeddedKey(payload) {
  return payload.grading?.mode === 'embedded-key' && payload.questions.every((question) => question.solution);
}

function lexicalCompatibility(payload, mode) {
  const allowMultipleChoices = mode === 'word-search';
  const all = [];
  const reasons = [];
  for (const question of payload.questions) {
    const entries = lexicalEntriesForQuestion(question, {allowMultipleChoices});
    if (!entries.length) {
      reasons.push(`${question.id}: no tiene una respuesta textual inequívoca compatible.`);
      continue;
    }
    if (mode === 'rosco' && entries.length !== 1) {
      reasons.push(`${question.id}: el rosco necesita exactamente un reto por pregunta.`);
      continue;
    }
    if (mode === 'crossword' && entries.some((entry) => !entry.clue)) {
      reasons.push(`${question.id}: el crucigrama necesita pistas no vacías.`);
      continue;
    }
    all.push(...entries);
  }
  if (reasons.length) return {entries: all, reasons};
  const wordConflicts = duplicateConflicts(all, (entry) => entry.word);
  if (wordConflicts.size) reasons.push(`Respuestas repetidas en preguntas: ${[...wordConflicts].join(', ')}.`);
  if (mode !== 'word-search') {
    const clueConflicts = duplicateConflicts(all, (entry) => normalizeText(entry.clue));
    if (clueConflicts.size) reasons.push(`Pistas repetidas en preguntas: ${[...clueConflicts].join(', ')}.`);
  }
  return {entries: all, reasons};
}

function buildWordSearch(payload, seedSource) {
  if (!requireEmbeddedKey(payload)) return result(WORD_SEARCH_RENDERER, 'Sopa de letras', false, null, ['Necesita soluciones embebidas para convertir el cuestionario sin inventar respuestas.']);
  const evaluated = lexicalCompatibility(payload, 'word-search');
  const candidates = evaluated.entries.filter((entry) => entry.word.length >= 3 && entry.word.length <= 16);
  if (evaluated.reasons.length || candidates.length !== evaluated.entries.length) return result(WORD_SEARCH_RENDERER, 'Sopa de letras', false, null, [...evaluated.reasons, ...(candidates.length !== evaluated.entries.length ? ['Todas las respuestas deben tener entre 3 y 16 caracteres normalizados.'] : [])]);
  if (candidates.length < 3) return result(WORD_SEARCH_RENDERER, 'Sopa de letras', false, null, ['Necesita al menos 3 respuestas textuales.']);
  const random = seededRandom(seedFor(payload, 'word-search', seedSource));
  const maxLength = Math.max(...candidates.map((item) => item.word.length));
  const totalLetters = candidates.reduce((sum, item) => sum + item.word.length, 0);
  const size = Math.max(11, Math.min(40, Math.max(maxLength + 2, Math.ceil(Math.sqrt(totalLetters * 2.4)))));
  const grid = Array.from({length: size}, () => Array(size).fill(null));
  const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const placed = [];
  const ordered = [...candidates].sort((a,b) => b.word.length - a.word.length || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    let found = null;
    for (let attempt = 0; attempt < 600 && !found; attempt += 1) {
      const [dr, dc] = directions[Math.floor(random() * directions.length)];
      const row = Math.floor(random() * size); const col = Math.floor(random() * size);
      const lastRow = row + dr * (entry.word.length - 1); const lastCol = col + dc * (entry.word.length - 1);
      if (lastRow < 0 || lastRow >= size || lastCol < 0 || lastCol >= size) continue;
      const cells = []; let fits = true;
      for (let index = 0; index < entry.word.length; index += 1) {
        const r = row + dr * index; const c = col + dc * index; const existing = grid[r][c];
        if (existing && existing !== entry.word[index]) { fits = false; break; }
        cells.push({row: r, col: c});
      }
      if (!fits) continue;
      cells.forEach((cell, index) => { grid[cell.row][cell.col] = entry.word[index]; });
      found = {...entry, start: cells[0], end: cells[cells.length - 1], cells};
    }
    if (found) placed.push(found);
  }
  if (placed.length !== candidates.length) return result(WORD_SEARCH_RENDERER, 'Sopa de letras', false, null, [`Sólo se pudieron colocar ${placed.length} de ${candidates.length} respuestas; no se genera una versión parcial.`]);
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (!grid[r][c]) grid[r][c] = SPANISH_ALPHABET[Math.floor(random() * SPANISH_ALPHABET.length)];
  return result(WORD_SEARCH_RENDERER, 'Sopa de letras', true, {size, grid, words: placed});
}

function wordsConnected(words) {
  if (words.length <= 1) return true;
  const chars = words.map((word) => new Set([...word]));
  const connected = new Set([0]); let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < words.length; index += 1) {
      if (connected.has(index)) continue;
      if ([...connected].some((other) => [...chars[index]].some((char) => chars[other].has(char)))) { connected.add(index); changed = true; }
    }
  }
  return connected.size === words.length;
}

function occupies(placed, row, col) {
  if (placed.direction === 'H') return placed.row === row && col >= placed.col && col < placed.col + placed.word.length;
  return placed.col === col && row >= placed.row && row < placed.row + placed.word.length;
}

function evaluateCrosswordWord(grid, word, row, col, direction, placed) {
  const rows = grid.length; const cols = grid[0]?.length ?? 0;
  const dr = direction === 'V' ? 1 : 0; const dc = direction === 'H' ? 1 : 0;
  const perpendicular = direction === 'H' ? [[-1,0],[1,0]] : [[0,-1],[0,1]];
  const inside = (r,c) => r >= 0 && r < rows && c >= 0 && c < cols;
  if ((inside(row-dr,col-dc) && grid[row-dr][col-dc]) || (inside(row+dr*word.length,col+dc*word.length) && grid[row+dr*word.length][col+dc*word.length])) return {valid:false,crosses:0};
  let crosses = 0;
  for (let index = 0; index < word.length; index += 1) {
    const r = row + dr*index; const c = col + dc*index;
    if (!inside(r,c)) return {valid:false,crosses:0};
    const existing = grid[r][c];
    if (existing && existing !== word[index]) return {valid:false,crosses:0};
    if (existing === word[index]) {
      const sameDirection = placed.some((item) => item.direction === direction && occupies(item,r,c));
      const perpendicularCross = placed.some((item) => item.direction !== direction && occupies(item,r,c));
      if (sameDirection || !perpendicularCross) return {valid:false,crosses:0};
      crosses += 1; continue;
    }
    for (const [pr,pc] of perpendicular) if (inside(r+pr,c+pc) && grid[r+pr][c+pc]) return {valid:false,crosses:0};
  }
  return {valid:true,crosses};
}

function writeCrosswordWord(grid, word, row, col, direction) {
  for (let index=0; index<word.length; index +=1) grid[row + (direction==='V'?index:0)][col + (direction==='H'?index:0)] = word[index];
}

function findCompleteCrossword(entries, size, seed) {
  const base = [...entries].sort((a,b) => b.word.length-a.word.length || a.id.localeCompare(b.id));
  const random = seededRandom(seed);
  const maxFirst = entries.length <=12?10:entries.length<=20?8:6;
  const firsts = [...base.slice(0,Math.min(maxFirst,base.length)), ...shuffleDeterministic(base.slice(maxFirst), Math.floor(random()*0xffffffff))];
  const nodeLimit = entries.length<=12?9000:entries.length<=20?3500:entries.length<=30?900:Math.max(200,entries.length*3);
  const maxEntryOptions = entries.length<=12?5:entries.length<=20?4:3;
  const maxPositions = entries.length<=12?14:entries.length<=20?10:6;
  let visited = 0;
  const emptyGrid = () => Array.from({length:size},()=>Array(size).fill(null));
  const cloneGrid = (grid) => grid.map((row)=>[...row]);

  const findPositions = (grid, entry, placed, positionsByChar) => {
    const seen = new Set(); const positions=[];
    for (let i=0;i<entry.word.length;i+=1) {
      for (const pos of positionsByChar.get(entry.word[i]) ?? []) {
        for (const direction of ['H','V']) {
          const row = direction==='V'?pos.row-i:pos.row; const col = direction==='H'?pos.col-i:pos.col;
          const key=`${row}:${col}:${direction}`; if(seen.has(key)) continue; seen.add(key);
          const evaluation=evaluateCrosswordWord(grid,entry.word,row,col,direction,placed);
          if(evaluation.valid && evaluation.crosses>0) positions.push({row,col,direction,crosses:evaluation.crosses});
        }
      }
    }
    return positions.sort((a,b)=>b.crosses-a.crosses||a.row-b.row||a.col-b.col||a.direction.localeCompare(b.direction));
  };

  const complete = (grid,pending,placed) => {
    visited +=1; if(visited>nodeLimit) return null; if(!pending.length) return {grid,placed};
    const positionsByChar=new Map(); const seenCells=new Set();
    for(const item of placed) for(let i=0;i<item.word.length;i+=1){const row=item.row+(item.direction==='V'?i:0); const col=item.col+(item.direction==='H'?i:0); const key=`${row}:${col}`; if(seenCells.has(key)) continue; seenCells.add(key); const ch=grid[row]?.[col]; if(!ch)continue; const arr=positionsByChar.get(ch)??[]; arr.push({row,col}); positionsByChar.set(ch,arr);}
    const options=pending.map((entry,index)=>({entry,index,positions:findPositions(grid,entry,placed,positionsByChar)})).filter((item)=>item.positions.length).sort((a,b)=>a.positions.length-b.positions.length||b.entry.word.length-a.entry.word.length||a.entry.id.localeCompare(b.entry.id));
    if(!options.length) return null;
    for(const option of options.slice(0,Math.min(maxEntryOptions,options.length))){const nextPending=pending.filter((_,index)=>index!==option.index); for(const pos of option.positions.slice(0,maxPositions)){if(visited>nodeLimit)return null; const nextGrid=cloneGrid(grid); writeCrosswordWord(nextGrid,option.entry.word,pos.row,pos.col,pos.direction); const placedEntry={...option.entry,row:pos.row,col:pos.col,direction:pos.direction}; const found=complete(nextGrid,nextPending,[...placed,placedEntry]); if(found)return found;}}
    return null;
  };

  for(const first of firsts){if(visited>nodeLimit)break; const grid=emptyGrid(); const row=Math.floor(size/2); const col=Math.max(0,Math.floor((size-first.word.length)/2)); writeCrosswordWord(grid,first.word,row,col,'H'); const found=complete(grid,entries.filter((entry)=>entry.id!==first.id),[{...first,row,col,direction:'H'}]); if(found)return found;}
  return null;
}

function cropCrossword(grid, placed) {
  let minRow=grid.length,maxRow=0,minCol=grid[0]?.length??0,maxCol=0;
  for(let r=0;r<grid.length;r+=1) for(let c=0;c<(grid[r]?.length??0);c+=1) if(grid[r][c]){minRow=Math.min(minRow,r);maxRow=Math.max(maxRow,r);minCol=Math.min(minCol,c);maxCol=Math.max(maxCol,c);}
  const cropped=grid.slice(minRow,maxRow+1).map((row)=>row.slice(minCol,maxCol+1));
  const starts=unique(placed.map((item)=>`${item.row}:${item.col}`)).map((key)=>{const [row,col]=key.split(':').map(Number);return{key,row,col};}).sort((a,b)=>a.row-b.row||a.col-b.col);
  const numbers=new Map(starts.map((start,index)=>[start.key,index+1])); const numberGrid={};
  const entries=placed.map((item)=>({...item,row:item.row-minRow,col:item.col-minCol,number:numbers.get(`${item.row}:${item.col}`)??0}));
  entries.forEach((item)=>{numberGrid[`${item.row}:${item.col}`]=item.number;});
  return {rows:cropped.length,cols:cropped[0]?.length??0,grid:cropped,numbers:numberGrid,entries};
}

function buildCrossword(payload, seedSource) {
  if (!requireEmbeddedKey(payload)) return result(CROSSWORD_RENDERER,'Crucigrama',false,null,['Necesita soluciones embebidas.']);
  const evaluated=lexicalCompatibility(payload,'crossword');
  const candidates=evaluated.entries.filter((entry)=>entry.word.length>=3&&entry.word.length<=17&&entry.clue);
  const reasons=[...evaluated.reasons]; if(candidates.length!==evaluated.entries.length) reasons.push('Todas las respuestas deben tener entre 3 y 17 caracteres y una pista inequívoca.');
  if(reasons.length)return result(CROSSWORD_RENDERER,'Crucigrama',false,null,reasons);
  if(candidates.length<4)return result(CROSSWORD_RENDERER,'Crucigrama',false,null,['Necesita al menos 4 respuestas textuales.']);
  if(candidates.length>80)return result(CROSSWORD_RENDERER,'Crucigrama',false,null,['Admite como máximo 80 respuestas; no se eliminan preguntas para forzarlo.']);
  if(!wordsConnected(candidates.map((item)=>item.word)))return result(CROSSWORD_RENDERER,'Crucigrama',false,null,['Las respuestas no comparten letras suficientes para formar un único crucigrama conectado.']);
  const maxLength=Math.max(...candidates.map((item)=>item.word.length)); const size=Math.max(15,Math.min(45,maxLength+Math.max(8,Math.ceil(candidates.length/2))));
  const built=findCompleteCrossword(candidates,size,seedFor(payload,'crossword',seedSource));
  if(!built||built.placed.length!==candidates.length)return result(CROSSWORD_RENDERER,'Crucigrama',false,null,['No se encontró una disposición completa válida; no se genera una versión parcial.']);
  return result(CROSSWORD_RENDERER,'Crucigrama',true,cropCrossword(built.grid,built.placed));
}

function buildRosco(payload, seedSource) {
  if (!requireEmbeddedKey(payload)) return result(ROSCO_RENDERER,'Rosco',false,null,['Necesita soluciones embebidas.']);
  const evaluated=lexicalCompatibility(payload,'rosco'); if(evaluated.reasons.length)return result(ROSCO_RENDERER,'Rosco',false,null,evaluated.reasons);
  const candidates=evaluated.entries.filter((entry)=>entry.word.length>=2&&[...entry.word].some((ch)=>SPANISH_ALPHABET.includes(ch)));
  const represented=new Set(candidates.map((entry)=>entry.questionId));
  if(candidates.length!==payload.questions.length||represented.size!==payload.questions.length)return result(ROSCO_RENDERER,'Rosco',false,null,['El rosco exige exactamente una letra y un reto por cada pregunta.']);
  if(candidates.length>SPANISH_ALPHABET.length)return result(ROSCO_RENDERER,'Rosco',false,null,[`Hay más retos (${candidates.length}) que letras distintas disponibles (${SPANISH_ALPHABET.length}).`]);
  const byEntry=new Map(candidates.map((entry)=>[entry.id,entry])); const owner=new Map(); const letterByEntry=new Map();
  const possible=(entry)=>unique([...entry.word]).filter((letter)=>SPANISH_ALPHABET.includes(letter)).sort((a,b)=>(entry.word.startsWith(a)?0:1)-(entry.word.startsWith(b)?0:1)||SPANISH_ALPHABET.indexOf(a)-SPANISH_ALPHABET.indexOf(b));
  const assign=(entry,visited)=>{for(const letter of possible(entry)){if(visited.has(letter))continue;visited.add(letter);const current=owner.get(letter);if(!current){owner.set(letter,entry.id);letterByEntry.set(entry.id,letter);return true;}const currentEntry=byEntry.get(current);if(currentEntry&&assign(currentEntry,visited)){owner.set(letter,entry.id);letterByEntry.set(entry.id,letter);return true;}}return false;};
  const order=[...candidates].sort((a,b)=>possible(a).length-possible(b).length||a.id.localeCompare(b.id));
  for(const entry of order) if(!assign(entry,new Set())) return result(ROSCO_RENDERER,'Rosco',false,null,['No se puede asignar una letra distinta a cada reto usando sus propias respuestas.']);
  const elements=candidates.map((entry)=>{const letter=letterByEntry.get(entry.id);return letter?{...entry,letter,mode:entry.word.startsWith(letter)?'starts':'contains'}:null;}).filter(Boolean).sort((a,b)=>SPANISH_ALPHABET.indexOf(a.letter)-SPANISH_ALPHABET.indexOf(b.letter));
  if(elements.length!==payload.questions.length||new Set(elements.map((item)=>item.letter)).size!==payload.questions.length)return result(ROSCO_RENDERER,'Rosco',false,null,['No se pudo mantener la correspondencia exacta 1:1 entre preguntas y letras.']);
  return result(ROSCO_RENDERER,'Rosco',true,{elements,seed:seedFor(payload,'rosco',seedSource)});
}

function buildPairs(payload, renderer, name, seedSource) {
  if (!requireEmbeddedKey(payload)) return result(renderer,name,false,null,['Necesita soluciones embebidas.']);
  const pairs=[]; const reasons=[];
  for(const question of payload.questions){const entries=pairEntriesForQuestion(question);if(!entries.length){reasons.push(`${question.id}: no se puede expresar como pareja inequívoca.`);continue;} pairs.push(...entries);}
  const duplicateLeft=duplicateConflicts(pairs,(item)=>normalizeText(item.left)); const duplicateRight=duplicateConflicts(pairs,(item)=>normalizeText(item.right));
  if(duplicateLeft.size)reasons.push('Hay pistas repetidas que harían ambiguas las parejas.'); if(duplicateRight.size)reasons.push('Hay respuestas repetidas que harían ambiguas las parejas.');
  if(reasons.length)return result(renderer,name,false,null,reasons); if(pairs.length<3)return result(renderer,name,false,null,['Necesita al menos 3 parejas.']);
  return result(renderer,name,true,{pairs:shuffleDeterministic(pairs,seedFor(payload,renderer,seedSource))});
}

function buildOrdering(payload, seedSource) {
  if(!requireEmbeddedKey(payload))return result(ORDERING_RENDERER,'Ordenar',false,null,['Necesita soluciones embebidas.']);
  const sequences=[]; const reasons=[]; for(const question of payload.questions){const seq=orderingForQuestion(question);if(!seq)reasons.push(`${question.id}: sólo se admiten secuencias completas de al menos 3 elementos.`);else sequences.push(seq);} if(reasons.length)return result(ORDERING_RENDERER,'Ordenar',false,null,reasons);
  return result(ORDERING_RENDERER,'Ordenar',true,{sequences:shuffleDeterministic(sequences,seedFor(payload,'ordering',seedSource))});
}

function buildClassification(payload, seedSource) {
  if(!requireEmbeddedKey(payload))return result(CLASSIFICATION_RENDERER,'Clasificar',false,null,['Necesita soluciones embebidas.']);
  const trials=[]; const reasons=[];
  for(const question of payload.questions){
    if(question.type!=='classification'){reasons.push(`${question.id}: el modo Clasificar exige preguntas classification.`);continue;}
    const objects=(question.items??[]).map((item)=>({id:String(item.id),text:String(item.text)}));
    const categories=(question.categories??[]).map((item)=>({id:String(item.id),text:String(item.text)}));
    const assignments=(question.solution?.assignments??[]).map((item)=>({itemId:String(item.item),categoryId:String(item.category)}));
    if(objects.length<2||categories.length<2||assignments.length!==objects.length){reasons.push(`${question.id}: necesita objetos, categorías y una solución completa.`);continue;}
    trials.push({
      questionId:question.id,
      prompt:question.prompt,
      objects:shuffleDeterministic(objects,seedFor(payload,`classification:${question.id}`,seedSource)),
      categories,
      assignments,
    });
  }
  if(reasons.length||trials.length!==payload.questions.length)return result(CLASSIFICATION_RENDERER,'Clasificar',false,null,reasons);
  return result(CLASSIFICATION_RENDERER,'Clasificar',true,{trials});
}

function buildTrueFalse(payload) {
  if(!requireEmbeddedKey(payload))return result(TRUE_FALSE_RENDERER,'Verdadero/Falso',false,null,['Necesita soluciones embebidas.']);
  const questions=[]; const reasons=[]; for(const question of payload.questions){const item=trueFalseForQuestion(question);if(!item)reasons.push(`${question.id}: debe ser verdadero/falso con exactamente dos opciones inequívocas.`);else questions.push(item);} if(reasons.length)return result(TRUE_FALSE_RENDERER,'Verdadero/Falso',false,null,reasons); if(questions.length<2)return result(TRUE_FALSE_RENDERER,'Verdadero/Falso',false,null,['Necesita al menos 2 preguntas.']); return result(TRUE_FALSE_RENDERER,'Verdadero/Falso',true,{questions});
}

function rotate(items, offset) { if(!items.length)return[]; const n=((offset%items.length)+items.length)%items.length; return [...items.slice(n),...items.slice(0,n)]; }
function shuffledOrderNotSolved(items, correct, seed){let out=shuffleDeterministic(items,seed);if(out.length>1&&out.every((item,index)=>item.id===correct[index]))out=rotate(out,1);return out;}
function rightWithoutFacing(left,right,connections,seed){if(right.length<2)return[...right];const byLeft=new Map();const useRight=new Map();for(const c of connections){byLeft.set(c.leftId,[...(byLeft.get(c.leftId)??[]),c.rightId]);useRight.set(c.rightId,(useRight.get(c.rightId)??0)+1);}const oneToOne=left.length===right.length&&left.every((item)=>(byLeft.get(item.id)??[]).length===1)&&right.every((item)=>useRight.get(item.id)===1);if(oneToOne){const map=new Map(right.map((item)=>[item.id,item]));const solved=left.map((item)=>map.get(byLeft.get(item.id)[0]));if(solved.every(Boolean))return rotate(solved,1+(seed%Math.max(1,right.length-1)));}const base=shuffleDeterministic(right,seed);const set=new Set(connections.map((c)=>`${c.leftId}\0${c.rightId}`));let best=base,bestHits=Infinity;for(let off=0;off<base.length;off+=1){let hits=0;for(let i=0;i<left.length;i+=1){const dest=base[(i+off)%base.length];if(dest&&set.has(`${left[i].id}\0${dest.id}`)){hits+=1;if(hits>=bestHits)break;}}if(hits<bestHits){best=rotate(base,off);bestHits=hits;if(!hits)break;}}return best;}

function build3D(payload, seedSource) {
  if(!requireEmbeddedKey(payload))return result(THREE_D_RENDERER,'3D ordenar/relacionar/clasificar',false,null,['Necesita soluciones embebidas.']);
  const trials=[]; const reasons=[];
  for(const question of payload.questions){
    if(question.type==='ordering'){
      if(!Array.isArray(question.items)||question.items.length<2||!Array.isArray(question.solution?.order)||question.solution.order.length!==question.items.length){reasons.push(`${question.id}: ordenar 3D necesita una solución completa.`);continue;}
      const ids=new Set(question.items.map((item)=>String(item.id)));const correct=question.solution.order.map(String);if(new Set(correct).size!==correct.length||correct.some((id)=>!ids.has(id))){reasons.push(`${question.id}: orden 3D inválido.`);continue;}
      const objects=question.items.map((item)=>({id:String(item.id),text:String(item.text)}));if(new Set(objects.map((item)=>normalizeText(item.text))).size!==objects.length){reasons.push(`${question.id}: elementos 3D con texto duplicado.`);continue;}
      trials.push({type:'ordering-3d',questionId:question.id,prompt:question.prompt,objects:shuffledOrderNotSolved(objects,correct,seedFor(payload,`3d:${question.id}`,seedSource)),correctOrder:correct,patch:{kind:'order',order:correct}});continue;
    }
    if(question.type==='matching'){
      const left=(question.left??[]).map((item)=>({id:String(item.id),text:String(item.text)}));const right=(question.right??[]).map((item)=>({id:String(item.id),text:String(item.text)}));const connections=(question.solution?.pairs??[]).map((pair)=>({leftId:String(pair.left),rightId:String(pair.right)}));
      if(left.length<2||right.length<2||!connections.length){reasons.push(`${question.id}: relacionar 3D necesita al menos dos elementos por lado y relaciones.`);continue;}
      if(new Set(left.map((item)=>normalizeText(item.text))).size!==left.length||new Set(right.map((item)=>normalizeText(item.text))).size!==right.length){reasons.push(`${question.id}: hay textos duplicados no distinguibles físicamente.`);continue;}
      const lset=new Set(left.map((item)=>item.id)),rset=new Set(right.map((item)=>item.id));if(connections.some((c)=>!lset.has(c.leftId)||!rset.has(c.rightId))){reasons.push(`${question.id}: relación 3D apunta a elemento inexistente.`);continue;}
      trials.push({type:'matching-3d',questionId:question.id,prompt:question.prompt,left,right:rightWithoutFacing(left,right,connections,seedFor(payload,`3d:${question.id}`,seedSource)),connections});continue;
    }
    if(question.type==='classification'){
      const objects=(question.items??[]).map((item)=>({id:String(item.id),text:String(item.text)}));
      const categories=(question.categories??[]).map((item)=>({id:String(item.id),text:String(item.text)}));
      const assignments=(question.solution?.assignments??[]).map((item)=>({itemId:String(item.item),categoryId:String(item.category)}));
      if(objects.length<2||categories.length<2||assignments.length!==objects.length){reasons.push(`${question.id}: clasificar 3D necesita objetos, categorías y una asignación completa.`);continue;}
      if(new Set(objects.map((item)=>normalizeText(item.text))).size!==objects.length||new Set(categories.map((item)=>normalizeText(item.text))).size!==categories.length){reasons.push(`${question.id}: clasificar 3D necesita textos distinguibles.`);continue;}
      const itemIds=new Set(objects.map((item)=>item.id)),categoryIds=new Set(categories.map((item)=>item.id)),seen=new Set();
      if(assignments.some((assignment)=>!itemIds.has(assignment.itemId)||!categoryIds.has(assignment.categoryId)||seen.has(assignment.itemId)||(seen.add(assignment.itemId),false))){reasons.push(`${question.id}: asignación 3D inválida o duplicada.`);continue;}
      trials.push({type:'classification-3d',questionId:question.id,prompt:question.prompt,objects:shuffleDeterministic(objects,seedFor(payload,`3d-classification:${question.id}`,seedSource)),categories,assignments});continue;
    }
    reasons.push(`${question.id}: la representación 3D admite ordenar, relacionar y clasificar.`);
  }
  if(reasons.length||trials.length!==payload.questions.length)return result(THREE_D_RENDERER,'3D ordenar/relacionar/clasificar',false,null,reasons);
  return result(THREE_D_RENDERER,'3D ordenar/relacionar/clasificar',true,{trials});
}

export function buildQuestionnaireGame(payload, rendererId, {seedSource = ''} = {}) {
  validateQuestionnaire(payload);
  switch(rendererId){
    case WORD_SEARCH_RENDERER:return buildWordSearch(payload,seedSource);
    case CROSSWORD_RENDERER:return buildCrossword(payload,seedSource);
    case ROSCO_RENDERER:return buildRosco(payload,seedSource);
    case MEMORY_RENDERER:return buildPairs(payload,rendererId,'Memoria',seedSource);
    case MATCHING_RENDERER:return buildPairs(payload,rendererId,'Emparejar',seedSource);
    case ORDERING_RENDERER:return buildOrdering(payload,seedSource);
    case CLASSIFICATION_RENDERER:return buildClassification(payload,seedSource);
    case TRUE_FALSE_RENDERER:return buildTrueFalse(payload);
    case THREE_D_RENDERER:return build3D(payload,seedSource);
    default:throw new Error(`Unknown questionnaire game renderer: ${rendererId}`);
  }
}

export function mergeAnswerPatch(current, patch) {
  const answer = current && typeof current === 'object' && !Array.isArray(current) ? JSON.parse(JSON.stringify(current)) : {};
  switch(patch?.kind){
    case 'choice-add': answer.choiceIds=unique([...(Array.isArray(answer.choiceIds)?answer.choiceIds.map(String):[]),String(patch.choiceId)]); break;
    case 'choice-set': answer.choiceIds=[String(patch.choiceId)]; break;
    case 'text': answer.text=String(patch.text); break;
    case 'blank-set': answer.blanks={...(answer.blanks&&typeof answer.blanks==='object'&&!Array.isArray(answer.blanks)?answer.blanks:{}),[String(patch.blankId)]:String(patch.value)}; break;
    case 'pair-set': answer.pairs={...(answer.pairs&&typeof answer.pairs==='object'&&!Array.isArray(answer.pairs)?answer.pairs:{}),[String(patch.leftId)]:String(patch.rightId)}; break;
    case 'classification-set': answer.classifications={...(answer.classifications&&typeof answer.classifications==='object'&&!Array.isArray(answer.classifications)?answer.classifications:{}),[String(patch.itemId)]:String(patch.categoryId)}; break;
    case 'order': answer.order=patch.order.map(String); break;
    default: break;
  }
  return answer;
}

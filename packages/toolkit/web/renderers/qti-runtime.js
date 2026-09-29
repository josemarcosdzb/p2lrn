import {dispatchRuntimeEvent} from '../runtime-events.js';

export const acceptsPayload = true;
const decoder = new TextDecoder('utf-8', {fatal:false});

function local(node) {
  const value = String(node?.localName ?? node?.nodeName ?? '').toLowerCase();
  return value.startsWith('qti-') ? value.slice(4) : value;
}
function elementChildren(node) {
  return [...(node?.childNodes ?? [])].filter((child) => child.nodeType === 1);
}
function text(node) {
  return String(node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
function attr(node, name) {
  return node?.getAttribute?.(name) ?? node?.getAttribute?.(name.toLowerCase()) ?? null;
}
function responseDeclarations(root) {
  const map = new Map();
  for (const node of root.querySelectorAll('*')) {
    if (local(node) !== 'responsedeclaration') continue;
    const id = attr(node, 'identifier');
    if (!id) continue;
    const values = [];
    for (const child of node.querySelectorAll('*')) {
      if (local(child) === 'value' && child.parentElement && local(child.parentElement) === 'correctresponse') values.push(text(child));
    }
    map.set(id, {identifier:id, correct:values});
  }
  return map;
}
function resolveRelative(base, ref) {
  const value = String(ref ?? '').trim();
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(value)) return null;
  const parts = [];
  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  for (const part of (value.startsWith('/') ? value.slice(1) : baseDir + value).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
function mediaType(path) {
  const ext = String(path).toLowerCase().split(/[?#]/,1)[0].split('.').pop();
  return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm'})[ext] ?? 'application/octet-stream';
}

export async function render({container, bytes, payload, eventTarget, adapter, context}) {
  const xml = decoder.decode(bytes);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('QTI representation is not valid XML.');
  const root = doc.documentElement;
  const kind = local(root);
  if (!['assessment-item','assessmentitem'].includes(kind)) {
    const box = document.createElement('div');
    box.className = 'p2lrn-message';
    box.textContent = `QTI ${kind || 'document'} is preserved, but this browser renderer currently delivers assessment items only.`;
    container.append(box);
    return {destroy(){container.replaceChildren();}};
  }

  const declarations = responseDeclarations(root);
  const responses = new Map();
  const objectUrls = [];
  const shell = document.createElement('section');
  shell.className = 'p2lrn-qti';
  const heading = document.createElement('h3');
  heading.textContent = attr(root, 'title') || attr(root, 'identifier') || 'QTI assessment item';
  shell.append(heading);

  const bodyNode = [...root.querySelectorAll('*')].find((node) => ['itembody','assessmentitembody'].includes(local(node)));
  const body = document.createElement('div');
  body.className = 'p2lrn-qti-body';
  shell.append(body);

  async function renderNode(node, parent) {
    if (node.nodeType === 3) {
      parent.append(document.createTextNode(node.nodeValue ?? ''));
      return;
    }
    if (node.nodeType !== 1) return;
    const name = local(node);
    if (['choiceinteraction','inlinechoiceinteraction','textentryinteraction','extendedtextinteraction'].includes(name)) {
      const responseId = attr(node, 'responseIdentifier') || attr(node, 'response-identifier') || '';
      const label = document.createElement('fieldset');
      const promptNode = elementChildren(node).find((child) => local(child) === 'prompt');
      if (promptNode) {
        const legend = document.createElement('legend');
        legend.textContent = text(promptNode);
        label.append(legend);
      }
      if (name === 'choiceinteraction') {
        const maxChoices = Number(attr(node, 'maxChoices') || attr(node, 'max-choices') || 1);
        const choices = elementChildren(node).filter((child) => local(child) === 'simplechoice');
        for (const choice of choices) {
          const row = document.createElement('label');
          const input = document.createElement('input');
          input.type = maxChoices === 1 ? 'radio' : 'checkbox';
          input.name = `qti-${responseId}`;
          input.value = attr(choice, 'identifier') || text(choice);
          input.addEventListener('change', () => {
            const selected = [...label.querySelectorAll('input:checked')].map((item) => item.value);
            responses.set(responseId, maxChoices === 1 ? (selected[0] ?? '') : selected);
          });
          row.append(input, document.createTextNode(' ' + text(choice)));
          label.append(row);
        }
      } else if (name === 'inlinechoiceinteraction') {
        const select = document.createElement('select');
        const empty = document.createElement('option'); empty.value=''; empty.textContent='—'; select.append(empty);
        for (const choice of elementChildren(node).filter((child) => local(child) === 'inlinechoice')) {
          const option = document.createElement('option');
          option.value = attr(choice,'identifier') || text(choice);
          option.textContent = text(choice);
          select.append(option);
        }
        select.addEventListener('change', () => responses.set(responseId, select.value));
        label.append(select);
      } else if (name === 'extendedtextinteraction') {
        const input = document.createElement('textarea');
        input.rows = Math.max(3, Number(attr(node,'expectedLines') || attr(node,'expected-lines') || 5));
        input.addEventListener('input', () => responses.set(responseId, input.value));
        label.append(input);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.addEventListener('input', () => responses.set(responseId, input.value));
        label.append(input);
      }
      parent.append(label);
      return;
    }

    const allowed = new Map([
      ['p','p'],['div','div'],['span','span'],['strong','strong'],['em','em'],['b','b'],['i','i'],['ul','ul'],['ol','ol'],['li','li'],
      ['h1','h4'],['h2','h4'],['h3','h4'],['h4','h4'],['br','br'],['blockquote','blockquote'],['pre','pre'],['code','code'],
    ]);
    if (name === 'prompt') return;
    if (name === 'img') {
      const image = document.createElement('img');
      image.alt = attr(node,'alt') || '';
      const src = attr(node,'src');
      const nested = payload?.nested;
      const member = payload?.member || '';
      const path = nested && src ? resolveRelative(member, src) : null;
      if (path && nested.has(path)) {
        const data = await nested.read(path);
        const url = URL.createObjectURL(new Blob([data], {type:mediaType(path)}));
        objectUrls.push(url);
        image.src = url;
      }
      parent.append(image);
      return;
    }
    const tag = allowed.get(name);
    const target = tag ? document.createElement(tag) : document.createDocumentFragment();
    for (const child of [...node.childNodes]) await renderNode(child, target);
    parent.append(target);
  }

  if (bodyNode) {
    for (const child of [...bodyNode.childNodes]) await renderNode(child, body);
  } else {
    const note = document.createElement('p');
    note.textContent = 'This QTI item has no itemBody.';
    body.append(note);
  }

  const actions = document.createElement('div');
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.textContent = 'Enviar respuestas';
  submit.addEventListener('click', async () => {
    const answerObject = Object.fromEntries(responses);
    const simpleScores = [];
    for (const [id, declaration] of declarations) {
      if (!declaration.correct.length || !responses.has(id)) continue;
      const actual = responses.get(id);
      const values = Array.isArray(actual) ? actual.map(String).sort() : [String(actual)];
      const expected = declaration.correct.map(String).sort();
      simpleScores.push(values.length === expected.length && values.every((value, index) => value === expected[index]));
    }
    const allSimpleCorrect = simpleScores.length ? simpleScores.every(Boolean) : null;
    dispatchRuntimeEvent(eventTarget, 'p2lrn:complete', {
      runtime:'qti',
      responses:answerObject,
      authoritative:false,
      simpleMatchCorrect:allSimpleCorrect,
      note:'QTI responseProcessing remains authoritative; simple correctResponse comparison is informational only.',
    }, context, {adapter});
    if (adapter?.saveState) await adapter.saveState({responses:answerObject}, Object.freeze({...context, runtime:'qti'}));
  });
  actions.append(submit);
  shell.append(actions);
  container.replaceChildren(shell);
  dispatchRuntimeEvent(eventTarget, 'p2lrn:activityready', {runtime:'qti', itemIdentifier:attr(root,'identifier') ?? null}, context, {adapter});

  return {
    destroy() {
      for (const url of objectUrls) try { URL.revokeObjectURL(url); } catch {}
      container.replaceChildren();
    },
  };
}

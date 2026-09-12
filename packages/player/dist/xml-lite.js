const XML_DECLARATION = /^\uFEFF?\s*<\?xml[\s\S]*?\?>/i;

export function parseXmlLite(xml) {
  if (!xml || typeof xml !== 'string') throw new TypeError('XML is empty or invalid.');
  const root = {name:'#document', localName:'#document', attributes:{}, children:[], text:''};
  const stack = [root];
  const cleaned = xml
    .replace(/^\uFEFF/, '')
    .replace(XML_DECLARATION, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<!DOCTYPE([\s\S]*?)>/gi, '');
  const tokenRegex = /<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^>\s]+)\s*>|<([^/>\s]+)([^>]*)\/\s*>|<([^/>\s]+)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tokenRegex.exec(cleaned))) {
    const current = stack[stack.length - 1];
    if (match[1] != null) { current.text += match[1]; continue; }
    if (match[2]) {
      const closing = normalizeName(match[2]);
      const top = stack.pop();
      if (!top || top.localName !== closing.localName) throw new Error(`Malformed XML. Unexpected closing tag: ${match[2]}`);
      continue;
    }
    if (match[3]) { current.children.push(createNode(match[3], match[4] ?? '', current)); continue; }
    if (match[5]) {
      const node = createNode(match[5], match[6] ?? '', current);
      current.children.push(node);
      stack.push(node);
      continue;
    }
    if (match[7]) current.text += decodeXml(match[7]);
  }
  if (stack.length !== 1) throw new Error('Malformed XML. Unclosed tags remain.');
  const firstElement = root.children.find((child) => child.name !== '#text');
  if (!firstElement) throw new Error('XML has no root element.');
  return firstElement;
}

export function attr(node, ...names) {
  if (!node) return undefined;
  for (const name of names) {
    if (node.attributes[name] != null) return node.attributes[name];
    const local = stripNs(name);
    const match = Object.entries(node.attributes).find(([key]) => key === local || stripNs(key) === local);
    if (match) return match[1];
  }
  return undefined;
}

export function children(node, localName = null) {
  if (!node) return [];
  if (!localName) return node.children;
  const local = stripNs(localName);
  return node.children.filter((child) => child.localName === local);
}

export function firstChild(node, localName) { return children(node, localName)[0]; }

export function descendants(node, localName = null) {
  if (!node) return [];
  const result = [];
  const wanted = localName ? stripNs(localName) : null;
  const visit = (current) => {
    for (const child of current.children) {
      if (!wanted || child.localName === wanted) result.push(child);
      visit(child);
    }
  };
  visit(node);
  return result;
}

export function textContent(node) {
  if (!node) return '';
  const nested = node.children.map((child) => textContent(child)).join('');
  return `${node.text ?? ''}${nested}`.replace(/\s+/g, ' ').trim();
}

export function stripNs(name) { return String(name ?? '').split(':').pop() ?? ''; }

function createNode(name, attrsRaw, parent) {
  const normalized = normalizeName(name);
  return {name:normalized.name, localName:normalized.localName, attributes:parseAttributes(attrsRaw), children:[], text:'', parent};
}

function normalizeName(name) {
  const trimmed = String(name ?? '').trim();
  return {name:trimmed, localName:stripNs(trimmed)};
}

function parseAttributes(raw) {
  const attrs = {};
  const attrRegex = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrRegex.exec(raw))) attrs[match[1]] = decodeXml(match[3] ?? match[4] ?? '');
  return attrs;
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

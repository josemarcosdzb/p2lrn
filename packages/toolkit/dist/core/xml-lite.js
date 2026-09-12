import { ValidationError } from './errors.js';
const decoder = new TextDecoder('utf-8', { fatal: true });
function decodeEntity(value) {
    return value.replace(/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, code) => {
        if (code === 'amp')
            return '&';
        if (code === 'lt')
            return '<';
        if (code === 'gt')
            return '>';
        if (code === 'quot')
            return '"';
        if (code === 'apos')
            return "'";
        const n = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        if (!Number.isInteger(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff))
            throw new ValidationError('invalid XML numeric character reference');
        return String.fromCodePoint(n);
    });
}
function findTagEnd(xml, start) {
    let quote = '';
    for (let i = start; i < xml.length; i++) {
        const ch = xml[i];
        if (quote) {
            if (ch === quote)
                quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '>')
            return i;
    }
    throw new ValidationError('unterminated XML tag');
}
function parseOpen(raw) {
    let text = raw.trim();
    let selfClosing = false;
    if (text.endsWith('/')) {
        selfClosing = true;
        text = text.slice(0, -1).trimEnd();
    }
    const nameMatch = /^([^\s/>]+)/.exec(text);
    if (!nameMatch)
        throw new ValidationError('invalid XML start tag');
    const name = nameMatch[1];
    const attributes = {};
    let i = name.length;
    while (i < text.length) {
        while (i < text.length && /\s/.test(text[i]))
            i++;
        if (i >= text.length)
            break;
        const m = /^[^\s=/>]+/.exec(text.slice(i));
        if (!m)
            throw new ValidationError(`invalid XML attribute in <${name}>`);
        const key = m[0];
        i += key.length;
        while (i < text.length && /\s/.test(text[i]))
            i++;
        if (text[i] !== '=')
            throw new ValidationError(`XML attribute ${key} requires a value`);
        i++;
        while (i < text.length && /\s/.test(text[i]))
            i++;
        const q = text[i];
        if (q !== '"' && q !== "'")
            throw new ValidationError(`XML attribute ${key} must be quoted`);
        i++;
        const end = text.indexOf(q, i);
        if (end < 0)
            throw new ValidationError(`unterminated XML attribute ${key}`);
        if (Object.prototype.hasOwnProperty.call(attributes, key))
            throw new ValidationError(`duplicate XML attribute ${key}`);
        attributes[key] = decodeEntity(text.slice(i, end));
        i = end + 1;
    }
    return { name, attributes, selfClosing };
}
export function parseXml(input) {
    let xml;
    try {
        xml = typeof input === 'string' ? input : decoder.decode(input);
    }
    catch {
        throw new ValidationError('XML is not valid UTF-8');
    }
    if (/^\uFEFF/.test(xml))
        xml = xml.slice(1);
    if (/<!DOCTYPE\b/i.test(xml) || /<!ENTITY\b/i.test(xml))
        throw new ValidationError('XML DTD/entity declarations are not supported');
    const stack = [];
    let root;
    let pos = 0;
    const appendText = (s) => { if (stack.length && s)
        stack[stack.length - 1].text.push(decodeEntity(s)); };
    while (pos < xml.length) {
        const lt = xml.indexOf('<', pos);
        if (lt < 0) {
            appendText(xml.slice(pos));
            break;
        }
        appendText(xml.slice(pos, lt));
        if (xml.startsWith('<!--', lt)) {
            const end = xml.indexOf('-->', lt + 4);
            if (end < 0)
                throw new ValidationError('unterminated XML comment');
            pos = end + 3;
            continue;
        }
        if (xml.startsWith('<![CDATA[', lt)) {
            const end = xml.indexOf(']]>', lt + 9);
            if (end < 0)
                throw new ValidationError('unterminated CDATA');
            appendText(xml.slice(lt + 9, end));
            pos = end + 3;
            continue;
        }
        if (xml.startsWith('<?', lt)) {
            const end = xml.indexOf('?>', lt + 2);
            if (end < 0)
                throw new ValidationError('unterminated XML processing instruction');
            pos = end + 2;
            continue;
        }
        if (xml.startsWith('</', lt)) {
            const end = findTagEnd(xml, lt + 2);
            const name = xml.slice(lt + 2, end).trim();
            const node = stack.pop();
            if (!node || node.name !== name)
                throw new ValidationError(`mismatched XML end tag: ${name}`);
            pos = end + 1;
            continue;
        }
        if (xml.startsWith('<!', lt))
            throw new ValidationError('unsupported XML declaration');
        const end = findTagEnd(xml, lt + 1);
        const opened = parseOpen(xml.slice(lt + 1, end));
        const node = { name: opened.name, attributes: opened.attributes, children: [], text: [] };
        const parent = stack[stack.length - 1];
        if (parent) {
            node.parent = parent;
            parent.children.push(node);
        }
        else {
            if (root)
                throw new ValidationError('XML document has multiple root elements');
            root = node;
        }
        if (!opened.selfClosing)
            stack.push(node);
        pos = end + 1;
    }
    if (stack.length)
        throw new ValidationError(`unclosed XML tag: ${stack[stack.length - 1].name}`);
    if (!root)
        throw new ValidationError('XML document has no root element');
    return root;
}
export function localName(name) { const i = name.indexOf(':'); return i >= 0 ? name.slice(i + 1) : name; }
export function attrLocal(node, name) { for (const [k, v] of Object.entries(node.attributes))
    if (localName(k).toLowerCase() === name.toLowerCase())
        return v; return undefined; }
export function descendants(node, includeSelf = true) { const out = []; const walk = (n) => { out.push(n); for (const c of n.children)
    walk(c); }; if (includeSelf)
    walk(node);
else
    for (const c of node.children)
        walk(c); return out; }
export function firstDescendant(node, name) { return descendants(node).find((n) => localName(n.name) === name); }
export function firstDirectChild(node, name) { return node?.children.find((n) => localName(n.name) === name); }
export function textContent(node) { if (!node)
    return ''; let s = node.text.join(''); for (const child of node.children)
    s += textContent(child); return s.replace(/\s+/g, ' ').trim(); }
export function namespaceUri(node) { const idx = node.name.indexOf(':'); const prefix = idx >= 0 ? node.name.slice(0, idx) : ''; return node.attributes[prefix ? `xmlns:${prefix}` : 'xmlns'] ?? ''; }
//# sourceMappingURL=xml-lite.js.map
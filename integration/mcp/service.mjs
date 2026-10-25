import {randomUUID, createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {P2LRNReadingSystem} from '../../packages/toolkit/dist/reader/index.js';
import {P2LRNAuthoringWorkspace} from '../../packages/toolkit/dist/authoring/index.js';
import {validateQuestionnaire, validateComponentInstance} from '../../packages/toolkit/dist/core/index.js';

const DRAFTS = '.p2lrn-mcp-drafts';
const EXPORTS = '.p2lrn-mcp-exports';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function within(root, target) {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
}

function segments(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || isAbsolute(value)) throw new Error('Invalid relative path');
  const parts = value.split(/[/\\]/);
  if (parts.some((p) => !p || p === '.' || p === '..' || p.includes(':'))) throw new Error('Path traversal is not allowed');
  if ([DRAFTS, EXPORTS].includes(parts[0])) throw new Error('Internal MCP storage is not accessible as course input');
  return parts;
}

function existingUnder(root, parts, expected = 'file') {
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !within(root, realpathSync(current))) throw new Error('Symlinks and paths outside the authorized root are not allowed');
  }
  const stat = lstatSync(current);
  if (expected === 'file' && !stat.isFile()) throw new Error('Expected a regular file');
  if (expected === 'directory' && !stat.isDirectory()) throw new Error('Expected a directory');
  return current;
}

function safeInternalDirectory(root, name) {
  const path = join(root, name);
  if (existsSync(path)) existingUnder(root, [name], 'directory');
  else mkdirSync(path, {mode: 0o700});
  return path;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
  return value;
}

export class P2LRNMcpService {
  constructor({root, writeEnabled = false} = {}) {
    if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('P2LRN_MCP_ROOT must be an explicit absolute directory');
    this.root = realpathSync(root);
    if (!lstatSync(this.root).isDirectory()) throw new Error('P2LRN_MCP_ROOT must be a directory');
    this.writeEnabled = writeEnabled === true;
  }

  requireWrite() {
    if (!this.writeEnabled) throw new Error('Writing is disabled; set P2LRN_MCP_WRITE=1 explicitly');
  }

  packagePath(relativePath) {
    const parts = segments(relativePath);
    if (!parts.at(-1).toLowerCase().endsWith('.p2lrn')) throw new Error('Only .p2lrn course packages can be opened');
    return existingUnder(this.root, parts);
  }

  listCourses({limit = 100} = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid course limit');
    const courses = [];
    const visit = (directory, prefix, depth) => {
      if (depth > 12 || courses.length >= limit) return;
      for (const item of readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        if (courses.length >= limit) break;
        if (item.isSymbolicLink() || item.name === DRAFTS || item.name === EXPORTS || item.name === 'node_modules') continue;
        const rel = prefix ? prefix + '/' + item.name : item.name;
        if (item.isDirectory()) visit(existingUnder(this.root, segments(rel), 'directory'), rel, depth + 1);
        else if (item.isFile() && item.name.toLowerCase().endsWith('.p2lrn')) {
          try {
            const reader = new P2LRNReadingSystem(this.packagePath(rel));
            courses.push({path: rel, ...reader.reader.summary()});
          } catch (error) {
            courses.push({path: rel, valid: false, error: error.message});
          }
        }
      }
    };
    visit(this.root, '', 0);
    return {courses, truncated: courses.length >= limit};
  }

  inspectCourse(relativePath) {
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath));
    return {path: relativePath, summary: reader.summary(), tree: reader.tree()};
  }

  readEntity(relativePath, entityId) {
    if (typeof entityId !== 'string' || !entityId) throw new Error('entityId is required');
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath));
    return {path: relativePath, entity: reader.entity(entityId)};
  }

  searchMetadata(relativePath, query, limit = 40) {
    if (typeof query !== 'string' || !query.trim() || query.length > 200) throw new Error('A search query is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid result limit');
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath));
    const term = query.toLocaleLowerCase();
    const matches = [];
    for (const entity of reader.reader.entities.values()) {
      const text = [entity.id, ...Object.values(entity.title ?? {}), ...Object.values(entity.description ?? {})].join(' ').toLocaleLowerCase();
      if (text.includes(term)) matches.push({id: entity.id, type: entity.type, title: entity.title, description: entity.description});
      if (matches.length >= limit) break;
    }
    return {path: relativePath, query, matches, scope: 'metadata', truncated: matches.length >= limit};
  }

  draftPath(draftId) {
    if (typeof draftId !== 'string' || !UUID.test(draftId)) throw new Error('Invalid draft ID');
    return existingUnder(this.root, [DRAFTS, draftId], 'directory');
  }

  draftState(draftId, includeProject = false) {
    const dir = this.draftPath(draftId);
    const metaPath = existingUnder(this.root, [DRAFTS, draftId, 'mcp-draft.json']);
    const projectFile = existingUnder(this.root, [DRAFTS, draftId, 'p2lrn.project.json']);
    const meta = object(JSON.parse(readFileSync(metaPath, 'utf8')), 'draft metadata');
    const workspace = P2LRNAuthoringWorkspace.load(dir);
    const data = {draftId, source: meta.source, baseContentRoot: meta.contentRoot, digest: hash(readFileSync(projectFile)), summary: workspace.summary()};
    if (includeProject) data.project = workspace.project;
    return {dir, meta, workspace, data};
  }

  createDraft(relativePath) {
    this.requireWrite();
    const source = this.packagePath(relativePath);
    const reader = new P2LRNReadingSystem(source);
    const parent = safeInternalDirectory(this.root, DRAFTS);
    const draftId = randomUUID();
    const dir = join(parent, draftId);
    try {
      P2LRNAuthoringWorkspace.open(source, dir);
      writeFileSync(join(dir, 'mcp-draft.json'), JSON.stringify({source: relativePath, contentRoot: reader.reader.package.manifest.integrity.contentRoot}, null, 2), {flag: 'wx'});
      return this.draftState(draftId).data;
    } catch (error) {
      if (existsSync(dir)) rmSync(dir, {force: true, recursive: true});
      throw error;
    }
  }

  inspectDraft(draftId, includeProject = false) {
    return this.draftState(draftId, includeProject).data;
  }

  mutateDraft(draftId, expectedDigest, edit) {
    this.requireWrite();
    if (typeof expectedDigest !== 'string' || !DIGEST.test(expectedDigest)) throw new Error('Expected draft SHA-256 digest is required');
    const dir = this.draftPath(draftId);
    const lock = join(dir, '.mcp-lock');
    mkdirSync(lock); // Fail closed when another process is editing this draft.
    try {
      const state = this.draftState(draftId);
      if (state.data.digest !== expectedDigest) throw new Error('Draft changed: reload its digest before editing');
      const result = edit(state.workspace, dir);
      return {result, ...this.draftState(draftId).data};
    } finally {
      rmSync(lock, {recursive: true, force: true});
    }
  }

  setText(draftId, expectedDigest, key, changes) {
    object(changes, 'changes');
    return this.mutateDraft(draftId, expectedDigest, (workspace) => {
      return key === 'course' ? workspace.setCourseMetadata(changes) : workspace.setEntityText(key, changes);
    });
  }

  addUnit(draftId, expectedDigest, unit) {
    return this.mutateDraft(draftId, expectedDigest, (workspace) => workspace.addUnit(object(unit, 'unit')));
  }

  addUrl(draftId, expectedDigest, resource) {
    return this.mutateDraft(draftId, expectedDigest, (workspace) => workspace.addUrl(object(resource, 'resource')));
  }

  addNativeActivity(draftId, expectedDigest, kind, key, parent, title, payload) {
    if (!['questionnaire', 'component'].includes(kind)) throw new Error('Unsupported native activity kind');
    const validated = kind === 'questionnaire' ? validateQuestionnaire(payload) : validateComponentInstance(payload);
    return this.mutateDraft(draftId, expectedDigest, (workspace, dir) => {
      const inputDir = join(dir, '.mcp-inputs');
      mkdirSync(inputDir, {recursive: true});
      const source = join(inputDir, randomUUID() + '.json');
      writeFileSync(source, JSON.stringify(validated), {flag: 'wx', mode: 0o600});
      const args = {source, key, title, parent};
      return kind === 'questionnaire' ? workspace.addQuestionnaire(args) : workspace.addComponent(args);
    });
  }

  addComposite(draftId, expectedDigest, composite) {
    return this.mutateDraft(draftId, expectedDigest, (workspace) => workspace.addComposite(object(composite, 'composite')));
  }

  setProgression(draftId, expectedDigest, key, rule) {
    return this.mutateDraft(draftId, expectedDigest, (workspace) => workspace.setProgression(key, rule));
  }

  exportDraft(draftId, expectedDigest) {
    this.requireWrite();
    const state = this.draftState(draftId);
    if (state.data.digest !== expectedDigest) throw new Error('Draft changed: reload its digest before exporting');
    const original = new P2LRNReadingSystem(this.packagePath(state.meta.source));
    if (original.reader.package.manifest.integrity.contentRoot !== state.meta.contentRoot) throw new Error('Source course changed since the draft was created');
    const targetDir = safeInternalDirectory(this.root, EXPORTS);
    const filename = randomUUID() + '.p2lrn';
    const file = join(targetDir, filename);
    state.workspace.build(file, {strictProfiles: true});
    try {
      const validated = new P2LRNReadingSystem(file);
      return {path: EXPORTS + '/' + filename, draftId, source: state.meta.source, contentRoot: validated.reader.package.manifest.integrity.contentRoot, originalContentRoot: state.meta.contentRoot, sourceUnchanged: true, note: 'A separate validated export; the original course was not replaced'};
    } catch (error) {
      rmSync(file, {force: true});
      throw error;
    }
  }
}

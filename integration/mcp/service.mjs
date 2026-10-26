import {randomUUID, createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {P2LRNReadingSystem} from '../../packages/toolkit/dist/reader/index.js';
import {P2LRNAuthoringWorkspace} from '../../packages/toolkit/dist/authoring/index.js';
import {buildQuestionnaireGame} from '../../packages/toolkit/web/questionnaire-games-core.js';
import * as rendererRegistry from '../../packages/toolkit/web/renderer-registry.js';
import {validateQuestionnaire, validateComponentInstance} from '../../packages/toolkit/dist/core/index.js';

const DRAFTS = '.p2lrn-mcp-drafts';
const EXPORTS = '.p2lrn-mcp-exports';
const gameRenderers = Object.freeze(
  Object.entries(rendererRegistry).filter(([symbol, id]) =>
    symbol.endsWith('_RENDERER') &&
    symbol !== 'STANDARD_QUESTIONNAIRE_RENDERER' &&
    typeof id === 'string' &&
    id.startsWith('https://p2lrn.org/renderer/questionnaire/')
  ).map(([symbol, id]) => Object.freeze({symbol, id}))
);
const knownGameRenderers = new Set(gameRenderers.map(item => item.id));
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

  listGameRenderers() {
    return {renderers:gameRenderers.map(({symbol,id}) => ({id, name:symbol.toLowerCase().replace(/_renderer$/, '').replaceAll('_', '-')})),
      catalog:'P2LRN Toolkit renderer registry', hint:'Game compatibility is checked before authoring. Only complete questionnaires are accepted.'};
  }

  readPlan(relativePath) {
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath));
    return {path: relativePath, plan: reader.readPlan()};
  }

  validateCourse(relativePath) {
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath), {validateProfilePayloads: true});
    return {path: relativePath, valid: true, summary: reader.summary()};
  }

  readTextMember(relativePath, member, maxBytes = 32768) {
    if (typeof member !== 'string' || !member.trim() || member.length > 512) throw new Error('An embedded member path is required');
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 32768) throw new Error('Text read maximum is 32768 bytes');
    const reader = new P2LRNReadingSystem(this.packagePath(relativePath));
    const [bytes, mediaType] = reader.readOuter(member, maxBytes);
    if (!(/^text\//i.test(mediaType) || /\/(json|xml|javascript)$/i.test(mediaType))) {
      throw new Error('Binary resource content cannot be exposed as plain text');
    }
    return {path: relativePath, member, mediaType, bytes: bytes.length,
      text: new TextDecoder('utf-8', {fatal:true}).decode(bytes)};
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

  createEmptyDraft(options) {
    this.requireWrite();
    const settings = object(options, 'new course');
    if (typeof settings.title !== 'string' || !settings.title.trim() || settings.title.length > 500) {
      throw new Error('New course title is required (maximum 500 characters)');
    }
    const parent = safeInternalDirectory(this.root, DRAFTS);
    const draftId = randomUUID(), dir = join(parent, draftId);
    try {
      P2LRNAuthoringWorkspace.create(dir, {
        title: settings.title.trim(),
        language: settings.language ?? 'es',
        ...(settings.description ? {description: settings.description} : {})
      });
      writeFileSync(join(dir, 'mcp-draft.json'), JSON.stringify({source:null,contentRoot:null,created:true}, null, 2), {flag:'wx'});
      return this.draftState(draftId).data;
    } catch (error) {
      if (existsSync(dir)) rmSync(dir, {force:true,recursive:true});
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

  setChildren(draftId, expectedDigest, parentKey, children) {
    if (!Array.isArray(children) || !children.every(child => typeof child === 'string')) {
      throw new Error('children must be an array of entity keys');
    }
    return this.mutateDraft(draftId, expectedDigest,
      workspace => workspace.setChildren(parentKey, children));
  }

  addFile(draftId, expectedDigest, sourceRelativePath, options) {
    const source = existingUnder(this.root, segments(sourceRelativePath));
    const opts = object(options, 'file resource');
    return this.mutateDraft(draftId, expectedDigest,
      workspace => workspace.addFile({...opts, source, copyFile:true}));
  }

  addWebContent(draftId, expectedDigest, directoryRelativePath, options) {
    const sourceDirectory = existingUnder(this.root, segments(directoryRelativePath), 'directory');
    // Web bundles may include many nested assets. Reject symlinks before the
    // trusted Toolkit copies resources into the isolated authoring workspace.
    let count = 0;
    const inspect = (dir, depth = 0) => {
      if (depth > 24) throw new Error('Web content directory nesting is too deep');
      for (const entry of readdirSync(dir, {withFileTypes:true})) {
        if (++count > 5000) throw new Error('Web content directory contains too many files');
        if (entry.isSymbolicLink()) throw new Error('Web content cannot contain symlinks');
        const candidate = join(dir, entry.name);
        if (!within(this.root, candidate)) throw new Error('Web content must stay under course root');
        if (entry.isDirectory()) inspect(candidate, depth + 1);
        else if (!entry.isFile()) throw new Error('Unsupported filesystem item in web content');
      }
    };
    inspect(sourceDirectory);
    const opts = object(options, 'web content');
    return this.mutateDraft(draftId, expectedDigest,
      workspace => workspace.addWebContent({...opts, sourceDirectory, copyDirectory:true}));
  }

  addUrl(draftId, expectedDigest, resource) {
    return this.mutateDraft(draftId, expectedDigest, (workspace) => workspace.addUrl(object(resource, 'resource')));
  }

  addNativeActivity(draftId, expectedDigest, kind, key, parent, title, payload, renderer = null) {
    if (!['questionnaire', 'component'].includes(kind)) throw new Error('Unsupported native activity kind');
    const validated = kind === 'questionnaire' ? validateQuestionnaire(payload) : validateComponentInstance(payload);
    if (renderer !== null && renderer !== undefined) {
      if (kind !== 'questionnaire') throw new Error('Game renderer is only valid for a native questionnaire');
      if (!knownGameRenderers.has(renderer)) throw new Error('Game renderer is not installed in the P2LRN registry: ' + renderer);
      const built = buildQuestionnaireGame(validated, renderer, {seedSource:key});
      if (!built.compatible) throw new Error('Questionnaire is incompatible with this complete game: ' + JSON.stringify(built.reasons));
    }
    return this.mutateDraft(draftId, expectedDigest, (workspace, dir) => {
      const inputDir = join(dir, '.mcp-inputs');
      mkdirSync(inputDir, {recursive: true});
      const source = join(inputDir, randomUUID() + '.json');
      writeFileSync(source, JSON.stringify(validated), {flag: 'wx', mode: 0o600});
      const args = {source, key, title, parent, ...(renderer ? {renderer} : {})};
      return kind === 'questionnaire' ? workspace.addQuestionnaire(args) : workspace.addComponent(args);
    });
  }

  editNativeActivity(draftId, expectedDigest, activityKey, kind, payload, renderer = null) {
    this.requireWrite();
    if (!['questionnaire', 'component'].includes(kind)) throw new Error('Unsupported native activity kind');
    if (typeof activityKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(activityKey))
      throw new Error('A valid activity key is required');
    const validated = kind === 'questionnaire' ? validateQuestionnaire(payload) : validateComponentInstance(payload);
    if (renderer && kind !== 'questionnaire') throw new Error('A game renderer can only be used for questionnaires');
    if (renderer && !knownGameRenderers.has(renderer)) throw new Error('Renderer not installed in the P2LRN catalog');

    return this.mutateDraft(draftId, expectedDigest, (workspace, dir) => {
      const project = workspace.project;
      const activity = project.activities.find(item => item.key === activityKey);
      if (!activity || typeof activity.resource !== 'string') throw new Error('Native activity not found in draft');
      const resource = project.resources.find(item => item.key === activity.resource);
      if (!resource || !Array.isArray(resource.representations) || resource.representations.length !== 1)
        throw new Error('Editing requires one native resource representation; compound or multi-representation resources are not replaced');
      if (project.activities.filter(item => item.resource === resource.key).length !== 1)
        throw new Error('Shared resource cannot be edited without affecting other activities');
      const rep = resource.representations[0];
      const expectedType = kind === 'questionnaire' ? 'application/vnd.p2lrn.questionnaire+json' : 'application/vnd.p2lrn.component+json';
      if (rep.mediaType !== expectedType) throw new Error('Existing activity is not a P2LRN ' + kind + ' resource');

      const HINT = 'https://p2lrn.org/ext/renderer-preference/1';
      const selectedRenderer = renderer ?? activity.extensions?.[HINT]?.preferred ?? null;
      if (kind === 'questionnaire' && selectedRenderer) {
        if (!knownGameRenderers.has(selectedRenderer)) throw new Error('Unrecognized existing game renderer');
        const result = buildQuestionnaireGame(validated, selectedRenderer, {seedSource: activityKey});
        if (!result.compatible) throw new Error('Edited questions are incompatible with the selected game renderer: ' + JSON.stringify(result.reasons));
      }

      const assetDir = join(dir, 'assets');
      mkdirSync(assetDir, {recursive: true});
      const filename = 'mcp-edit-' + randomUUID() + '.json';
      const output = join(assetDir, filename);
      writeFileSync(output, JSON.stringify(validated), {flag: 'wx', mode: 0o600});
      try {
        workspace.update(draft => {
          const nextActivity = draft.activities.find(item => item.key === activityKey);
          const nextResource = draft.resources.find(item => item.key === nextActivity.resource);
          const nextRep = nextResource.representations[0];
          nextRep.source = {type: 'file', path: 'assets/' + filename};
          if (renderer) {
            nextActivity.extensions ??= {};
            nextActivity.extensions[HINT] = {preferred: renderer, required: false};
          }
        });
      } catch (error) {
        rmSync(output, {force: true});
        throw error;
      }
      return {activityKey, resourceKey: resource.key, kind, renderer: selectedRenderer, sourceReplacedInDraftOnly: true};
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
    if (state.meta.source) {
      const original = new P2LRNReadingSystem(this.packagePath(state.meta.source));
      if (original.reader.package.manifest.integrity.contentRoot !== state.meta.contentRoot) throw new Error('Source course changed since the draft was created');
    } else if (state.meta.created !== true) {
      throw new Error('Unknown draft origin: cannot export');
    }
    const targetDir = safeInternalDirectory(this.root, EXPORTS);
    const filename = randomUUID() + '.p2lrn';
    const file = join(targetDir, filename);
    state.workspace.build(file, {strictProfiles: true});
    try {
      const validated = new P2LRNReadingSystem(file);
      return {path: EXPORTS + '/' + filename, draftId, source: state.meta.source, contentRoot: validated.reader.package.manifest.integrity.contentRoot, originalContentRoot: state.meta.contentRoot, sourceUnchanged: true, createdFromScratch: state.meta.created === true, note: 'A separate validated export; the original course was not replaced'};
    } catch (error) {
      rmSync(file, {force: true});
      throw error;
    }
  }
}

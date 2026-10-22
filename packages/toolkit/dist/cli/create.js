#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { addComponent, addComposite, addFile, addQuestionnaire, addUnit, addUrl, addWebContent, loadProject, newProject, PROJECT_FILE, saveProject, upgradeProjectWorkspace } from '../creator/project.js';
import { buildProject, guessMediaType } from '../creator/builder.js';
import { convertExternalPackage } from '../creator/external.js';
import { ingestAulaP2PReader } from '../creator/aulap2p-ingest.js';
import { extractAulaP2PCourse, ingestAulaP2PCourse } from '../creator/aulap2p-course.js';
import { referenceComponentCatalog } from '../core/component-authoring.js';
import { openPackageAsProject } from '../creator/import-project.js';
import { parse, flag, opt, opts, printJson, req, fail, CliExit, isMain } from './util.js';
function withProject(path, fn) { const l = loadProject(path), root = dirname(l.path), r = fn(root, l.project); saveProject(l.path, l.project); return { path: l.path, result: r, project: l.project }; }
export function main(argv = process.argv.slice(2)) {
    try {
        const p = parse(argv);
        if (flag(p, 'help')) {
            process.stdout.write('Usage: p2lrn-create <init|open|upgrade|add-unit|add-file|add-web-content|add-questionnaire|add-component|add-composite|add-url|build|convert|ingest-aulap2p|ingest-aulap2p-course|extract-aulap2p-course|component-catalog|validate-component-authoring|show> ...\n');
            return;
        }
        const cmd = req(p.positional[0], 'command');
        let r;
        if (cmd === 'init') {
            const dir = resolve(req(p.positional[1], 'directory')), path = join(dir, PROJECT_FILE);
            if (existsSync(path) && !flag(p, 'force'))
                throw new Error(`project already exists: ${path}; use --force to replace it`);
            mkdirSync(dir, { recursive: true });
            const project = newProject(req(opt(p, 'title'), '--title'), opt(p, 'language', 'es'), opt(p, 'description'));
            saveProject(path, project);
            r = { project: path, projectId: project.projectId, course: project.course.title };
        }
        else if (cmd === 'open') {
            r = openPackageAsProject(req(p.positional[1], 'package'), req(p.positional[2], 'project_directory'), { force: flag(p, 'force') });
        }
        else if (cmd === 'upgrade') {
            const x = upgradeProjectWorkspace(req(p.positional[1], 'project'));
            r = { sourceProject: x.sourcePath, project: x.projectPath, fromVersion: x.fromVersion, toVersion: x.toVersion, changed: x.changed };
        }
        else if (cmd === 'add-unit') {
            const proj = req(p.positional[1], 'project'), key = req(opt(p, 'key'), '--key'), title = req(opt(p, 'title'), '--title'), x = withProject(proj, (_root, pr) => addUnit(pr, key, title, opt(p, 'language', 'es'), opt(p, 'role', 'module'), opt(p, 'parent', 'course')));
            r = { project: x.path, addedUnit: key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'add-file') {
            const proj = req(p.positional[1], 'project'), file = req(p.positional[2], 'file'), key = req(opt(p, 'key'), '--key'), title = req(opt(p, 'title'), '--title'), x = withProject(proj, (root, pr) => addFile(root, pr, file, key, title, { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), mediaType: opt(p, 'media-type') ?? guessMediaType(file), profile: opt(p, 'profile'), role: opt(p, 'role', 'primary'), activityType: opt(p, 'activity-type', 'https://p2lrn.org/type/resource'), copyFile: !flag(p, 'no-copy') }));
            r = { project: x.path, addedFile: file, key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'add-web-content') {
            const proj = req(p.positional[1], 'project'), dir = req(p.positional[2], 'directory'), key = req(opt(p, 'key'), '--key'), title = req(opt(p, 'title'), '--title'), x = withProject(proj, (root, pr) => addWebContent(root, pr, dir, opt(p, 'entrypoint', 'index.html'), key, title, { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), copyDirectory: !flag(p, 'no-copy') }));
            r = { project: x.path, addedWebDirectory: dir, entrypoint: opt(p, 'entrypoint', 'index.html'), key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'add-questionnaire') {
            const proj = req(p.positional[1], 'project'), file = req(p.positional[2], 'file'), key = req(opt(p, 'key'), '--key'), x = withProject(proj, (root, pr) => addQuestionnaire(root, pr, file, key, opt(p, 'title'), { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), copyFile: !flag(p, 'no-copy'), renderer: opt(p, 'renderer'), rendererVersion: opt(p, 'renderer-version') }));
            r = { project: x.path, addedQuestionnaire: file, key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'add-component') {
            const proj = req(p.positional[1], 'project'), file = req(p.positional[2], 'file'), key = req(opt(p, 'key'), '--key'), x = withProject(proj, (root, pr) => addComponent(root, pr, file, key, opt(p, 'title'), { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), copyFile: !flag(p, 'no-copy') }));
            r = { project: x.path, addedComponent: file, activity: x.result?.[1]?.key ?? key, key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'component-catalog') {
            const c = referenceComponentCatalog(), id = opt(p, 'component'), v = opt(p, 'component-version');
            if (!id)
                r = c.document;
            else if (!v)
                r = { components: c.list().filter((x) => x.id === id) };
            else
                r = flag(p, 'authoring-documents') ? c.authoringDocuments(id, v) : c.definition(id, v);
            if (r == null)
                throw new Error(`component is not in reference catalog: ${id} @ ${v}`);
        }
        else if (cmd === 'validate-component-authoring') {
            const file = req(p.positional[1], 'file'), payload = JSON.parse(new TextDecoder().decode(readFileSync(file))), vr = referenceComponentCatalog().validateInstanceData(payload, !flag(p, 'allow-unknown'));
            r = { file, known: vr.known, component: payload.component, dataSchema: vr.definition?.dataSchemas?.[payload.component?.dataVersion] };
        }
        else if (cmd === 'add-composite') {
            const proj = req(p.positional[1], 'project'), key = req(opt(p, 'key'), '--key'), title = req(opt(p, 'title'), '--title'), children = opts(p, 'children').flatMap(x => x.split(',').filter(Boolean));
            const x = withProject(proj, (root, pr) => addComposite(root, pr, key, title, { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), mode: opt(p, 'mode', 'sequence'), completion: opt(p, 'completion', 'all'), navigation: opt(p, 'navigation'), children, moveChildren: !flag(p, 'keep-existing-parents') }));
            r = { project: x.path, addedComposite: key, children, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'add-url') {
            const proj = req(p.positional[1], 'project'), url = req(p.positional[2], 'url'), key = req(opt(p, 'key'), '--key'), title = req(opt(p, 'title'), '--title'), x = withProject(proj, (_root, pr) => addUrl(pr, url, key, title, { language: opt(p, 'language', 'es'), parent: opt(p, 'parent', 'course'), mediaType: opt(p, 'media-type', 'text/html'), profile: opt(p, 'profile'), role: opt(p, 'role', 'primary'), activityType: opt(p, 'activity-type', 'https://p2lrn.org/type/resource') }));
            r = { project: x.path, addedUrl: url, key, parent: opt(p, 'parent', 'course') };
        }
        else if (cmd === 'build')
            r = buildProject(req(p.positional[1], 'project'), req(p.positional[2], 'output'), flag(p, 'strict-profiles'));
        else if (cmd === 'convert')
            r = convertExternalPackage(req(p.positional[1], 'source'), req(p.positional[2], 'output'), opt(p, 'package-root'));
        else if (cmd === 'ingest-aulap2p')
            r = ingestAulaP2PReader(req(p.positional[1], 'reader_json'), req(p.positional[2], 'output'), { sourceFile: opt(p, 'source-file'), assetRoot: opt(p, 'asset-root'), language: opt(p, 'language'), strictProfiles: flag(p, 'strict-profiles') });
        else if (cmd === 'ingest-aulap2p-course')
            r = ingestAulaP2PCourse(req(p.positional[1], 'course_json'), req(p.positional[2], 'output'), { assetRoot: opt(p, 'asset-root'), language: opt(p, 'language', 'es'), strictProfiles: flag(p, 'strict-profiles') });
        else if (cmd === 'extract-aulap2p-course')
            r = extractAulaP2PCourse(req(p.positional[1], 'package'), req(p.positional[2], 'output_json'));
        else if (cmd === 'show') {
            const l = loadProject(req(p.positional[1], 'project')), pr = l.project;
            r = { project: l.path, projectId: pr.projectId, targetFormatVersion: pr.targetFormatVersion, course: pr.course, counts: { units: pr.units.length, resources: pr.resources.length, activities: pr.activities.length, objectives: pr.objectives.length, relations: pr.relations.length } };
        }
        else
            throw new Error(`unknown creator command: ${cmd}`);
        printJson(r);
    }
    catch (e) {
        if (e instanceof CliExit)
            return;
        fail('P2LRN Creator error', e);
    }
}
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=create.js.map
#!/usr/bin/env node
// @ts-nocheck
// Generate disposable examples from the supported Authoring API, never from
// old bundled course data. The repository contains no native demo packages.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P2LRNAuthoringWorkspace } from '../authoring/index.js';
import { validatePackageFile } from '../core/validator.js';
import { parse, opt, printJson, fail, CliExit, flag, isMain } from '../cli/util.js';
export function rebuildExample(root, name, outputDir = join(root, 'examples')) {
    if (name !== 'minimal' && name !== 'web')
        throw new Error('Unknown example kind: ' + name);
    mkdirSync(outputDir, { recursive: true });
    const temp = mkdtempSync(join(tmpdir(), 'p2lrn-generated-example-'));
    try {
        const workspace = P2LRNAuthoringWorkspace.create(join(temp, 'workspace'), {
            title: name === 'minimal' ? 'Ejemplo mínimo generado' : 'Ejemplo web generado', language: 'es'
        });
        workspace.addUnit({ key: 'unidad', title: 'Unidad de prueba' });
        if (name === 'web') {
            const web = join(temp, 'web');
            mkdirSync(web, { recursive: true });
            writeFileSync(join(web, 'index.html'), '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ejemplo web</title></head><body><h1>Contenido web verificado</h1></body></html>\n');
            workspace.addWebContent({ sourceDirectory: web, key: 'web', title: 'Contenido web', parent: 'unidad' });
        }
        else {
            workspace.addUrl({ url: 'https://example.invalid/resource', key: 'resource', title: 'Recurso mínimo', parent: 'unidad' });
        }
        const out = join(outputDir, name === 'minimal' ? 'minimal-course.p2lrn' : 'web-course.p2lrn');
        workspace.build(out, { strictProfiles: true });
        return { name, output: out, validation: validatePackageFile(out, { strictProfiles: true, validateProfilePayloads: true }).summary };
    }
    finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
export function main(argv = process.argv.slice(2)) {
    try {
        const p = parse(argv);
        if (flag(p, 'help')) {
            process.stdout.write('Usage: p2lrn-rebuild-examples [--root DIR] [--output DIR]\n');
            return;
        }
        const explicitRoot = opt(p, 'root');
        const root = resolve(explicitRoot ?? fileURLToPath(new URL('../../', import.meta.url)));
        const outputDir = resolve(opt(p, 'output') ?? (explicitRoot ? join(root, 'examples') : process.cwd()));
        printJson([rebuildExample(root, 'minimal', outputDir), rebuildExample(root, 'web', outputDir)]);
    }
    catch (e) {
        if (e instanceof CliExit)
            return;
        fail('P2LRN Rebuild examples error', e);
    }
}
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=rebuild-examples.js.map
#!/usr/bin/env node
// @ts-nocheck
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, opt, printJson, fail, CliExit, flag, isMain } from '../cli/util.js';
const EXCLUDED = new Set(['app.js', 'index.html', 'style.css']);
const LOCAL_REF = /(?:from\s+|import\()(['"])(\.{1,2}\/[^'"]+)\1|new URL\((['"])(\.{1,2}\/[^'"]+)\3/g;
function walk(dir) { const out = []; for (const name of readdirSync(dir)) {
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory())
        out.push(...walk(p));
    else if (s.isFile())
        out.push(p);
} return out; }
function sha(data, alg, encoding) { return createHash(alg).update(data).digest(encoding); }
function pathPartsCompare(a, b, base) { const aa = relative(base, a).split(/[\\/]/), bb = relative(base, b).split(/[\\/]/); for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] !== bb[i])
        return aa[i] < bb[i] ? -1 : 1;
} return aa.length - bb.length; }
function copyRuntime(root, dist) {
    const monorepoWeb = join(root, 'node-toolkit', 'web'), monorepoSdk = join(root, 'web_sdk', 'src');
    const packageWeb = join(root, 'web'), packageSdk = join(root, 'web-sdk-src');
    const web = existsSync(packageWeb) ? packageWeb : monorepoWeb;
    const sdk = existsSync(packageSdk) ? packageSdk : monorepoSdk;
    if (!existsSync(web))
        throw new Error(`Canonical Node web runtime is missing: ${web}`);
    if (!existsSync(sdk))
        throw new Error(`P2LRN Web SDK entry sources are missing: ${sdk}`);
    for (const source of walk(web).sort()) {
        const rel = relative(web, source).split('\\').join('/'), parts = rel.split('/'), name = parts.at(-1);
        if ((parts.length === 1 && EXCLUDED.has(name)) || EXCLUDED.has(parts[0]))
            continue;
        const ext = extname(source), allowed = ['.js', '.css'].includes(ext) || (parts[0] === 'runtime-host' && ext === '.html');
        if (!allowed)
            continue;
        const target = join(dist, rel);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
    }
    for (const name of ['p2lrn.js', 'p2lrn.esm.js', 'p2rln.js', 'p2rln.esm.js'])
        copyFileSync(join(sdk, name), join(dist, name));
}
function validateLocalRefs(dist) { const missing = []; for (const source of walk(dist).filter((p) => p.endsWith('.js')).sort()) {
    const text = new TextDecoder().decode(readFileSync(source));
    LOCAL_REF.lastIndex = 0;
    let m;
    while ((m = LOCAL_REF.exec(text))) {
        const raw = m[2] || m[4];
        if (!raw)
            continue;
        const path = raw.split('?', 1)[0].split('#', 1)[0], target = resolve(dirname(source), path), r = relative(resolve(dist), target);
        if (r.startsWith('..') || resolve(target) === resolve(dist)) {
            missing.push(`${relative(dist, source)} -> unsafe ${raw}`);
            continue;
        }
        if (!existsSync(target))
            missing.push(`${relative(dist, source)} -> missing ${raw}`);
    }
} if (missing.length)
    throw new Error('Web SDK has unresolved local references:\n' + missing.join('\n')); }
function writeRelease(dist) { const files = walk(dist).filter((p) => !p.endsWith('/release.json') && p !== join(dist, 'release.json')).sort((a, b) => pathPartsCompare(a, b, dist)).map((p) => { const data = readFileSync(p); return { path: relative(dist, p).split('\\').join('/'), bytes: data.byteLength, sha256: 'sha256:' + sha(data, 'sha256', 'hex'), sri: 'sha384-' + sha(data, 'sha384', 'base64') }; }); const release = { schema: 'https://p2lrn.org/schema/web-sdk-release/1', version: '1', webSdkVersion: '0.5.0-alpha.1', toolkitVersion: '0.5.0-alpha.1', coreVersion: '0.4.0', entrypoints: { classic: 'p2lrn.js', module: 'p2lrn.esm.js', serviceWorker: 'p2lrn-sw.js' }, files }; writeFileSync(join(dist, 'release.json'), JSON.stringify(release, null, 2) + '\n'); return release; }
export function buildWebSdk(root, output) { if (existsSync(output))
    rmSync(output, { recursive: true, force: true }); mkdirSync(output, { recursive: true }); copyRuntime(root, output); validateLocalRefs(output); const release = writeRelease(output); return { output, files: release.files.length, release }; }
export function main(argv = process.argv.slice(2)) { try {
    const p = parse(argv);
    if (flag(p, 'help')) {
        process.stdout.write('Usage: p2lrn-build-web-sdk [--root DIR] [--output DIR]\n');
        return;
    }
    const root = resolve(opt(p, 'root') ?? fileURLToPath(new URL('../../', import.meta.url))), output = resolve(opt(p, 'output') ?? join(process.cwd(), 'p2lrn-web-sdk'));
    const r = buildWebSdk(root, output);
    printJson({ output: r.output, files: r.files });
}
catch (e) {
    if (e instanceof CliExit)
        return;
    fail('P2LRN Web SDK build error', e);
} }
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=build-web-sdk.js.map
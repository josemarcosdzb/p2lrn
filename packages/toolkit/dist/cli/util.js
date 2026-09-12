import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export class CliError extends Error {
}
const BOOLEAN = new Set(['help', 'force', 'profile-payloads', 'require-trusted', 'summary', 'tree', 'read-plan', 'import-plan', 'no-browser', 'no-profile-payload-validation', 'no-copy', 'authoring-documents', 'allow-unknown', 'keep-existing-parents', 'strict-profiles', 'validate-profile-payloads', 'new-package-id', 'canonicalize-identifiers', 'transformation', 'plan', 'no-strict-profiles']);
const MULTI_VALUE = new Set(['children']);
export function parse(argv) { const positional = [], options = new Map(); const push = (k, v) => (options.get(k) ?? options.set(k, []).get(k)).push(v); for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') {
        push('help', 'true');
        continue;
    }
    if (!a.startsWith('--')) {
        positional.push(a);
        continue;
    }
    const eq = a.indexOf('=');
    if (eq > 2) {
        push(a.slice(2, eq), a.slice(eq + 1));
        continue;
    }
    const k = a.slice(2);
    if (BOOLEAN.has(k)) {
        push(k, 'true');
        continue;
    }
    if (MULTI_VALUE.has(k)) {
        let count = 0;
        while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
            push(k, argv[++i]);
            count++;
        }
        if (!count)
            throw new CliError(`option --${k} requires at least one value`);
        continue;
    }
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--'))
        push(k, argv[++i]);
    else
        push(k, 'true');
} return { positional, options }; }
export function flag(p, name) { return p.options.has(name); }
export function opt(p, name, def) { return p.options.get(name)?.at(-1) ?? def; }
export function opts(p, name) { return p.options.get(name) ?? []; }
export function req(value, label) { if (!value)
    throw new CliError(`missing ${label}`); return value; }
export function printJson(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
export function fail(prefix, e) { const m = e instanceof Error ? e.message : String(e); process.stderr.write(`${prefix}: ${m}\n`); process.exitCode = 1; throw new CliExit(); }
export class CliExit extends Error {
}
export function isMain(moduleUrl) { const entry = process.argv[1]; if (!entry)
    return false; const source = fileURLToPath(moduleUrl); try {
    return realpathSync(source) === realpathSync(entry);
}
catch {
    return resolve(source) === resolve(entry);
} }
//# sourceMappingURL=util.js.map
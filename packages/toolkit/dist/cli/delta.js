#!/usr/bin/env node
import { applyDelta, createDelta, inspectDelta } from '../core/delta.js';
import { parse, flag, printJson, req, fail, CliExit, isMain } from './util.js';
export function main(argv = process.argv.slice(2)) { try {
    const p = parse(argv);
    if (flag(p, 'help')) {
        process.stdout.write('Usage: p2lrn-delta <create|apply|inspect> ... [--force]\n');
        return;
    }
    const cmd = req(p.positional[0], 'command');
    let r;
    if (cmd === 'create')
        r = createDelta(req(p.positional[1], 'base'), req(p.positional[2], 'target'), req(p.positional[3], 'output'), flag(p, 'force'));
    else if (cmd === 'apply')
        r = applyDelta(req(p.positional[1], 'base'), req(p.positional[2], 'delta'), req(p.positional[3], 'output'), flag(p, 'force'));
    else if (cmd === 'inspect')
        r = inspectDelta(req(p.positional[1], 'delta'));
    else
        throw new Error(`unknown delta command: ${cmd}`);
    printJson(r);
}
catch (e) {
    if (e instanceof CliExit)
        return;
    fail('P2LRN Delta error', e);
} }
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=delta.js.map
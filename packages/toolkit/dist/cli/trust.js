#!/usr/bin/env node
import { generateKeypair, loadSignature, signPackage, verifyPackageSignature } from '../core/detached-signature.js';
import { parse, flag, opt, opts, printJson, req, fail, CliExit, isMain } from './util.js';
export function main(argv = process.argv.slice(2)) { try {
    const p = parse(argv);
    if (flag(p, 'help')) {
        process.stdout.write('Usage: p2lrn-trust <keygen|sign|verify|inspect> ...\n');
        return;
    }
    const cmd = req(p.positional[0], 'command');
    let r;
    if (cmd === 'keygen')
        r = generateKeypair(req(p.positional[1], 'private key'), req(p.positional[2], 'public key'), flag(p, 'force'));
    else if (cmd === 'sign')
        r = signPackage(req(p.positional[1], 'package'), req(p.positional[2], 'private key'), opt(p, 'output'), opt(p, 'scope', 'content'), flag(p, 'force'));
    else if (cmd === 'verify')
        r = verifyPackageSignature(req(p.positional[1], 'package'), req(p.positional[2], 'signature'), { trustedPublicKeys: opts(p, 'trust-key'), requireTrusted: flag(p, 'require-trusted') });
    else if (cmd === 'inspect')
        r = loadSignature(req(p.positional[1], 'signature'));
    else
        throw new Error(`unknown trust command: ${cmd}`);
    printJson(r);
}
catch (e) {
    if (e instanceof CliExit)
        return;
    fail('P2LRN Trust error', e);
} }
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=trust.js.map
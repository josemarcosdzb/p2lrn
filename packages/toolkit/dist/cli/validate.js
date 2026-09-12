#!/usr/bin/env node
import { validatePackageFile } from '../core/validator.js';
import { parse, flag, printJson, req, fail, CliExit, isMain } from './util.js';
export function main(argv = process.argv.slice(2)) { try {
    const p = parse(argv);
    if (flag(p, 'help')) {
        process.stdout.write('Usage: p2lrn-validate <package> [--profile-payloads]\n');
        return;
    }
    const pkg = req(p.positional[0], 'package'), strict = flag(p, 'strict-profiles') || !flag(p, 'no-strict-profiles'), profilePayloads = flag(p, 'profile-payloads') || flag(p, 'validate-profile-payloads');
    const r = validatePackageFile(pkg, { strictProfiles: strict, validateProfilePayloads: profilePayloads });
    printJson(r.summary);
}
catch (e) {
    if (e instanceof CliExit)
        return;
    fail('INVALID', e);
} }
if (isMain(import.meta.url))
    main();
//# sourceMappingURL=validate.js.map
#!/usr/bin/env node
import {copyFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: p2lrn-copy-sw <public-directory-or-file>');
  process.exit(2);
}
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, 'dist', 'p2lrn-sw.js');
const resolved = resolve(target);
const destination = resolved.endsWith('.js') ? resolved : resolve(resolved, 'p2lrn-sw.js');
await mkdir(dirname(destination), {recursive: true});
await copyFile(source, destination);
console.log(destination);

#!/usr/bin/env node
import {cp, rm, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: p2lrn-copy-h5p-libraries <target-directory>');
  process.exit(2);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'dist');
const info = await stat(source);
if (!info.isDirectory()) throw new Error('H5P library dist is missing. Reinstall or rebuild @p2lrn/h5p-libraries.');
const destination = resolve(target);
await rm(destination, {recursive:true, force:true});
await cp(source, destination, {recursive:true, force:true});
console.log(destination);

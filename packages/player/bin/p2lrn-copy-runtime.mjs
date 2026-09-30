#!/usr/bin/env node
import {cp, mkdir, stat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const target = process.argv[2];
if (!target) {
  console.error('Usage: p2lrn-copy-runtime <target-directory>');
  process.exit(2);
}
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, 'dist');
if (!(await stat(source)).isDirectory()) throw new Error('@p2lrn/player dist is missing.');
const destination = resolve(target);
await mkdir(destination, {recursive:true});
await cp(source, destination, {recursive:true, force:true});

let h5pCopied = false;
try {
  const libs = await import('@p2lrn/h5p-libraries');
  const librariesTarget = resolve(destination, 'runtime-host', 'h5p-libraries');
  await mkdir(librariesTarget, {recursive:true});
  await cp(libs.h5pLibrariesPath, librariesTarget, {recursive:true, force:true});
  h5pCopied = true;
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

console.log(JSON.stringify({
  runtime:destination,
  h5pLibraries:h5pCopied ? resolve(destination,'runtime-host','h5p-libraries') : null,
  note:h5pCopied ? null : 'Install @p2lrn/h5p-libraries to copy shared H5P libraries too.',
},null,2));

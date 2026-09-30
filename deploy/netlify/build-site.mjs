import {copyFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root, 'deploy', 'netlify', 'site');
const outputRoot = join(root, '.netlify-cdn');

for (const file of ['index.html', 'p2lrn.css', 'p2lrn.js']) {
  await copyFile(join(siteRoot, file), join(outputRoot, file));
}

console.log(JSON.stringify({ok:true, site:'P2LRN documentation portal'}, null, 2));

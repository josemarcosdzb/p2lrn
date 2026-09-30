import {cp} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root, 'deploy', 'netlify', 'site');
const outputRoot = join(root, '.netlify-cdn');

await cp(siteRoot, outputRoot, {
  recursive: true,
  force: true,
});

console.log(JSON.stringify({
  ok:true,
  site:'P2LRN documentation portal',
  pages:'recursive',
}, null, 2));

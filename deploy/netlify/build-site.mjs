import {cp, copyFile, mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(process.cwd());
await import('./build-cdn.mjs');

const siteRoot = join(root, 'deploy', 'netlify', 'site');
const outputRoot = join(root, '.netlify-cdn');

await cp(siteRoot, outputRoot, {
  recursive: true,
  force: true,
});

// The static virtual-resource bridge expects its Service Worker at the
// application origin with the canonical /__p2lrn__/ scope.
await copyFile(
  join(outputRoot, 'player', 'current', 'dist', 'p2lrn-sw.js'),
  join(outputRoot, 'p2lrn-sw.js'),
);

const examplesOutput = join(outputRoot, 'examples');
await mkdir(examplesOutput, {recursive:true});

for (const file of [
  'creator-course.p2lrn',
  'web-bundle-course.p2lrn',
  'native-questionnaire-course.p2lrn',
]) {
  await copyFile(
    join(root, 'examples', 'canonical', file),
    join(examplesOutput, file),
  );
}

await cp(
  join(root, 'examples', 'developer-course'),
  join(examplesOutput, 'developer-course'),
  {recursive:true, force:true},
);

console.log(JSON.stringify({
  ok:true,
  site:'P2LRN documentation portal',
  pages:'recursive',
  viewerExamples:[
    '/examples/creator-course.p2lrn',
    '/examples/web-bundle-course.p2lrn',
    '/examples/native-questionnaire-course.p2lrn',
  ],
}, null, 2));

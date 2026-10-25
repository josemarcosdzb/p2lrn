import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=(path)=>readFile(resolve(root,path),'utf8');
const player=JSON.parse(await read('packages/player/package.json'));
const toolkit=JSON.parse(await read('packages/toolkit/package.json'));
const studio=JSON.parse(await read('packages/studio/package.json'));
const h5p=JSON.parse(await read('packages/h5p-libraries/package.json'));
const version=player.version;
assert.equal(toolkit.version,version);
assert.equal(studio.version,version);
assert.equal(h5p.version,version);
assert.match(version,/^0\.5\.0-alpha\.\d+$/u,'Connected E2E release matrix is currently defined for the 0.5.0 alpha line.');

const workflow=await read('.github/workflows/p2lrn-ci.yml');
const localViewer=await read('scripts/verify-local-viewer.mjs');
const collaborationTests=await read('packages/toolkit/test/collaboration.test.mjs');
const httpTests=await read('packages/toolkit/test/collaboration-http.test.mjs');
const analyticsTests=await read('packages/toolkit/test/rich-analytics.test.mjs');
const server=await read('packages/player/server/collaboration-http.mjs');
const browserProvider=await read('packages/toolkit/web/collaboration-http-provider.js');

const rows=[
  {
    id:'authoring-roundtrip',
    evidence:['packages/toolkit/test/collaboration.test.mjs'],
    checks:[
      collaborationTests.includes('Studio round-trips poll board and peer-review'),
      collaborationTests.includes('transport credentials'),
    ],
  },
  {
    id:'production-http-security',
    evidence:['packages/toolkit/test/collaboration-http.test.mjs','packages/player/server/collaboration-http.mjs'],
    checks:[
      httpTests.includes('authenticates host users and synchronizes a room'),
      httpTests.includes('rejects forged identity'),
      server.includes('authenticate(request)'),
      server.includes('resolveContext'),
      server.includes('authorize'),
      server.includes('P2LRN_COLLABORATION_ORIGIN_DENIED'),
    ],
  },
  {
    id:'two-player-browser-sync',
    evidence:['scripts/verify-local-viewer.mjs','.visual-evidence/collaboration-two-player.png'],
    checks:[
      localViewer.includes('createHttpCollaborationProvider'),
      localViewer.includes("transport:'http'"),
      localViewer.includes('collaboration HTTP synchronization'),
      localViewer.includes("captureVisualEvidence(cdp,'collaboration-two-player')"),
    ],
  },
  {
    id:'shared-resource-dedup',
    evidence:['packages/toolkit/web/shared-resource-store.js','scripts/verify-local-viewer.mjs'],
    checks:[
      localViewer.includes('createMemorySharedResourceStore'),
      localViewer.includes('Shared resource store retained duplicate physical objects.'),
      localViewer.includes("captureVisualEvidence(cdp,'shared-resource-digest')"),
    ],
  },
  {
    id:'rich-analytics',
    evidence:['packages/toolkit/test/rich-analytics.test.mjs','spec/RUNTIME-EVENTS.md'],
    checks:[
      analyticsTests.includes("phase,'started'")||analyticsTests.includes("phase,'resumed'"),
      analyticsTests.includes('answer-change'),
      analyticsTests.includes("'answer' in changes[0].payload,false"),
    ],
  },
  {
    id:'accessibility',
    evidence:['scripts/verify-local-viewer.mjs','packages/toolkit/web/renderers/component-collaboration.js'],
    checks:[
      localViewer.includes("querySelector('fieldset legend')"),
      localViewer.includes('[role="status"][aria-live="polite"]'),
      localViewer.includes("sharedResource.alt==='Diagrama P2LRN compartido'"),
    ],
  },
  {
    id:'offline-and-cache',
    evidence:['scripts/verify-local-viewer.mjs'],
    checks:[
      localViewer.includes('Offline web package did not resolve through the verified static-resource bridge.'),
      localViewer.includes('Verified package cache did not persist exactly one test package.'),
    ],
  },
  {
    id:'external-format-regression',
    evidence:['scripts/verify-local-viewer.mjs'],
    checks:[
      ['cmi5','h5p','scorm','qti'].every((name)=>localViewer.includes("await audit('"+name+"'")),
    ],
  },
  {
    id:'installed-npm-browser',
    evidence:['.github/workflows/p2lrn-ci.yml'],
    checks:[
      workflow.includes('Verify npm tarballs as installed packages'),
      workflow.includes('Browser smoke from installed npm tarballs'),
    ],
  },
  {
    id:'native-games-visual',
    evidence:['.github/workflows/p2lrn-ci.yml'],
    checks:[workflow.includes('Verify twelve native games visually from staged npm tarballs')],
  },
  {
    id:'independent-host',
    evidence:['.github/workflows/p2lrn-ci.yml'],
    checks:[workflow.includes('Verify staged npm integration in independent Express Host')],
  },
  {
    id:'distribution-identity',
    evidence:['.github/workflows/p2lrn-ci.yml'],
    checks:[
      workflow.includes('Verify npm/CDN byte identity'),
      workflow.includes('Stage immutable SHA-locked npm release candidate on Windows'),
    ],
  },
];

for(const row of rows)assert(row.checks.every(Boolean),'Connected E2E matrix row is incomplete: '+row.id);
assert(browserProvider.includes("COLLABORATION_HTTP_MEDIA_TYPE='application/vnd.p2lrn.collaboration+json'"));
assert(browserProvider.includes("SAFE_CONTEXT_KEYS=['contentRoot','packageId','entityId']"));

const report={
  schema:'https://p2lrn.org/schema/connected-e2e-matrix/1',
  ok:true,
  status:'PASS',
  version,
  commit:process.env.GITHUB_SHA??null,
  evidenceMode:'Sequential Windows CI: this gate runs only after source tests, local browser E2E, Edge, npm tarball install/browser, native game visuals, independent Express Host, site build and npm/CDN identity.',
  rows:rows.map(({id,evidence})=>({id,status:'PASS',evidence})),
  publication:'NOT_PERFORMED',
};
await writeFile(resolve(root,'.connected-e2e-matrix.json'),JSON.stringify(report,null,2)+'\n');
console.log('P2LRN_CONNECTED_E2E_MATRIX='+JSON.stringify(report));

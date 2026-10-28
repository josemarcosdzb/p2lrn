import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const text=(p)=>readFile(join(root,p),'utf8');
const [pkg,player,model,component,types,cdn,nav,docs,demo]=await Promise.all([
  text('packages/analytics/package.json').then(JSON.parse),
  text('packages/player/package.json').then(JSON.parse),
  text('packages/analytics/src/model.js'),
  text('packages/analytics/src/p2lrn-analytics.js'),
  text('packages/analytics/types/index.d.ts'),
  text('deploy/netlify/build-cdn.mjs'),
  text('deploy/netlify/site/p2lrn.js'),
  text('deploy/netlify/site/docs/analytics/index.html'),
  text('deploy/netlify/site/analytics/index.html'),
]);
assert.equal(pkg.name,'@p2lrn/analytics');
assert.equal(pkg.version,player.version,'Analytics must share the P2LRN release version');
for(const token of ['P2LRN_ANALYTICS_VERSION','computeAnalyticsSnapshot','createHttpAnalyticsDataSource','analyticsToCsv'])assert(model.includes(token),'Analytics model missing '+token);
for(const token of ['p2lrn-analytics','Alumnos','Cursos','Notas','Actividad','authoritative'])assert(component.includes(token),'Analytics component missing '+token);
assert(!component.includes('content:"2"'),'Analytics must not reintroduce the retired square P2 badge');
for(const token of ['P2LRNAnalyticsElement','createHttpAnalyticsDataSource','exportCsv'])assert(types.includes(token),'Analytics types missing '+token);
for(const token of ["analyticsPackage:'@p2lrn/analytics'","/analytics/current/dist/","p2lrn-analytics.esm.js"])assert(cdn.includes(token),'CDN build missing Analytics '+token);
assert(nav.includes("['/docs/analytics/','P2LRN Analytics']"),'Analytics missing from Seguimiento navigation');
for(const token of ['@p2lrn/analytics','analytics/current/dist/p2lrn-analytics.js','authoritative: true'])assert(docs.includes(token),'Analytics docs missing '+token);
assert(demo.includes('<p2lrn-analytics src="/analytics/demo-data.json"></p2lrn-analytics>'),'Analytics demo is not wired to the component');
for(const file of ['model.js','p2lrn-analytics.esm.js','p2lrn-analytics.js','release.json'])assert((await stat(join(root,'packages','analytics','dist',file))).isFile(),'Analytics dist missing '+file);
console.log(JSON.stringify({ok:true,package:pkg.name,version:pkg.version,cdn:true,npm:true,docs:true,demo:true},null,2));

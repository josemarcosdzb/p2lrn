import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
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
for(const token of ['p2lrn-analytics','Alumnos','Cursos','Notas','Actividad','authoritative','export * from \'./model.js\'','for=\"pa-search\"','page-size','data-page-kind'])assert(component.includes(token),'Analytics component missing '+token);
assert(!component.includes('content:"2"'),'Analytics must not reintroduce the retired square P2 badge');
for(const token of ['P2LRNAnalyticsElement','createHttpAnalyticsDataSource','exportCsv'])assert(types.includes(token),'Analytics types missing '+token);
for(const token of ["analyticsPackage:'@p2lrn/analytics'","/analytics/current/dist/","p2lrn-analytics.esm.js"])assert(cdn.includes(token),'CDN build missing Analytics '+token);
assert(nav.includes("['INTEGRAR', [")&&nav.includes("const visibleSections=forTeachers"),'Developer integration sidebar must remain separated and visible');
assert(nav.includes("label: 'Analytics'"),'Analytics top navigation section missing');
assert(nav.includes("['/docs/analytics/','Analytics para plataformas']"),'Analytics guide must remain accessible in the developer integration sidebar');
for(const token of ['@p2lrn/analytics','analytics/current/dist/p2lrn-analytics.js','authoritative: true'])assert(docs.includes(token),'Analytics docs missing '+token);
assert(demo.includes('<p2lrn-analytics src="/analytics/demo-data.json"></p2lrn-analytics>'),'Analytics demo is not wired to the component');
for(const file of ['model.js','p2lrn-analytics.esm.js','p2lrn-analytics.js','release.json'])assert((await stat(join(root,'packages','analytics','dist',file))).isFile(),'Analytics dist missing '+file);
const {computeAnalyticsSnapshot}=await import('../packages/analytics/src/model.js');
const learners=Array.from({length:1500},(_,i)=>({id:'u'+i,name:'Alumno '+i}));
const courses=Array.from({length:5},(_,i)=>({id:'c'+i,title:'Curso '+i}));
const enrollments=[],attempts=[],grades=[];
for(let i=0;i<learners.length;i++)for(let j=0;j<courses.length;j++){
  const progress=((i+j)%101)/100;
  enrollments.push({learnerId:learners[i].id,courseId:courses[j].id,progress});
  attempts.push({id:'a'+i+'-'+j,learnerId:learners[i].id,courseId:courses[j].id,status:'started',progress,activeTimeMs:60000});
  grades.push({learnerId:learners[i].id,courseId:courses[j].id,value:70,maxValue:100,authoritative:true});
}
const started=performance.now();
const snapshot=computeAnalyticsSnapshot({learners,courses,enrollments,attempts,grades,events:[]});
const benchmarkMs=Math.round(performance.now()-started);
assert.equal(snapshot.overview.learners,1500);
assert.ok(benchmarkMs<5000,'Analytics snapshot benchmark regressed: '+benchmarkMs+' ms');
console.log(JSON.stringify({ok:true,package:pkg.name,version:pkg.version,cdn:true,npm:true,docs:true,demo:true,benchmarkMs},null,2));

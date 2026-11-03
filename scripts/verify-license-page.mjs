import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=(path)=>readFile(join(root,path),'utf8');
const [license,notice,es,en,css,generator,contactEs,contactEn,footer]=await Promise.all([
  read('LICENSE'),read('NOTICE.md'),
  read('deploy/netlify/site/licencia/index.html'),
  read('deploy/netlify/site/en/licencia/index.html'),
  read('deploy/netlify/site/p2lrn.css'),
  read('scripts/generate-site-english.mjs'),
  read('deploy/netlify/site/contacto/index.html'),
  read('deploy/netlify/site/en/contacto/index.html'),
  read('deploy/netlify/site-footer.mjs'),
]);
const routeId='licencia/index.html';
assert.match(generator,/handAuthoredEnglishPages[\s\S]*?['"]licencia\/index\.html['"]/,
  'The English legal page must be excluded from machine translation');
for(const annex of ['### A.1 Formato','### A.2 Player','### A.3 Studio','### A.4 Contenido'])
  assert.ok(license.includes(annex),'Binding Annex A is missing '+annex);
assert.match(notice,/P2LRN-NCSL 1\.0/);
assert.match(css,/\/\* License permissions design \(ES\/EN\)/);
assert.match(css,/\.license-page \.license-matrix/);
assert.match(css,/@media\(max-width:520px\)/);

const requirements=[
  'actual','permisos','obligaciones','casos','fuente-legal',
  'codigo-fuente','paquetes','terceros','contenido','consultas'
];
const links=(html)=>[...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(m=>m[1]);
const ids=(html)=>[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const count=(html,re)=>[...html.matchAll(re)].length;
const sectionRows=(html)=>{
  const table=html.match(/<table\s+class="license-matrix">([\s\S]*?)<\/table>/);
  assert.ok(table,'Missing comparison table');
  const body=table[1].match(/<tbody>([\s\S]*?)<\/tbody>/);
  assert.ok(body,'Missing comparison table body');
  return count(body[1],/<tr>/g);
};
for(const [lang,html] of [['es',es],['en',en]]){
  const prefix=lang==='en'?'/en':'';
  assert.match(html,new RegExp('<html lang="'+lang+'">'));
  assert.match(html,new RegExp('<link rel="canonical" href="https:\\/\\/p2lrn\\.org'+prefix+'\\/licencia\\/"'));
  assert.match(html,/<body class="license-page">/);
  assert.match(html,/<main class="legal-main" id="top">/);
  assert.match(html,/<p class="license-disclaimer" role="note">/);
  assert.match(html,/<table\s+class="license-matrix">/);
  assert.match(html,/<caption>[^<]+<\/caption>/);
  assert.match(html,/class="license-table-scroll" role="region" aria-label="[^"]+" tabindex="0"/);
  assert.match(html,/<th scope="col">/);
  assert.match(html,/<th scope="row">/);
  assert.match(html,/href="\/LICENSE"/);
  assert.match(html,/href="\/NOTICE\.md"/);
  assert.match(html,/href="\/player\/current\/source\/SOURCE-MANIFEST\.json"/);
  assert.match(html,new RegExp('href="'+prefix+'\\/contacto\\/"'));
  assert.match(html,new RegExp('href="'+prefix+'\\/docs\\/npm\\/"'));
  assert.ok(!html.includes('github.com/josemarcosfrodo/p2lrn/blob/main/LICENSE'),
    'The contract cannot depend on a private repository');
  const found=ids(html);
  assert.equal(new Set(found).size,found.length,'Duplicate ID in '+lang);
  for(const required of requirements)assert.ok(found.includes(required),'Missing '+required+' in '+lang);
  for(const link of links(html))if(link.startsWith('#'))assert.ok(found.includes(link.slice(1)),
    'Broken fragment '+link+' in '+lang);
  assert.equal(count(html,/<details class="license-faq">/g),6,'FAQ count '+lang);
  assert.equal(sectionRows(html),5,'component row count '+lang);
  assert.equal(count(html,/<section id="/g),requirements.length,'section count '+lang);
  assert.ok(!/\bTODO\b|\[PENDIENTE\]|FIXME/.test(html));
}
assert.deepEqual(ids(es),ids(en),'Bilingual ID parity');
for(const tag of ['a','button','section','details','summary','table','th','td','code']){
  const tagRe=new RegExp('<'+tag+'(?:[\\s>])','g');
  assert.equal(count(es,tagRe),count(en,tagRe),'Bilingual '+tag+' parity');
}
const esLinks=links(es),enLinks=links(en);
assert.equal(esLinks.length,enLinks.length,'Bilingual navigation count');
for(let i=0;i<esLinks.length;i++){
  const url=esLinks[i];
  const expected=url==='/'?'/en/':[
    '/docs/','/docs/empezar/','/docs/player/','/docs/toolkit/','/docs/npm/','/contacto/'
  ].some(prefix=>url.startsWith(prefix))?'/en'+url:url;
  assert.equal(enLinks[i],expected,'English href counterpart at index '+i);
}
assert.match(es,/No es una licencia <em>open source<\/em> aprobada por OSI/);
assert.match(en,/not an OSI-approved <em>open-source<\/em> license/);
assert.match(es,/Anexo A\.1 y A\.4/);
assert.match(es,/Anexo A\.2/);
assert.match(es,/Anexo A\.3/);
assert.match(en,/Annex A\.1 and A\.4/);
assert.match(en,/Annex A\.2/);
assert.match(en,/Annex A\.3/);
assert.ok(!en.includes('Volver arriba'),'English retained Spanish UI text');
assert.match(en,/Back to top/);
for(const [lang,licensePage,contact] of [['es',es,contactEs],['en',en,contactEn]]){
  const localePrefix=lang==='en'?'/en':'';
  assert.ok(licensePage.includes('href="'+localePrefix+'/contacto/#solicitar-licencia"'),
    'Commercial license CTA must open the contact form in '+lang);
  assert.match(contact,/id="solicitar-licencia" data-contact-form/);
  assert.match(contact,/name="subject"[^>]+required/);
  if(lang==='es'){
    assert.match(licensePage,/El medio de contacto para solicitarla es el formulario de esta web/);
    assert.match(licensePage,/acuerdo expreso por escrito/);
    assert.match(contact,/Solicitud de licencia comercial P2LRN/);
  }else{
    assert.match(licensePage,/Use the contact form on this website to request it/);
    assert.match(licensePage,/express written agreement/);
    assert.match(contact,/P2LRN commercial license request/);
  }
}
assert.match(footer,/https:\/\/github\.com\/josemarcosdzb\/p2lrn/);
assert.match(footer,/site-footer__credit/);
assert.ok(!footer.includes('github.com/josemarcosfrodo/p2lrn'));

console.log(JSON.stringify({ok:true,localePages:2,sections:requirements.length,
  licenseAnnex:'A.1-A.4',componentRows:5,faqPerLanguage:6,linksVerified:esLinks.length,
  englishMirrorProtected:true,sourceAndNoticesLinked:true,commercialContactForm:true,repositoryOwner:'josemarcosdzb'},null,2));

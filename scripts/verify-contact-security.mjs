import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// The only Supabase integration is the website contact form. The shared site
// scripts and the product runtime must never import or invoke it.
const root='deploy/netlify/site/';
const [publicES,publicEN,contact,formES,formEN]=await Promise.all([
  readFile(root+'p2lrn.js','utf8'),
  readFile(root+'en/p2lrn.js','utf8'),
  readFile(root+'assets/contact/contact-form.js','utf8'),
  readFile(root+'contacto/index.html','utf8'),
  readFile(root+'en/contacto/index.html','utf8'),
]);
for(const [locale,publicJS] of [['es',publicES],['en',publicEN]]){
  assert.doesNotMatch(publicJS,/supabase|p2lrn-contact|data-contact-form|turnstile/i,
    'Global '+locale+' bundle must contain no contact backend or form handler');
}
assert.match(contact,/\/functions\/v1\/p2lrn-contact/);
assert.doesNotMatch(contact,/\/rest\/v1\/contact_messages|service_role/i);
assert.match(contact,/response\.status === 429/);
assert.match(contact,/Content-Type': 'application\/json'/);
assert.match(contact,/window\.turnstile\?\.render/);
assert.match(contact,/messages\.sending/);
const explicitScript='<script src="/assets/contact/contact-form.js" defer></script>';
for(const [locale,html] of [['es',formES],['en',formEN]]){
  assert.equal(html.split(explicitScript).length-1,1,'contact script must be loaded once in '+locale);
  assert.match(html,/data-contact-form/);
  assert.match(html,/name="company"/);
  for(const field of ['name','email','subject','message'])
    assert.match(html,new RegExp('name="'+field+'"'));
  assert.match(html,/data-form-status/);
}
assert.match(formES,/<html lang="es"/i);
assert.match(formEN,/<html lang="en"/i);
console.log(JSON.stringify({ok:true,isolatedContactAsset:true,globalBundlesClean:true,
  spanishForm:true,englishForm:true,serverFunctionOnly:true}));

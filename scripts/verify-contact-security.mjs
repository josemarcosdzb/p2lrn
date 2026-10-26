import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static regression guard. Runtime/RLS checks are separately documented and
// must be repeated against the actual Supabase project before certification.
const site=await readFile('deploy/netlify/site/p2lrn.js','utf8');
const form=await readFile('deploy/netlify/site/contacto/index.html','utf8');
assert.match(site,/\/functions\/v1\/p2lrn-contact/);
assert.doesNotMatch(site,/\/rest\/v1\/contact_messages/);
assert.match(site,/response\.status === 429/);
assert.match(site,/Content-Type': 'application\/json'/);
assert.match(form,/data-contact-form/);
assert.match(form,/name="company"/);
for(const field of ['name','email','subject','message'])assert.match(form,new RegExp('name="'+field+'"'));
assert.match(form,/data-form-status/);
console.log(JSON.stringify({ok:true,frontendServerRoute:true,notDirectTable:true,rateLimitFeedback:true,honeypot:true,formFields:true}));

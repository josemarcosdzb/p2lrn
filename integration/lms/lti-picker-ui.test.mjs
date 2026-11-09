import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerHtml} from './lti-picker-ui.mjs';
import {classifyLtiUserError,ltiErrorHtml} from './lti-user-errors.mjs';

const content=[{id:'catalog-a',title:'Seguridad informática',
 entities:[{id:'course-root',type:'course',title:'Seguridad informática'},
 {id:'unit1',type:'unit',title:'Primeros pasos'},
 {id:'activity1',type:'activity',title:'Cuestionario final'}]},
 {id:'catalog-b',title:'Datos y tablas',
 entities:[{id:'course-b',type:'course',title:'Datos y tablas'}]}];

test('teacher sees one primary Add course button per package',()=>{
 const markup=pickerHtml({ticket:'ticket-123',tenantId:'qa-campus',contents:content,cspNonce:'csp-123'});
 assert.equal((markup.match(/Añadir curso<\/button>/g)||[]).length,2);
 assert.equal((markup.match(/Añadir actividad<\/button>/g)||[]).length,2);
 assert.match(markup,/<details><summary>Elegir una actividad específica \(opcional\)<\/summary>/);
 assert.match(markup,/<input id="buscar" type="search"/);
 assert.match(markup,/action="\/lti\/deep-link\/confirm" enctype="multipart\/form-data"/);
 assert.match(markup,/role="status" aria-live="polite"/);
 assert.match(markup,/name="ticket" value="ticket-123"/);
 assert.match(markup,/name="catalogId" value="catalog-a"/);
 assert.match(markup,/name="entityId" value="course-root"/);
 assert.match(markup,/No necesitas descargar archivos ni configurar nada más/);
 assert.match(markup,/<script nonce="csp-123">/);
});

test('upload error is accessible, sanitized and leaves the upload form available',()=>{
 const markup=pickerHtml({ticket:'retry-ticket',contents:content,cspNonce:'nonce',
  errorMessage:'El archivo <script>alert("bad")</script> no está disponible.'});
 assert.match(markup,/role="alert"/);
 assert.match(markup,/No se ha publicado/);
 assert.match(markup,/Publicar y añadir/);
 assert.match(markup,/value="retry-ticket"/);
 assert.doesNotMatch(markup,/<script>alert/);
 assert.match(markup,/&lt;script&gt;/);
});
test('empty catalogue gives actionable response; malformed content cannot inject markup',()=>{
 const missing=pickerHtml({ticket:'t',contents:[],cspNonce:'n'});
 assert.match(missing,/No hay cursos publicados/);
 const dangerous=pickerHtml({ticket:'t" onclick="alert(1)',cspNonce:'x',
  contents:[{id:'x',title:'<img src=x onerror=evil()>',
   entities:[{id:'root',type:'course',title:'" onmouseover="alert(2)'}]}]});
 assert.doesNotMatch(dangerous,/<img src=x/);
 assert.doesNotMatch(dangerous, /ticket="t" onclick=/);
 assert.match(dangerous,/&lt;img/);
 assert.match(dangerous,/&quot;/);
});

test('all user-visible errors use safe fixed copy with no JWT, issuer or passwords',()=>{
 const suspicious='Invalid LMS JWT signature: username=jose@example.org token=abc.password';
 const issue=classifyLtiUserError(new Error(suspicious));
 assert.equal(issue.code,'LMS_VERIFICATION_FAILED');
 const page=ltiErrorHtml({problem:issue,reference:'A1B2C3'});
 assert.match(page,/No se pudo validar el acceso/);
 assert.match(page,/Incidencia <code>A1B2C3<\/code>/);
 assert.doesNotMatch(page,/jose@example.org/);
 assert.doesNotMatch(page,/abc\.password/);
});

test('expired session and missing deployment give different corrective instructions',()=>{
 assert.equal(classifyLtiUserError('Missing, consumed or expired LTI OIDC state').code,'SESSION_EXPIRED');
 assert.equal(classifyLtiUserError('Unregistered LTI deployment').code,'LMS_NOT_CONNECTED');
 assert.equal(classifyLtiUserError('UNAUTHORIZED_DEEP_LINK_CONTENT').code,'CONTENT_NOT_LINKED');
 assert.equal(classifyLtiUserError('Deep Linking requires an authorized instructor').code,'TEACHER_REQUIRED');
});

test('fallback message does not reflect unknown internal exception',()=>{
 const unknown=classifyLtiUserError(new Error('sensitive /private/path?jwt=secret'));
 assert.equal(unknown.code,'LTI_ACCESS_ERROR');
 const html=ltiErrorHtml({problem:unknown,reference:'REF123'});
 assert.doesNotMatch(html,/\/private\/path|jwt=secret/);
 assert.match(html,/Vuelve a tu aula virtual/);
});

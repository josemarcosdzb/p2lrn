// Public-facing errors are deliberately coarse: never expose JWT, issuer, keys or claims.
const problems=[
 {pattern:/INVALID_P2LRN_UPLOAD|REQUEST_TOO_LARGE|P2LRN package contains no publishable/i,
  code:'INVALID_COURSE_FILE',title:'No se pudo publicar el curso',
  detail:'Vuelve al selector y elige un archivo .p2lrn exportado desde Studio. El paquete debe estar completo y ocupar menos de 64 MB.'},
 {pattern:/Missing, consumed or expired LTI OIDC state|LTI browser binding mismatch|OIDC browser binding|SESSION_EXPIRED|PICKER_EXPIRED/i,
  code:'SESSION_EXPIRED',title:'La sesión ha caducado',
  detail:'Vuelve al curso de tu aula virtual y abre de nuevo P2LRN. No uses un enlace guardado de la pantalla anterior.'},
 {pattern:/Deep Linking requires an authorized instructor|NRPS_ROLE_DENIED/i,
  code:'TEACHER_REQUIRED',title:'Necesitas acceso de profesor',
  detail:'Abre la opción de añadir actividades desde el curso con una cuenta de profesor o administrador del aula.'},
 {pattern:/Unknown or inactive LTI platform|Unregistered LTI deployment|Unknown LTI deployment|Unregistered LTI target|LTI registration changed|UNREGISTERED_LEGACY_PLATFORM/i,
  code:'LMS_NOT_CONNECTED',title:'Tu aula todavía no está conectada',
  detail:'El administrador debe terminar la conexión de P2LRN con este aula virtual una sola vez. No necesitas modificar el archivo del curso.'},
 {pattern:/Unapproved P2LRN selection|UNAUTHORIZED_DEEP_LINK_CONTENT|P2LRN content authorization|UNAUTHORIZED_LEGACY_BINDING|Invalid P2LRN content binding/i,
  code:'CONTENT_NOT_LINKED',title:'La actividad no está vinculada',
  detail:'Pide al profesor que vuelva a añadir el curso desde el selector P2LRN de su aula. No hace falta volver a crear ni convertir el curso.'},
 {pattern:/LTI JWT|Invalid JWT|LMS issuer mismatch|audience|LMS RSA|nonce|signature|key|INVALID_LEGACY_SIGNATURE|INVALID_LEGACY_OAUTH/i,
  code:'LMS_VERIFICATION_FAILED',title:'No se pudo validar el acceso',
  detail:'Por seguridad no se ha abierto la actividad. Abre el enlace original desde tu aula y, si se repite, contacta con el administrador.'},
 {pattern:/Deep Linking requested at the wrong|Resource link requested at the wrong|WRONG_LTI_TARGET|LTI protocol or target mismatch/i,
  code:'WRONG_LMS_LINK',title:'El enlace del curso necesita actualizarse',
  detail:'El profesor debe insertar P2LRN desde la herramienta del aula y no pegar manualmente la dirección de lanzamiento.'}
];
export function classifyLtiUserError(error){
 const reason=String(error?.message||error||'');
 return problems.find(p=>p.pattern.test(reason))||
  {code:'LTI_ACCESS_ERROR',title:'No se pudo abrir la actividad',
   detail:'Vuelve a tu aula virtual e intenta abrir la actividad otra vez. Si continúa fallando, comunica el código de incidencia al administrador.'};
}
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ltiErrorHtml({problem,reference}){
 const p=problem||classifyLtiUserError('');
 return '<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">'+
  '<title>'+escapeText(p.title)+' · P2LRN</title>'+
  '<style>:root{font:16px system-ui,sans-serif;color:#172b45;background:#f3f6fb}'+
  'body{margin:0;min-height:100dvh;display:grid;place-items:center}main{background:white;'+
  'max-width:600px;margin:16px;padding:clamp(20px,5vw,40px);border-radius:16px;'+
  'border:1px solid #cbd5e1;box-shadow:0 9px 28px #213f6310}'+
  'h1{font-size:clamp(1.4rem,3vw,1.8rem)}p{line-height:1.6}'+
  '.label{color:#1e548b;font-weight:700}code{padding:3px 7px;background:#e5edf7;border-radius:5px}'+
  '</style></head><body><main role="alert"><p class="label">P2LRN · Acceso al aula</p>'+
  '<h1>'+escapeText(p.title)+'</h1><p>'+escapeText(p.detail)+'</p>'+
  '<p><strong>Qué hacer:</strong> vuelve al curso en Moodle, Chamilo, Canvas, Sakai u Open edX y abre la actividad desde allí.</p>'+
  '<p><small>Incidencia <code>'+escapeText(reference)+'</code>. Si necesitas ayuda, facilita solo este código; nunca compartas tu contraseña.</small></p>'+
  '</main></body></html>';
}

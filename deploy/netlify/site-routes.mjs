// One source of truth for public English route names and permanent legacy redirects.
// All paths are absolute, end with "/", and have a real authored counterpart.
export const ENGLISH_ROUTES=Object.freeze({
  '/crear-cursos-interactivos/':'/en/create-interactive-courses/',
  '/juegos-educativos-3d/':'/en/3d-educational-games/',
  '/cursos-offline/':'/en/offline-courses/',
  '/contacto/':'/en/contact/',
  '/privacidad/':'/en/privacy/',
  '/terminos/':'/en/terms/',
  '/aviso-legal/':'/en/legal-notice/',
  '/licencia/':'/en/license/',
  '/docs/empezar/':'/en/docs/getting-started/',
  '/docs/empezar-facil/':'/en/docs/quickstart/',
  '/docs/desarrolladores/':'/en/docs/developers/',
  '/docs/desarrolladores/primeros-pasos/':'/en/docs/developers/quickstart/',
  '/docs/instalar/':'/en/docs/installation/',
  '/docs/formato/':'/en/docs/file-format/',
  '/docs/formato-portable-cursos-interactivos/':'/en/docs/portable-course-format/',
  '/docs/conceptos/':'/en/docs/concepts/',
  '/docs/paquetes/':'/en/docs/packages/',
  '/docs/paquetes/multipart/':'/en/docs/packages/multipart/',
  '/docs/que-usar/':'/en/docs/choose-tools/',
  '/docs/compatibilidad/':'/en/docs/compatibility/',
  '/docs/conectores/':'/en/docs/connectors/',
  '/docs/conectores/ia/':'/en/docs/connectors/ai/',
  '/docs/conectores/lms/':'/en/docs/connectors/lms/',
  '/docs/conectores/lti/':'/en/docs/connectors/lti/',
  '/docs/colaboracion/':'/en/docs/collaboration/',
  '/docs/ejemplos/':'/en/docs/examples/',
  '/docs/entrega-offline/':'/en/docs/offline-delivery/',
  '/docs/eventos/':'/en/docs/events/',
  '/docs/glosario/':'/en/docs/glossary/',
  '/docs/integracion/':'/en/docs/integration/',
  '/docs/juegos-3d/':'/en/docs/3d-games/',
  '/docs/metricas/':'/en/docs/metrics/',
  '/docs/progresion/':'/en/docs/progression/',
  '/docs/recetas/':'/en/docs/recipes/',
  '/docs/referencia/':'/en/docs/reference/',
});
export const LEGACY_ENGLISH_ROUTES=Object.freeze(Object.fromEntries(
  Object.entries(ENGLISH_ROUTES).map(([es,en])=>['/en'+es,en])
));
export const SPANISH_ROUTES=Object.freeze(Object.fromEntries(
  Object.entries(ENGLISH_ROUTES).map(([es,en])=>[en,es])
));
export const englishRouteFor=es=>ENGLISH_ROUTES[es]||(es==='/'?'/en/':'/en'+es);
export const spanishRouteFor=en=>SPANISH_ROUTES[en]||(en==='/en/'?'/':en.replace(/^\/en(?=\/)/,'')||'/');
export const canonicalRoute=route=>LEGACY_ENGLISH_ROUTES[route]||route;
export const legacyRouteFor=route=>Object.entries(LEGACY_ENGLISH_ROUTES)
  .find(([,canonical])=>canonical===route)?.[0]||route;

export const ENGLISH_ANCHORS=Object.freeze({
  'crear-cuestionarios-online':'create-online-quizzes',
  'juegos-educativos-2d':'2d-educational-games',
  'crear-cursos':'create-courses',
  'conectar-ordenador':'connect-computer',
  'guia-ia':'ai-guide'
});

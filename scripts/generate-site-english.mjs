import {mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {dirname,extname,join,relative,resolve} from 'node:path';
import {parseJs,walkAst,structuralLiteral} from './site-i18n-ast.mjs';
import {load} from 'cheerio';

const root=resolve(process.cwd());
const siteRoot=join(root,'deploy','netlify','site');
const englishRoot=join(siteRoot,'en');
// Pages translated by an editor, rather than a machine, must survive a full mirror rebuild.
const handAuthoredEnglishPages=new Set(['docs/formato-portable-cursos-interactivos/index.html']);
const cachePath=join(root,'scripts','site-en-translations.json');
const MODEL='Xenova/opus-mt-es-en';
const JS_FILES=['p2lrn.js','studio/studio.js','demo/viewer.js','analytics/demo.js'];

const MANUAL=new Map(Object.entries({
  'Guía de portabilidad':'Portability guide',
  'Una explicación práctica para comparar formatos, reproducción y entrega de contenidos. Consulta la':'A practical guide to comparing formats, playback and course delivery. Read the',
  'guía del formato portable de cursos interactivos':'portable interactive course format guide',
  'Menú':'Menu','Cerrar':'Close','Abrir':'Open','Inicio':'Home','Anterior':'Previous','Siguiente':'Next',
  'Documentación':'Documentation','Integración':'Integration','Colaboración':'Collaboration','Contacto':'Contact',
  'Privacidad':'Privacy','Licencia':'License','Términos':'Terms','Aviso legal':'Legal notice','Recursos':'Resources',
  'Crear':'Create','Reproducir':'Play','Integrar':'Integrate','Seguimiento':'Tracking','Referencia':'Reference',
  'Empezar':'Get started','Instalar':'Install','Conectores':'Connectors','Cuestionarios':'Questionnaires',
  'Cuestionario':'Questionnaire','Memoria':'Memory','Relacionar':'Matching','Ordenar':'Ordering',
  'Clasificar':'Classification','Verdadero / Falso':'True / False','Sopa de letras':'Word search',
  'Crucigrama':'Crossword','Rosco':'Word Wheel','Juego 3D':'3D game','Juegos 3D':'3D games',
  'Lecciones':'Lessons','Paquetes':'Packages','Compatibilidad':'Compatibility','Métricas':'Metrics',
  'Analítica':'Analytics','Progresión':'Progress','Alumno':'Learner','Alumnos':'Learners','Profesor':'Teacher',
  'Profesores':'Teachers','Autor':'Author','Descripción':'Description','Título':'Title','Archivo':'File',
  'Archivos':'Files','Guardar':'Save','Descargar':'Download','Seleccionar':'Select','Eliminar':'Delete',
  'Copiado':'Copied','Disponible':'Available','No disponible':'Unavailable','Resultados':'Results',
  'Resultado':'Result','Actividad':'Activity','Actividades':'Activities','Curso':'Course','Cursos':'Courses',
  'Unidad':'Unit','Unidades':'Units','Lección':'Lesson','Puntuación':'Score','Intentos':'Attempts',
  'Contenido':'Content','Formato':'Format','Formatos':'Formats','Ejemplos':'Examples','Ejemplo':'Example',
  'Configuración':'Settings','Seguridad':'Security','Cookies':'Cookies',
  'Perfiles':'Profiles','Glosario':'Glossary','Arquitectura':'Architecture','Eventos':'Events','Recetas':'Recipes',
  'curso.p2lrn':'course.p2lrn','curso-split.p2lrn':'course-split.p2lrn',
  'https://…/curso.p2lrn':'https://…/course.p2lrn','https://content.example.com/courses/curso/':'https://content.example.com/courses/course/',
  'P2LRN Analytics | Analítica educativa y seguimiento de alumnos':'P2LRN Analytics | Learning analytics and learner tracking',
  '1. Qué muestra':'1. What it shows',
  '2. Manifiesto (manifest): identidad, capacidades e integridad':'2. Manifest: identity, capabilities and integrity',
  'Recorrido común del proveedor':'Common provider flow',
  'NRPS: roles y matrículas (opcional)':'NRPS: roles and enrollments (optional)',
  'Estado actual del proveedor':'Current provider status',
  'Flujo docente y alumno implementado':'Implemented teacher and learner flow',
  'Catálogo procesable':'Machine-readable catalog',
  'Empezar fácil con P2LRN — P2LRN':'Quick start with P2LRN — P2LRN',
  'Empezar fácil':'Quick start',
  'Antes de empezar':'Before you start',
  'Entrega offline y paquetes autorreproducibles — P2LRN':'Offline delivery and self-running packages — P2LRN',
  'Entrega offline y cursos autorreproducibles':'Offline delivery and self-running courses',
  '5. Qué registra una entrega autorreproducible':'5. What a self-running delivery records',
  '9. Firma del encargo y procedencia':'9. Assignment signature and provenance',
  'Recursos compartidos verificados':'Verified shared resources',
  'Ejemplo ejecutable':'Runnable example','Limitaciones':'Limitations',
  'Player web — P2LRN':'Web Player — P2LRN','Player web':'Web Player',
  'API pública':'Public API','Integridad y transporte':'Integrity and transport',
  'Relacionar — P2LRN':'Matching — P2LRN','Ordenar — P2LRN':'Ordering — P2LRN','Rosco — P2LRN':'Word Wheel — P2LRN',
  'Studio visual — P2LRN':'P2LRN Studio — Visual editor',
  '6. Comprobar la vista del alumno':'6. Check the learner view',
  '9. Referencia técnica del componente':'9. Component technical reference',
  '2. Recorrido habitual':'2. Typical workflow',
  '8. Host autoritativo de referencia':'8. Authoritative reference host',
  'Descarga P2LRN para crear cursos educativos con IA.':'Download P2LRN Skills to create educational courses with AI.',
  'Entrega offline autorreproducible':'Self-running offline delivery',
  'Revisar entrega offline':'Review offline delivery',
  '1. Objeto':'1. Purpose',
  '¿Necesitas seguimiento de alumnos y resultados?':'Need learner and result tracking?',
  'De la primera lección a la experiencia del alumno.':'From the first lesson to the learner experience.',
  'Qué vas a conseguir':'What you will get','Qué componente necesitas':'Which component you need',
  'Comprobación final':'Final check','Accesibilidad y alternativa':'Accessibility and alternative mode',
  'Probar un paquete':'Test a package','Probar el ejemplo':'Try the example',
  'Finalización y puntuación':'Completion and scoring',
  'Referencia técnica del componente':'Component technical reference',
  'Toolkit para creación por código':'Toolkit for programmatic authoring',
  'Abrir visor':'Open viewer','Vista alumno':'Learner view',
  'Objeto':'Purpose','Terceros':'Third parties','Responsabilidad':'Liability','Cambios':'Changes',
  'Nombre':'Name','Asunto':'Subject','Mensaje':'Message','Empresa':'Company','Resumen':'Summary',
  'Consentimiento':'Consent','Proveedor':'Provider','Finalidad':'Purpose','Tipo':'Type',
  'Emparejar':'Match','Recargar':'Reload','Pausar':'Pause','Copiar':'Copy','Limpiar':'Clear',
  'RECURSO':'RESOURCE','Notas':'Notes','Inactividad':'Inactivity','Localiza':'Locate','Consulta':'Query',
  'Carga.':'Load.','Salida.':'Output.','expone':'exposes','Identidad':'Identity','Permisos':'Permissions',
  'Nativo':'Native','Leer':'Read','Conservar':'Preserve','Perfil':'Profile','representaciones':'representations',
  'renderizador':'renderer','Ejecuta':'Run','ejecuta':'runs','Administrador:':'Administrator:','Notas:':'Notes:',
  'Requisitos':'Requirements','Servidor':'Server','Reintentos':'Retries','Demuestra':'Demonstrates',
  'Origen':'Origin','Metadatos':'Metadata','Contactar':'Contact','Preparar':'Prepare','Entregar':'Deliver',
  'Realizar':'Complete','Devolver':'Return','Analizar':'Analyze','informativas':'informational',
  'Pulsa':'Click','Comportamiento':'Behavior','Autorreproducible':'Self-running','Incluye':'Includes',
  'Conserva':'Preserves','publicados.':'published.','Fases':'Phases','INSTALAR':'INSTALL',
  'exporta':'exports','Configura':'Configure','Usa':'Use','ESTADO':'STATUS','PRIVADO':'PRIVATE',
  'selecciona':'selects','Estado':'Status','Nota:':'Note:','Interacciones':'Interactions',
  'Objetivos':'Objectives','Deriva':'Derives','Puntuaciones':'Scores','proporciona':'provides',
  'Instala':'Install','Cada':'Each','Conecta':'Connect','Acepta':'Accepts','Renderizado.':'Rendering.',
  'Reglas.':'Rules.','Persistencia.':'Persistence.','Emite':'Emits','Secuencias':'Sequences',
  'DOCUMENTOS':'DOCUMENTS','PRUEBA':'TEST','Devuelve':'Returns','Requisitos:':'Requirements:',
  'Unidad.':'Unit.','Guarda':'Save','DOCUMENTO':'DOCUMENT','estructura':'structure','responde.':'responds.',
  'Comprueba':'Check','Escucha':'Listen','Si':'If','Interactivo':'Interactive','Nativos':'Native',
  'Interactivas':'Interactive','Componentes':'Components','OTROS':'OTHER','independiente.':'independent.',
  'EXPERIENCIA':'EXPERIENCE','Responsable':'Controller','Destinatarios':'Recipients',
  'Actualizaciones':'Updates','indicando':'specifying','Editar':'Edit','Componente':'Component',
  'Fuente':'Font','Negrita':'Bold','Cursiva':'Italic','Subrayado':'Underline','Tachado':'Strikethrough',
  'Centrar':'Center','Color':'Color','Obligaciones':'Obligations','Versiones':'Versions',
  'Disponibilidad':'Availability',
  'y':'and','Y':'AND','o':'or','O':'OR','En':'In','en':'in',
  'INTEGRIDAD':'INTEGRITY','ORIGEN':'ORIGIN','PERFILES':'PROFILES',
  'Usar CDN':'Use CDN','Usar NPM':'Use NPM','Ver eventos':'View events',
  'exige perfiles completos.':'requires complete profiles.',
  '7. Eventos y tiempo activo':'7. Events and active time','8. API y eventos':'8. API and events',
  '5. Perfiles (profiles): reglas adicionales':'5. Profiles: additional rules',
  'Eventos — P2LRN':'Events — P2LRN','Glosario — P2LRN':'Glossary — P2LRN',
  'eventos / Host Adapter':'events / Host Adapter','servidor y persistencia':'server and persistence',
  'Identidad y permisos':'Identity and permissions','Almacenamiento y procesamiento':'Storage and processing',
  'Identidad y notas':'Identity and grades','estado / notas / eventos / LRS':'state / grades / events / LRS',
  '9. Eventos':'9. Events','Arquitectura 3D':'3D architecture','Recetas — P2LRN':'Recipes — P2LRN',
  'EVENTOS':'EVENTS','educational analytics y learning analytics':'educational analytics and learning analytics',
  'Entrega offline':'Offline delivery',
  '4. Acceso y uso correcto':'4. Access and proper use','8. Responsabilidad':'8. Liability',
  'Enviar mensaje':'Send message','1. Cookies utilizadas':'1. Cookies used','2. Inventario comprobado':'2. Verified inventory',
  '3. Almacenamiento local':'3. Local storage','6. Consentimiento':'6. Consent',
  'Ver proceso completo':'View the full process','Comprueba la vista alumno':'Check the learner view',
  'El alumno trabaja en su navegador':'The learner works in their browser','Probar un juego en el visor':'Test a game in the viewer',
  'Qué incluye el flujo':'What is included in the workflow?','¿Ya tienes un curso preparado?':'Already have a course ready?',
  'Caducidad desde primera apertura':'Expiration after first opening',
  '3. Cargar Studio':'3. Load Studio','Analytics mediante CDN':'Analytics via CDN','Studio mediante CDN':'Studio via CDN',
  'Studio mediante CDN — P2LRN':'Studio via CDN — P2LRN','1. Cargar Studio':'1. Load Studio',
  '1. Requisito previo':'1. Prerequisite','6. Convertir, reempaquetar y extraer':'6. Convert, repackage, and extract',
  '8. Cambios incrementales (Delta)':'8. Incremental changes (Delta)','9. Firma y confianza (Trust)':'9. Signing and trust',
  '2. Contrato portable':'2. Portable contract','Conceptos — P2LRN':'Concepts — P2LRN','Conceptos fundamentales':'Fundamental concepts',
  'Integridad SHA-256':'SHA-256 integrity','Comprobar SHA-256':'Verify SHA-256','Descargas relacionadas':'Related downloads',
  'Ver integridad SHA-256':'View SHA-256 integrity','Ver despliegue y estado':'View deployment and status',
  'Descargar fuente LTI (.zip)':'Download LTI source (.zip)','Verificar SHA-256':'Verify SHA-256',
  'Ver entrega offline':'View offline delivery','12. Elegir entre .p2lrn y entrega offline':'12. Choose between .p2lrn and offline delivery',
  '6. H5P y xAPI':'6. H5P and xAPI','7. Errores':'7. Errors','Identificadores principales':'Primary identifiers',
  'Recorrido recomendado':'Recommended path','Studio alojado':'Hosted Studio','Studio mediante CDN':'Studio via CDN',
  'Capacidades en vivo: Capability Broker':'Live capabilities: Capability Broker','Runtime externo opcional':'Optional external runtime',
  '13. Reintentos, duplicados e idempotencia':'13. Retries, duplicates, and idempotency',
  '3. Instalar Studio':'3. Install Studio','5. Instalar Analytics':'5. Install Analytics',
  'SCORM y otros subpaquetes':'SCORM and other subpackages','Varios payloads grandes':'Multiple large payloads',
  'Ver metadatos y hashes':'View metadata and hashes','Componente web':'Web component','Service Worker y cache verificado':'Service Worker and verified cache',
  'Servicios conectados':'Connected services','1. Modelo mental':'1. Mental model','2. Propiedades disponibles':'2. Available properties',
  '3. Obligatoriedad y bloqueo no son lo mismo':'3. Required and blocked are not the same',
  '2. Componentes principales':'2. Main components','Conectado y offline':'Connected and offline',
  'Rutas CDN':'CDN routes','Multipart ejecutable':'Executable multipart',
  'Claude: Skill personalizada y Claude Code':'Claude: Custom Skill and Claude Code','Gemini: interfaz web y Gemini CLI':'Gemini: web interface and Gemini CLI',
  'Integrar Studio':'Integrate Studio','Componentes nativos':'Native components',
  'Player no carga':'Player does not load','SCORM no arranca':'SCORM does not start',
  '3. Finalidad':'3. Purpose','9. Decisiones automatizadas':'9. Automated decision-making','10. Actualizaciones':'10. Updates',
  'Verifica y reproduce':'Verify and play','Editar y exportar visualmente':'Edit and export visually',
  'Estructura avanzada':'Advanced structure','Recuperar borrador':'Restore draft','Exportar .p2lrn':'Export .p2lrn',
  'Revisar entrega':'Review delivery','Generar entrega':'Generate delivery','Recurso compartido':'Shared resource',
  'Biblioteca compartida':'Shared library','Reader / documento':'Reader / document','Rellenar huecos':'Fill in the blanks',
  'Pizarra compartida':'Shared board','Borrador local':'Local draft','Windows · CMD (alternativa)':'Windows · CMD (alternative)',
  '1. Objeto':'1. Purpose','7. Usos prohibidos':'7. Prohibited uses','12. Cambios y marco aplicable':'12. Changes and applicable framework',
  'Usos prohibidos':'Prohibited uses','Cambios y marco aplicable':'Changes and applicable framework',
  'Fuente de datos de una plataforma':'Platform data source','Funciones auxiliares de servidor':'Server helper functions',
  'Clasificar — P2LRN':'Classification — P2LRN','Proyecto de autoría':'Authoring project',
  'Empezar fácil con CDN':'Quick start with CDN','Responsable y contacto':'Controller and contact','Conservación':'Data retention',
  'Firma del encargo y procedencia':'Assignment signature and provenance','Firmar el encargo para comprobarlo después (opcional)':'Sign the assignment for later verification (optional)',
  'Archivo / multimedia':'File / media','Fuente LTI':'LTI source',
  '12. Elegir entre':'12. Choose between','y entrega offline':'and offline delivery',
  'Puedes usar una ruta del propio sitio o una URL web. Si el paquete está alojado en otro dominio, ese servidor debe permitir su carga desde el visor.':'You can use a path from this site or a web URL. If the package is hosted on another domain, that server must allow the viewer to load it.'
,
  'Crea una lección editable para escribir y dar formato al contenido directamente en Studio.':'Create an editable lesson to write and format content directly in Studio.',
  'Añade una imagen, vídeo, audio u otro archivo como recurso dentro del curso.':'Add an image, video, audio, or another file as a course resource.',
  'Enlaza una página o recurso web externo mediante su URL, sin copiar el contenido al paquete.':'Link an external page or web resource by URL without copying it into the package.',
  'Referencia una única copia verificable mediante URL lógica y digest SHA-256.':'Reference a single verifiable copy using a logical URL and SHA-256 digest.',
  'Selecciona un recurso verificado por SHA-256 de la biblioteca compartida conectada por el host.':'Select a SHA-256 verified resource from the shared library connected by the host.',
  'Importa documentos como PDF, DOCX, PPTX, EPUB, TXT o Markdown y los convierte en contenido utilizable en el curso.':'Import documents such as PDF, DOCX, PPTX, EPUB, TXT, or Markdown and convert them into usable course content.',
  'Importa un paquete educativo ya creado, por ejemplo SCORM, H5P, cmi5, QTI, Common Cartridge o IMS Content Package.':'Import an existing learning package such as SCORM, H5P, cmi5, QTI, Common Cartridge, or IMS Content Package.',
  'Crea una evaluación flexible donde puedes combinar elección única, múltiple, verdadero/falso, texto, huecos, ordenar, relacionar y clasificar.':'Create a flexible assessment combining single choice, multiple choice, true/false, text, fill-in-the-blank, ordering, matching, and classification.',
  'Juego de memoria basado en parejas. El alumno descubre cartas y debe encontrar las correspondencias.':'Pair-based memory game. The learner reveals cards and finds the matching pairs.',
  'Juego para relacionar elementos de dos columnas, por ejemplo países con capitales o conceptos con definiciones.':'Match items from two columns, such as countries with capitals or concepts with definitions.',
  'Juego para colocar elementos en el orden correcto, como pasos, fechas o fases de un proceso.':'Place items in the correct order, such as steps, dates, or stages of a process.',
  'Juego para arrastrar o asignar elementos a la categoría correcta.':'Drag or assign items to the correct category.',
  'Juego de afirmaciones que el alumno debe marcar como verdaderas o falsas.':'Statements that the learner must mark as true or false.',
  'Juego para completar uno o varios huecos con las respuestas correctas.':'Fill one or more blanks with the correct answers.',
  'Genera una sopa de letras a partir de respuestas de texto que el alumno debe localizar.':'Generate a word search from text answers that the learner must find.',
  'Genera un crucigrama usando pistas y respuestas de texto.':'Generate a crossword from clues and text answers.',
  'Juego tipo rosco: una serie de pistas con respuestas de texto, normalmente asociadas a letras.':'Word Wheel game: a series of clues with text answers, usually associated with letters.',
  'Crea un juego 3D de ordenar objetos. Puedes cambiar a Relacionar o Clasificar en el campo Tipo de cada pregunta.':'Create a 3D object-ordering game. You can switch to Matching or Classification in each question’s Type field.',
  'Crea un juego 3D para conectar elementos y sus parejas con el mismo motor físico del Player.':'Create a 3D matching game that connects items and their pairs using the same Player physics engine.',
  'Crea un juego 3D para clasificar objetos en categorías con el mismo motor físico del Player.':'Create a 3D classification game using the same Player physics engine.',
  'Crea una votación sincronizada con fallback individual.':'Create a synchronized poll with an individual fallback.',
  'Crea una pizarra ligera de notas compartidas.':'Create a lightweight shared notes board.',
  'Permite compartir una aportación y comentar las de otros participantes.':'Let participants share a contribution and comment on contributions from others.',
  'Añade avisos, líneas temporales y otros componentes nativos registrados en P2LRN.':'Add callouts, timelines, and other native components registered in P2LRN.',
  'Crea un grupo que contiene actividades reales y define cómo se recorren y completan.':'Create a group containing real activities and define how learners navigate and complete them.',
  'Acceso y uso':'Access and use','y en':'and in','Player · Entrega portable':'Player · Portable delivery',
  'En Analytics pulsa':'In Analytics, click','Identidad visible autorizada: id, nombre, correo opcional, grupo, cohorte y etiquetas.':'Authorized visible identity: ID, name, optional email, group, cohort, and tags.',
  'Procesa documentos importados mediante Reader.':'Processes imported documents through Reader.','. En':'. In',
  'SCORM 1.2 y SCORM 2004:':'SCORM 1.2 and SCORM 2004:','cmi5 y HTML:':'cmi5 and HTML:','npm y CDN':'npm and CDN','LMS y LTI':'LMS and LTI',
  'Player verifica y renderiza.':'Player verifies and renders.','Host conserva identidad y estado.':'Host preserves identity and state.',
  'Servidor HTTPS':'HTTPS server','Moodle, Canvas, Sakai, Chamilo y Open edX':'Moodle, Canvas, Sakai, Chamilo, and Open edX','En Host Adapter':'In Host Adapter',
  'y binding autorizado.':'and authorized binding.','y entidad.':'and entity.','NRPS sigue siendo opcional y':'NRPS remains optional and',
  'Implementado: proveedor y persistencia':'Implemented: provider and persistence','Implementado: OIDC, JWKS y Deep Linking':'Implemented: OIDC, JWKS, and Deep Linking','Implementado: Player, estado y AGS':'Implemented: Player, state, and AGS',
  'Conectar progreso y usuarios':'Connect progress and users','y pulsa':'and click','Aperturas, sesiones y tiempo activo':'Openings, sessions, and active time',
  'Credenciales y secretos.':'Credentials and secrets.','Renderer / renderizador':'Renderer','Recurso verificado':'Verified resource',
  'Panel y vistas':'Dashboard and views','CDN y NPM':'CDN and NPM','entrega offline autorreproducible':'self-running offline delivery',
  '. Estado:':'. Status:','en 1.2.':'in 1.2.','Estado actual':'Current status','Mantiene secuencia y, opcionalmente,':'Preserves sequence and, optionally,',
  'indicado en':'specified in','JavaScript / TypeScript · biblioteca':'JavaScript / TypeScript · library','Recurso muy grande':'Very large resource',
  'y elige':'and choose','Entra en':'Go to','Parejas y asociaciones':'Pairs and associations','Vocabulario y escritura':'Vocabulary and writing','Completar huecos':'Fill in the blanks',
  '; admite language, description y force.':'; supports language, description, and force.','Devuelve versiones, projectId, rutas y contadores.':'Returns versions, projectId, paths, and counters.',
  'Reordena hijos y rechaza claves duplicadas.':'Reorders children and rejects duplicate keys.','Integridad y confianza son distintas.':'Integrity and trust are different concepts.',
  ', scripts y referencias.':', scripts and references.','+ Unidad':'+ Unit','recurso compartido':'shared resource','Firma y confianza (Trust)':'Signing and trust',
  'y Network.':'and Network.','SCORM y H5P:':'SCORM and H5P:','Experiencias interactivas':'Interactive experiences','y aplicaciones compatibles':'and compatible applications',
  'Explorar entrega':'Explore delivery','Player y Toolkit':'Player and Toolkit','Studio y Analytics':'Studio and Analytics','o en':'or in','Entrega firmada generada.':'Signed delivery generated.',
  '6. Fuente de datos de una plataforma':'6. Platform data source','Salida exitosa':'Successful output',
  'Relacionar en 3D':'Match in 3D','1. Responsable y contacto':'1. Controller and contact','7. Conservación':'7. Data retention',
  'Publicación correcta':'Publishing correctly','2. Recorrido normal para crear un curso':'2. Typical course creation workflow',
  'Trabajar con cursos del ordenador':'Work with local courses','Conectar cursos del ordenador':'Connect local courses',
  '3. Profesor → alumno → profesor':'3. Teacher → learner → teacher flow','Si quieres enviarlo al alumno sin LMS':'If you want to send it to a learner without an LMS',
  '1. Qué hace y ve el alumno':'1. What the learner does and sees','Llevar la especificación a un paquete real':'Turn the specification into a real package',
  'Crear un paquete por código':'Create a package programmatically','Verificar el ZIP y generar un curso de prueba':'Verify the ZIP and generate a sample course',
  '8. Volver a trabajar con un curso':'8. Reopen and edit a course','Alumno / identificador (opcional)':'Learner ID (optional)',
  "Ver flujo completo →":"View the full workflow →",
  "Ver Studio →":"View Studio →",
  "Ver Analytics →":"View Analytics →",
  "Ver opciones":"View options",
  "Ver entregas offline":"View offline deliveries",
  "CONECTORES / LMS":"CONNECTORS / LMS",
  "CONECTORES / LTI 1.3":"CONNECTORS / LTI 1.3",
  "Conectores LMS":"LMS connectors",
  "Player integrado directamente":"Directly embedded Player",
  "Herramienta externa LTI 1.3":"External LTI 1.3 tool",
  "Versión de runtime ":"Runtime version ",
  " distinta del Player ":" differs from Player ",
  "No hay un origen de runtime P2LRN aislado disponible. ":"No isolated P2LRN runtime origin is available. ",
  "Introduce una URL de paquete.":"Enter a package URL.",
  "La URL no es válida.":"The URL is invalid.",
  "Sólo se admiten URLs http/https.":"Only HTTP/HTTPS URLs are supported.",
  "CARGANDO":"LOADING",
  "LISTO":"READY",
  "MOSTRANDO":"RENDERING",
  "PREPARANDO":"PREPARING",
  "[viewer] sin eventos":"[viewer] no events",
  "Cuestionarios y juegos":"Quizzes and games",
  "Formatos externos":"External formats",
  "Ejemplos de Reader":"Reader examples",
  "Ejemplos P2LRN":"P2LRN examples",
  "verificando…":"verifying…",
  "verificada":"verified",
  "sin contentRoot":"missing contentRoot",
  "Cargando paquete":"Loading package",
  "automático":"automatic",
  "No se pudo abrir o verificar el paquete":"Could not open or verify the package",
  "Recargando":"Reloading",
  "Reanudar":"Resume",
  "Error de reproducción":"Playback error",
  "Preparando recursos verificados":"Preparing verified resources",
  "Error preparando el visor":"Error preparing the viewer",
  "Player preparado":"Player ready",
  "Contenido renderizado":"Content rendered",
  "Cargando P2LRN Analytics…":"Loading P2LRN Analytics…",
  'Trabajar con los cursos del ordenador':'Work with local courses','8. Volver a trabajar sobre un curso':'8. Reopen and edit a course'
}));

// Human-reviewed runtime and editor strings override machine translation cache.
const reviewedRuntime=JSON.parse(await readFile(join(root,'scripts','site-en-runtime-reviewed.json'),'utf8'));
for(const [source,english] of Object.entries(reviewedRuntime)){
  if(!source.trim()||!english.trim())throw Error('Invalid reviewed runtime translation');
  MANUAL.set(source,english);
  // The scanner normalizes whitespace before querying the reviewed catalog.
  // Also index full multiword labels without their surrounding whitespace,
  // preserving spaces on output via preserveWhitespace().
  const normalized=source.trim();
  if(normalized!==source&&normalized.length>=6)MANUAL.set(normalized,english.trim());
}
const SPANISH_RE=/[áéíóúñü¿¡]|\b(?:el|la|los|las|una?|unos|unas|de|del|al|para|por|con|sin|desde|hasta|como|cómo|que|qué|quién|cuál|cuando|cuándo|donde|dónde|este|esta|estos|estas|ese|esa|esos|esas|su|sus|tu|tus|nuestro|nuestra|puede|puedes|pueden|crear|crea|curso|cursos|juego|juegos|alumno|alumnos|profesor|profesores|docente|lección|lecciones|actividad|actividades|abrir|cerrar|guardar|descargar|seleccionar|eliminar|añadir|nuevo|nueva|documentación|integración|colaboración|seguimiento|métricas|analítica|progresión|referencia|recursos|paquete|paquetes|formato|formatos|compatible|compatibilidad|resultado|resultados|respuesta|respuestas|pregunta|preguntas|intento|intentos|autor|derechos|titular|licencia|privacidad|términos|aviso|contacto|solución|problemas|antes|empezar|instalación|reproducir|disponible|fecha|contenido|puntuación|archivo|archivos|herramientas|plataforma|plataformas|navegador|compartir|revisión|primera|después|todo|toda|todos|todas|más|menos|también|sólo|solo|ningún|ninguna|memoria|relacionar|ordenar|clasificar|verdadero|falso|crucigrama|rosco|visor|inicio|menú|anterior|siguiente|configurar|página|páginas|datos|calificaciones|ejemplos|ejemplo|seguridad)\b/i;

const TECH_EXACT=new Set(['P2LRN','Player','Studio','Toolkit','Analytics','SCORM','H5P','cmi5','xAPI','QTI','LTI','LMS','HTML','CSS','JavaScript','TypeScript','Node','Node.js','NPM','npm','CDN','API','MCP','JSON','JSON-LD','SHA-256','Ed25519','WebRTC','URL','HTTP','HTTPS','ChatGPT','Claude','Gemini','Grok','Windows','Linux','macOS','ZIP','CSV','EPUB','DOCX','PPTX','PDF','RTF','ODT','Markdown','.p2lrn','.p2lrn-result','P2LRN-NCSL 1.0','Apache-2.0','MIT']);

const EMBEDDED_REPLACEMENTS=Object.freeze([
  ['datasetCurso','courseDataset'],['analytics-curso','course-analytics'],
  ['// datasetCurso contiene métricas reales de este curso, obtenidas de Player','// courseDataset contains real metrics for this course, obtained from Player'],
  ['// o de resultados .p2lrn-result ya validados; no es el archivo .p2lrn.','// or from already validated .p2lrn-result files; it is not the .p2lrn course file.'],
  ['// datos reales del curso y resultados de sus alumnos','// real course data and learner results'],
  ['// refresh() sólo es necesario cuando se ha configurado un dataSource o src.','// refresh() is only needed when a dataSource or src has been configured.'],
  ['Matemáticas','Mathematics'],['Curso de seguridad básica','Basic digital safety course'],['Curso de seguridad','Digital safety course'],
  ['Unidad 1 · Fundamentos','Unit 1 · Fundamentals'],['Fundamentos','Fundamentals'],['Introducción','Introduction'],
  ['Crea un curso P2LRN en español sobre seguridad digital:','Create a P2LRN course in English about digital safety:'],
  ['3 unidades, 6 lecciones, 10 preguntas y 2 juegos.','3 units, 6 lessons, 10 questions, and 2 games.'],
  ['Ejecuta el empaquetador P2LRN y valida el resultado.','Run the P2LRN packager and validate the result.'],
  ['Entrégame el archivo .p2lrn descargable.','Give me the downloadable .p2lrn file.'],
  ['Clasifica los elementos por su naturaleza.','Classify the items by type.'],['perro','dog'],['Perro','Dog'],['roble','oak'],['Roble','Oak'],['planta','plant'],['Planta','Plant'],
  ['Ordenar el ciclo del agua','Order the water cycle'],['Ordena las fases','Order the stages'],['Evaporación','Evaporation'],['Condensación','Condensation'],['Precipitación','Precipitation'],
  ['Clasificar seres vivos','Classify living things'],['Clasifica cada elemento','Classify each item'],
  ['Crucigrama','Crossword'],['Lugar donde se vive','Place where people live'],['CASA','HOME'],['Anfibio que salta','Amphibian that jumps'],['SAPO','TOAD'],['Ave acuática','Water bird'],['PATO','DUCK'],['Recipiente con asa','Container with a handle'],['TAZA','CUP'],
  ['Relacionar países y capitales','Match countries and capitals'],['Relaciona cada país con su capital','Match each country with its capital'],['España','Spain'],['Francia','France'],['Italia','Italy'],['París','Paris'],['Roma','Rome'],
  ['Rosco de vocabulario','Vocabulary Word Wheel'],['Vivienda','Home'],['Animal doméstico que ladra','Domestic animal that barks'],['PERRO','DOG'],['Mueble para comer o trabajar','Furniture used for eating or working'],['MESA','TABLE'],['Satélite natural de la Tierra',"Earth's natural satellite"],['LUNA','MOON'],
  ['Comprobación rápida','Quick check'],['Capital de Portugal','Capital of Portugal'],['Lisboa','Lisbon'],['Cuestionario estándar','Standard questionnaire'],
  ['Verdadero o falso','True or false'],['La Tierra orbita alrededor del Sol','Earth orbits the Sun'],['Verdadero','True'],['Falso','False'],['Marte es una estrella','Mars is a star'],
  ['Planetas','Planets'],['Planeta más cercano al Sol','Closest planet to the Sun'],['MERCURIO','MERCURY'],['Segundo planeta del Sistema Solar','Second planet in the Solar System'],['Nuestro planeta','Our planet'],['TIERRA','EARTH'],
  ['curso-multipart.p2lrn','course-multipart.p2lrn'],['curso-split.p2lrn','course-split.p2lrn'],['curso-stage1.p2lrn','course-stage1.p2lrn'],['curso-final.p2lrn','course-final.p2lrn'],['curso-prueba.p2lrn','test-course.p2lrn'],['curso.p2lrn','course.p2lrn'],['curso.sig','course.sig'],
  ['curso-split.part','course-split.part'],['/courses/curso/','/courses/course/'],['unidad-1','unit-1'],['video-principal','main-video'],['scorm-grande','large-scorm'],['assets/ejemplo-curso.json','assets/example-course.json'],
  ["language: 'es'","language: 'en'"],["\"language\": \"es\"","\"language\": \"en\""],['--language es','--language en'],
  ['curso-actual','current-course'],['clasifica','classify'],['nuevo.p2lrn','new.p2lrn'],['cambio.p2lrn-delta','change.p2lrn-delta'],['resultado.p2lrn','result.p2lrn'],
  ['Nombre del autor','Author name'],['Titular de los derechos','Rights holder'],['actividad-avanzada','advanced-activity'],['actividad-intro','intro-activity'],['actividad-1','activity-1'],
  ['--title "Juego 3D"','--title "3D Game"'],['--title "Clasificar"','--title "Classification"'],['--title "Relacionar"','--title "Matching"'],['--title "Memoria"','--title "Memory"'],['--title "Ordenar"','--title "Ordering"'],['--title "Rosco"','--title "Word Wheel"'],['--title "Sopa de letras"','--title "Word Search"'],
  ['[viewer] esperando al Player…','[viewer] waiting for Player…']
]);
function translateEmbeddedCode(value){
  let out=String(value);
  for(const [from,to] of [...EMBEDDED_REPLACEMENTS].sort((a,b)=>b[0].length-a[0].length))out=out.split(from).join(to);
  return out;
}


async function walk(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory()){
      if(full===englishRoot)continue;
      out.push(...await walk(full));
    }else if(entry.isFile())out.push(full);
  }
  return out;
}
function routeFromRelative(rel){
  const normalized=rel.replaceAll('\\','/');
  if(normalized==='index.html')return '/';
  if(normalized.endsWith('/index.html'))return '/'+normalized.slice(0,-'index.html'.length);
  return null;
}
function normalizeRoute(pathname){return pathname==='/'?'/':(pathname.endsWith('/')?pathname:pathname+'/');}
function englishRoute(route){return route==='/'?'/en/':'/en'+route;}
function splitHref(value){
  const q=value.indexOf('?'),h=value.indexOf('#');
  let cut=value.length;
  if(q>=0)cut=Math.min(cut,q);
  if(h>=0)cut=Math.min(cut,h);
  return {path:value.slice(0,cut),suffix:value.slice(cut)};
}
function rewriteHref(value,routes){
  if(!value||value.startsWith('#')||value.startsWith('//')||/^[a-z][a-z0-9+.-]*:/i.test(value)||!value.startsWith('/'))return value;
  const {path,suffix}=splitHref(value);
  if(path.startsWith('/en/'))return value;
  if(path==='/search-index.json')return '/en/search-index.json'+suffix;
  const normalized=normalizeRoute(path);
  return routes.has(normalized)?englishRoute(normalized)+suffix:value;
}
function rewriteAbsoluteUrl(value,routes){
  const origin='https://p2lrn.org';
  if(!value.startsWith(origin+'/'))return value;
  return origin+rewriteHref(value.slice(origin.length),routes);
}
function looksSpanish(value){return MANUAL.has(String(value).trim())||SPANISH_RE.test(String(value));}
// These string literals are stable section IDs, not language-dependent labels.
const STRUCTURAL_JS_TOKENS=new Set(['para-que','crear-cursos','en','es','en-US','es-ES','en-GB','es-MX']);
function shouldTranslate(value){
  const text=String(value??'').trim();
  if(!text||STRUCTURAL_JS_TOKENS.has(text)||/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(text)||TECH_EXACT.has(text)||!/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/.test(text))return false;
  if(text.startsWith('{')||text.startsWith('[')){
    try{JSON.parse(text);return false;}catch{}
  }
  if(/^https?:\/\//i.test(text)||/^mailto:/i.test(text)||/^tel:/i.test(text)||/^[/#\[]/.test(text))return false;
  if(/^\.[A-Za-z0-9_-]+(?:[./:#?]|$)/.test(text))return false;
  if(/^(?:application|text|image|audio|video)\//i.test(text))return false;
  if(/^(?:\\[nrt])+$/i.test(text))return false;
  if(/^[\w.-]+\.(?:js|mjs|css|json|html|xml|png|jpe?g|svg|webp|zip|p2lrn|md|txt|wasm)$/i.test(text))return false;
  return looksSpanish(text);
}

let cache={};
try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch{}
const pending=new Set();
function register(value){
  const text=String(value??'').trim();
  if(!shouldTranslate(text)||MANUAL.has(text)||cache[text])return;
  pending.add(text);
}
function registerJson(value,key=''){
  if(Array.isArray(value)){for(const item of value)registerJson(item,key);return;}
  if(value&&typeof value==='object'){for(const [k,v] of Object.entries(value))registerJson(v,k);return;}
  if(typeof value!=='string')return;
  if(['url','@id','@context','@type','sameAs','image','inLanguage','applicationCategory','operatingSystem','position'].includes(key))return;
  if(['name','headline','description','alternateName','text','about','keywords'].includes(key))register(value);
}
function registerHtmlFragment(fragment){
  // Cheerio fragment mode drops the special <body> wrapper; use a normal node.
  const $=load('<div id="p2lrn-i18n-fragment">'+fragment+'</div>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)register(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('#p2lrn-i18n-fragment').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title','data-help'])
    $('['+attr+']').each((_,el)=>register($(el).attr(attr)));
}

const files=await walk(siteRoot);
const allSourceHtmlFiles=files.filter(file=>{
  if(extname(file).toLowerCase()!=='.html')return false;
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  return !rel.startsWith('en/')&&routeFromRelative(rel)!==null;
});
// Do not ask a machine translator to rewrite the manually localized editorial guide.
const htmlFiles=allSourceHtmlFiles.filter(file=>{
  const rel=relative(siteRoot,file).replaceAll(String.fromCharCode(92),'/');
  return !handAuthoredEnglishPages.has(rel);
});
const preservedEnglishPages=new Map();
for(const rel of handAuthoredEnglishPages){
  if(!allSourceHtmlFiles.some(file=>relative(siteRoot,file).replaceAll(String.fromCharCode(92),'/')===rel))
    throw Error('Missing authored Spanish editorial source: '+rel);
  const englishPath=join(englishRoot,...rel.split('/'));
  const english=await readFile(englishPath,'utf8').catch(()=>null);
  if(!english||!/<html\s+lang="en"/i.test(english))
    throw Error('Missing manually reviewed English editorial source: '+rel);
  preservedEnglishPages.set(rel,english);
}
console.log('P2LRN_I18N_PHASE=scan-source-html pages='+allSourceHtmlFiles.length+' translated='+htmlFiles.length+' authored='+preservedEnglishPages.size);
const routes=new Set();
for(const file of htmlFiles){
  const route=routeFromRelative(relative(siteRoot,file).replaceAll('\\','/'));
  if(route)routes.add(route);
}
for(const rel of handAuthoredEnglishPages){
  const route=routeFromRelative(rel);
  if(route)routes.add(route);
}

function visitTextNodes($,registerOnly=true){
  const blockedTags=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,blocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=blocked||blockedTags.has(tag);
    if(node.type==='text'&&!nextBlocked){
      if(registerOnly)register(node.data);
      else node.data=translatePlain(node.data);
    }
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $.root().get(0)?.children??[])visit(node,false);
}

for(const file of htmlFiles){
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  visitTextNodes($,true);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title','data-help'])$('['+attr+']').each((_,el)=>register($(el).attr(attr)));
  $('input[type="button"][value],input[type="submit"][value]').each((_,el)=>register($(el).attr('value')));
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>register($(el).attr('content')));
  $('script[type="application/ld+json"]').each((_,el)=>{try{registerJson(JSON.parse($(el).text()));}catch{}});
}

console.log('P2LRN_I18N_PHASE=registered-html pending='+pending.size);
const jsSources=new Map();
for(const rel of JS_FILES){
  const source=await readFile(join(siteRoot,...rel.split('/')),'utf8');
  jsSources.set(rel,source);
  walkAst(parseJs(source),(node,parent)=>{
    if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex&&!structuralLiteral(node,parent)){
      if(node.value.includes('<')&&node.value.includes('>'))registerHtmlFragment(node.value);
      else register(node.value);
    }
    if(node.type==='TemplateElement'){
      const value=node.value?.cooked??node.value?.raw??'';
      if(value.includes('<')&&value.includes('>'))registerHtmlFragment(value);
      else register(value);
    }
  });
}
for(const file of htmlFiles){
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  $('script:not([src])').each((_,el)=>{
    const type=String($(el).attr('type')??'').toLowerCase();
    if(type==='application/ld+json'||type==='importmap'||type==='application/json')return;
    const source=$(el).text();
    if(!source.trim())return;
    let ast;
    try{ast=parseJs(source);}catch{return;}
    walkAst(ast,(node,parent)=>{
      if(node.type==='Literal'&&typeof node.value==='string'&&!node.regex&&!structuralLiteral(node,parent)){
        if(node.value.includes('<')&&node.value.includes('>'))registerHtmlFragment(node.value);
        else register(node.value);
      }
      if(node.type==='TemplateElement'){
        const value=node.value?.cooked??node.value?.raw??'';
        if(value.includes('<')&&value.includes('>'))registerHtmlFragment(value);
        else register(value);
      }
    });
  });
}

console.log('P2LRN_I18N_PHASE=registered-js pending='+pending.size+' cache='+Object.keys(cache).length);
let translator=null;
async function getTranslator(){
  if(!translator){
    const {pipeline}=await import('@huggingface/transformers');
    translator=await pipeline('translation',MODEL,{dtype:'q8'});
  }
  return translator;
}
function unwrap(item){
  const value=Array.isArray(item)?item[0]:item;
  return String(value?.translation_text??value?.generated_text??'').trim();
}
const missing=[...pending].filter(text=>!MANUAL.has(text)&&!cache[text]);
console.log('P2LRN_I18N_PHASE=translate missing='+missing.length+' provider='+(process.env.P2LRN_I18N_PROVIDER||'local'));
if(process.env.P2LRN_I18N_REPORT_MISSING==='1'){
  console.log('P2LRN_I18N_MISSING_JSON='+JSON.stringify(missing));
  process.exit(missing.length?2:0);
}
const translationProvider=String(process.env.P2LRN_I18N_PROVIDER||'local').toLowerCase();
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function translateGoogle(text){
  const endpoint='https://translate.googleapis.com/translate_a/single?client=gtx&sl=es&tl=en&dt=t&q='+encodeURIComponent(text);
  for(let attempt=0;attempt<6;attempt++){
    try{
      const response=await fetch(endpoint,{
        headers:{'User-Agent':'P2LRN-site-i18n/1.0'},
        signal:AbortSignal.timeout(15000),
      });
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json();
      const translated=Array.isArray(payload?.[0])
        ?payload[0].map(part=>String(part?.[0]??'')).join('').trim()
        :'';
      if(!translated)throw new Error('Empty translation');
      return translated;
    }catch(error){
      if(attempt===5)throw error;
      await sleep((attempt+1)*750);
    }
  }
}
if(missing.length&&translationProvider==='google'){
  const concurrency=Math.max(1,Math.min(8,Number(process.env.P2LRN_I18N_CONCURRENCY)||4));
  let cursor=0,done=0;
  const failures=[];
  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=missing.length)return;
      const source=missing[index];
      try{cache[source]=await translateGoogle(source);}
      catch(error){failures.push({source,error:String(error?.message??error)});}
      done++;
      if(done%80===0||done===missing.length){
        console.log('P2LRN_I18N_PROGRESS='+done+'/'+missing.length+' failures='+failures.length);
        await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');
      }
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  if(failures.length){
    throw new Error('Remote translation left '+failures.length+' unresolved string(s): '+JSON.stringify(failures.slice(0,12)));
  }
}else if(missing.length){
  const pipe=await getTranslator();
  const batchSize=Math.max(1,Number(process.env.P2LRN_I18N_BATCH_SIZE)||16);
  for(let offset=0;offset<missing.length;offset+=batchSize){
    const batch=missing.slice(offset,offset+batchSize);
    let results;
    try{
      results=await pipe(batch,{max_new_tokens:512});
      if(!Array.isArray(results)||results.length!==batch.length)throw new Error('Unexpected batch output shape.');
      for(let index=0;index<batch.length;index++){
        const translated=unwrap(results[index]);
        cache[batch[index]]=translated||batch[index];
      }
    }catch(batchError){
      console.warn('P2LRN_I18N_BATCH_FALLBACK='+offset+': '+String(batchError?.message??batchError));
      for(const source of batch){
        let result;
        try{result=await pipe(source,{max_new_tokens:512});}
        catch(error){throw new Error('Translation failed for '+JSON.stringify(source)+': '+String(error?.message??error));}
        const translated=unwrap(result);
        cache[source]=translated||source;
      }
    }
    const done=Math.min(offset+batch.length,missing.length);
    if(done%80===0||done===missing.length)console.log('P2LRN_I18N_PROGRESS='+done+'/'+missing.length);
    if(done%320===0)await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');
  }
}
await writeFile(cachePath,JSON.stringify(cache,null,2)+'\n','utf8');

function preserveWhitespace(original,replacement){
  const leading=String(original).match(/^\s*/)?.[0]??'';
  const trailing=String(original).match(/\s*$/)?.[0]??'';
  return leading+replacement+trailing;
}
function normalizeEnglishCopy(value){
  return String(value).replace(/\bRosco\b/g,'Word Wheel').replace(/\brosco\b/g,'word wheel').replace(/\bstudents\b/gi,'learners').replace(/\bstudent's\b/gi,"learner's").replace(/\bstudent\b/gi,'learner');
}
function translatePlain(value){
  const original=String(value??'');
  const text=original.trim();
  if(MANUAL.has(text))return preserveWhitespace(original,normalizeEnglishCopy(MANUAL.get(text)));
  if(!shouldTranslate(text))return original;
  return preserveWhitespace(original,normalizeEnglishCopy(cache[text]??text));
}
function translateHtmlFragment(fragment){
  // Cheerio fragment mode drops the special <body> wrapper; use a normal node.
  const $=load('<div id="p2lrn-i18n-fragment">'+fragment+'</div>',{decodeEntities:false},false);
  const blocked=new Set(['code','pre','script','style','kbd','samp','svg','path']);
  const visit=(node,ancestorBlocked=false)=>{
    const tag=String(node.name||'').toLowerCase();
    const nextBlocked=ancestorBlocked||blocked.has(tag);
    if(node.type==='text'&&!nextBlocked)node.data=translatePlain(node.data);
    for(const child of node.children??[])visit(child,nextBlocked);
  };
  for(const node of $('#p2lrn-i18n-fragment').get(0)?.children??[])visit(node,false);
  for(const attr of ['aria-label','aria-description','alt','placeholder','title','data-help'])
    $('['+attr+']').each((_,el)=>$(el).attr(attr,translatePlain($(el).attr(attr))));
  return $('#p2lrn-i18n-fragment').html()??fragment;
}
function translateJavaScriptSource(source,{rewriteRoutes=true}={}){
  let ast;
  try{ast=parseJs(source);}catch{return source;}
  const edits=[];
  walkAst(ast,(node,parent)=>{
    if(node.type==='TemplateElement'){
      // Raw quasis exclude ${...} expressions. Editing only the quasi keeps
      // interpolation, identifiers and executable behavior unchanged.
      const raw=source.slice(node.start,node.end);
      const next=raw.includes('<')&&raw.includes('>')?translateHtmlFragment(raw):translatePlain(raw);
      if(next!==raw)edits.push({start:node.start,end:node.end,text:next.replaceAll('`','\\`').replaceAll('${','\\${')});
      return;
    }
    if(node.type!=='Literal'||typeof node.value!=='string'||node.regex||structuralLiteral(node,parent))return;
    let next=node.value.includes('<')&&node.value.includes('>')
      ?translateHtmlFragment(node.value)
      :translatePlain(node.value);
    if(rewriteRoutes)next=rewriteHref(next,routes);
    if(next!==node.value)edits.push({start:node.start,end:node.end,text:JSON.stringify(next)});
  });
  let generated=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))
    generated=generated.slice(0,edit.start)+edit.text+generated.slice(edit.end);
  return generated;
}
function translateJson(value,key=''){
  if(Array.isArray(value))return value.map(item=>translateJson(item,key));
  if(value&&typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value))out[k]=translateJson(v,k);
    return out;
  }
  if(typeof value!=='string')return value;
  if(key==='inLanguage')return 'en';
  if(['url','@id','sameAs','image'].includes(key))return rewriteAbsoluteUrl(value,routes);
  if(['@context','@type','applicationCategory','operatingSystem','position'].includes(key))return value;
  if(['name','headline','description','alternateName','text','about','keywords'].includes(key))return translatePlain(value);
  return value;
}

console.log('P2LRN_I18N_PHASE=generate-html cache='+Object.keys(cache).length);
await rm(englishRoot,{recursive:true,force:true});
await mkdir(englishRoot,{recursive:true});
for(const file of htmlFiles){
  const rel=relative(siteRoot,file).replaceAll('\\','/');
  const $=load(await readFile(file,'utf8'),{decodeEntities:false});
  $('html').attr('lang','en');
  if(rel==='analytics/index.html')$('p2lrn-analytics').attr('locale','en-US');
  visitTextNodes($,false);
  $('pre code').each((_,el)=>$(el).text(translateEmbeddedCode($(el).text())));
  for(const attr of ['aria-label','aria-description','alt','placeholder','title','data-help'])$('['+attr+']').each((_,el)=>$(el).attr(attr,translatePlain($(el).attr(attr))));
  $('input[type="button"][value],input[type="submit"][value]').each((_,el)=>$(el).attr('value',translatePlain($(el).attr('value'))));
  $('meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]').each((_,el)=>$(el).attr('content',translatePlain($(el).attr('content'))));
  $('meta[property="og:url"]').each((_,el)=>$(el).attr('content',rewriteAbsoluteUrl($(el).attr('content')??'',routes)));
  $('link[rel~="canonical"][href]').each((_,el)=>$(el).attr('href',rewriteAbsoluteUrl($(el).attr('href')??'',routes)));
  $('script[type="application/ld+json"]').each((_,el)=>{try{$(el).text(JSON.stringify(translateJson(JSON.parse($(el).text()))));}catch{}});
  $('script:not([src])').each((_,el)=>{
    const type=String($(el).attr('type')??'').toLowerCase();
    if(type==='application/ld+json'||type==='importmap'||type==='application/json')return;
    const source=$(el).text();
    if(source.trim())$(el).text(translateJavaScriptSource(source));
  });
  $('a[href]').each((_,el)=>$(el).attr('href',rewriteHref($(el).attr('href'),routes)));
  $('form[action]').each((_,el)=>$(el).attr('action',rewriteHref($(el).attr('action'),routes)));
  $('link[rel~="manifest"]').each((_,el)=>$(el).attr('href','/en/site.webmanifest'));
  $('meta[http-equiv]').each((_,el)=>{
    if(String($(el).attr('http-equiv')??'').toLowerCase()!=='refresh')return;
    const content=String($(el).attr('content')??'');
    const match=/^(\s*\d+\s*;\s*url=)([\s\S]+)$/i.exec(content);
    if(match)$(el).attr('content',match[1]+rewriteHref(match[2].trim(),routes));
  });
  const scriptMap=[['/p2lrn.js','/en/p2lrn.js'],['/studio/studio.js','/en/studio/studio.js'],['/demo/viewer.js','/en/demo/viewer.js'],['/analytics/demo.js','/en/analytics/demo.js']];
  $('script[src]').each((_,el)=>{
    const src=$(el).attr('src')??'';
    for(const [from,to] of scriptMap)if(src===from||src.startsWith(from+'?')){$(el).attr('src',to+src.slice(from.length));break;}
  });
  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,$.html(),'utf8');
}

for(const [rel,english] of preservedEnglishPages){
  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,english,'utf8');
}
console.log('P2LRN_I18N_PHASE=html-generated pages='+(htmlFiles.length+preservedEnglishPages.size));
const sourceManifestPath=join(siteRoot,'site.webmanifest');
try{
  const manifest=JSON.parse(await readFile(sourceManifestPath,'utf8'));
  manifest.lang='en';
  manifest.start_url='/en/';
  manifest.scope='/en/';
  await writeFile(join(englishRoot,'site.webmanifest'),JSON.stringify(manifest,null,2)+'\n','utf8');
}catch{}

console.log('P2LRN_I18N_PHASE=generate-js files='+jsSources.size);
for(const [rel,source] of jsSources){
  let generated=translateJavaScriptSource(source,{rewriteRoutes:rel!=='p2lrn.js'});
  // The English Studio entrypoint uses the same tested shared runtime modules.
  // A relative ./runtime/ import from /en/studio/ otherwise returns HTTP 404.
  if(rel==='studio/studio.js'){
    // Share the canonical Studio runtime and create English-language content by default.
    // Do not change language tags inside imported courses or serialized data.
    generated=generated.replace(/(from\s+['"])\.\/runtime\//g,'$1/studio/runtime/');
    generated=generated.replaceAll("language:'es'","language:'en'");
  }
  if(rel==='p2lrn.js')generated=generated.replace("toLocaleLowerCase('es')","toLocaleLowerCase('en')");

  const dest=join(englishRoot,...rel.split('/'));
  await mkdir(dirname(dest),{recursive:true});
  await writeFile(dest,generated,'utf8');
}

console.log(JSON.stringify({ok:true,model:MODEL,htmlPages:htmlFiles.length,routes:routes.size,cacheEntries:Object.keys(cache).length},null,2));

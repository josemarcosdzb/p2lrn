// Reviewed UI copy for the Analytics web component. Only static interface
// nodes are localized; course names, learner identities and datasets are not.
const EN={
  "Atención alta": "High priority",
  "Revisar": "Review",
  "Normal": "Normal",
  "Player preparado": "Player ready",
  "Contenido mostrado": "Content displayed",
  "Navegación": "Navigation",
  "Respuesta": "Answer",
  "Intento": "Attempt",
  "Interacción": "Interaction",
  "Progreso": "Progress",
  "Puntuación": "Score",
  "Completado": "Completed",
  "Tiempo agotado": "Time expired",
  "Tiempo activo": "Active time",
  "Atención": "Attention",
  "Capacidad": "Capability",
  "Apertura offline": "Offline opening",
  "Anterior": "Previous",
  "Siguiente": "Next",
  "Todos los cursos": "All courses",
  "Resumen": "Overview",
  "Alumnos": "Learners",
  "Cursos": "Courses",
  "Notas": "Grades",
  "Actividad": "Activity",
  "Alumno": "Learner",
  "Curso": "Course",
  "Nota": "Grade",
  "Intentos": "Attempts",
  "Señal": "Alert",
  "Señales": "Alerts",
  "Fuente": "Source",
  "Estado": "Status",
  "Elemento": "Item",
  "Actualizada": "Updated",
  "Última actividad": "Last activity",
  "Iniciados": "Started",
  "Completados": "Completed",
  "Nota media": "Average grade",
  "Aprobados": "Passed",
  "Señales de seguimiento": "Monitoring alerts",
  "Finalización": "Completion",
  "Necesitan revisión": "Need review",
  "Sólo notas autoritativas": "Authoritative grades only",
  "Reglas transparentes": "Transparent rules",
  "Nota oficial": "Official grade",
  "Sin señales": "No alerts",
  "Sin cursos": "No courses",
  "Conecta un dataset para empezar.": "Connect a dataset to get started.",
  "Sin señales activas": "No active alerts",
  "No hay alumnos que cumplan las reglas configuradas.": "No learners match the configured rules.",
  "Rendimiento por curso": "Course performance",
  "Progreso medio y nota oficial media": "Average progress and average official grade",
  "Actividad reciente": "Recent activity",
  "Reglas visibles, no predicción opaca": "Explicit rules, not opaque predictions",
  "Últimos eventos": "Latest events",
  "Actividad normalizada del Player/Host": "Normalized Player/Host activity",
  "No hay alumnos que coincidan": "No matching learners",
  "Cambia los filtros o conecta otro dataset.": "Change the filters or connect another dataset.",
  "No hay cursos": "No courses",
  "El Host todavía no ha entregado cursos al panel.": "The host has not provided any courses yet.",
  "Progreso, notas, intentos y actividad": "Progress, grades, attempts and activity",
  "Distribución de notas": "Grade distribution",
  "Sólo calificaciones autoritativas del Host": "Only authoritative grades from the host",
  "Libro de notas": "Gradebook",
  "Oficial": "Official",
  "Informativa": "Informational",
  "Sin actividad": "No activity",
  "No se han recibido eventos para este filtro.": "No events have been received for this filter.",
  "Categorías de actividad": "Activity categories",
  "Últimos eventos recibidos": "Most recent events received",
  "Uso offline": "Offline use",
  "Aperturas": "Openings",
  "Primera apertura": "First opening",
  "Última apertura": "Last opening",
  "Caducidad": "Expiration",
  "Apertura": "Opening",
  "Origen": "Source",
  "Sesión": "Session",
  "Navegador": "Browser",
  "no disponible": "unavailable",
  "No hay sesiones individuales disponibles en este resultado.": "No individual sessions are available in this result.",
  "Alumnos del curso": "Course learners",
  "Datos del Host": "Host data",
  "Resultado offline": "Offline result",
  "Centro de analítica": "Analytics center",
  "Buscar alumno": "Search learners",
  "Nombre, correo, grupo...": "Name, email, group...",
  "Todas": "All",
  "7 días": "7 days",
  "14 días": "14 days",
  "30 días": "30 days",
  "90 días": "90 days",
  "Abrir resultado": "Open result",
  "Actualizar": "Refresh",
  "Exportar": "Export",
  "Vistas de Analytics": "Analytics views",
  "Cerrar": "Close",
  "Sin actividad reciente": "No recent activity",
  "Progreso bajo": "Low progress",
  "Nota baja": "Low grade",
  "registros visibles": "visible records",
  "calificaciones · oficiales e informativas diferenciadas": "grades · official and informational shown separately",
  "eventos normalizados": "normalized events",
  "matrículas": "enrollments",
  "intentos": "attempts",
  "eventos": "events",
  "activos (30 días)": "active (30 days)",
  "días": "days",
  "Las puntuaciones importadas de una entrega offline son informativas salvo que un Host autoritativo las confirme.": "Scores imported from an offline delivery are informational unless confirmed by an authoritative host."
};
export function analyticsUiText(value,locale='es-ES'){
  const text=String(value??'');
  if(!/^en(?:-|$)/i.test(String(locale)))return text;
  const trimmed=text.trim();
  const leading=text.slice(0,text.length-text.trimStart().length);
  const trailing=text.slice(text.trimEnd().length);
  if(Object.hasOwn(EN,trimmed))return leading+EN[trimmed]+trailing;
  // Count and period labels contain dynamic numbers; translate only their
  // known interface prefixes and suffixes.
  let result=text;
  result=result.replace(/Mostrando (?=\d)/g,'Showing ').replace(/ (\d[\d,.]*) de (?=\d)/g,' $1 of ');
  result=result.replace(/Página (?=\d)/g,'Page ');
  result=result.replace(/ (activos \(30 días\)|matrículas|intentos|eventos normalizados|eventos|registros visibles)$/g,(_m,k)=>' '+(EN[k]??k));
  result=result.replace(/ calificaciones · oficiales e informativas diferenciadas$/g,' grades · official and informational shown separately');
  result=result.replace(/^(Dispositivo local: )/g,'Local device: ').replace(/^(Eventos P2LRN durante )/g,'P2LRN events over ');
  result=result.replace(/^(\d+ días)$/g,(_m,k)=>k.replace('días','days'));
  result=result.replace(/ · actualizado /g,' · updated ');
  return result;
}
export function localizeAnalyticsInterface(root,locale){
  if(!root||!/^en(?:-|$)/i.test(String(locale)))return;
  const selectors=[
    '.topbar','.toolbar label','.toolbar select[data-risk-filter]',
    '.toolbar select[data-period]','.toolbar .action-row',
    '.tabs','.kpi','.panel-head','table thead','.pager',
    '.empty','.detail-stat','.detail-section h3','.detail-note',
    '.signal-list .badge','.risk-item .badge','.risk-item .item-copy span',
    '.event-item .item-copy strong','.footer-note',
    '.detail-section table thead','select[data-course-filter] option:first-child'
  ];
  const doc=root.host?.ownerDocument??globalThis.document;
  if(!doc?.createTreeWalker)return;
  const touched=new Set();
  for(const selector of selectors){
    for(const element of root.querySelectorAll(selector)){
      if(touched.has(element))continue;
      touched.add(element);
      const walker=doc.createTreeWalker(element,globalThis.NodeFilter?.SHOW_TEXT??4);
      let textNode;
      while((textNode=walker.nextNode())){
        const original=textNode.nodeValue;
        const translated=analyticsUiText(original,locale);
        if(original!==translated)textNode.nodeValue=translated;
      }
    }
  }
  for(const node of root.querySelectorAll('[aria-label],[placeholder],[title]')){
    for(const attr of ['aria-label','placeholder','title']){
      const value=node.getAttribute(attr);
      if(value==null)continue;
      const translated=analyticsUiText(value,locale);
      if(translated!==value)node.setAttribute(attr,translated);
    }
  }
}
export const ANALYTICS_UI_TRANSLATION_COUNT=110;

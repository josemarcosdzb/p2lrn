// Canonical course authorship and rights metadata, shared by Studio and Player.
export const COURSE_RIGHTS_EXTENSION = 'https://p2lrn.org/ext/course-rights/1';
export const COURSE_RIGHTS_FIELDS = Object.freeze(['author','createdAt','license','copyrightHolder']);
export const COURSE_RIGHTS_LABELS = Object.freeze({
  author:'Autor del contenido',
  createdAt:'Fecha de creación',
  license:'Licencia · Condiciones de uso y distribución',
  copyrightHolder:'Derechos de autor · Titular de los derechos',
});
const MAX = Object.freeze({author:300,createdAt:10,license:2000,copyrightHolder:300});

function validDate(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) return false;
  const date=new Date(value+'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value;
}

// New-course default only. Never infer or overwrite the date for an imported course.
export function currentCreationDate() {
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}

export function normalizeCourseRights(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new TypeError('Los datos de autoría deben ser un objeto.');
  const result={};
  for(const [key,raw] of Object.entries(value)) {
    if(!COURSE_RIGHTS_FIELDS.includes(key)) throw new Error('Campo de autoría desconocido: '+key);
    if(typeof raw!=='string') throw new Error('El campo '+key+' debe ser texto.');
    if(raw!==raw.trim() || !raw.trim() || raw.length>MAX[key]) throw new Error('El campo '+key+' no es válido.');
    if(key==='createdAt' && !validDate(raw)) throw new Error('La fecha de creación debe ser una fecha real AAAA-MM-DD.');
    result[key]=raw;
  }
  if(!Object.keys(result).length) throw new Error('Los datos de autoría deben contener al menos un campo.');
  return result;
}

export function getCourseRights(course) {
  const raw=course?.type==='course'?course.extensions?.[COURSE_RIGHTS_EXTENSION]:null;
  if(!raw) return null;
  return normalizeCourseRights(raw);
}

export function setCourseRights(course,updates) {
  if(!course || course.type!=='course') throw new Error('La autoría solo se puede asignar al curso.');
  if(!updates || typeof updates!=='object' || Array.isArray(updates)) throw new Error('Actualización de autoría no válida.');
  const next={...(getCourseRights(course)??{})};
  for(const [key,value] of Object.entries(updates)) {
    if(!COURSE_RIGHTS_FIELDS.includes(key)) throw new Error('Campo de autoría desconocido: '+key);
    if(value===null || value==='') delete next[key];
    else {
      if(typeof value!=='string') throw new Error('La autoría debe ser texto.');
      next[key]=value.trim();
    }
  }
  if(Object.keys(next).length)normalizeCourseRights(next);
  if(Object.keys(next).length) {
    course.extensions??={};
    course.extensions[COURSE_RIGHTS_EXTENSION]=next;
  }else if(course.extensions) {
    delete course.extensions[COURSE_RIGHTS_EXTENSION];
    if(!Object.keys(course.extensions).length)delete course.extensions;
  }
  return {...next};
}

export function courseRightsRows(course) {
  const rights=getCourseRights(course);
  return rights?COURSE_RIGHTS_FIELDS.filter(key=>rights[key]).map(key=>({key,label:COURSE_RIGHTS_LABELS[key],value:rights[key]})):[];
}

export function renderCourseRights(container,course,{heading='Autoría y derechos'}={}) {
  const rows=courseRightsRows(course);
  container.replaceChildren();
  container.hidden=rows.length===0;
  if(!rows.length)return;
  const h=document.createElement('strong');h.textContent=heading;
  const dl=document.createElement('dl');
  for(const row of rows){
    const dt=document.createElement('dt');dt.textContent=row.label;
    const dd=document.createElement('dd');dd.textContent=row.value;
    dl.append(dt,dd);
  }
  container.append(h,dl);
}

const QUESTION=/^(?:(?:pregunta|question)\s*(?:n[ºo.]?\s*)?\d{0,3}\s*[:.)\-]|\d{1,3}\s*[.)]\s*).*[?¿]|^¿[\s\S]+\?$|^[\s\S]+\?$/iu;
const OPTION=/^(?:opci[oó]n\s*)?(?:[A-H]|\d{1,2})\s*[)\].:\-]\s+\S+/iu;
const SOLUTION=/^(?:respuesta(?:s)?(?:\s+correcta(?:s)?)?|soluci[oó]n(?:es)?|answer(?:s)?|solution(?:s)?|correcta(?:s)?|correcto(?:s)?)\s*[:=\-]\s*\S+/iu;
const QUIZ=/^(?:cuestionario|quiz|evaluaci[oó]n|examen|test|preguntas?|ejercicios?|actividades?|pr[aá]cticas?)\b/iu;
const NAMED_STRUCTURE=/^(?:m[oó]dulo|unidad|tema|cap[ií]tulo)\s+(?:\d+|[A-ZÁÉÍÓÚÑ])(?:[.):–—-]|\s)\s*\S+/iu;
const NAMED_LESSON=/^lecci[oó]n\s+(?:\d+(?:\.\d+)?|[A-ZÁÉÍÓÚÑ](?:\.[A-ZÁÉÍÓÚÑ])?)(?:[.):–—-]|\s)\s*\S+/iu;
const NUMBERING=/^(?:[A-Za-z](?:\.[A-Za-z]){0,2}|\d+(?:\.\d+){0,2})(?:[.)])?\s+\S+/;

export function isSemanticBoundaryLine(value:string):boolean{
  const text=String(value??'').replace(/\s+/g,' ').trim();
  return Boolean(text&&(QUESTION.test(text)||OPTION.test(text)||SOLUTION.test(text)||QUIZ.test(text)));
}

export function inferredHeadingLevel(value:string):number|undefined{
  const text=String(value??'').replace(/\s+/g,' ').trim();
  if(!text)return undefined;
  if(NAMED_LESSON.test(text))return 2;
  if(NAMED_STRUCTURE.test(text))return 1;
  const match=text.match(NUMBERING)?.[0]?.trim();
  if(!match)return undefined;
  const token=match.split(/\s+/,1)[0]!.replace(/[.)]$/,'');
  const depth=token.split('.').length;
  // Numeric/alphabetic numbering alone is only structural when the line is
  // short enough to look like a heading and does not look like a question.
  if(depth<=3&&text.length<=180&&!QUESTION.test(text)&&!OPTION.test(text))return Math.min(3,depth);
  return undefined;
}

// Local teacher-review report: evidence for the teacher's workflow, not a
// cryptographically certified LMS grade. The Host must verify/approve separately.
export const P2LRN_MANUAL_REVIEW_SCHEMA='https://p2lrn.org/schema/teacher-manual-review/1';

const key=(entityId,questionId)=>JSON.stringify([entityId??null,questionId]);
const valid=(value)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

export function latestManualReviewAnswers(review){
  const answers=review?.summary?.answers;
  if(!Array.isArray(answers))return [];
  const latest=new Map();
  for(const item of answers){
    if(!item||typeof item.questionId!=='string'||!item.questionId.trim())continue;
    const row={entityId:item.entityId??null,questionId:item.questionId,answer:structuredClone(item.answer??null)};
    latest.set(key(row.entityId,row.questionId),row);
  }
  return [...latest.values()];
}

/** Called ONLY from a teacher-controlled review screen with explicit marks. */
export function createP2LRNManualReviewReport(review,{marks,reviewer='Profesor'}={}){
  if(review?.integrityValid!==true||review?.courseMatches===false||review?.assignmentMatches===false)
    throw new Error('La entrega no ha superado las comprobaciones básicas de integridad y correspondencia.');
  const answers=latestManualReviewAnswers(review);
  if(!answers.length)throw new Error('La entrega no contiene respuestas para corregir.');
  if(!Array.isArray(marks)||marks.length!==answers.length)
    throw new Error('Es necesario corregir todas las preguntas recibidas.');
  const byKey=new Map();
  for(const mark of marks){
    const id=key(mark?.entityId,mark?.questionId);
    if(byKey.has(id)||typeof mark?.questionId!=='string'||!mark.questionId.trim()||
      !valid(mark.pointsAwarded)||!valid(mark.pointsPossible)||mark.pointsPossible<=0||
      mark.pointsAwarded>mark.pointsPossible)
      throw new Error('Puntuación inválida o pregunta duplicada en la corrección.');
    if(mark.comment!==undefined&&(typeof mark.comment!=='string'||mark.comment.length>2000))
      throw new Error('Comentario de corrección inválido.');
    byKey.set(id,mark);
  }
  const corrections=answers.map(answer=>{
    const mark=byKey.get(key(answer.entityId,answer.questionId));
    if(!mark)throw new Error('Falta corregir una pregunta.');
    return {entityId:answer.entityId,questionId:answer.questionId,answer:answer.answer,
      pointsAwarded:mark.pointsAwarded,pointsPossible:mark.pointsPossible,comment:String(mark.comment??'')};
  });
  const sum=(field)=>Math.round(corrections.reduce((total,entry)=>total+entry[field],0)*100)/100;
  const awarded=sum('pointsAwarded'),maximum=sum('pointsPossible');
  const assignment=review?.result?.assignment??{};
  const label=String(reviewer??'').trim();
  if(!label||label.length>120)throw new Error('Identificación del profesor inválida.');
  return {
    schema:P2LRN_MANUAL_REVIEW_SCHEMA,
    version:'1',
    reviewedAt:new Date().toISOString(),
    reviewer:label,
    source:{
      assignmentId:assignment.assignmentId??null,
      contentRoot:assignment.contentRoot??null,
      resultDigest:review.result?.integrity?.payloadDigest??null,
      participantLabel:review.summary?.participantLabel??null,
    },
    corrections,
    totals:{awarded,maximum,normalized:maximum>0?Math.round((awarded/maximum)*1000000)/1000000:null},
    status:'reviewed-local-unverified',
    authoritative:false,
  };
}

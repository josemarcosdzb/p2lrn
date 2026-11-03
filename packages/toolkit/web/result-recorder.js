// Shared .p2lrn-result recorder for web Player and connected hosts.
// Captures Player events, not a learner database or an identity-verification service.
export const P2LRN_RESULT_SCHEMA='https://p2lrn.org/schema/offline-result/1';
const encoder=new TextEncoder();

function canonical(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value))
      throw new TypeError('Resultado con número fuera de rango.');
    return JSON.stringify(value);
  }
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  throw new TypeError('El resultado contiene valores no compatibles con JSON.');
}
async function digest(value){
  if(!globalThis.crypto?.subtle)throw new Error('Se requiere WebCrypto para generar .p2lrn-result verificables.');
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical(value))));
  return 'sha256:'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
const clean=(v)=>String(v??'').trim();
const uuid=()=>globalThis.crypto?.randomUUID?.()??('attempt-'+Date.now()+'-'+Math.random().toString(36).slice(2));
function normalizeIdentity(identity){
  if(!identity||typeof identity!=='object')throw new TypeError('Debes identificar al alumno para generar su resultado.');
  const mode=clean(identity.mode);
  const issuer=clean(identity.issuer);
  const label=clean(identity.label);
  if(mode==='platform'){
    const subjectId=clean(identity.subjectId);
    if(!issuer||!subjectId)throw new TypeError('La plataforma debe aportar issuer y subjectId del usuario autenticado.');
    return Object.freeze({mode,issuer,subjectId,label:label||subjectId});
  }
  if(mode==='code'){
    const code=clean(identity.code);
    if(!code)throw new TypeError('Indica el código individual que asignó el profesor.');
    return Object.freeze({mode,issuer:issuer||'curso',code,label:label||code});
  }
  throw new TypeError('La identidad debe tener modo platform o code.');
}
function asJSON(value){
  try{return JSON.parse(JSON.stringify(value??{}));}catch{return {};}
}
function pickScore(detail){
  const value=(detail?.value&&typeof detail.value==='object')?detail.value:(detail?.payload&&typeof detail.payload==='object')?detail.payload:detail;
  const number=Number(value?.score??value?.value??NaN);
  const max=Number(value?.maxScore??value?.maxValue??NaN);
  if(Number.isFinite(number)&&Number.isFinite(max)&&max>0)return {score:number,maxScore:max};
  const normalized=Number(value?.normalized??NaN);
  if(Number.isFinite(normalized)&&normalized>=0&&normalized<=1)return {score:normalized,maxScore:1};
  return null;
}
export function createResultRecorder(player,{identity,courseId='',courseTitle='',attemptId='',attemptNumber=1,onResult=null}={}){
  if(!player||typeof player.addEventListener!=='function')throw new TypeError('Se necesita una instancia de P2LRN Player.');
  const person=normalizeIdentity(identity);
  const attempt=clean(attemptId)||uuid();
  let packageId=clean(courseId)||clean(player.packageId),contentRoot=clean(player.contentRoot),startedAt=new Date().toISOString();
  let completedAt=null,finalResult=null,stopped=false,number=attemptNumber,openings=1;
  const observations=[],scores=[],states=[];
  const types=['p2lrn:ready','p2lrn:rendered','p2lrn:score','p2lrn:statechange','p2lrn:complete','p2lrn:interaction','p2lrn:progressionchange','p2lrn:learning','p2lrn:activity'];
  function capture(event){
    if(stopped||finalResult)return;
    const detail=asJSON(event.detail);
    const context=detail.context??{};
    const payload=detail.payload??detail;
    if(event.type==='p2lrn:ready'){
      packageId=clean(context.packageId??payload.packageId??detail.packageId)||packageId;
      contentRoot=clean(context.contentRoot??payload.contentRoot??detail.contentRoot)||contentRoot;
    }
    const raw={id:attempt+'-event-'+(observations.length+1),type:event.type,timestamp:new Date().toISOString(),category:'player',context:{packageId:packageId||null,attemptId:attempt},payload};
    if(observations.length>=20000)throw new RangeError('La captura supera el límite de 20000 eventos.');
    observations.push(raw);
    if(event.type==='p2lrn:score'){
      const score=pickScore(payload);
      if(score)scores.push({id:attempt+'-score-'+(scores.length+1),type:'score',timestamp:raw.timestamp,context:{packageId,attemptId:attempt},value:score});
    }
    if(event.type==='p2lrn:statechange')states.push({id:raw.id,type:'state',timestamp:raw.timestamp,context:asJSON(context),value:payload});
    if(event.type==='p2lrn:complete')completedAt=raw.timestamp;
  }
  for(const type of types)player.addEventListener(type,capture);
  async function buildResult(final){
    packageId=packageId||clean(player.packageId);
    contentRoot=contentRoot||clean(player.contentRoot);
    if(!packageId)throw new Error('No se ha identificado el paquete. Espera a que Player cargue el curso.');
    const now=new Date().toISOString(),finishedAt=final?(completedAt||now):null;
    const elapsedSeconds=Math.max(0,Math.round((Date.parse(finishedAt||now)-Date.parse(startedAt))/1000));
    const latestScore=scores.at(-1)?.value??null;
    const personToken=person.mode==='platform'?person.issuer+':'+person.subjectId:person.issuer+':'+person.code;
    const body={
      schema:P2LRN_RESULT_SCHEMA,version:'1',identity:person,
      assignment:{assignmentId:'web-'+packageId,packageId,contentRoot,participantToken:personToken,participantLabel:person.label,title:clean(courseTitle)||packageId,policy:{}},
      assignmentProof:null,runtime:{source:'web-player'},
      attempt:{id:attempt,number,status:final?'submitted':'in_progress',startedAt,finishedAt,elapsedSeconds},
      usage:{firstOpenedAt:startedAt,lastOpenedAt:now,openCount:openings,sessions:[{id:attempt,openedAt:startedAt,source:'web'}]},
      summary:{latestScore:latestScore?{value:latestScore.score,maxValue:latestScore.maxScore,normalized:latestScore.score/latestScore.maxScore}:null,stateSnapshots:states.length,events:observations.length,activeTimeMs:0,answers:0,openings},
      submission:{states:[...states],answers:[],scores:[...scores]},
      analytics:{events:[...observations],activeTimeMs:0},
      audit:{anomalies:[],networkPolicy:'host-managed'},
    };
    return Object.freeze({...body,integrity:{algorithm:'sha256',payloadDigest:await digest(body)}});
  }
  return Object.freeze({
    get identity(){return person;},
    get attemptId(){return attempt;},
    get count(){return observations.length;},
    record(event){capture({type:clean(event?.type)||'p2lrn:interaction',detail:event?.detail??{}});},
    async checkpoint(){
      if(finalResult)return finalResult;
      if(stopped)throw new Error('La captura se ha detenido.');
      return buildResult(false);
    },
    async restore(previous){
      if(stopped||finalResult||observations.length)throw new Error('Este intento ya tiene actividad y no puede reemplazarse.');
      if(!previous||previous.schema!==P2LRN_RESULT_SCHEMA||previous.version!=='1'||previous.attempt?.status!=='in_progress'||previous.attempt?.finishedAt)
        throw new Error('Se necesita un resultado de progreso pendiente.');
      const body=JSON.parse(JSON.stringify(previous));delete body.integrity;
      if(previous.integrity?.payloadDigest!==await digest(body))
        throw new Error('La integridad del resultado de progreso es inv?lida.');
      const original=normalizeIdentity(previous.identity);
      if(original.mode!==person.mode||original.issuer!==person.issuer||
         (person.mode==='platform'?original.subjectId!==person.subjectId:original.code!==person.code))
        throw new Error('El progreso corresponde a otro alumno.');
      const course=clean(previous.assignment?.packageId);
      if(!course||(packageId&&course!==packageId)||(contentRoot&&previous.assignment?.contentRoot&&previous.assignment.contentRoot!==contentRoot))
        throw new Error('El progreso corresponde a otro curso o versi?n.');
      if(previous.attempt?.id!==attempt||!Number.isSafeInteger(previous.attempt.number)||previous.attempt.number<1)
        throw new Error('El identificador del intento no coincide.');
      const events=previous.analytics?.events,oldScores=previous.submission?.scores,oldStates=previous.submission?.states;
      if(!Array.isArray(events)||!Array.isArray(oldScores)||!Array.isArray(oldStates)||
         events.length>20000||oldStates.length>20000||oldScores.length>20000)
        throw new Error('El progreso no contiene registros compatibles.');
      for(const [i,event] of events.entries()){
        if(event?.id!==attempt+'-event-'+(i+1)||typeof event.type!=='string')
          throw new Error('Secuencia de eventos incompatible.');
      }
      if(!Number.isFinite(Date.parse(previous.attempt.startedAt)))throw new Error('Fecha del intento inv?lida.');
      packageId=course;contentRoot=clean(previous.assignment.contentRoot);
      startedAt=previous.attempt.startedAt;number=previous.attempt.number;
      openings=Math.max(1,Number(previous.usage?.openCount)||1)+1;
      observations.push(...JSON.parse(JSON.stringify(events)));
      scores.push(...JSON.parse(JSON.stringify(oldScores)));
      states.push(...JSON.parse(JSON.stringify(oldStates)));
      return {attemptId:attempt,restoredEvents:observations.length};
    },
    async finish(){
      if(finalResult){
        if(typeof onResult==='function')await onResult(finalResult);
        return finalResult;
      }
      if(stopped)throw new Error('La captura se ha detenido.');
      stopped=true;
      for(const type of types)player.removeEventListener(type,capture);
      finalResult=await buildResult(true);
      if(typeof onResult==='function')await onResult(finalResult);
      return finalResult;
    },
    async download(filename){
      const result=await this.finish();
      if(!globalThis.document||!globalThis.URL?.createObjectURL)
        throw new Error('La descarga requiere un navegador. Utiliza finish() para obtener el objeto.');
      const safe=clean(filename||('resultado-'+attempt+'.p2lrn-result')).replace(/[^a-zA-Z0-9_.-]/g,'_');
      const blob=new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/vnd.p2lrn-result+json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      try{link.href=url;link.download=safe;document.body.appendChild(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      return result;
    },
    stop(){stopped=true;for(const type of types)player.removeEventListener(type,capture);}
  });
}

import {normalizeAnalyticsDataset} from './model.js';

// Course-scoped evidence from Player events and validated offline results.
// Validate result integrity and the teacher receipt before passing results here.
export function createCourseAnalyticsDataSource({courseId,title,learnerId='local-learner',learnerName='Alumno',events=[],results=[]}={}){
  if(typeof courseId!=='string'||!courseId.trim())throw new TypeError('courseId is required');
  const id=courseId.trim();
  const records=Array.isArray(results)?results:[];
  const active=Array.isArray(events)?events:[];
  return Object.freeze({
    async load(filters={}){
      if(filters.courseId&&filters.courseId!==id)return normalizeAnalyticsDataset({});
      const learners=new Map(),attempts=[],grades=[],learningEvents=[];
      const addLearner=(uid,name)=>{if(!learners.has(uid))learners.set(uid,{id:uid,name:name||uid});};
      addLearner(learnerId,learnerName);
      let seq=0;
      function ingest(raw,uid,attemptId){
        const event=raw?.value?.type?raw.value:raw;
        if(!event||typeof event.type!=='string')return;
        const context=event.context&&typeof event.context==='object'?event.context:{};
        learningEvents.push({id:String(raw?.id||event.id||'course-event-'+(++seq)),type:event.type,timestamp:event.timestamp||raw.queuedAt||new Date().toISOString(),category:event.category||'extension',learnerId:uid,courseId:id,attemptId,context,payload:event.payload||{}});
      }
      for(const raw of active)ingest(raw,learnerId,'');
      const seen=new Set();
      for(const item of records){
        const result=item?.result??item;
        if(!result?.assignment||!result?.attempt||result.assignment.packageId!==id)continue;
        const attemptId=String(result.attempt.id||'');
        if(!attemptId||seen.has(attemptId))continue;
        seen.add(attemptId);
        const uid=String(result.assignment.participantToken||learnerId);
        addLearner(uid,String(result.assignment.participantLabel||uid));
        const start=result.attempt.startedAt,end=result.attempt.finishedAt;
        attempts.push({id:attemptId,learnerId:uid,courseId:id,status:end?'completed':'started',startedAt:start,completedAt:end,activeTimeMs:Math.max(0,Number(result.analytics?.activeTimeMs)||0)});
        for(const event of result.analytics?.events||[])ingest(event,uid,attemptId);
        for(const [index,op] of (result.submission?.scores||[]).entries()){
          const score=op?.value||op;
          if(!Number.isFinite(Number(score?.score))||!Number.isFinite(Number(score?.maxScore)))continue;
          grades.push({id:attemptId+'-'+index,learnerId:uid,courseId:id,entityId:String(op.context?.entityId||score.entityId||''),value:Number(score.score),maxValue:Number(score.maxScore),authoritative:false,source:'player-local',updatedAt:op.timestamp||end||start});
        }
      }
      return normalizeAnalyticsDataset({learners:[...learners.values()],courses:[{id,title:title||id}],attempts,grades,events:learningEvents});
    },
  });
}

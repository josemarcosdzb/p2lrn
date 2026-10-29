export const P2LRN_ANALYTICS_VERSION='0.5.0-alpha.11';
export const ANALYTICS_DATASET_SCHEMA='https://p2lrn.org/schema/analytics-dataset/1';
export const ANALYTICS_SNAPSHOT_SCHEMA='https://p2lrn.org/schema/analytics-snapshot/1';

export const DEFAULT_ANALYTICS_RISK_RULES=Object.freeze({
  inactiveDays:14,
  lowProgress:0.35,
  lowGrade:0.60,
  failedAttempts:2,
});

const DAY_MS=86_400_000;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const asArray=(value)=>Array.isArray(value)?value:[];
const clone=(value)=>{
  if(value==null)return value;
  if(typeof structuredClone==='function')try{return structuredClone(value);}catch{}
  try{return JSON.parse(JSON.stringify(value));}catch{return null;}
};
const text=(value,fallback='')=>{
  const out=String(value??'').trim();
  return out||fallback;
};
const semantic=(value,fallback='')=>{
  const out=text(value,fallback);
  return out.slice(0,220);
};
const finite=(value,fallback=null)=>{
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
};
const ratio=(value,fallback=null)=>{
  const number=finite(value,null);
  return number==null?fallback:clamp(number,0,1);
};
const timestamp=(value)=>{
  if(value==null||value==='')return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
};
const record=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const latest=(values)=>{
  const valid=values.filter(Boolean).map((value)=>new Date(value).getTime()).filter(Number.isFinite);
  return valid.length?new Date(Math.max(...valid)).toISOString():null;
};
const average=(values)=>{
  const valid=values.filter((value)=>Number.isFinite(value));
  return valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:null;
};
const sum=(values)=>values.filter(Number.isFinite).reduce((total,value)=>total+value,0);
const key=(...parts)=>parts.map((part)=>semantic(part,'_')).join('::');
const sortByName=(a,b)=>String(a.name??a.title??a.id).localeCompare(String(b.name??b.title??b.id),'es',{sensitivity:'base'});
const freezeList=(values)=>Object.freeze(values.map((value)=>Object.freeze(value)));

function normalizeLearner(value,index){
  const item=record(value);
  const id=semantic(item.id,'learner-'+(index+1));
  return {
    id,
    name:text(item.name,item.displayName??id),
    email:text(item.email,''),
    group:text(item.group,''),
    cohort:text(item.cohort,''),
    status:text(item.status,'active'),
    tags:Object.freeze(asArray(item.tags).map((tag)=>text(tag)).filter(Boolean)),
    metadata:Object.freeze(record(clone(item.metadata))),
  };
}
function normalizeCourse(value,index){
  const item=record(value);
  const id=semantic(item.id,'course-'+(index+1));
  return {
    id,
    title:text(item.title,item.name??id),
    code:text(item.code,''),
    status:text(item.status,'active'),
    maxScore:finite(item.maxScore,null),
    metadata:Object.freeze(record(clone(item.metadata))),
  };
}
function normalizeEnrollment(value,index){
  const item=record(value);
  const learnerId=semantic(item.learnerId);
  const courseId=semantic(item.courseId);
  if(!learnerId||!courseId)return null;
  return {
    id:semantic(item.id,key(learnerId,courseId,index)),
    learnerId,
    courseId,
    status:text(item.status,'active'),
    progress:ratio(item.progress,null),
    enrolledAt:timestamp(item.enrolledAt),
    startedAt:timestamp(item.startedAt),
    completedAt:timestamp(item.completedAt),
    dueAt:timestamp(item.dueAt),
    metadata:Object.freeze(record(clone(item.metadata))),
  };
}
function normalizeAttempt(value,index){
  const item=record(value);
  const learnerId=semantic(item.learnerId);
  const courseId=semantic(item.courseId);
  if(!learnerId||!courseId)return null;
  return {
    id:semantic(item.id,key(learnerId,courseId,'attempt',index+1)),
    learnerId,
    courseId,
    entityId:semantic(item.entityId,''),
    status:text(item.status,'started'),
    startedAt:timestamp(item.startedAt),
    submittedAt:timestamp(item.submittedAt),
    completedAt:timestamp(item.completedAt),
    updatedAt:timestamp(item.updatedAt),
    progress:ratio(item.progress,null),
    score:finite(item.score,null),
    maxScore:finite(item.maxScore,null),
    activeTimeMs:Math.max(0,finite(item.activeTimeMs,0)),
    metadata:Object.freeze(record(clone(item.metadata))),
  };
}
function normalizeGrade(value,index){
  const item=record(value);
  const learnerId=semantic(item.learnerId);
  const courseId=semantic(item.courseId);
  if(!learnerId||!courseId)return null;
  const numericValue=finite(item.value,item.score);
  const maxValue=finite(item.maxValue,item.maxScore);
  return {
    id:semantic(item.id,key(learnerId,courseId,item.entityId??'course','grade',index+1)),
    learnerId,
    courseId,
    entityId:semantic(item.entityId,''),
    value:numericValue,
    maxValue:maxValue,
    passed:typeof item.passed==='boolean'?item.passed:null,
    authoritative:item.authoritative===true,
    updatedAt:timestamp(item.updatedAt??item.timestamp),
    source:text(item.source,'host'),
    metadata:Object.freeze(record(clone(item.metadata))),
  };
}
function normalizeEvent(value,index){
  const item=record(value);
  const context=record(clone(item.context));
  const payload=record(clone(item.payload));
  const learnerId=semantic(item.learnerId??context.learnerId??context.userId,'');
  const courseId=semantic(item.courseId??context.courseId??context.packageId,'');
  const attemptId=semantic(item.attemptId??context.attemptId,'');
  const type=text(item.type,'p2lrn:interaction');
  return {
    id:semantic(item.id,'event-'+(index+1)),
    sequence:Number.isSafeInteger(Number(item.sequence))?Number(item.sequence):index+1,
    type,
    category:text(item.category,'extension'),
    timestamp:timestamp(item.timestamp)??new Date(0).toISOString(),
    learnerId,
    courseId,
    attemptId,
    context:Object.freeze(context),
    payload:Object.freeze(payload),
  };
}
function compactMap(values,mapper){
  const out=[];
  for(let index=0;index<values.length;index++){
    try{
      const value=mapper(values[index],index);
      if(value)out.push(value);
    }catch{}
  }
  return out;
}

export function normalizeAnalyticsDataset(input={}){
  const source=record(input);
  const learners=compactMap(asArray(source.learners),normalizeLearner);
  const courses=compactMap(asArray(source.courses),normalizeCourse);
  const enrollments=compactMap(asArray(source.enrollments),normalizeEnrollment);
  const attempts=compactMap(asArray(source.attempts),normalizeAttempt);
  const grades=compactMap(asArray(source.grades),normalizeGrade);
  const events=compactMap(asArray(source.events),normalizeEvent);
  return Object.freeze({
    schema:ANALYTICS_DATASET_SCHEMA,
    generatedAt:timestamp(source.generatedAt)??new Date().toISOString(),
    learners:freezeList(learners),
    courses:freezeList(courses),
    enrollments:freezeList(enrollments),
    attempts:freezeList(attempts),
    grades:freezeList(grades),
    events:freezeList(events),
    metadata:Object.freeze(record(clone(source.metadata))),
  });
}

function authoritativeGradeRatio(grade){
  if(!grade?.authoritative)return null;
  const value=finite(grade.value,null),maxValue=finite(grade.maxValue,null);
  if(value==null||maxValue==null||maxValue<=0)return null;
  return clamp(value/maxValue,0,1);
}
function isCourseGrade(grade,courseId){
  return grade?.authoritative===true && (!grade.entityId || grade.entityId===courseId);
}
function latestAuthoritativeGrade(grades,courseId){
  const sorted=grades.filter((grade)=>isCourseGrade(grade,courseId)).sort((a,b)=>{
    const left=new Date(a.updatedAt??0).getTime();
    const right=new Date(b.updatedAt??0).getTime();
    return right-left;
  });
  return sorted[0]??null;
}
function attemptCompleted(attempt){
  return Boolean(attempt.completedAt)||['completed','passed','failed','submitted'].includes(String(attempt.status).toLowerCase());
}
function courseProgress(enrollment,attempts){
  if(enrollment?.completedAt||String(enrollment?.status).toLowerCase()==='completed')return 1;
  const values=[
    ratio(enrollment?.progress,null),
    ...attempts.map((attempt)=>attemptCompleted(attempt)?1:ratio(attempt.progress,null)),
  ].filter((value)=>value!=null);
  return values.length?Math.max(...values):0;
}

function maxTimestampMs(current,value){
  if(!value)return current;
  const ms=new Date(value).getTime();
  return Number.isFinite(ms)&&ms>current?ms:current;
}
function ensureSet(map,id){
  let set=map.get(id);
  if(!set){set=new Set();map.set(id,set);}
  return set;
}
function createAnalyticsIndex(dataset){
  const pairs=new Map();
  const courseIdsByLearner=new Map();
  const learnerIdsByCourse=new Map();
  const activeGroups=new Map();
  const ensurePair=(learnerId,courseId)=>{
    const pairKey=key(learnerId,courseId);
    let pair=pairs.get(pairKey);
    if(!pair){
      pair={
        learnerId,courseId,enrollment:null,attempts:0,failedAttempts:0,
        attemptProgress:null,attemptCompleted:false,hasStarted:false,
        grade:null,gradeUpdatedMs:-1,lastActivityMs:-1,activeTimeMs:0,
      };
      pairs.set(pairKey,pair);
      ensureSet(courseIdsByLearner,learnerId).add(courseId);
      ensureSet(learnerIdsByCourse,courseId).add(learnerId);
    }
    return pair;
  };
  for(const enrollment of dataset.enrollments){
    const pair=ensurePair(enrollment.learnerId,enrollment.courseId);
    pair.enrollment=enrollment;
    if(enrollment.startedAt||ratio(enrollment.progress,null)>0)pair.hasStarted=true;
  }
  for(const attempt of dataset.attempts){
    const pair=ensurePair(attempt.learnerId,attempt.courseId);
    pair.attempts++;
    pair.hasStarted=true;
    if(String(attempt.status).toLowerCase()==='failed')pair.failedAttempts++;
    if(attemptCompleted(attempt))pair.attemptCompleted=true;
    const progress=ratio(attempt.progress,null);
    if(progress!=null)pair.attemptProgress=Math.max(pair.attemptProgress??0,progress);
    for(const value of [attempt.updatedAt,attempt.completedAt,attempt.submittedAt,attempt.startedAt]){
      pair.lastActivityMs=maxTimestampMs(pair.lastActivityMs,value);
    }
    const group=key(attempt.learnerId,attempt.courseId,attempt.id);
    activeGroups.set(group,{
      pairKey:key(attempt.learnerId,attempt.courseId),
      ms:Math.max(activeGroups.get(group)?.ms??0,Math.max(0,attempt.activeTimeMs||0)),
    });
  }
  for(const grade of dataset.grades){
    const pair=ensurePair(grade.learnerId,grade.courseId);
    if(!isCourseGrade(grade,grade.courseId))continue;
    const updatedMs=new Date(grade.updatedAt??0).getTime();
    const comparable=Number.isFinite(updatedMs)?updatedMs:0;
    if(pair.grade==null||comparable>pair.gradeUpdatedMs){
      pair.grade=grade;
      pair.gradeUpdatedMs=comparable;
    }
  }
  for(const event of dataset.events){
    if(!event.learnerId||!event.courseId)continue;
    const pair=ensurePair(event.learnerId,event.courseId);
    pair.hasStarted=true;
    pair.lastActivityMs=maxTimestampMs(pair.lastActivityMs,event.timestamp);
    if(!['p2lrn:attention','p2lrn:active-time'].includes(event.type))continue;
    const total=finite(event.payload?.totalActiveMs,null);
    if(total==null||total<0)continue;
    const group=key(event.learnerId,event.courseId,event.attemptId||'event-session');
    activeGroups.set(group,{
      pairKey:key(event.learnerId,event.courseId),
      ms:Math.max(activeGroups.get(group)?.ms??0,total),
    });
  }
  for(const item of activeGroups.values()){
    const pair=pairs.get(item.pairKey);
    if(pair)pair.activeTimeMs+=item.ms;
  }
  for(const pair of pairs.values()){
    if(pair.enrollment?.completedAt||String(pair.enrollment?.status).toLowerCase()==='completed'||pair.attemptCompleted){
      pair.progress=1;
    }else{
      pair.progress=Math.max(ratio(pair.enrollment?.progress,0)??0,pair.attemptProgress??0);
    }
    pair.gradeRatio=authoritativeGradeRatio(pair.grade);
    pair.lastActivity=pair.lastActivityMs>=0?new Date(pair.lastActivityMs).toISOString():null;
  }
  return {pairs,courseIdsByLearner,learnerIdsByCourse};
}
function learnerMetrics(index,learner,rules,nowMs){
  const courseIds=index.courseIdsByLearner.get(learner.id)??new Set();
  let completedCourses=0,failedAttempts=0,attempts=0,activeTimeMs=0,lastActivityMs=-1,hasStarted=false;
  const progresses=[],officialGrades=[];
  for(const courseId of courseIds){
    const pair=index.pairs.get(key(learner.id,courseId));
    if(!pair)continue;
    progresses.push(pair.progress);
    if(pair.progress>=1)completedCourses++;
    if(pair.hasStarted||pair.progress>0)hasStarted=true;
    failedAttempts+=pair.failedAttempts;
    attempts+=pair.attempts;
    activeTimeMs+=pair.activeTimeMs;
    lastActivityMs=Math.max(lastActivityMs,pair.lastActivityMs);
    if(pair.gradeRatio!=null)officialGrades.push(pair.gradeRatio);
  }
  const progress=average(progresses)??0;
  const gradeRatio=average(officialGrades);
  const lastActivity=lastActivityMs>=0?new Date(lastActivityMs).toISOString():null;
  const completed=courseIds.size>0&&completedCourses===courseIds.size;
  const risk=signalRisk({progress,gradeRatio,lastActivity,failedAttempts,hasStarted,completed},rules,nowMs);
  return Object.freeze({
    id:learner.id,learner,courses:courseIds.size,completedCourses,
    completionRate:courseIds.size?completedCourses/courseIds.size:0,
    progress,gradeRatio,attempts,activeTimeMs,lastActivity,failedAttempts,risk,
  });
}
function courseMetrics(index,course,rules,nowMs){
  const learnerIds=index.learnerIdsByCourse.get(course.id)??new Set();
  const progresses=[],gradeRatios=[];
  let completed=0,started=0,passed=0,graded=0,riskCount=0,attempts=0,activeTimeMs=0,lastActivityMs=-1;
  for(const learnerId of learnerIds){
    const pair=index.pairs.get(key(learnerId,course.id));
    if(!pair)continue;
    progresses.push(pair.progress);
    if(pair.progress>=1)completed++;
    if(pair.progress>0||pair.hasStarted)started++;
    if(pair.gradeRatio!=null){
      gradeRatios.push(pair.gradeRatio);
      graded++;
      const didPass=pair.grade?.passed==null?pair.gradeRatio>=rules.lowGrade:pair.grade.passed;
      if(didPass)passed++;
    }
    attempts+=pair.attempts;
    activeTimeMs+=pair.activeTimeMs;
    lastActivityMs=Math.max(lastActivityMs,pair.lastActivityMs);
    const risk=signalRisk({
      progress:pair.progress,gradeRatio:pair.gradeRatio,lastActivity:pair.lastActivity,
      failedAttempts:pair.failedAttempts,hasStarted:pair.hasStarted||pair.progress>0,completed:pair.progress>=1,
    },rules,nowMs);
    if(risk.level!=='none')riskCount++;
  }
  return Object.freeze({
    id:course.id,course,enrolled:learnerIds.size,started,completed,
    completionRate:learnerIds.size?completed/learnerIds.size:0,
    averageProgress:average(progresses)??0,averageGrade:average(gradeRatios),
    graded,passed,passRate:graded?passed/graded:null,attempts,
    averageAttempts:learnerIds.size?attempts/learnerIds.size:0,
    activeTimeMs,riskCount,lastActivity:lastActivityMs>=0?new Date(lastActivityMs).toISOString():null,
  });
}

function activitySeries(dataset,days,nowMs){
  const length=Math.max(1,Math.min(120,Math.floor(days||14)));
  const rows=[];
  const byDay=new Map();
  for(let offset=length-1;offset>=0;offset--){
    const date=new Date(nowMs-offset*DAY_MS);
    const day=date.toISOString().slice(0,10);
    const row={date:day,events:0,learners:new Set(),attempts:new Set()};
    rows.push(row);byDay.set(day,row);
  }
  for(const event of dataset.events){
    const day=String(event.timestamp).slice(0,10);
    const row=byDay.get(day);if(!row)continue;
    row.events++;
    if(event.learnerId)row.learners.add(event.learnerId);
    if(event.attemptId)row.attempts.add(event.attemptId);
  }
  return Object.freeze(rows.map((row)=>Object.freeze({
    date:row.date,events:row.events,learners:row.learners.size,attempts:row.attempts.size,
  })));
}
function gradeDistribution(grades){
  const ratios=grades.map(authoritativeGradeRatio).filter((value)=>value!=null);
  const bins=[
    {key:'0-49',min:0,max:.5,count:0},
    {key:'50-59',min:.5,max:.6,count:0},
    {key:'60-69',min:.6,max:.7,count:0},
    {key:'70-79',min:.7,max:.8,count:0},
    {key:'80-89',min:.8,max:.9,count:0},
    {key:'90-100',min:.9,max:1.000001,count:0},
  ];
  for(const value of ratios){
    const bin=bins.find((item)=>value>=item.min&&value<item.max);
    if(bin)bin.count++;
  }
  return freezeList(bins);
}

export function computeAnalyticsSnapshot(input={},options={}){
  const dataset=input?.schema===ANALYTICS_DATASET_SCHEMA?input:normalizeAnalyticsDataset(input);
  const rules=Object.freeze({...DEFAULT_ANALYTICS_RISK_RULES,...record(options.riskRules)});
  const nowMs=Number.isFinite(Number(options.now))?Number(options.now):Date.now();
  const index=createAnalyticsIndex(dataset);
  const learners=dataset.learners.map((learner)=>learnerMetrics(index,learner,rules,nowMs)).sort((a,b)=>sortByName(a.learner,b.learner));
  const courses=dataset.courses.map((course)=>courseMetrics(index,course,rules,nowMs)).sort((a,b)=>sortByName(a.course,b.course));
  const courseGrades=[...index.pairs.values()].map((pair)=>pair.grade).filter(Boolean);
  const courseGradeRatios=courseGrades.map(authoritativeGradeRatio).filter((value)=>value!=null);
  const activeLearners=learners.filter((item)=>{
    if(!item.lastActivity)return false;
    return nowMs-new Date(item.lastActivity).getTime()<=30*DAY_MS;
  }).length;
  const atRisk=learners.filter((item)=>item.risk.level!=='none').length;
  const completed=sum(courses.map((item)=>item.completed));
  const enrolled=sum(courses.map((item)=>item.enrolled));
  const overview=Object.freeze({
    learners:dataset.learners.length,
    activeLearners,
    courses:dataset.courses.length,
    enrollments:dataset.enrollments.length,
    attempts:dataset.attempts.length,
    completionRate:enrolled?completed/enrolled:0,
    averageGrade:average(courseGradeRatios),
    activeTimeMs:sum([...index.pairs.values()].map((pair)=>pair.activeTimeMs)),
    atRisk,
    events:dataset.events.length,
  });
  const recentEvents=[...dataset.events].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,80);
  return Object.freeze({
    schema:ANALYTICS_SNAPSHOT_SCHEMA,
    generatedAt:new Date(nowMs).toISOString(),
    dataset,
    rules,
    overview,
    learners:Object.freeze(learners),
    courses:Object.freeze(courses),
    gradeDistribution:gradeDistribution(courseGrades),
    activity:activitySeries(dataset,Number(options.activityDays??14),nowMs),
    recentEvents:Object.freeze(recentEvents),
  });
}

export function filterAnalyticsDataset(input={},filters={}){
  const dataset=input?.schema===ANALYTICS_DATASET_SCHEMA?input:normalizeAnalyticsDataset(input);
  const courseId=semantic(filters.courseId,'');
  const learnerId=semantic(filters.learnerId,'');
  const from=filters.from?new Date(filters.from).getTime():null;
  const to=filters.to?new Date(filters.to).getTime():null;
  const acceptCourse=(value)=>!courseId||value===courseId;
  const acceptLearner=(value)=>!learnerId||value===learnerId;
  const acceptDate=(value)=>{
    if(!from&&!to)return true;
    const time=new Date(value??0).getTime();
    if(!Number.isFinite(time))return false;
    return (!from||time>=from)&&(!to||time<=to);
  };
  let learnerIds=new Set(dataset.learners.filter((item)=>acceptLearner(item.id)).map((item)=>item.id));
  let courseIds=new Set(dataset.courses.filter((item)=>acceptCourse(item.id)).map((item)=>item.id));
  const linkedPairs=[
    ...dataset.enrollments.map((item)=>[item.learnerId,item.courseId]),
    ...dataset.attempts.map((item)=>[item.learnerId,item.courseId]),
    ...dataset.grades.map((item)=>[item.learnerId,item.courseId]),
    ...dataset.events.filter((item)=>item.learnerId&&item.courseId).map((item)=>[item.learnerId,item.courseId]),
  ];
  if(courseId&&!learnerId){
    const linkedLearners=new Set(linkedPairs.filter(([,cid])=>courseIds.has(cid)).map(([lid])=>lid));
    learnerIds=new Set([...learnerIds].filter((id)=>linkedLearners.has(id)));
  }
  if(learnerId&&!courseId){
    const linkedCourses=new Set(linkedPairs.filter(([lid])=>learnerIds.has(lid)).map(([,cid])=>cid));
    courseIds=new Set([...courseIds].filter((id)=>linkedCourses.has(id)));
  }
  return normalizeAnalyticsDataset({
    generatedAt:dataset.generatedAt,
    learners:dataset.learners.filter((item)=>learnerIds.has(item.id)),
    courses:dataset.courses.filter((item)=>courseIds.has(item.id)),
    enrollments:dataset.enrollments.filter((item)=>learnerIds.has(item.learnerId)&&courseIds.has(item.courseId)),
    attempts:dataset.attempts.filter((item)=>learnerIds.has(item.learnerId)&&courseIds.has(item.courseId)&&acceptDate(item.updatedAt??item.completedAt??item.startedAt)),
    grades:dataset.grades.filter((item)=>learnerIds.has(item.learnerId)&&courseIds.has(item.courseId)&&acceptDate(item.updatedAt)),
    events:dataset.events.filter((item)=>learnerIds.has(item.learnerId)&&courseIds.has(item.courseId)&&acceptDate(item.timestamp)),
    metadata:dataset.metadata,
  });
}

export function createAnalyticsStore(seed={}){
  let dataset=normalizeAnalyticsDataset(seed);
  const listeners=new Set();
  const notify=()=>{for(const listener of listeners)try{listener(dataset);}catch{}};
  const replace=(next)=>{dataset=normalizeAnalyticsDataset(next);notify();return dataset;};
  const upsert=(collection,value,idField='id')=>{
    const list=[...dataset[collection]];
    const id=semantic(value?.[idField],'');
    const index=list.findIndex((item)=>item[idField]===id);
    if(index>=0)list[index]={...list[index],...clone(value)};
    else list.push(clone(value));
    return replace({...dataset,[collection]:list});
  };
  return Object.freeze({
    get data(){return dataset;},
    replace,
    upsertLearner:(value)=>upsert('learners',value),
    upsertCourse:(value)=>upsert('courses',value),
    upsertEnrollment:(value)=>upsert('enrollments',value),
    upsertAttempt:(value)=>upsert('attempts',value),
    upsertGrade:(value)=>upsert('grades',value),
    addEvent(value){return replace({...dataset,events:[...dataset.events,clone(value)]});},
    subscribe(listener){
      if(typeof listener!=='function')throw new TypeError('Analytics store listener must be a function.');
      listeners.add(listener);return()=>listeners.delete(listener);
    },
    snapshot(options){return computeAnalyticsSnapshot(dataset,options);},
  });
}

export function createMemoryAnalyticsDataSource(seed={}){
  const store=createAnalyticsStore(seed);
  return Object.freeze({
    store,
    async load(){return store.data;},
  });
}

export function createHttpAnalyticsDataSource({
  url='/api/p2lrn/analytics/snapshot',
  fetch:fetchImpl=globalThis.fetch,
  headers={},
  credentials='same-origin',
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('Analytics HTTP data source requires fetch().');
  return Object.freeze({
    async load(filters={}){
      const base=globalThis.location?.href??'http://localhost/';
      const target=new URL(url,base);
      for(const [name,value] of Object.entries(filters)){
        if(value!=null&&value!=='')target.searchParams.set(name,String(value));
      }
      const resolvedHeaders=typeof headers==='function'?await headers(filters):headers;
      const response=await fetchImpl(target.href,{
        method:'GET',
        credentials,
        headers:{accept:'application/json',...record(resolvedHeaders)},
        signal:filters.signal,
      });
      if(!response.ok)throw new Error('P2LRN Analytics HTTP '+response.status);
      return normalizeAnalyticsDataset(await response.json());
    },
  });
}

function csvCell(value){
  let text=String(value??'');
  if(/^[=+\-@]/u.test(text))text="'"+text;
  return /[",\n\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
}
export function analyticsToCsv(snapshotOrDataset,{kind='learners',locale='es-ES'}={}){
  const snapshot=snapshotOrDataset?.schema===ANALYTICS_SNAPSHOT_SCHEMA?snapshotOrDataset:computeAnalyticsSnapshot(snapshotOrDataset);
  const percent=(value)=>value==null?'':new Intl.NumberFormat(locale,{style:'percent',maximumFractionDigits:1}).format(value);
  const hours=(value)=>Number.isFinite(value)?(value/3_600_000).toFixed(2):'';
  let rows;
  if(kind==='courses'){
    rows=[['id','curso','alumnos','iniciados','completados','progreso','nota','aprobados','intentos','horas_activas','en_riesgo'],
      ...snapshot.courses.map((item)=>[
        item.id,item.course.title,item.enrolled,item.started,item.completed,percent(item.averageProgress),
        percent(item.averageGrade),percent(item.passRate),item.attempts,hours(item.activeTimeMs),item.riskCount,
      ])];
  }else if(kind==='grades'){
    rows=[['id','alumno','curso','valor','maximo','porcentaje','aprobado','autoritativa','actualizada'],
      ...(()=>{
        const learnersById=new Map(snapshot.dataset.learners.map((item)=>[item.id,item]));
        const coursesById=new Map(snapshot.dataset.courses.map((item)=>[item.id,item]));
        return snapshot.dataset.grades.map((grade)=>{
          const learner=learnersById.get(grade.learnerId);
          const course=coursesById.get(grade.courseId);
          return [grade.id,learner?.name??grade.learnerId,course?.title??grade.courseId,grade.value,grade.maxValue,
            percent(authoritativeGradeRatio(grade)),grade.passed,grade.authoritative,grade.updatedAt];
        });
      })()];
  }else{
    rows=[['id','alumno','email','grupo','cursos','completados','progreso','nota','intentos','horas_activas','ultima_actividad','senal'],
      ...snapshot.learners.map((item)=>[
        item.id,item.learner.name,item.learner.email,item.learner.group,item.courses,item.completedCourses,
        percent(item.progress),percent(item.gradeRatio),item.attempts,hours(item.activeTimeMs),item.lastActivity,item.risk.level,
      ])];
  }
  return rows.map((row)=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

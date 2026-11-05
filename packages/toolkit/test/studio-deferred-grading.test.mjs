import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNStudioDocument} from '../web/studio/new-document.js';
import {exportP2LRNPackage} from '../web/studio/package-export.js';
import {openP2LRNPackageBytes} from '../web/p2lrn-player.js';
import {questionnaireForLearner,setQuestionnaireGradingMode} from '../web/studio/questionnaire-grading.js';
import {validateQuestionnaire,scoreQuestionnaire} from '../web/questionnaire-core.js';

const questions=[
 {id:'q1',type:'single-choice',prompt:'Elige una',points:1,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}},
 {id:'q2',type:'multiple-choice',prompt:'Elige varias',points:1,choices:[{id:'a',text:'A'},{id:'b',text:'B'}],solution:{choiceIds:['a']}},
 {id:'q3',type:'true-false',prompt:'¿Es correcto?',points:1,choices:[{id:'t',text:'Verdadero'},{id:'f',text:'Falso'}],solution:{choiceIds:['t']}},
 {id:'q4',type:'true-false',trueFalseMode:'multiple',prompt:'Afirmaciones',points:1,statements:[{id:'s1',text:'Uno'},{id:'s2',text:'Dos'}],solution:{answers:{s1:true,s2:false}}},
 {id:'q5',type:'text',prompt:'Respuesta abierta',points:1,solution:{acceptedAnswers:['CLAVE-SECRETA-PROFESOR']}},
 {id:'q6',type:'fill-blanks',prompt:'Completa',points:1,body:'Texto {{b1}}.',inputMode:'text',blanks:[{id:'b1'}],solution:{answers:{b1:['PRIVADO-HUECO']}}},
 {id:'q7',type:'ordering',prompt:'Ordena',points:1,items:[{id:'i1',text:'Uno'},{id:'i2',text:'Dos'}],solution:{order:['i1','i2']}},
 {id:'q8',type:'matching',prompt:'Relaciona',points:1,left:[{id:'l1',text:'Uno'},{id:'l2',text:'Dos'}],right:[{id:'r1',text:'A'},{id:'r2',text:'B'}],solution:{pairs:[{left:'l1',right:'r1'},{left:'l2',right:'r2'}]}},
 {id:'q9',type:'classification',prompt:'Clasifica',points:1,items:[{id:'i1',text:'Uno'},{id:'i2',text:'Dos'}],categories:[{id:'c1',text:'A'},{id:'c2',text:'B'}],solution:{assignments:[{item:'i1',category:'c1'},{item:'i2',category:'c2'}]}},
].map(q=>({...q,explanation:'PRIVADA-EXPLICACION'}));
const payload=()=>({schema:'https://p2lrn.org/schema/native-questionnaire/0.4.0',version:'0.4.0',title:'Ejercicio',grading:{mode:'embedded-key'},presentation:{showFeedback:'after-submit'},questions:structuredClone(questions)});
async function courseData(doc,activity){
 const packed=await exportP2LRNPackage(doc);
 const reopened=await openP2LRNPackageBytes(packed.bytes.buffer.slice(packed.bytes.byteOffset,packed.bytes.byteOffset+packed.bytes.length));
 const entity=reopened.entities.get(activity.id),resource=reopened.entities.get(entity.resource);
 const bytes=await reopened.payload(resource.representations[0].location.path).read();
 const text=new TextDecoder().decode(bytes);
 return {text,data:JSON.parse(text)};
}
test('deferred correction strips answers for all question kinds and never fabricates a score',()=>{
 const original=payload(),student=setQuestionnaireGradingMode(original,'host');
 validateQuestionnaire(student);
 assert.equal(student.grading.mode,'host');assert.equal(student.presentation.showFeedback,'never');
 assert(student.questions.every(q=>!('solution'in q)&&!('explanation'in q)));
 assert.equal(original.questions[4].solution.acceptedAnswers[0],'CLAVE-SECRETA-PROFESOR');
 const score=scoreQuestionnaire(student,{q1:{choiceIds:['a']},q5:{text:'CLAVE-SECRETA-PROFESOR'}});
 assert.equal(score.graded,false);assert.equal(score.normalized,null);
 assert(score.questions.every(q=>q.graded===false));
});
test('Studio saves and exports answer-free questionnaires for both online and offline packages',async()=>{
 const doc=createP2LRNStudioDocument({title:'Curso',language:'es'});
 const activity=doc.addQuestionnaire(doc.rootId,{title:'Test'});
 const host=payload();host.grading.mode='host';
 doc.setQuestionnaire(activity.id,host);
 const persisted=(await doc.readQuestionnaire(activity.id)).payload;
 assert(persisted.questions.every(q=>!('solution'in q)));
 const {text,data}=await courseData(doc,activity);
 validateQuestionnaire(data);assert.equal(data.grading.mode,'host');
 assert(!text.includes('CLAVE-SECRETA-PROFESOR')&&!text.includes('PRIVADO-HUECO')&&!text.includes('PRIVADA-EXPLICACION'));
});
test('export sanitizes an imported host-mode payload even when Studio never edited it',async()=>{
 const doc=createP2LRNStudioDocument({title:'Importado',language:'es'}),activity=doc.addQuestionnaire(doc.rootId,{title:'Test'});
 const target=doc.questionnaireForActivity(activity.id),legacy=payload();legacy.grading.mode='host';
 doc.payloadOverrides.set(target.path,new TextEncoder().encode(JSON.stringify(legacy)));
 const {text,data}=await courseData(doc,activity);
 assert.equal(data.presentation.showFeedback,'never');
 assert(!text.includes('CLAVE-SECRETA-PROFESOR'));assert(data.questions.every(q=>!('solution'in q)));
});
test('legacy automatic scoring remains unchanged',async()=>{
 const doc=createP2LRNStudioDocument({title:'Auto',language:'es'}),activity=doc.addQuestionnaire(doc.rootId,{title:'Test'});
 doc.setQuestionnaire(activity.id,payload());
 const {data}=await courseData(doc,activity);assert.equal(data.grading.mode,'embedded-key');
 assert.equal(data.questions[4].solution.acceptedAnswers[0],'CLAVE-SECRETA-PROFESOR');
 const score=scoreQuestionnaire(data,{q1:{choiceIds:['a']}});
 assert.equal(score.questions[0].graded,true);assert.equal(score.questions[0].correct,true);
});
test('new questionnaire authoring API also prevents leaking host answers',async()=>{
 const doc=createP2LRNStudioDocument({title:'Nuevo',language:'es'}),host=payload();host.grading.mode='host';
 const activity=doc.addQuestionnaire(doc.rootId,{title:'Test',payload:host});
 const data=(await doc.readQuestionnaire(activity.id)).payload;
 assert(data.questions.every(q=>!('solution'in q)));assert.equal(data.presentation.showFeedback,'never');
});
test('mode API is fail-closed for malformed requests',()=>{
 assert.throws(()=>questionnaireForLearner(null),/cuestionario/);
 assert.throws(()=>setQuestionnaireGradingMode(payload(),'unknown'),/Modo de corrección/);
 assert.deepEqual(questionnaireForLearner(payload()),payload());
});

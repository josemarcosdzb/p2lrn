import test from 'node:test';
import assert from 'node:assert/strict';
import {createP2LRNManualReviewReport,latestManualReviewAnswers,P2LRN_MANUAL_REVIEW_SCHEMA} from '../../toolkit/web/studio/manual-grading.js';

const sample=()=>({
 integrityValid:true,courseMatches:true,assignmentMatches:true,
 result:{assignment:{assignmentId:'assignment-1',contentRoot:'sha256:'+'f'.repeat(64)},
   integrity:{payloadDigest:'sha256:'+'e'.repeat(64)}},
 summary:{participantLabel:'Alumno de prueba',answers:[
   {entityId:'unit-a',questionId:'q1',answer:{choiceIds:['a']}},
   {entityId:'unit-a',questionId:'q2',answer:{text:'Primera respuesta'}},
   {entityId:'unit-a',questionId:'q2',answer:{text:'Respuesta final'}},
 ]},
});
const marks=()=>[
 {entityId:'unit-a',questionId:'q1',pointsAwarded:1,pointsPossible:2,comment:'Parcial'},
 {entityId:'unit-a',questionId:'q2',pointsAwarded:3,pointsPossible:3},
];
test('teacher manually reviews the latest answer and gets a separate untrusted report',()=>{
 const review=sample(),answers=latestManualReviewAnswers(review);
 assert.equal(answers.length,2);
 assert.equal(answers[1].answer.text,'Respuesta final');
 const report=createP2LRNManualReviewReport(review,{marks:marks(),reviewer:'Docente QA'});
 assert.equal(report.schema,P2LRN_MANUAL_REVIEW_SCHEMA);
 assert.equal(report.authoritative,false);
 assert.equal(report.status,'reviewed-local-unverified');
 assert.equal(report.totals.awarded,4);
 assert.equal(report.totals.maximum,5);
 assert.equal(report.totals.normalized,0.8);
 assert.equal(report.source.assignmentId,'assignment-1');
 assert.equal(report.corrections[1].answer.text,'Respuesta final');
 assert.equal(review.summary.answers.length,3,'must preserve original learner result');
});
test('manual report rejects invalid or mismatched submissions and incomplete teacher marks',()=>{
 for(const key of ['integrityValid','courseMatches','assignmentMatches']){
   const invalid=sample();invalid[key]=false;
   assert.throws(()=>createP2LRNManualReviewReport(invalid,{marks:marks()}),/integridad y correspondencia/);
 }
 assert.throws(()=>createP2LRNManualReviewReport(sample(),{marks:marks().slice(0,1)}),/todas las preguntas/);
 assert.throws(()=>createP2LRNManualReviewReport(sample(),{marks:[marks()[0],marks()[0]]}),/duplicada/);
 const tooHigh=marks();tooHigh[0].pointsAwarded=10;
 assert.throws(()=>createP2LRNManualReviewReport(sample(),{marks:tooHigh}),/Puntuación inválida/);
 const blank=marks();blank[0].pointsAwarded=NaN;
 assert.throws(()=>createP2LRNManualReviewReport(sample(),{marks:blank}),/Puntuación inválida/);
 const mismatched=marks();mismatched[1].questionId='q-other';
 assert.throws(()=>createP2LRNManualReviewReport(sample(),{marks:mismatched}),/Falta corregir/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQti3Item,scoreQti3Response,sanitizeQti3State,QTI3_STATE_VERSION} from '../web/qti3-core.js';
import {RendererRegistry} from '../web/renderer-registry.js';
import {QTI3_RUNTIME_RENDERER,registerBuiltInRenderers} from '../web/built-in-renderers.js';

function item({body,correct='<qti-value>A</qti-value>',cardinality='single',baseType='identifier',processing='https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/match_correct',extra='',adaptive='false'}){
  return `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="item1" title="QTI Gate" time-dependent="false" adaptive="${adaptive}" xml:lang="es">
  <qti-response-declaration base-type="${baseType}" cardinality="${cardinality}" identifier="RESPONSE">
    <qti-correct-response>${correct}</qti-correct-response>
  </qti-response-declaration>
  <qti-outcome-declaration base-type="float" cardinality="single" identifier="SCORE"/>
  <qti-item-body><p>Contexto del ítem.</p>${body}</qti-item-body>
  ${extra}
  <qti-response-processing template="${processing}"/>
</qti-assessment-item>`;
}

test('QTI 3 choiceInteraction parses official match_correct shape and scores exact single choice',()=>{
  const model=parseQti3Item(item({body:`
    <qti-choice-interaction max-choices="1" min-choices="1" response-identifier="RESPONSE">
      <qti-prompt>¿Cuál es correcta?</qti-prompt>
      <qti-simple-choice identifier="A">Correcta</qti-simple-choice>
      <qti-simple-choice identifier="B">Incorrecta</qti-simple-choice>
    </qti-choice-interaction>`
  }));
  assert.equal(model.version,'3.0');
  assert.equal(model.identifier,'item1');
  assert.equal(model.bodyLead,'Contexto del ítem.');
  assert.equal(model.interaction.type,'choice');
  assert.equal(model.interaction.maxChoices,1);
  assert.deepEqual(model.response.correctValues,['A']);
  assert.equal(scoreQti3Response(model,['A']).raw,1);
  assert.equal(scoreQti3Response(model,['B']).raw,0);
});

test('QTI 3 multiple choice requires exact response set for match_correct',()=>{
  const model=parseQti3Item(item({
    cardinality:'multiple',
    correct:'<qti-value>A</qti-value><qti-value>C</qti-value>',
    body:`<qti-choice-interaction max-choices="2" min-choices="2" shuffle="true" response-identifier="RESPONSE">
      <qti-prompt>Elige dos</qti-prompt>
      <qti-simple-choice identifier="A">A</qti-simple-choice>
      <qti-simple-choice identifier="B" fixed="true">B</qti-simple-choice>
      <qti-simple-choice identifier="C">C</qti-simple-choice>
    </qti-choice-interaction>`
  }));
  assert.equal(model.interaction.shuffle,true);
  assert.equal(model.interaction.choices[1].fixed,true);
  assert.equal(scoreQti3Response(model,['C','A']).correct,true);
  assert.equal(scoreQti3Response(model,['A']).correct,false);
  assert.equal(scoreQti3Response(model,['A','B']).correct,false);
});

test('QTI 3 textEntryInteraction match_correct supports string, integer and float scalar comparison',()=>{
  for(const [baseType,correct,response,wrong] of [
    ['string','York','York','york'],
    ['integer','42','42','41'],
    ['float','3.5','3.5','3.6'],
  ]){
    const model=parseQti3Item(item({
      baseType,correct:`<qti-value>${correct}</qti-value>`,
      body:'<p>Respuesta: <qti-text-entry-interaction response-identifier="RESPONSE" expected-length="8"/></p>'
    }));
    assert.equal(model.interaction.type,'text-entry');
    assert.equal(scoreQti3Response(model,response).correct,true,baseType);
    assert.equal(scoreQti3Response(model,wrong).correct,false,baseType);
  }
});

test('QTI 3 extendedTextInteraction is delivered only with simple single match_correct response',()=>{
  const model=parseQti3Item(item({
    baseType:'string',correct:'<qti-value>respuesta</qti-value>',
    body:'<qti-extended-text-interaction response-identifier="RESPONSE"><qti-prompt>Explica</qti-prompt></qti-extended-text-interaction>'
  }));
  assert.equal(model.interaction.type,'extended-text');
  assert.equal(scoreQti3Response(model,'respuesta').raw,1);
});

test('QTI 3 refuses map_response and general/custom processing instead of inventing scoring',()=>{
  assert.throws(()=>parseQti3Item(item({
    processing:'https://purl.imsglobal.org/spec/qti/v3p0/rptemplates/map_response.xml',
    body:'<qti-choice-interaction max-choices="1" response-identifier="RESPONSE"><qti-simple-choice identifier="A">A</qti-simple-choice><qti-simple-choice identifier="B">B</qti-simple-choice></qti-choice-interaction>'
  })),error=>error?.code==='P2LRN_QTI_RESPONSE_PROCESSING_UNSUPPORTED');
  assert.throws(()=>parseQti3Item(item({
    processing:'https://vendor.invalid/custom',
    body:'<qti-choice-interaction max-choices="1" response-identifier="RESPONSE"><qti-simple-choice identifier="A">A</qti-simple-choice><qti-simple-choice identifier="B">B</qti-simple-choice></qti-choice-interaction>'
  })),error=>error?.code==='P2LRN_QTI_RESPONSE_PROCESSING_UNSUPPORTED');
});

test('QTI 3 refuses adaptive and multi-interaction items until their semantics are implemented',()=>{
  const choice='<qti-choice-interaction max-choices="1" response-identifier="RESPONSE"><qti-simple-choice identifier="A">A</qti-simple-choice><qti-simple-choice identifier="B">B</qti-simple-choice></qti-choice-interaction>';
  assert.throws(()=>parseQti3Item(item({adaptive:'true',body:choice})),error=>error?.code==='P2LRN_QTI_ADAPTIVE_UNSUPPORTED');
  assert.throws(()=>parseQti3Item(item({body:choice+choice})),error=>error?.code==='P2LRN_QTI_INTERACTION_UNSUPPORTED');
});

test('QTI 2 assessmentItem namespace is rejected by the QTI 3 runtime',()=>{
  const xml=`<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p2" identifier="old" title="QTI2" adaptive="false" timeDependent="false"><responseDeclaration identifier="RESPONSE" cardinality="single" baseType="identifier"><correctResponse><value>A</value></correctResponse></responseDeclaration><itemBody><choiceInteraction responseIdentifier="RESPONSE" maxChoices="1"><simpleChoice identifier="A">A</simpleChoice><simpleChoice identifier="B">B</simpleChoice></choiceInteraction></itemBody><responseProcessing template="http://www.imsglobal.org/question/qti_v2p2/rptemplates/match_correct"/></assessmentItem>`;
  assert.throws(()=>parseQti3Item(xml),error=>error?.code==='P2LRN_QTI_VERSION_UNSUPPORTED');
});

test('QTI state sanitizer keeps only known responses and valid persisted choice order',()=>{
  const model=parseQti3Item(item({body:'<qti-choice-interaction max-choices="1" response-identifier="RESPONSE"><qti-simple-choice identifier="A">A</qti-simple-choice><qti-simple-choice identifier="B">B</qti-simple-choice></qti-choice-interaction>'}));
  const state=sanitizeQti3State({version:'anything',response:['A'],choiceOrder:['B','A'],completed:true,score:{raw:1}},model);
  assert.equal(state.version,QTI3_STATE_VERSION);
  assert.deepEqual(state.response,['A']);
  assert.deepEqual(state.choiceOrder,['B','A']);
  assert.equal(state.completed,true);
});

test('renderer registry selects QTI 3 runtime for QTI XML package-member representation',async()=>{
  const registry=registerBuiltInRenderers(new RendererRegistry());
  const representation={id:'qti-rep',role:'primary',profile:'https://p2lrn.org/profile/qti',mediaType:'application/xml',location:{type:'package-member',package:'packages/sha256/aa/bb/hash',member:'items/item1.xml'}};
  const resource={id:'res',type:'resource',representations:[representation]};
  const entity={id:'act',type:'activity',activityType:'https://p2lrn.org/type/assessment-item',resource:'res'};
  const candidate=await registry.select({representations:[representation],entity,resource});
  assert.equal(candidate.descriptor.id,QTI3_RUNTIME_RENDERER);
  assert.equal(candidate.representation.id,'qti-rep');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectQTIItemCompatibility,P2LRN_QTI_SUPPORTED_INTERACTIONS} from '../web/qti-compatibility.js';

function element(localName,attributes={},children=[]){
  return {
    localName,
    getAttribute(name){return Object.hasOwn(attributes,name)?attributes[name]:null;},
    children,
    querySelectorAll(selector){
      assert.equal(selector,'*');
      const result=[],queue=[...this.children];
      while(queue.length){
        const child=queue.shift();result.push(child);queue.push(...child.children);
      }
      return result;
    },
  };
}
function doc(interactions,extra=[],tag='qti-assessment-item'){
  const declarations=interactions.map((node,index)=>{
    const id=node.getAttribute('responseIdentifier')??node.getAttribute('response-identifier')??'R'+index;
    return element('qti-response-declaration',{identifier:id});
  });
  return {documentElement:element(tag,{},[
    ...declarations,
    ...extra,
    element('qti-item-body',{},interactions),
  ])};
}
test('QTI 3 preflight enumerates only interactions actually supported in the Player',()=>{
  const supported=[
    element('qti-choice-interaction',{responseIdentifier:'R1'}),
    element('qti-inline-choice-interaction',{'response-identifier':'R2'}),
    element('qti-text-entry-interaction',{responseIdentifier:'R3'}),
    element('qti-extended-text-interaction',{responseIdentifier:'R4'}),
  ];
  const result=inspectQTIItemCompatibility(doc(supported,[element('qti-response-processing')]));
  assert.equal(result.supported,true);
  assert.equal(result.scope,'response-capture-only');
  assert.equal(result.responseProcessing,true,'responseProcessing is present but NOT executed');
  assert.equal(result.interactions.length,4);
  assert.equal(result.unsupported.length,0);
  assert.deepEqual([...P2LRN_QTI_SUPPORTED_INTERACTIONS].sort(),[
    'choiceinteraction','extendedtextinteraction','inlinechoiceinteraction','textentryinteraction',
  ].sort());
});
test('unsupported match/hotspot/ordering QTI interactions are blocked rather than shown as plain text',()=>{
  for(const name of ['qti-match-interaction','qti-hotspot-interaction','qti-order-interaction','qti-graphic-gap-match-interaction']){
    const result=inspectQTIItemCompatibility(doc([element(name,{responseIdentifier:'R1'})]));
    assert.equal(result.supported,false);
    assert.equal(result.reason,'P2LRN_QTI_INTERACTION_UNSUPPORTED');
    assert.equal(result.unsupported.length,1);
  }
});
test('QTI needs a matching response declaration and a unique interaction binding',()=>{
  const item=doc([element('qti-choice-interaction',{responseIdentifier:'MISSING'})]);
  item.documentElement.children.shift();
  const invalid=inspectQTIItemCompatibility(item);
  assert.equal(invalid.supported,false);
  assert.equal(invalid.reason,'P2LRN_QTI_RESPONSE_BINDING_INVALID');
  assert.equal(invalid.unbound.length,1);
  const duplicate=inspectQTIItemCompatibility(doc([
    element('qti-choice-interaction',{responseIdentifier:'R1'}),
    element('qti-choice-interaction',{responseIdentifier:'R1'}),
  ]));
  assert.equal(duplicate.supported,false);
  assert.equal(duplicate.duplicates.length,1);
});
test('QTI test-level document does not claim item-level delivery',()=>{
  const notItem=inspectQTIItemCompatibility(doc([],[],'qti-assessment-test'));
  assert.equal(notItem.supported,false);
  assert.equal(notItem.reason,'P2LRN_QTI_DOCUMENT_NOT_DELIVERABLE');
  const noBody={documentElement:element('qti-assessment-item',{},[
    element('qti-response-declaration',{identifier:'R1'}),
    element('qti-choice-interaction',{responseIdentifier:'R1'}),
  ])};
  const result=inspectQTIItemCompatibility(noBody);
  assert.equal(result.supported,false);
  assert.equal(result.reason,'P2LRN_QTI_INVALID_ITEM_BODY');
});
test('QTI preflight has bounded complexity on maliciously large imported XML trees',()=>{
  const item=doc([element('qti-choice-interaction',{responseIdentifier:'R1'})]);
  assert.throws(()=>inspectQTIItemCompatibility(item,{maxElements:1}),{
    code:'P2LRN_QTI_INSPECTION_LIMIT',
  });
});

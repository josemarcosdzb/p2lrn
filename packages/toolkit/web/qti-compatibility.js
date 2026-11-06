// Bounded QTI item-compatibility inspection for the reference Player.
// Rendering a partial subset as a complete QTI 3 assessment is forbidden.
export const P2LRN_QTI_SUPPORTED_INTERACTIONS=Object.freeze([
  'choiceinteraction',
  'inlinechoiceinteraction',
  'textentryinteraction',
  'extendedtextinteraction',
]);

function local(node){
  const value=String(node?.localName??node?.nodeName??'').toLowerCase();
  return (value.startsWith('qti-')?value.slice(4):value).replaceAll('-','');
}
function attribute(node,key){
  return node?.getAttribute?.(key)??node?.getAttribute?.(key.toLowerCase())??null;
}
/**
 * Inspects only the XML tree, never running responseProcessing or arbitrary
 * scripts. 'supported' means answers can be captured, NOT that QTI scoring,
 * outcomeProcessing, adaptive tests or testParts are implemented.
 */
export function inspectQTIItemCompatibility(document,{maxElements=50000}={}){
  const root=document?.documentElement;
  if(!root)throw new TypeError('QTI document element required.');
  const kind=local(root);
  const result={kind,supported:false,scope:'response-capture-only',
    interactions:[],unsupported:[],unbound:[],duplicates:[],
    responseProcessing:false,reason:null};
  if(kind!=='assessmentitem'){
    result.reason='P2LRN_QTI_DOCUMENT_NOT_DELIVERABLE';
    return Object.freeze({...result,interactions:Object.freeze([]),unsupported:Object.freeze([]),unbound:Object.freeze([]),duplicates:Object.freeze([])});
  }
  const nodes=[...(root.querySelectorAll?.('*')??[])];
  if(nodes.length>maxElements||!Number.isInteger(maxElements)||maxElements<1){
    const error=new Error('QTI document exceeds safe compatibility inspection bounds.');
    error.code='P2LRN_QTI_INSPECTION_LIMIT';
    throw error;
  }
  const declared=new Set();
  for(const node of nodes){
    const name=local(node);
    if(name==='responsedeclaration'){
      const id=attribute(node,'identifier');
      if(id)declared.add(id);
    }
    if(name==='responseprocessing')result.responseProcessing=true;
  }
  const seen=new Set();
  let bodyCount=0;
  for(const node of nodes){
    const name=local(node);
    if(name==='itembody')bodyCount++;
    if(!name.endsWith('interaction'))continue;
    const responseIdentifier=attribute(node,'responseIdentifier')??attribute(node,'response-identifier');
    if(!P2LRN_QTI_SUPPORTED_INTERACTIONS.includes(name))
      result.unsupported.push({name,responseIdentifier:responseIdentifier??null});
    else if(!responseIdentifier||!declared.has(responseIdentifier))
      result.unbound.push({name,responseIdentifier:responseIdentifier??null});
    else if(seen.has(responseIdentifier))
      result.duplicates.push({name,responseIdentifier});
    else{
      seen.add(responseIdentifier);
      result.interactions.push({name,responseIdentifier});
    }
  }
  if(bodyCount!==1)result.reason='P2LRN_QTI_INVALID_ITEM_BODY';
  else if(result.unsupported.length)result.reason='P2LRN_QTI_INTERACTION_UNSUPPORTED';
  else if(result.unbound.length||result.duplicates.length)result.reason='P2LRN_QTI_RESPONSE_BINDING_INVALID';
  else if(!result.interactions.length)result.reason='P2LRN_QTI_NO_SUPPORTED_INTERACTION';
  else result.supported=true;
  return Object.freeze({
    ...result,
    interactions:Object.freeze(result.interactions.map(x=>Object.freeze(x))),
    unsupported:Object.freeze(result.unsupported.map(x=>Object.freeze(x))),
    unbound:Object.freeze(result.unbound.map(x=>Object.freeze(x))),
    duplicates:Object.freeze(result.duplicates.map(x=>Object.freeze(x))),
  });
}

// Messages from SCORM/H5P content are untrusted even when the enclosing
// iframe's origin/source and MessageChannel are already verified.
const MAX_RUNTIME_MESSAGE_BYTES=2*1024*1024;
const MAX_RUNTIME_MESSAGE_NODES=20000;
const MAX_RUNTIME_MESSAGE_DEPTH=48;
const forbiddenKeys=new Set(['__proto__','constructor','prototype']);
const encoder=new TextEncoder();

export function isSafeRuntimeMessage(value,{
  maxBytes=MAX_RUNTIME_MESSAGE_BYTES,
  maxNodes=MAX_RUNTIME_MESSAGE_NODES,
  maxDepth=MAX_RUNTIME_MESSAGE_DEPTH,
}={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     (Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))
    return false;
  if(typeof value.protocol!=='string'||value.protocol.length>128||
     typeof value.action!=='string'||value.action.length>64)
    return false;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1024||
     !Number.isSafeInteger(maxNodes)||maxNodes<1||
     !Number.isSafeInteger(maxDepth)||maxDepth<1)return false;
  const seen=new Set(),stack=[[value,0]];
  let nodes=0,bytes=0;
  while(stack.length){
    const [item,depth]=stack.pop();
    if(++nodes>maxNodes||depth>maxDepth)return false;
    if(item===null){bytes+=4;continue;}
    const type=typeof item;
    if(type==='undefined')continue; // Structured-clone messages may omit optional values.
    if(type==='string'){
      if(item.length>maxBytes-bytes)return false;
      bytes+=encoder.encode(item).byteLength;
      if(bytes>maxBytes)return false;
      continue;
    }
    if(type==='number'){if(!Number.isFinite(item))return false;bytes+=32;continue;}
    if(type==='boolean'){bytes+=5;continue;}
    if(type!=='object'||seen.has(item))return false;
    seen.add(item);
    if(!Array.isArray(item)){
      const proto=Object.getPrototypeOf(item);
      if(proto!==Object.prototype&&proto!==null)return false;
      const entries=Object.entries(item);
      if(entries.length>maxNodes-nodes)return false;
      for(const [key,child] of entries){
        if(forbiddenKeys.has(key)||key.length>maxBytes-bytes)return false;
        bytes+=encoder.encode(key).byteLength+4;
        stack.push([child,depth+1]);
      }
    }else{
      if(item.length>maxNodes-nodes)return false;
      for(const child of item)stack.push([child,depth+1]);
    }
    if(bytes>maxBytes||stack.length>maxNodes)return false;
  }
  return bytes<=maxBytes;
}

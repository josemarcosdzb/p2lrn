// One deterministic undo/redo stack for all edits to a Studio HTML lesson.
// Browser-native execCommand undo does not capture programmatic inserts or styles.
const MAX_STEPS=100;
const MAX_HISTORY_BYTES=48*1024*1024;
const MAX_SNAPSHOT_BYTES=16*1024*1024;
const TYPING_WINDOW_MS=650;

export function createStudioHistory({onChange=()=>{},onApply=()=>{}}={}){
  const documents=new Map();
  const mediaToToken=new Map(),tokenToMedia=new Map();
  let nextMedia=0;
  const toStored=(html)=>html.replace(/\b(src|poster)=(['"])(data:(?:image|video|audio)\/[a-z\d.+-]+;base64,[a-z\d+/=]+)\2/gi,(_full,attribute,quote,uri)=>{
    let token=mediaToToken.get(uri);
    if(!token){token='p2lrn-history-media:'+ ++nextMedia;mediaToToken.set(uri,token);tokenToMedia.set(token,uri);}
    return attribute+'='+quote+token+quote;
  });
  const fromStored=(html)=>html.replace(/\b(src|poster)=(['"])(p2lrn-history-media:[0-9]+)\2/gi,(full,attribute,quote,token)=>{
    const uri=tokenToMedia.get(token);return uri?attribute+'='+quote+uri+quote:full;
  });
  let activeSurface=null;
  let activeKey=null;
  let restoring=false;
  let usedBytes=0;
  const countBytes=html=>html.length*2;
  // Editor-only empty caret paragraphs must not become separate undo steps
  // when leaving Player preview and reconstructing the authoring surface.
  const semanticHtml=html=>html.replace(/<p\b(?=[^>]*\bdata-p2lrn-end-caret(?:=(?:"[^"]*"|'[^']*'))?)[^>]*>(?:\s|<br\s*\/?\s*>)*<\/p>/gi,'');
  const sameHtml=(a,b)=>semanticHtml(a)===semanticHtml(b);
  function notify(){onChange({canUndo:canUndo(),canRedo:canRedo(),key:activeKey});}
  function keyFor(surface){
    return surface?.dataset?.studioHtmlKey || surface?.dataset?.studioHtmlSurfaceKey || 'lesson';
  }
  function snapshot(surface,kind='initial'){
    return {html:toStored(surface.innerHTML),kind,at:Date.now()};
  }
  function state(){
    return activeKey===null?null:documents.get(activeKey)||null;
  }
  function activate(surface){
    if(!surface?.isContentEditable)return false;
    const key=keyFor(surface);
    activeSurface=surface;
    activeKey=key;
    let history=documents.get(key);
    if(!history){
      const initial=snapshot(surface);
      history={items:[initial],index:0};
      documents.set(key,history);
      usedBytes+=countBytes(initial.html);
    }else if(!sameHtml(history.items[history.index].html,toStored(surface.innerHTML))){
      record(surface,{kind:'external'});
    }
    notify();return true;
  }
  function ensure(surface){
    if(!surface?.isContentEditable)return false;
    if(activeSurface!==surface||activeKey!==keyFor(surface))return activate(surface);
    return true;
  }
  function capSize(current){
    while(current.items.length>MAX_STEPS){
      const removed=current.items.shift();usedBytes-=countBytes(removed.html);current.index--;
    }
    // Preserve the current history anchor. Drop the oldest undo steps first,
    // and never discard the only valid snapshot of a lesson.
    while(usedBytes>MAX_HISTORY_BYTES&&current.items.length>1&&current.index>0){
      const removed=current.items.shift();usedBytes-=countBytes(removed.html);current.index--;
    }
  }
  function record(surface,{kind='edit'}={}){
    if(restoring||!ensure(surface))return false;
    const current=state(),html=toStored(surface.innerHTML);
    if(sameHtml(current.items[current.index].html,html))return false;
    const size=countBytes(html);
    if(size>MAX_SNAPSHOT_BYTES){
      // Still preserve the last valid snapshot and current lesson data. The
      // editor must never block edits just because the author embedded media.
      current.items=[snapshot(surface,'large')];current.index=0;
      usedBytes=0;for(const doc of documents.values())for(const item of doc.items)usedBytes+=countBytes(item.html);
      notify();return true;
    }
    for(const extra of current.items.slice(current.index+1))usedBytes-=countBytes(extra.html);
    current.items.length=current.index+1;
    const previous=current.items[current.index];
    const typing=kind==='typing'&&previous.kind==='typing'&&Date.now()-previous.at<TYPING_WINDOW_MS&&current.index>0;
    if(typing){
      usedBytes-=countBytes(previous.html);
      current.items[current.index]=snapshot(surface,'typing');
    }else{
      current.items.push(snapshot(surface,kind));current.index++;
    }
    usedBytes+=size;capSize(current);notify();return true;
  }
  function canUndo(){const current=state();return !!current&&current.index>0;}
  function canRedo(){const current=state();return !!current&&current.index<current.items.length-1;}
  function apply(direction){
    if(!activeSurface?.isContentEditable)return false;
    const current=state();
    const index=current?.index+direction;
    if(!current||index<0||index>=current.items.length)return false;
    current.index=index;
    restoring=true;
    try{
      activeSurface.innerHTML=fromStored(current.items[index].html);
      // Persist the restored HTML through the existing Studio authoring model.
      // The capture listener must ignore this synthetic input while restoring.
      activeSurface.dispatchEvent(new Event('input',{bubbles:true}));
      onApply(activeSurface);
    }finally{restoring=false;}
    notify();return true;
  }
  function undo(surface=activeSurface){if(surface)ensure(surface);return apply(-1);}
  function redo(surface=activeSurface){if(surface)ensure(surface);return apply(1);}
  function reset(){
    documents.clear();mediaToToken.clear();tokenToMedia.clear();nextMedia=0;
    activeSurface=null;activeKey=null;usedBytes=0;restoring=false;notify();
  }
  return {activate,record,undo,redo,reset,canUndo,canRedo,get restoring(){return restoring;},
    get activeKey(){return activeKey;},get size(){return state()?.items.length??0;}};
}

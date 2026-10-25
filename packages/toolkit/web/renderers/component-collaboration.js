import {dispatchRuntimeEvent} from '../runtime-events.js';

const CAPABILITY='collaboration.room';
const OPERATIONS=['join','send','listen','snapshot','leave'];

function el(tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
}
function button(text,onClick,className='p2lrn-collaboration-button'){
  const b=el('button',className,text);b.type='button';b.addEventListener('click',onClick);return b;
}
function hasCapability(capabilities){
  const status=(capabilities??[]).find((item)=>item.id===CAPABILITY);
  return Boolean(status?.available && OPERATIONS.every((op)=>status.operations?.includes(op)));
}

function fallback(container,data,eventTarget,adapter,context){
  const shell=el('section','p2lrn-collaboration p2lrn-collaboration-fallback');
  if(data.heading)shell.append(el('h3',null,data.heading));
  shell.append(el('p','p2lrn-collaboration-prompt',data.prompt||'Actividad colaborativa'));
  const status=el('p','p2lrn-collaboration-status',data.fallbackText||'La colaboración no está disponible. Puedes continuar de forma individual.');
  status.setAttribute('role','status');shell.append(status);
  if(data.mode==='poll'){
    const field=document.createElement('fieldset');field.className='p2lrn-collaboration-poll';
    const radioGroup='p2lrn-local-'+String(context?.entityId??'activity').replace(/[^A-Za-z0-9_-]/g,'-');
    field.append(el('legend',null,data.prompt||'Elige una opción'));
    for(const option of data.options??[]){
      const label=el('label','p2lrn-collaboration-option');
      const input=document.createElement('input');input.type='radio';input.name=radioGroup;input.value=option.id;
      label.append(input,document.createTextNode(option.label));field.append(label);
    }
    shell.append(field,button('Guardar respuesta individual',()=>{
      const selected=field.querySelector('input:checked');
      if(!selected)return;
      dispatchRuntimeEvent(eventTarget,'p2lrn:interaction',{action:'collaboration-fallback-response',mode:'poll',choiceId:selected.value,connected:false},context,{adapter});
    }));
  }else{
    const label=el('label','p2lrn-collaboration-field');label.append(el('span',null,data.mode==='peer-review'?'Reflexión individual':'Nota individual'));
    const area=document.createElement('textarea');area.rows=4;label.append(area);shell.append(label);
  }
  container.append(shell);
  dispatchRuntimeEvent(eventTarget,'p2lrn:activityready',{kind:'collaboration',mode:data.mode,available:false},context,{adapter});
  return {destroy(){shell.remove();}};
}

export async function render({container,componentInstance,capabilities=[],invokeCapability,eventTarget,adapter,context}){
  const data=componentInstance?.data??{};
  if(!hasCapability(capabilities)||typeof invokeCapability!=='function')return fallback(container,data,eventTarget,adapter,context);

  const shell=el('section','p2lrn-collaboration');
  const header=el('header','p2lrn-collaboration-head');
  if(data.heading)header.append(el('h3',null,data.heading));
  if(data.prompt)header.append(el('p','p2lrn-collaboration-prompt',data.prompt));
  const status=el('p','p2lrn-collaboration-status','Conectando…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  header.append(status);shell.append(header);
  const body=el('div','p2lrn-collaboration-body');shell.append(body);container.append(shell);

  let destroyed=false,timer=null,session=null,cursor=0,presence=0;
  const votes=new Map(),board=new Map(),submissions=new Map(),reviews=new Map();
  let myVote=null,mySubmissionId=null;

  const emit=(action,payload={})=>dispatchRuntimeEvent(eventTarget,'p2lrn:interaction',{action,mode:data.mode,room:data.room,...payload},context,{adapter});
  const apply=(event)=>{
    if(!event||typeof event!=='object')return;
    cursor=Math.max(cursor,Number(event.revision)||0);
    const actor=String(event.participantId??'');
    if(event.type==='poll.vote'){
      const choice=String(event.payload?.choiceId??'');
      if(choice)votes.set(actor,choice);
      if(actor===session?.participantId)myVote=choice;
    }else if(event.type==='board.upsert'){
      const id=String(event.payload?.itemId??''),text=String(event.payload?.text??'').trim();
      if(id&&text)board.set(id,{id,text,participantId:actor});
    }else if(event.type==='board.delete'){
      board.delete(String(event.payload?.itemId??''));
    }else if(event.type==='peer.submission'){
      const id=String(event.payload?.submissionId??''),text=String(event.payload?.text??'').trim();
      if(id&&text){submissions.set(id,{id,text,participantId:actor});if(actor===session?.participantId)mySubmissionId=id;}
    }else if(event.type==='peer.review'){
      const id=String(event.payload?.submissionId??''),text=String(event.payload?.text??'').trim();
      if(id&&text){const list=reviews.get(id)??[];list.push({participantId:actor,text});reviews.set(id,list);}
    }
  };
  const applyMany=(events)=>{for(const event of events??[])apply(event);};

  const send=async(type,payload)=>{
    try{
      const result=await invokeCapability(CAPABILITY,'send',{sessionId:session.sessionId,type,payload});
      if(result?.event)apply(result.event);
      presence=Number(result?.presence??presence);cursor=Math.max(cursor,Number(result?.revision??cursor));renderView();
      return result;
    }catch(error){
      status.textContent='No se pudo sincronizar. Se volverá a intentar al recibir cambios.';
      dispatchRuntimeEvent(eventTarget,'p2lrn:error',{phase:'collaboration-send',mode:data.mode,error:String(error?.message??error)},context,{adapter});
      return null;
    }
  };

  const renderPoll=()=>{
    const field=document.createElement('fieldset');field.className='p2lrn-collaboration-poll';
    const radioGroup='p2lrn-collab-'+String(context?.entityId??'activity').replace(/[^A-Za-z0-9_-]/g,'-');
    field.append(el('legend',null,data.prompt||'Elige una opción'));
    for(const option of data.options??[]){
      const label=el('label','p2lrn-collaboration-option');
      const radio=document.createElement('input');radio.type='radio';radio.name=radioGroup;radio.value=option.id;radio.checked=myVote===option.id;
      if(myVote&&!data.allowChange)radio.disabled=true;
      label.append(radio,document.createTextNode(option.label));field.append(label);
    }
    const submit=button(myVote&&data.allowChange?'Cambiar voto':'Enviar voto',async()=>{
      const selected=field.querySelector('input:checked');if(!selected)return;
      submit.disabled=true;
      try{const sent=await send('poll.vote',{choiceId:selected.value});if(sent)emit('collaboration-vote',{choiceId:selected.value});}
      finally{submit.disabled=false;}
    });
    if(myVote&&!data.allowChange)submit.disabled=true;
    body.append(field,submit);
    if(data.showResults!==false){
      const results=el('div','p2lrn-collaboration-results');results.append(el('strong',null,'Resultados'));
      const total=votes.size;
      for(const option of data.options??[]){
        const count=[...votes.values()].filter((value)=>value===option.id).length;
        const row=el('div','p2lrn-collaboration-result');
        const label=el('span',null,option.label+' · '+count);
        const progress=document.createElement('progress');progress.max=Math.max(1,total);progress.value=count;progress.setAttribute('aria-label',option.label+': '+count+' de '+total);
        row.append(label,progress);results.append(row);
      }
      body.append(results);
    }
  };

  const renderBoard=()=>{
    const form=el('div','p2lrn-collaboration-compose');
    const label=el('label','p2lrn-collaboration-field');label.append(el('span',null,'Añadir idea'));
    const area=document.createElement('textarea');area.rows=3;area.maxLength=4000;label.append(area);
    const add=button('Compartir',async()=>{
      const text=area.value.trim();if(!text)return;add.disabled=true;
      try{const itemId=globalThis.crypto?.randomUUID?.()??('item-'+Date.now());const sent=await send('board.upsert',{itemId,text});if(sent){area.value='';emit('collaboration-board-add');}}
      finally{add.disabled=false;}
    });
    form.append(label,add);body.append(form);
    const list=el('ul','p2lrn-collaboration-board');
    for(const item of board.values()){
      const li=el('li','p2lrn-collaboration-note');li.append(el('p',null,item.text));
      if(item.participantId===session.participantId)li.append(button('Eliminar',()=>void send('board.delete',{itemId:item.id}).then((sent)=>{if(sent)emit('collaboration-board-delete');}),'p2lrn-collaboration-link'));
      list.append(li);
    }
    body.append(list);
  };

  const renderPeer=()=>{
    if(!mySubmissionId){
      const label=el('label','p2lrn-collaboration-field');label.append(el('span',null,'Tu aportación'));
      const area=document.createElement('textarea');area.rows=5;area.maxLength=10000;label.append(area);
      const submit=button('Enviar aportación',async()=>{
        const text=area.value.trim();if(!text)return;
        const submissionId=globalThis.crypto?.randomUUID?.()??('submission-'+Date.now());
        const sent=await send('peer.submission',{submissionId,text});if(sent)emit('collaboration-peer-submit');
      });
      body.append(label,submit);
    }else body.append(el('p','p2lrn-collaboration-confirm','Tu aportación está compartida.'));

    const others=[...submissions.values()].filter((item)=>item.participantId!==session.participantId);
    if(others.length){
      const section=el('section','p2lrn-collaboration-peer');section.append(el('h4',null,'Revisar aportaciones'));
      others.forEach((item,index)=>{
        const card=el('article','p2lrn-collaboration-peer-card');card.append(el('strong',null,'Aportación '+(index+1)),el('p',null,item.text));
        const area=document.createElement('textarea');area.rows=3;area.maxLength=5000;area.setAttribute('aria-label','Comentario para la aportación '+(index+1));
        const sendReview=button('Enviar comentario',async()=>{const text=area.value.trim();if(!text)return;const sent=await send('peer.review',{submissionId:item.id,text});if(sent){area.value='';emit('collaboration-peer-review');}});
        card.append(area,sendReview);section.append(card);
      });
      body.append(section);
    }
    const mine=reviews.get(mySubmissionId)??[];
    if(mine.length){
      const received=el('section','p2lrn-collaboration-received');received.append(el('h4',null,'Comentarios recibidos'));
      const list=el('ul');mine.forEach((review)=>list.append(el('li',null,review.text)));received.append(list);body.append(received);
    }
  };

  function renderView(){
    if(destroyed)return;
    status.textContent=presence+' participante'+(presence===1?'':'s')+' conectado'+(presence===1?'':'s');
    body.replaceChildren();
    if(data.mode==='board')renderBoard();
    else if(data.mode==='peer-review')renderPeer();
    else renderPoll();
  }

  try{
    session=await invokeCapability(CAPABILITY,'join',{room:data.room||'main'});
    presence=Number(session?.presence)||1;cursor=Number(session?.revision)||0;
    const snap=await invokeCapability(CAPABILITY,'snapshot',{sessionId:session.sessionId});
    presence=Number(snap?.presence??presence);applyMany(snap?.events);cursor=Math.max(cursor,Number(snap?.revision)||0);renderView();
    dispatchRuntimeEvent(eventTarget,'p2lrn:activityready',{kind:'collaboration',mode:data.mode,available:true,presence},context,{adapter});
  }catch(error){
    shell.remove();return fallback(container,data,eventTarget,adapter,context);
  }

  const poll=async()=>{
    if(destroyed)return;
    try{
      let more=true;
      while(more&&!destroyed){
        const result=await invokeCapability(CAPABILITY,'listen',{sessionId:session.sessionId,cursor});
        presence=Number(result?.presence??presence);applyMany(result?.events);cursor=Math.max(cursor,Number(result?.revision)||0);more=result?.hasMore===true;
      }
      renderView();
    }catch{
      status.textContent='Reconectando colaboración…';
    }finally{
      if(!destroyed)timer=setTimeout(poll,800);
    }
  };
  timer=setTimeout(poll,300);

  return {destroy(){
    destroyed=true;if(timer)clearTimeout(timer);
    const id=session?.sessionId;session=null;
    if(id)void invokeCapability(CAPABILITY,'leave',{sessionId:id}).catch(()=>undefined);
    shell.remove();
  }};
}

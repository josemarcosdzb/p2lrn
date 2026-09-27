import {dispatchRuntimeEvent} from '../runtime-events.js';
import {parseQti3Item,QTI3_STATE_VERSION,sanitizeQti3State,scoreQti3Response} from '../qti3-core.js';

export const stylesheets=[new URL('../qti3.css',import.meta.url).href];

function el(tag,attrs={},text=null){
  const node=document.createElement(tag);
  for(const [name,value] of Object.entries(attrs)){
    if(value==null)continue;
    if(name==='class')node.className=String(value);
    else if(name==='type')node.type=String(value);
    else if(name==='disabled')node.disabled=Boolean(value);
    else node.setAttribute(name,String(value));
  }
  if(text!==null)node.textContent=String(text);
  return node;
}
function hashText(value){
  let hash=2166136261;
  for(const ch of String(value??'')){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function randomFromSeed(seed){
  let state=seed||0x9e3779b9;
  return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
}
function shuffledChoices(item,context,state){
  if(item.interaction.type!=='choice')return[];
  if(Array.isArray(state.choiceOrder)){
    const byId=new Map(item.interaction.choices.map(x=>[x.id,x]));
    return state.choiceOrder.map(id=>byId.get(id)).filter(Boolean);
  }
  const original=[...item.interaction.choices];
  if(!item.interaction.shuffle){
    state.choiceOrder=original.map(x=>x.id);
    return original;
  }
  const movableIndexes=original.map((choice,index)=>choice.fixed?null:index).filter(index=>index!==null);
  const movable=movableIndexes.map(index=>original[index]);
  const random=randomFromSeed(hashText(`${context?.contentRoot??''}|${context?.entityId??''}|${item.identifier}`));
  for(let i=movable.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[movable[i],movable[j]]=[movable[j],movable[i]];}
  movableIndexes.forEach((index,i)=>{original[index]=movable[i];});
  state.choiceOrder=original.map(x=>x.id);
  return original;
}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

class Qti3Runtime{
  constructor({container,item,eventTarget,adapter,context}){
    this.container=container;this.item=item;this.eventTarget=eventTarget;this.adapter=adapter;this.context=context;
    this.state=sanitizeQti3State(null,item);this.destroyed=false;this.saveQueue=Promise.resolve();this.notice='';
  }
  emit(type,payload={}){return dispatchRuntimeEvent(this.eventTarget,type,{runtime:'qti3',...payload},this.context,{adapter:this.adapter});}
  async mount(){
    if(this.adapter?.loadState){
      try{this.state=sanitizeQti3State(await this.adapter.loadState({...this.context,runtime:'qti3'}),this.item);}
      catch(error){this.emit('p2lrn:error',{phase:'qti3-load-state',error:String(error?.message??error)});}
    }
    shuffledChoices(this.item,this.context,this.state);
    this.save();
    this.render();
    this.emit('p2lrn:activityready',{title:this.item.title,itemIdentifier:this.item.identifier,interactionType:this.item.interaction.type});
    return this;
  }
  save(){
    const snapshot=clone(this.state);
    this.emit('p2lrn:statechange',{state:snapshot});
    if(this.adapter?.saveState){
      this.saveQueue=this.saveQueue.catch(()=>undefined).then(()=>this.adapter.saveState(snapshot,{...this.context,runtime:'qti3'})).catch(error=>this.emit('p2lrn:error',{phase:'qti3-save-state',error:String(error?.message??error)}));
    }
  }
  setResponse(response){
    if(this.state.completed)return;
    this.state.response=clone(response);delete this.state.score;this.notice='';
    this.emit('p2lrn:answer',{response:clone(response),responseIdentifier:this.item.interaction.responseIdentifier});
    this.emit('p2lrn:progress',{value:this.hasMeaningfulResponse()?1:0});
    this.save();
  }
  hasMeaningfulResponse(){
    return this.item.interaction.type==='choice'?Array.isArray(this.state.response)&&this.state.response.length>0:String(this.state.response??'').trim().length>0;
  }
  async submit(){
    const interaction=this.item.interaction;
    if(interaction.type==='choice'){
      const selected=Array.isArray(this.state.response)?this.state.response:[];
      if(selected.length<interaction.minChoices){this.notice=`Selecciona al menos ${interaction.minChoices} opción${interaction.minChoices===1?'':'es'}.`;this.render();return null;}
      if(selected.length>interaction.maxChoices){this.notice=`Selecciona como máximo ${interaction.maxChoices} opción${interaction.maxChoices===1?'':'es'}.`;this.render();return null;}
    }else if(!this.hasMeaningfulResponse()){
      this.notice='Introduce una respuesta antes de finalizar.';this.render();return null;
    }
    const score=scoreQti3Response(this.item,this.state.response);
    this.emit('p2lrn:answer',{response:clone(this.state.response),responseIdentifier:this.item.interaction.responseIdentifier,itemIdentifier:this.item.identifier,final:true});
    this.state.completed=true;this.state.score=score;this.notice='';this.save();
    this.emit('p2lrn:score',score);
    if(this.adapter?.reportScore){
      try{await this.adapter.reportScore(score,{...this.context,runtime:'qti3'});}
      catch(error){this.emit('p2lrn:error',{phase:'qti3-report-score',error:String(error?.message??error)});}
    }
    this.emit('p2lrn:complete',{score,response:clone(this.state.response),itemIdentifier:this.item.identifier});
    this.render();
    return score;
  }
  render(){
    if(this.destroyed)return;
    this.container.replaceChildren();
    const shell=el('section',{class:'p2lrn-qti3'});
    const header=el('header',{class:'p2lrn-qti3-header'});
    header.append(el('h2',{},this.item.title));
    if(this.item.bodyLead)header.append(el('p',{class:'p2lrn-qti3-lead'},this.item.bodyLead));
    shell.append(header);
    if(this.notice)shell.append(el('p',{class:'p2lrn-qti3-notice',role:'alert'},this.notice));
    if(this.state.completed&&this.state.score){
      const result=el('section',{class:'p2lrn-qti3-result','aria-live':'polite'});
      result.append(el('h3',{},'Resultado'),el('p',{},this.state.score.correct?'Respuesta correcta':'Respuesta incorrecta'));
      shell.append(result);this.container.append(shell);return;
    }
    const prompt=el('h3',{class:'p2lrn-qti3-prompt'},this.item.interaction.prompt);
    shell.append(prompt);
    if(this.item.interaction.type==='choice')shell.append(this.renderChoices());
    else shell.append(this.renderText());
    const actions=el('div',{class:'p2lrn-qti3-actions'});
    const submit=el('button',{type:'button',class:'primary'},'Finalizar');
    submit.addEventListener('click',()=>void this.submit());actions.append(submit);shell.append(actions);
    this.container.append(shell);
  }
  renderChoices(){
    const field=el('fieldset',{class:'p2lrn-qti3-choices'});
    field.append(el('legend',{class:'p2lrn-sr-only'},this.item.interaction.prompt));
    const selected=new Set(Array.isArray(this.state.response)?this.state.response:[]);
    const choices=shuffledChoices(this.item,this.context,this.state);
    for(const choice of choices){
      const label=el('label',{class:'p2lrn-qti3-choice'}),input=el('input',{type:this.item.interaction.maxChoices===1?'radio':'checkbox'});
      input.name=`qti-${this.item.identifier}-${this.item.interaction.responseIdentifier}`;input.value=choice.id;input.checked=selected.has(choice.id);
      input.addEventListener('change',()=>{
        if(this.item.interaction.maxChoices===1){this.setResponse(input.checked?[choice.id]:[]);this.render();return;}
        const next=new Set(Array.isArray(this.state.response)?this.state.response:[]);
        if(input.checked){
          if(next.size>=this.item.interaction.maxChoices){input.checked=false;this.notice=`Máximo ${this.item.interaction.maxChoices} opciones.`;this.render();return;}
          next.add(choice.id);
        }else next.delete(choice.id);
        this.setResponse([...next]);
      });
      label.append(input,el('span',{},choice.text));field.append(label);
    }
    return field;
  }
  renderText(){
    const extended=this.item.interaction.type==='extended-text';
    const input=el(extended?'textarea':'input',{class:'p2lrn-qti3-text',...(extended?{}:{type:'text'})});
    input.value=String(this.state.response??'');
    if(this.item.interaction.expectedLength&&!extended)input.setAttribute('size',String(Math.min(120,Math.max(1,this.item.interaction.expectedLength))));
    if(this.item.interaction.placeholderText)input.setAttribute('placeholder',this.item.interaction.placeholderText);
    if(this.item.interaction.patternMask&&!extended)input.setAttribute('pattern',this.item.interaction.patternMask);
    input.addEventListener('input',()=>this.setResponse(input.value));
    return input;
  }
  flush(){return this.saveQueue;}
  destroy(){this.destroyed=true;this.container.replaceChildren();}
}

export async function render({container,bytes,eventTarget,adapter,context}){
  let xml;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{const error=new Error('QTI item is not valid UTF-8.');error.code='P2LRN_QTI_INVALID_XML';throw error;}
  const item=parseQti3Item(xml);
  const runtime=new Qti3Runtime({container,item,eventTarget,adapter,context});
  return runtime.mount();
}

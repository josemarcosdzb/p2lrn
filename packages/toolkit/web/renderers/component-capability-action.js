import {dispatchRuntimeEvent} from '../runtime-events.js';

function resultText(value,max=50000) {
  if (typeof value === 'string') return value.slice(0,max);
  for (const key of ['text','message','output']) if (typeof value?.[key] === 'string') return value[key].slice(0,max);
  if (Array.isArray(value?.content)) {
    const text=value.content.map((item)=>typeof item==='string'?item:(typeof item?.text==='string'?item.text:'')).filter(Boolean).join('\n');
    if(text)return text.slice(0,max);
  }
  try { return JSON.stringify(value,null,2).slice(0,max); } catch { return String(value).slice(0,max); }
}

export async function render({container,componentInstance,capabilities=[],invokeCapability,eventTarget,adapter,context}) {
  const data=componentInstance?.data ?? {};
  const card=document.createElement('article');card.className='p2lrn-component-capability';
  if(data.heading){const h=document.createElement('h3');h.textContent=data.heading;card.append(h);}
  if(data.body){const p=document.createElement('p');p.textContent=data.body;card.append(p);}
  const status=(capabilities??[]).find((item)=>item.id===data.capability)??null;
  const available=Boolean(status?.available && status.operations?.includes(data.operation) && typeof invokeCapability==='function');
  const button=document.createElement('button');button.type='button';button.className='p2lrn-capability-action';button.textContent=data.buttonLabel||'Ejecutar';
  const output=document.createElement('div');output.className='p2lrn-capability-output';output.hidden=true;output.setAttribute('aria-live','polite');
  const label=document.createElement('strong');label.textContent=data.resultLabel||'Resultado';
  const pre=document.createElement('pre');output.append(label,pre);
  const fallback=document.createElement('p');fallback.className='p2lrn-capability-fallback';fallback.textContent=data.fallbackText||'Esta función necesita una capacidad compatible del host.';
  if(!available){button.disabled=true;card.append(button,fallback);}else{
    card.append(button,output);
    button.addEventListener('click',async()=>{
      button.disabled=true;button.setAttribute('aria-busy','true');output.hidden=false;pre.textContent='Procesando…';
      try{
        const result=await invokeCapability(data.capability,data.operation,{instruction:data.instruction??'',restrictions:data.restrictions??{},component:{id:componentInstance.component.id,componentVersion:componentInstance.component.componentVersion,dataVersion:componentInstance.component.dataVersion}});
        pre.textContent=resultText(result,Number.isInteger(data.restrictions?.maxOutputChars)?data.restrictions.maxOutputChars:50000);
      }catch(error){
        pre.textContent=data.fallbackText||'La capacidad conectada no está disponible.';
        dispatchRuntimeEvent(eventTarget,'p2lrn:error',{phase:'capability-action',capability:data.capability,operation:data.operation,error:String(error?.message??error)},context,{adapter});
      }finally{button.disabled=false;button.removeAttribute('aria-busy');}
    });
  }
  container.append(card);
  dispatchRuntimeEvent(eventTarget,'p2lrn:activityready',{componentId:componentInstance.component.id,componentVersion:componentInstance.component.componentVersion,dataVersion:componentInstance.component.dataVersion,capability:data.capability,operation:data.operation,available},context,{adapter});
  return {destroy(){card.remove();}};
}

import {compositeNavigationForMode} from '../native-composite-core.js';
import {studioUiText} from './studio-ui-i18n.js';

const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=studioUiText(text);return el;};
const labeled=(label,control)=>{const wrap=node('label','q-field');wrap.append(node('span','q-label',label),control);return wrap;};
const input=(value='')=>{const el=document.createElement('input');el.type='text';el.value=value??'';return el;};
const textarea=(value='')=>{const el=document.createElement('textarea');el.value=value??'';return el;};
const select=(value,options)=>{const el=document.createElement('select');for(const [v,label] of options){const o=document.createElement('option');o.value=v;o.textContent=studioUiText(label);o.selected=v===value;el.append(o);}return el;};
const button=(label,action,className='q-mini')=>{const el=node('button',className,label);el.type='button';el.addEventListener('click',action);return el;};
const titleOf=(model,id)=>model?.title?.(id)??model?.entity?.(id)?.id??id;

export function renderStructuredVisualEditor(container,options={}){
  const {model,activityId,mediaType,payload,onChange,onStatus,onStructureChange,onSelectActivity,onCreateChild}=options;
  const report=(message)=>onStatus?.(studioUiText(message));
  container.replaceChildren();
  const isComponent=mediaType==='application/vnd.p2lrn.component+json';
  const isComposite=mediaType==='application/vnd.p2lrn.composite+json';
  const componentDescriptor=isComponent?model.componentCatalog?.().find((entry)=>entry.id===payload.component?.id):null;

  if(isComposite){
    const normalizedMode=payload.mode==='parallel'?'free':payload.mode;
    if(normalizedMode==='sequence'||normalizedMode==='free'){
      const navigation=compositeNavigationForMode(normalizedMode);
      if(payload.mode!==normalizedMode||payload.navigation!==navigation){
        payload.mode=normalizedMode;
        payload.navigation=navigation;
        model.setStructuredJson(activityId,payload);
        onChange?.();
        report('Navegación del grupo ajustada a su recorrido.');
      }
    }
  }

  const rerender=()=>renderStructuredVisualEditor(container,{...options,payload});
  const root=node('div','questionnaire-visual-editor structured-visual-editor');
  const head=node('div','q-editor-head');
  const copy=node('div');
  const kicker=isComponent?'Componente':'Grupo de actividades';
  copy.append(
    node('span','q-kicker',kicker),
    node('h2',null,payload.title||(isComponent?(componentDescriptor?.authoring?.label||'Componente'):'Grupo de actividades')),
    node('p',null,isComponent?(componentDescriptor?.authoring?.description||'Edita el componente con controles visuales.'):'Agrupa varias actividades y define cómo deben recorrerse y completarse.')
  );
  head.append(copy);root.append(head);

  const settings=node('div','q-settings');
  const title=input(payload.title||titleOf(model,activityId));
  const saveTitle=()=>{
    const value=title.value.trim();
    head.querySelector('h2').textContent=value||kicker;
    if(!value)return;
    try{
      const next=model.setStructuredTitle(activityId,value,payload);
      Object.keys(payload).forEach((key)=>delete payload[key]);Object.assign(payload,next);
      if(isComponent&&payload.component?.id==='https://p2lrn.org/component/callout'){
        payload.data??={};payload.data.heading=value;model.setStructuredJson(activityId,payload);
      }
      onChange?.();onStructureChange?.();
    }catch(error){report(String(error?.message??error));}
  };
  title.addEventListener('input',saveTitle);
  settings.append(labeled('Título',title));

  if(isComponent){
    payload.data??={};
    const editor=componentDescriptor?.authoring?.editor||'generic';
    root.append(settings);

    if(editor==='callout'){
      if(payload.data.tone==='danger')payload.data.tone='warning';
      const tone=select(payload.data.tone||'info',[
        ['info','Información'],['note','Nota'],['warning','Aviso / importante'],['success','Éxito'],
      ]);
      const preview=node('div','component-preview');
      const renderPreview=()=>{
        preview.replaceChildren();
        const card=node('div','component-preview-card component-tone-'+(payload.data.tone||'info'));
        card.append(node('strong',null,title.value||payload.data.heading||'Aviso'),node('p',null,payload.data.body||'Sin contenido'));
        preview.append(node('span','q-label','Vista previa'),card);
      };
      tone.addEventListener('change',()=>{payload.data.tone=tone.value;model.setStructuredJson(activityId,payload);onChange?.();renderPreview();});
      settings.append(labeled('Estilo',tone));
      const body=textarea(payload.data.body||'');body.className='q-answer-list';body.placeholder=studioUiText('Contenido del aviso');
      body.addEventListener('input',()=>{payload.data.body=body.value;model.setStructuredJson(activityId,payload);onChange?.();renderPreview();});
      root.append(labeled('Contenido',body));
      renderPreview();root.append(preview);
    }else if(editor==='timeline'){
      payload.data.items=Array.isArray(payload.data.items)&&payload.data.items.length?payload.data.items:[{id:'item-1',date:'',title:studioUiText('Primer acontecimiento'),body:''}];
      const list=node('div','q-list timeline-editor');
      const save=()=>{model.setStructuredJson(activityId,payload);onChange?.();};
      const move=(from,to)=>{if(to<0||to>=payload.data.items.length||from===to)return;const [item]=payload.data.items.splice(from,1);payload.data.items.splice(to,0,item);save();rerender();};
      payload.data.items.forEach((item,index)=>{
        const card=node('div','q-card timeline-item');card.draggable=true;
        card.addEventListener('dragstart',(event)=>event.dataTransfer?.setData('text/plain',String(index)));
        card.addEventListener('dragover',(event)=>event.preventDefault());
        card.addEventListener('drop',(event)=>{event.preventDefault();const from=Number(event.dataTransfer?.getData('text/plain'));if(Number.isInteger(from))move(from,index);});
        const cardHead=node('div','q-card-head');cardHead.append(node('strong',null,studioUiText('Acontecimiento '+(index+1))));
        const actions=node('div','q-card-actions');
        actions.append(
          button('↑',()=>move(index,index-1)),
          button('↓',()=>move(index,index+1)),
          button('Eliminar',()=>{
            if(payload.data.items.length<=1){report('La línea temporal debe conservar al menos un acontecimiento.');return;}
            payload.data.items.splice(index,1);save();rerender();
          },'q-mini q-danger')
        );
        cardHead.append(actions);card.append(cardHead);
        const date=input(item.date||'');date.placeholder=studioUiText('Fecha o periodo');
        const itemTitle=input(item.title||'');itemTitle.placeholder=studioUiText('Título del acontecimiento');
        const body=textarea(item.body||'');body.className='q-answer-list';body.placeholder=studioUiText('Descripción');
        date.addEventListener('input',()=>{item.date=date.value;save();});
        itemTitle.addEventListener('input',()=>{item.title=itemTitle.value;save();});
        body.addEventListener('input',()=>{item.body=body.value;save();});
        card.append(labeled('Fecha',date),labeled('Título',itemTitle),labeled('Descripción',body));list.append(card);
      });
      root.append(list,button('+ Añadir acontecimiento',()=>{
        let n=payload.data.items.length+1,id='item-'+n;const ids=new Set(payload.data.items.map((item)=>item.id));
        while(ids.has(id)){n+=1;id='item-'+n;}
        payload.data.items.push({id,date:'',title:studioUiText('Nuevo acontecimiento'),body:''});save();rerender();
      },'q-mini q-add-primary'));
    }else if(editor==='collaboration'){
      const mode=select(payload.data.mode||'poll',[['poll','Votación en directo'],['board','Pizarra compartida'],['peer-review','Revisión entre pares']]);
      const room=input(payload.data.room||'main');room.placeholder=studioUiText('main');
      const prompt=textarea(payload.data.prompt||'');prompt.className='q-answer-list';
      const fallback=textarea(payload.data.fallbackText||'');fallback.className='q-answer-list';
      const required=document.createElement('input');required.type='checkbox';required.checked=payload.data.required===true;
      const allowChange=document.createElement('input');allowChange.type='checkbox';allowChange.checked=payload.data.allowChange!==false;
      const showResults=document.createElement('input');showResults.type='checkbox';showResults.checked=payload.data.showResults!==false;
      const optionList=node('div','q-list collaboration-options');
      const save=()=>{
        const roomValue=room.value.trim()||'main';
        if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(roomValue)){report('La sala debe ser un identificador portable, por ejemplo main o equipo-1.');return;}
        payload.data.mode=mode.value;payload.data.room=roomValue;payload.data.prompt=prompt.value;payload.data.fallbackText=fallback.value;payload.data.required=required.checked;
        if(mode.value==='poll'){
          payload.data.allowChange=allowChange.checked;payload.data.showResults=showResults.checked;
          if(!Array.isArray(payload.data.options)||payload.data.options.length<2)payload.data.options=[{id:'a',label:studioUiText('Opción A')},{id:'b',label:studioUiText('Opción B')}];
        }else{
          delete payload.data.options;delete payload.data.allowChange;delete payload.data.showResults;
        }
        model.setStructuredJson(activityId,payload);
        model.setHostCapabilities(activityId,[{id:'collaboration.room',required:required.checked,operations:['join','send','listen','snapshot','leave'],context:['component.input'],description:studioUiText('Sala colaborativa resuelta por el host.'),fallback:'individual'}]);
        onChange?.();
      };
      const drawOptions=()=>{
        optionList.replaceChildren();
        if(mode.value!=='poll')return;
        payload.data.options=(payload.data.options??[]).length>=2?payload.data.options:[{id:'a',label:studioUiText('Opción A')},{id:'b',label:studioUiText('Opción B')}];
        payload.data.options.forEach((option,index)=>{
          const row=node('div','q-option-row');const text=input(option.label||'');
          const remove=button('Eliminar',()=>{if(payload.data.options.length<=2){report('La votación necesita al menos dos opciones.');return;}payload.data.options.splice(index,1);save();drawOptions();},'q-mini q-danger');
          text.addEventListener('input',()=>{option.label=text.value;save();});row.append(node('span','q-label',String(index+1)),text,remove);optionList.append(row);
        });
        optionList.append(button('+ Añadir opción',()=>{const used=new Set(payload.data.options.map((o)=>o.id));let n=payload.data.options.length+1,id='option-'+n;while(used.has(id)){n+=1;id='option-'+n;}payload.data.options.push({id,label:studioUiText('Opción '+n)});save();drawOptions();},'q-mini q-add-primary'));
      };
      mode.addEventListener('change',()=>{save();rerender();});room.addEventListener('change',save);prompt.addEventListener('input',save);fallback.addEventListener('input',save);required.addEventListener('change',save);allowChange.addEventListener('change',save);showResults.addEventListener('change',save);
      settings.append(labeled('Tipo',mode),labeled('Sala lógica',room),labeled('Obligatoria',required));
      root.append(labeled('Consigna',prompt));
      if(mode.value==='poll'){
        const pollSettings=node('div','q-settings collaboration-poll-settings');
        pollSettings.append(labeled('Permitir cambiar voto',allowChange),labeled('Mostrar resultados',showResults));
        root.append(pollSettings,optionList);drawOptions();
      }
      root.append(labeled('Fallback sin servicio',fallback));
      root.append(node('div','studio-readonly','El curso sólo guarda la actividad y la sala lógica. El host aporta identidad, permisos, transporte y persistencia. Si no hay servicio, se usa el fallback individual.'));
    }else if(editor==='capability-action'){
      const capability=input(payload.data.capability||'ai.tutor');capability.placeholder=studioUiText('ai.tutor');
      const operation=input(payload.data.operation||'hint');operation.placeholder=studioUiText('hint');
      const instruction=textarea(payload.data.instruction||'');instruction.className='q-answer-list';instruction.placeholder=studioUiText('Qué debe hacer el proveedor conectado');
      const buttonLabel=input(payload.data.buttonLabel||'Ejecutar');
      const fallback=textarea(payload.data.fallbackText||'');fallback.className='q-answer-list';fallback.placeholder=studioUiText('Texto cuando la capacidad no está disponible');
      const contextKeys=textarea((payload.data.context??[]).join('\n'));contextKeys.className='q-answer-list';contextKeys.placeholder=studioUiText('activity.objectives\ncurrent_question');
      const revealAnswer=document.createElement('input');revealAnswer.type='checkbox';revealAnswer.checked=payload.data.restrictions?.revealAnswer===true;
      const externalKnowledge=document.createElement('input');externalKnowledge.type='checkbox';externalKnowledge.checked=payload.data.restrictions?.allowExternalKnowledge===true;
      const maxOutput=input(String(payload.data.restrictions?.maxOutputChars??8000));maxOutput.type='number';maxOutput.min='1';maxOutput.max='50000';
      const required=document.createElement('input');required.type='checkbox';required.checked=payload.data.required===true;
      const token=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
      const save=()=>{
        const cap=capability.value.trim(),op=operation.value.trim();
        if(!token.test(cap)||!token.test(op)){report('Capacidad y operación deben ser identificadores semánticos, por ejemplo ai.tutor / hint.');return;}
        const requestedContext=[...new Set(contextKeys.value.split(/[\s,]+/).map((value)=>value.trim()).filter(Boolean))];
        if(requestedContext.some((value)=>!token.test(value))){report('Las claves de contexto deben ser identificadores semánticos, no URLs.');return;}
        payload.data.capability=cap;payload.data.operation=op;payload.data.instruction=instruction.value;payload.data.buttonLabel=buttonLabel.value.trim()||'Ejecutar';payload.data.fallbackText=fallback.value;payload.data.required=required.checked;payload.data.context=requestedContext;payload.data.restrictions={revealAnswer:revealAnswer.checked,allowExternalKnowledge:externalKnowledge.checked,maxOutputChars:Math.max(1,Math.min(50000,Number(maxOutput.value)||8000))};
        model.setStructuredJson(activityId,payload);
        model.setHostCapabilities(activityId,[{id:cap,required:required.checked,operations:[op],context:requestedContext,description:studioUiText('Operación solicitada por un componente conectado.')}]);
        onChange?.();
      };
      capability.addEventListener('change',save);operation.addEventListener('change',save);instruction.addEventListener('input',save);buttonLabel.addEventListener('input',save);fallback.addEventListener('input',save);contextKeys.addEventListener('input',save);maxOutput.addEventListener('input',save);revealAnswer.addEventListener('change',save);externalKnowledge.addEventListener('change',save);required.addEventListener('change',save);
      settings.append(labeled('Capacidad',capability),labeled('Operación',operation),labeled('Texto del botón',buttonLabel),labeled('Obligatoria',required));
      root.append(labeled('Instrucción para el proveedor',instruction),labeled('Contexto semántico solicitado',contextKeys),labeled('Puede revelar la respuesta',revealAnswer),labeled('Puede usar conocimiento externo',externalKnowledge),labeled('Máximo de salida',maxOutput),labeled('Fallback sin proveedor',fallback));
      const note=node('div','studio-readonly','El paquete sólo declara intención, contexto solicitado y restricciones. El host decide qué datos entrega y si la capacidad la ofrece MCP, Paula, un modelo local, AulaP2P u otro proveedor; credenciales y endpoints permanecen fuera del paquete.');root.append(note);
    }else{
      root.append(node('div','studio-readonly','Este componente está registrado, pero todavía no tiene un editor visual específico. Puedes editar su JSON en Avanzado.'));
    }
  }else if(isComposite){
    const mode=select(payload.mode||'sequence',[['free','Recorrido libre'],['sequence','En secuencia']]);
    const completion=select(payload.completion||'all',[['all','Completar todas'],['any','Completar cualquiera']]);
    const savePolicy=()=>{
      payload.mode=mode.value;
      payload.completion=completion.value;
      payload.navigation=compositeNavigationForMode(payload.mode);
      model.setStructuredJson(activityId,payload);onChange?.();
    };
    mode.addEventListener('change',savePolicy);completion.addEventListener('change',savePolicy);
    settings.append(labeled('Recorrido',mode),labeled('Finalización',completion));root.append(settings);

    const section=node('section','composite-content');
    const sectionHead=node('div','composite-content-head');
    const sectionCopy=node('div');
    sectionCopy.append(node('h3',null,'Actividades del grupo'),node('p',null,'El orden de esta lista es el orden real guardado en el paquete.'));
    sectionHead.append(sectionCopy,button('+ Crear actividad dentro',()=>onCreateChild?.(activityId),'q-mini q-add-primary'));
    section.append(sectionHead);

    const children=model.children?.(activityId)??[];
    if(!children.length)section.append(node('div','studio-warning','Añade al menos una actividad. Un grupo vacío no se puede exportar.'));
    else{
      const list=node('div','composite-list');
      children.forEach((child,index)=>{
        const row=node('div','composite-row');row.draggable=true;
        row.addEventListener('dragstart',(event)=>event.dataTransfer?.setData('text/plain',child.id));
        row.addEventListener('dragover',(event)=>event.preventDefault());
        row.addEventListener('drop',(event)=>{event.preventDefault();const id=event.dataTransfer?.getData('text/plain');if(!id)return;model.reorderChild(activityId,id,index);onStructureChange?.();rerender();});
        const meta=node('div','composite-row-meta');
        meta.append(node('span','drag-handle','⋮⋮'),node('strong',null,titleOf(model,child.id)),node('small',null,child.activityType?.split('/').at(-1)||'actividad'));
        const actions=node('div','q-card-actions');
        actions.append(
          button('Abrir',()=>onSelectActivity?.(child.id)),
          button('↑',()=>{model.reorderChild(activityId,child.id,index-1);onStructureChange?.();rerender();}),
          button('↓',()=>{model.reorderChild(activityId,child.id,index+1);onStructureChange?.();rerender();}),
          button('Sacar',()=>{model.removeActivityFromComposite(activityId,child.id);onStructureChange?.();rerender();}),
          button('Eliminar',()=>{if(confirm(studioUiText('¿Eliminar esta actividad del curso?'))){model.removeActivity(child.id);onStructureChange?.();rerender();}},'q-mini q-danger')
        );
        row.append(meta,actions);list.append(row);
      });
      section.append(list);
    }

    const candidates=model.movableActivitiesForComposite?.(activityId)??[];
    if(candidates.length){
      const chooser=select('',[['','Selecciona una actividad del curso...'],...candidates.map((entity)=>[entity.id,titleOf(model,entity.id)])]);
      const move=button('Añadir actividad existente',()=>{
        if(!chooser.value)return;
        try{
          const entity=model.moveActivityToComposite(chooser.value,activityId);
          onStructureChange?.();report('Actividad añadida al grupo: '+titleOf(model,entity.id));rerender();
        }catch(error){report('No se pudo mover la actividad: '+String(error?.message??error));}
      });
      move.disabled=true;chooser.addEventListener('change',()=>{move.disabled=!chooser.value;});
      const actions=node('div','q-settings composite-existing');actions.append(labeled('Actividad existente',chooser),move);section.append(actions);
    }

    root.append(section);
  }

  const advanced=node('details','q-advanced');
  const summary=node('summary',null,'Avanzado: ver JSON');
  const area=node('textarea');area.value=JSON.stringify(payload,null,2);
  area.addEventListener('change',()=>{
    try{
      const parsed=JSON.parse(area.value);
      Object.keys(payload).forEach((key)=>delete payload[key]);Object.assign(payload,parsed);
      if(parsed.title?.trim()){
        const next=model.setStructuredTitle(activityId,parsed.title,payload);
        Object.keys(payload).forEach((key)=>delete payload[key]);Object.assign(payload,next);
      }else model.setStructuredJson(activityId,payload);
      onChange?.();onStructureChange?.();report('Modelo avanzado actualizado');rerender();
    }catch(error){report('JSON avanzado no válido: '+String(error?.message??error));}
  });
  advanced.append(summary,area);root.append(advanced);container.append(root);
}
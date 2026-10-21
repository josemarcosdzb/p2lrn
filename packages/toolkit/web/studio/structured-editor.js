import {compositeNavigationForMode} from '../native-composite-core.js';

const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
const labeled=(label,control)=>{const wrap=node('label','q-field');wrap.append(node('span','q-label',label),control);return wrap;};
const input=(value='')=>{const el=document.createElement('input');el.type='text';el.value=value??'';return el;};
const textarea=(value='')=>{const el=document.createElement('textarea');el.value=value??'';return el;};
const select=(value,options)=>{const el=document.createElement('select');for(const [v,label] of options){const o=document.createElement('option');o.value=v;o.textContent=label;o.selected=v===value;el.append(o);}return el;};
const button=(label,action,className='q-mini')=>{const el=node('button',className,label);el.type='button';el.addEventListener('click',action);return el;};
const titleOf=(model,id)=>model?.title?.(id)??model?.entity?.(id)?.id??id;

export function renderStructuredVisualEditor(container,options={}){
  const {model,activityId,mediaType,payload,onChange,onStatus,onStructureChange,onSelectActivity,onCreateChild}=options;
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
        onStatus?.('Navegación del grupo ajustada a su recorrido.');
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
    }catch(error){onStatus?.(String(error?.message??error));}
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
      const body=textarea(payload.data.body||'');body.className='q-answer-list';body.placeholder='Contenido del aviso';
      body.addEventListener('input',()=>{payload.data.body=body.value;model.setStructuredJson(activityId,payload);onChange?.();renderPreview();});
      root.append(labeled('Contenido',body));
      renderPreview();root.append(preview);
    }else if(editor==='timeline'){
      payload.data.items=Array.isArray(payload.data.items)&&payload.data.items.length?payload.data.items:[{id:'item-1',date:'',title:'Primer acontecimiento',body:''}];
      const list=node('div','q-list timeline-editor');
      const save=()=>{model.setStructuredJson(activityId,payload);onChange?.();};
      const move=(from,to)=>{if(to<0||to>=payload.data.items.length||from===to)return;const [item]=payload.data.items.splice(from,1);payload.data.items.splice(to,0,item);save();rerender();};
      payload.data.items.forEach((item,index)=>{
        const card=node('div','q-card timeline-item');card.draggable=true;
        card.addEventListener('dragstart',(event)=>event.dataTransfer?.setData('text/plain',String(index)));
        card.addEventListener('dragover',(event)=>event.preventDefault());
        card.addEventListener('drop',(event)=>{event.preventDefault();const from=Number(event.dataTransfer?.getData('text/plain'));if(Number.isInteger(from))move(from,index);});
        const cardHead=node('div','q-card-head');cardHead.append(node('strong',null,'Acontecimiento '+(index+1)));
        const actions=node('div','q-card-actions');
        actions.append(
          button('↑',()=>move(index,index-1)),
          button('↓',()=>move(index,index+1)),
          button('Eliminar',()=>{
            if(payload.data.items.length<=1){onStatus?.('La línea temporal debe conservar al menos un acontecimiento.');return;}
            payload.data.items.splice(index,1);save();rerender();
          },'q-mini q-danger')
        );
        cardHead.append(actions);card.append(cardHead);
        const date=input(item.date||'');date.placeholder='Fecha o periodo';
        const itemTitle=input(item.title||'');itemTitle.placeholder='Título del acontecimiento';
        const body=textarea(item.body||'');body.className='q-answer-list';body.placeholder='Descripción';
        date.addEventListener('input',()=>{item.date=date.value;save();});
        itemTitle.addEventListener('input',()=>{item.title=itemTitle.value;save();});
        body.addEventListener('input',()=>{item.body=body.value;save();});
        card.append(labeled('Fecha',date),labeled('Título',itemTitle),labeled('Descripción',body));list.append(card);
      });
      root.append(list,button('+ Añadir acontecimiento',()=>{
        let n=payload.data.items.length+1,id='item-'+n;const ids=new Set(payload.data.items.map((item)=>item.id));
        while(ids.has(id)){n+=1;id='item-'+n;}
        payload.data.items.push({id,date:'',title:'Nuevo acontecimiento',body:''});save();rerender();
      },'q-mini q-add-primary'));
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
          button('Eliminar',()=>{if(confirm('¿Eliminar esta actividad del curso?')){model.removeActivity(child.id);onStructureChange?.();rerender();}},'q-mini q-danger')
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
          onStructureChange?.();onStatus?.('Actividad añadida al grupo: '+titleOf(model,entity.id));rerender();
        }catch(error){onStatus?.('No se pudo mover la actividad: '+String(error?.message??error));}
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
      onChange?.();onStructureChange?.();onStatus?.('Modelo avanzado actualizado');rerender();
    }catch(error){onStatus?.('JSON avanzado no válido: '+String(error?.message??error));}
  });
  advanced.append(summary,area);root.append(advanced);container.append(root);
}
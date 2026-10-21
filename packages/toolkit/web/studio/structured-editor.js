import {compositeNavigationForMode} from '../native-composite-core.js';

const node=(tag,className,text)=>{
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
};
const labeled=(label,control)=>{
  const wrap=node('label','q-field');
  wrap.append(node('span','q-label',label),control);
  return wrap;
};
const input=(value='')=>{
  const el=document.createElement('input');
  el.type='text';el.value=value??'';
  return el;
};
const select=(value,options)=>{
  const el=document.createElement('select');
  for(const [v,label] of options){
    const o=document.createElement('option');
    o.value=v;o.textContent=label;o.selected=v===value;
    el.append(o);
  }
  return el;
};

export function renderStructuredVisualEditor(container,{model,activityId,mediaType,payload,onChange,onStatus,onStructureChange}={}){
  const isComponent=mediaType==='application/vnd.p2lrn.component+json';
  if(!isComponent){
    // Repair historical drafts written by Studio with sequence/open or the
    // unsupported parallel mode. Do not modify other authoring fields.
    const mode=payload.mode==='parallel'?'free':payload.mode;
    if(mode==='sequence'||mode==='free'){
      const navigation=compositeNavigationForMode(mode);
      if(payload.mode!==mode||payload.navigation!==navigation){
        payload.mode=mode;
        payload.navigation=navigation;
        model.setStructuredJson(activityId,payload);
        onChange?.();
        onStatus?.('Navegación del compuesto ajustada a su modo.');
      }
    }
  }

  container.replaceChildren();
  const root=node('div','questionnaire-visual-editor');
  const head=node('div','q-editor-head'),copy=node('div');
  copy.append(
    node('span','q-kicker',isComponent?'Componente':'Compuesto'),
    node('h2',null,payload.title||(isComponent?'Componente':'Compuesto')),
    node('p',null,'Edita este contenido con controles normales.')
  );
  head.append(copy);root.append(head);

  const settings=node('div','q-settings');
  const title=input(payload.title||'');
  title.addEventListener('input',()=>{
    payload.title=title.value;model.setStructuredJson(activityId,payload);
    onChange?.();head.querySelector('h2').textContent=title.value||'Contenido';
  });
  settings.append(labeled('Título',title));

  if(isComponent){
    payload.data??={};
    const tone=select(payload.data.tone||'info',[
      ['info','Información'],['success','Éxito'],
      ['warning','Aviso'],['danger','Importante'],
    ]);
    tone.addEventListener('change',()=>{
      payload.data.tone=tone.value;model.setStructuredJson(activityId,payload);onChange?.();
    });
    settings.append(labeled('Estilo',tone));
    root.append(settings);
    const body=node('textarea','q-answer-list');
    body.value=payload.data.body||'';
    body.placeholder='Contenido del componente';
    body.addEventListener('input',()=>{
      payload.data.body=body.value;model.setStructuredJson(activityId,payload);onChange?.();
    });
    root.append(labeled('Contenido',body));
  }else{
    const mode=select(payload.mode||'sequence',[
      ['sequence','Secuencia'],['free','Libre'],
    ]);
    const completion=select(payload.completion||'all',[
      ['all','Completar todos'],['any','Completar cualquiera'],
    ]);
    const navigation=select(
      payload.navigation||'linear',
      [['linear','Navegación lineal'],['open','Navegación libre']],
    );
    // Navigation is a consequence of sequence/free, not an independent mode.
    navigation.disabled=true;
    navigation.title='La navegación se configura automáticamente según el modo.';
    mode.addEventListener('change',()=>{
      payload.mode=mode.value;
      payload.navigation=compositeNavigationForMode(mode.value);
      navigation.value=payload.navigation;
      model.setStructuredJson(activityId,payload);
      onChange?.();
    });
    completion.addEventListener('change',()=>{
      payload.completion=completion.value;
      model.setStructuredJson(activityId,payload);
      onChange?.();
    });
    settings.append(
      labeled('Modo',mode),
      labeled('Finalización',completion),
      labeled('Navegación',navigation),
    );
    root.append(settings);

    const children=model.children(activityId);
    const description=children.length
      ?'Actividades del grupo: '+children.map((item)=>model.title(item.id)).join(' · ')
      :'Este compuesto está vacío. Selecciónalo en el árbol y pulsa «Añadir contenido» para crear sus actividades dentro.';
    root.append(node('div','studio-readonly',description));

    // Existing activities from course/units can be moved without duplicating
    // resources or losing work already done in the authoring session.
    const candidates=model.movableActivitiesForComposite(activityId);
    if(candidates.length){
      const chooser=select('',[
        ['','Selecciona una actividad del curso...'],
        ...candidates.map((entity)=>[entity.id,model.title(entity.id)]),
      ]);
      const move=node('button',null,'Mover al compuesto');
      move.type='button';
      move.disabled=true;
      chooser.addEventListener('change',()=>{move.disabled=!chooser.value;});
      move.addEventListener('click',()=>{
        if(!chooser.value)return;
        try{
          const entity=model.moveActivityToComposite(chooser.value,activityId);
          onStructureChange?.();
          if(!onStructureChange)onChange?.();
          onStatus?.('Actividad movida al compuesto: '+model.title(entity.id));
          renderStructuredVisualEditor(container,{
            model,activityId,mediaType,payload,
            onChange,onStatus,onStructureChange,
          });
        }catch(error){
          onStatus?.('No se pudo mover la actividad: '+String(error?.message??error));
        }
      });
      const actions=node('div','q-settings');
      actions.append(labeled('Mover actividad existente',chooser),move);
      root.append(actions);
    }
  }

  const advanced=node('details','q-advanced');
  const summary=node('summary',null,'Avanzado: ver JSON');
  const area=node('textarea');
  area.value=JSON.stringify(payload,null,2);
  area.addEventListener('change',()=>{
    try{
      const parsed=JSON.parse(area.value);
      Object.keys(payload).forEach((k)=>delete payload[k]);
      Object.assign(payload,parsed);
      model.setStructuredJson(activityId,payload);
      onChange?.();
      onStatus?.('Modelo avanzado actualizado');
    }catch(error){
      onStatus?.('JSON avanzado no válido: '+error.message);
    }
  });
  advanced.append(summary,area);
  root.append(advanced);
  container.append(root);
}

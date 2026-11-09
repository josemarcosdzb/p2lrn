// Browser-level regression for the ONE Studio UI shared by the website and npm.
// Uses the real browser DOM, browser editing commands and official P2LRN exporter.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';

const sleep=ms=>new Promise(done=>setTimeout(done,ms));
function findChrome(){
  return [
    process.env.P2LRN_CHROME,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium','/usr/bin/google-chrome'
  ].filter(Boolean).find(existsSync)||null;
}
async function browserScenario(){
  const {mountStudioCommandBar,applyUnifiedStudioWorkspace}=await import('/studio/command-bar.js');
  const {createP2LRNStudioDocument}=await import('/studio/new-document.js');
  const {exportP2LRNPackage}=await import('/studio/package-export.js');
  const {openP2LRNPackageBytes}=await import('/p2lrn-player.js');
  const {prepareStudioDropSandbox}=await import('/renderers/lesson-drop-sandbox.js');
  const {render:renderPassiveText}=await import('/renderers/passive-text.js');
  const {createStudioDropActivity}=await import('/studio/studio-drop-activity.js');
  const {getStudioShape,normalizeStudioShapeCaptions}=await import('/studio/studio-shapes.js');
  const {bootStudioDropActivities}=await import('/renderers/lesson-drop-runtime.js');
  const expect=(value,msg)=>{if(!value)throw new Error(msg);};
  const make=async(withShadow)=>{
    const host=document.createElement('div');
    document.body.append(host);
    const root=withShadow?host.attachShadow({mode:'open'}):host;
    const mount=document.createElement('section');mount.className='toolbar';
    const workspace=document.createElement('div');
    const outline=document.createElement('nav');
    const canvas=document.createElement('main');
    const stage=document.createElement('div');
    const sheet=document.createElement('article');
    const surface=document.createElement('article');
    surface.contentEditable='true';surface.dataset.studioHtmlSurface='true';
    surface.innerHTML='<p>La explicación debe conservarse.</p>';
    sheet.append(surface);stage.append(sheet);canvas.append(stage);
    workspace.append(outline,canvas);root.append(mount,workspace);
    applyUnifiedStudioWorkspace({workspace,outline,canvas,stage,sheet});
    const course=createP2LRNStudioDocument({title:'Estudio visual',language:'es'});
    const lesson=course.addLesson(course.rootId,{title:'Diseño unificado',language:'es'});
    const editable=await course.readEditableText(lesson.id);
    let writes=0;
    surface.addEventListener('input',()=>{
      course.setPayloadText(editable.path,'<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>'+surface.innerHTML+'</body></html>');
      writes++;
    });
    const actions=[];
    const on=name=>()=>{actions.push(name);};
    const ui=mountStudioCommandBar({
      mount,resolveSurface:()=>surface,
      actions:{
        create:on('create'),open:on('open'),save:on('save'),
        export:on('export'),offline:on('offline'),
        review:on('review'),addUnit:on('unit'),addLesson:on('lesson'),
        addContent:on('activity'),addKind:(kind)=>{actions.push('kind:'+kind);},preview:on('preview'),edit:on('edit')
      },
      onStatus:msg=>actions.push('status:'+msg)
    });
    ui.setDocument(true,'Estudio visual');
    const toolbar=mount.querySelector('.p2lrn-studio-ribbon');
    expect(toolbar&&mount.classList.contains('p2lrn-studio-unified'),'Canonical toolbar missing');
    expect([...toolbar.querySelectorAll('[role=tab]')].filter(tab=>!tab.hidden).length===2,'Only Formato and Insertar tabs should remain');
    expect(!toolbar.querySelector('[role=tab][aria-controls$="-design"],[role=tab][aria-controls$="-table"]'),'Duplicate Design or Table tabs remain');
    expect(toolbar.querySelectorAll('[data-ui-action=create]').length===1,'Create command is duplicated');
    expect(toolbar.querySelectorAll('[data-ui-action=open]').length===1,'Open command is duplicated');
    expect(toolbar.querySelectorAll('[data-ui-action=export]').length===1,'Export command is duplicated');
    expect(toolbar.querySelectorAll('[data-ui-action=save]').length===1,'Save command is duplicated');
    expect(toolbar.querySelector('[data-ui-action=save]'),'Save button missing');
    expect(toolbar.querySelector('[data-ui-action=export]'),'Export button missing');
    expect(toolbar.querySelector('[data-ui-action=preview]'),'Preview button missing');
    expect(toolbar.querySelector('[data-ui-action=edit]'),'Persistent Editar control missing');
    expect(toolbar.querySelector('[data-ui-action=preview]').textContent==='Vista alumno','Student view label missing');
    expect(toolbar.querySelector('[data-ui-action=edit]').textContent==='Editar','Edit mode label missing');
    const html=toolbar.outerHTML.replace(/p2lrn-studio-(?:panel|tab|more)-\d+/g,'p2lrn-studio-unique');
    return {host,root,mount,toolbar,workspace,outline,stage,surface,course,lesson,editable,ui,actions,html,get writes(){return writes;}};
  };
  const website=await make(false),npm=await make(true);
  expect(website.html===npm.html,'Website and npm command trees are different');
  for(const item of [website,npm]){
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    const add=[...item.toolbar.querySelectorAll('button')].find(b=>b.textContent==='Añadir contenido');
    expect(add&&!add.disabled,'Common activity picker action missing');
    add.click();
    const picker=item.root.querySelector('.p2lrn-activity-picker')||document.querySelector('.p2lrn-activity-picker');
    expect(picker?.open,'Activity picker did not open in its DOM root');
    const search=picker.querySelector('input[type=search]');search.value='crucigrama';
    search.dispatchEvent(new Event('input',{bubbles:true}));
    const crossword=picker.querySelector('[data-activity-kind=crossword]');
    expect(crossword&&!crossword.hidden,'Searching the shared activity catalog failed');
    crossword.click();
    await new Promise(done=>setTimeout(done,0));
    expect(item.actions.includes('kind:crossword'),'Shared activity picker did not dispatch the chosen game');
    // Real table commands shared by both Studio entrypoints.
    const addTable=item.toolbar.querySelector('[data-ui-layout=table]');
    expect(addTable&&!addTable.disabled,'Table insertion is missing');
    addTable.click();
    let table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table&&table.rows.length===3&&table.rows[0].cells.length===2,'Inserted table has the wrong grid');
    table.rows[1].cells[0].click();
    const context=item.toolbar.querySelector('[data-studio-context-tools]');
    expect(context&&!context.hidden,'Selecting a table does not show contextual editing');
    const formatTab=item.toolbar.querySelector('[role=tab][aria-controls$="-home"]');
    expect(formatTab.getAttribute('aria-selected')==='true','Table selection must return to Formato automatically');
    expect(item.toolbar.querySelectorAll('[data-studio-advanced-action=rowBelow]').length===1,'Table row insertion is duplicated');
    const addRow=item.toolbar.querySelector('[data-studio-advanced-action=rowBelow]');
    const addCol=item.toolbar.querySelector('[data-studio-advanced-action=colRight]');
    expect(!addRow.disabled&&!addCol.disabled,'Context table actions are disabled');
    addRow.click();
    expect(table.rows.length===4,'Could not add a table row');
    addCol.click();
    expect(table.rows[0].cells.length===3,'Could not add a table column');
    // Undo/redo must work across Insertar and contextual Tabla, not just typing.
    item.toolbar.querySelector('[role=tab][aria-controls$="-home"]').click();
    const undo=item.toolbar.querySelector('[data-ui-command=undo]');
    const redo=item.toolbar.querySelector('[data-ui-command=redo]');
    expect(!undo.disabled,'Structural changes did not enter the shared history');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[0].cells.length===2&&table.rows.length===4,'Undo did not remove column');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows.length===3,'Undo did not remove row');
    redo.click();redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows.length===4&&table.rows[0].cells.length===3,'Redo did not restore table modifications');
    // Cell formatting and row geometry must be reversible as well.
    table.rows[1].cells[0].click();
    expect(!context.hidden&&formatTab.getAttribute('aria-selected')==='true','Cell formatting requires unnecessary tab switching');
    const cellFill=item.toolbar.querySelector('input[aria-label="Color de fondo de celda"]');
    cellFill.value='#ffd6a5';
    item.toolbar.querySelector('[data-studio-advanced-action=cellFill]').click();
    expect(table.rows[1].cells[0].style.backgroundColor==='rgb(255, 214, 165)','Cell fill failed');
    const rowHeight=item.toolbar.querySelector('input[aria-label="Altura de fila en píxeles"]');
    rowHeight.value='64';
    item.toolbar.querySelector('[data-studio-advanced-action=rowHeight]').click();
    expect(table.rows[1].style.height==='64px','Row height failed');
    undo.click();undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[1].style.height!=='64px'&&table.rows[1].cells[0].style.backgroundColor!=='rgb(255, 214, 165)','Undo of cell formatting failed');
    redo.click();redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.rows[1].style.height==='64px'&&table.rows[1].cells[0].style.backgroundColor==='rgb(255, 214, 165)','Redo of cell formatting failed');
    // Object geometry is also part of the same portable history.
    table.rows[1].cells[0].click();
    expect(item.ui.performObject('width',340)!==false,'Width command failed');
    expect(table.style.width==='340px','Table resize was not applied');
    expect(item.ui.performObject('nudge',{x:30,y:14})!==false,'Movement command failed');
    expect(table.dataset.p2lrnObjectX==='30','Object translation missing');
    const dragHandle=item.root.querySelector('[data-object-action=drag]');
    expect(dragHandle,'Object drag handle not rendered');
    const pointer=(type,x,y)=>dragHandle.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:93,pointerType:'mouse',button:0,
      buttons:type==='pointerup'?0:1,clientX:x,clientY:y
    }));
    pointer('pointerdown',210,210);pointer('pointermove',235,230);pointer('pointerup',235,230);
    expect(table.dataset.p2lrnObjectX!=='30','Pointer drag did not move the table');
    undo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(table.dataset.p2lrnObjectX==='30','Undo did not restore previous position');
    redo.click();
    table=item.surface.querySelector('table[data-p2lrn-layout=table]');
    expect(Number(table.dataset.p2lrnObjectX)>30,'Redo did not restore drag');
    item.toolbar.querySelector('[role=tab][aria-controls$="-insert"]').click();
    const insert=item.toolbar.querySelector('[data-ui-layout=columns]');
    expect(insert&&!insert.disabled,'Columns action unavailable');
    insert.click();
    expect(item.surface.querySelector('[data-p2lrn-layout=columns]'),'Columns not inserted in HTML');
    expect(item.writes>0,'Insertion was not persisted in authoring model');
    expect(formatTab.getAttribute('aria-selected')==='true','New block should expose Formato automatically');
    const blue=[...item.toolbar.querySelectorAll('button')].find(b=>b.title==='Aplicar fondo azul');
    expect(blue,'Visual design option missing');
    blue.click();
    const section=item.surface.querySelector('[data-p2lrn-layout=columns]');
    expect(section.style.backgroundColor==='rgb(239, 246, 255)','Block design was not persisted');
    const backgroundMenu=item.toolbar.querySelector('[data-studio-context-menu=fondo]');
    const colorHex=backgroundMenu.querySelector('input[aria-label="Color hexadecimal del fondo"]');
    const alpha=backgroundMenu.querySelector('input[aria-label="Opacidad del fondo, porcentaje"]');
    expect(backgroundMenu.querySelector('input[type=color]')&&colorHex&&alpha,
      'Any RGB background color and opacity must be editable, not only 4 preset colors');
    colorHex.value='#1ba4ef';colorHex.dispatchEvent(new Event('change',{bubbles:true}));
    expect(section.style.backgroundColor==='rgb(27, 164, 239)','Arbitrary hex background did not apply');
    alpha.value='37';alpha.dispatchEvent(new Event('change',{bubbles:true}));
    expect(section.style.backgroundColor==='rgba(27, 164, 239, 0.37)','Alpha background did not apply');
    backgroundMenu.querySelector('button[title*="Eliminar el fondo"]').click();
    expect(section.style.backgroundColor==='transparent','Transparent background was not applied');
    blue.click();
    expect(section.style.backgroundColor==='rgb(239, 246, 255)','Preset could not restore the block background');
    // Resize handle on a movable shape, including undo/redo of the gesture.
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    item.toolbar.querySelector('[data-ui-layout=shape]').click();
    let shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape,'Shape insertion failed');
    expect(!shape.querySelector('figcaption')&&shape.getAttribute('aria-label')===getStudioShape('rectangle').label,
      'New shapes must not show an automatically printed name');
    const grip=item.root.querySelector('[data-object-action=resize]');
    expect(grip,'Shape resize grip missing');
    const previousWidth=shape.getBoundingClientRect().width;
    const resizeEvent=(type,x,y)=>grip.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:75,pointerType:'mouse',button:0,
      buttons:type==='pointerup'?0:1,clientX:x,clientY:y
    }));
    resizeEvent('pointerdown',200,200);resizeEvent('pointermove',280,235);resizeEvent('pointerup',280,235);
    expect(shape.getBoundingClientRect().width>previousWidth,'Pointer resize did not grow shape');
    item.toolbar.querySelector('[role=tab][aria-controls*="-home"]').click();
    undo.click();
    shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape.getBoundingClientRect().width<=previousWidth+2,'Undo did not restore shape width');
    redo.click();
    shape=item.surface.querySelector('[data-p2lrn-layout=shape]');
    expect(shape.getBoundingClientRect().width>previousWidth,'Redo did not restore shape width');
    expect(formatTab.getAttribute('aria-selected')==='true','New shape should expose Formato automatically');
    // All authored shapes must share the same resize/undo system, not a parallel editor.
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    const choices=[...item.toolbar.querySelectorAll('[data-ui-layout^="shape:"]')];
    expect(choices.length>=21,'The full geometric shape gallery is missing');
    const triangleChoice=item.toolbar.querySelector('[data-ui-layout="shape:triangle"]');
    expect(triangleChoice,'Triangle is missing from the shape gallery');
    triangleChoice.click();
    const triangle=item.surface.querySelector('[data-p2lrn-shape=triangle]');
    expect(triangle&&triangle.querySelector('[data-p2lrn-shape-art]')?.style.clipPath.startsWith('polygon('),
      'Geometric shape does not use scalable CSS geometry');
    expect(!triangle.querySelector('figcaption')&&triangle.getAttribute('aria-label')===getStudioShape('triangle').label,
      'Geometry names are for accessibility, not a visible caption');
    const {normalizeStudioShapeCaptions}=await import('/studio/studio-shapes.js');
    const legacy=document.createElement('figure');legacy.dataset.p2lrnLayout='shape';
    legacy.dataset.p2lrnShape='arrow-down';
    const generated=document.createElement('figcaption');generated.textContent='Flecha abajo';legacy.append(generated);
    item.surface.append(legacy);
    expect(normalizeStudioShapeCaptions(item.surface)===1&&!legacy.querySelector('figcaption')&&
      legacy.getAttribute('aria-label')==='Flecha abajo','Historical autogenerated labels were not removed');
    const authored=document.createElement('figcaption');authored.textContent='Mi explicaci?n';legacy.append(authored);
    expect(normalizeStudioShapeCaptions(item.surface)===0&&legacy.contains(authored),
      'A teacher-authored shape caption must not be deleted');
    legacy.remove();
    const dropdownChoice=item.toolbar.querySelector('[data-ui-layout=dropdown]');
    dropdownChoice.click();
    const dropdown=item.surface.querySelector('details[data-p2lrn-layout=dropdown]');
    expect(dropdown&&dropdown.querySelector('summary')?.textContent.includes('desplegar'),
      'Native keyboard-accessible dropdown was not inserted');
    item.toolbar.querySelector('[data-ui-layout=drag-drop]').click();
    const activityDrop=item.surface.querySelector('section[data-p2lrn-dnd="1"]');
    expect(activityDrop,'Image drop activity was not inserted');
    expect(activityDrop.querySelectorAll('[data-p2lrn-dnd-zone]').length===2,'Missing initial destination zones');
    expect(activityDrop.querySelectorAll('[data-p2lrn-dnd-item]').length===2,'Missing draggable item tray');
    const zonesMenu=[...item.toolbar.querySelectorAll('details')].find(el=>el.querySelector(':scope > summary')?.textContent==='Zonas de arrastre');
    expect(zonesMenu,'Drag-drop hotspot controls are missing');
    zonesMenu.open=true;
    const newZone=[...zonesMenu.querySelectorAll('button')].find(btn=>btn.textContent==='Añadir zona y ficha');
    newZone.click();
    expect(activityDrop.querySelectorAll('[data-p2lrn-dnd-zone]').length===3,
      'Adding a new image hotspot did not also add a draggable item');
    expect(activityDrop.querySelectorAll('[data-p2lrn-dnd-item]').length===3,'Draggable item tray did not grow');
    const zoneName=zonesMenu.querySelector('[data-p2lrn-drop-name=zone]');
    const itemName=zonesMenu.querySelector('[data-p2lrn-drop-name=item]');
    expect(zoneName&&!zoneName.disabled&&itemName&&!itemName.disabled,'Selected hotspot needs editable labels');
    zoneName.value='Zona de reciclaje';zoneName.dispatchEvent(new Event('change',{bubbles:true}));
    itemName.value='Papel reciclado';itemName.dispatchEvent(new Event('change',{bubbles:true}));
    expect(activityDrop.textContent.includes('Zona de reciclaje')&&activityDrop.textContent.includes('Papel reciclado'),
      'Hotspot labels were not updated in the WYSIWYG course');
    // Upload a tiny local raster image; it must survive strict Studio HTML sanitization.
    const fileInput=zonesMenu.querySelector('input[type=file]');
    const pngBytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y7lMqYAAAAASUVORK5CYII='),x=>x.charCodeAt(0));
    const files=new DataTransfer();files.items.add(new File([pngBytes],'fondo.png',{type:'image/png'}));
    fileInput.files=files.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<60&&!activityDrop.querySelector('[data-p2lrn-dnd-image]');i++)
      await new Promise(done=>setTimeout(done,25));
    expect(activityDrop.querySelector('[data-p2lrn-dnd-image]')?.getAttribute('src')?.startsWith('data:image/png;base64,'),
      'Raster background image did not persist in the activity');
    const cardImageInput=zonesMenu.querySelector('[data-p2lrn-drop-image=item]');
    const altField=zonesMenu.querySelector('[data-p2lrn-drop-name=alt]');
    expect(cardImageInput?.type==='file','Card image upload input was not installed');
    const newCard=activityDrop.querySelector('[data-p2lrn-dnd-item=item-3]');
    const cardFiles=new DataTransfer();
    cardFiles.items.add(new File([pngBytes],'papel.png',{type:'image/png'}));
    cardImageInput.files=cardFiles.files;
    cardImageInput.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<100&&!newCard.querySelector('[data-p2lrn-dnd-item-image]');i++)
      await new Promise(done=>setTimeout(done,25));
    const cardImage=newCard.querySelector('[data-p2lrn-dnd-item-image]');
    expect(cardImage?.getAttribute('src')?.startsWith('data:image/png;base64,'),
      'Card image did not embed as a local data URL');
    expect(newCard.querySelector('[data-p2lrn-dnd-text]')?.textContent==='Papel reciclado',
      'Adding a card image erased the existing label');
    expect(newCard.style.backgroundColor==='transparent'&&newCard.style.borderColor==='transparent',
      'Transparent PNG images must not be surrounded by an opaque tile background');
    expect(!altField.disabled,'The image description must be editable');
    altField.value='Papel para depositar en el contenedor azul';
    altField.dispatchEvent(new Event('change',{bubbles:true}));
    expect(cardImage.alt===altField.value,'Edited image description did not persist');
    const removeCardImage=[...zonesMenu.querySelectorAll('button')]
      .find(button=>button.textContent==='Quitar imagen de la ficha');
    removeCardImage.click();
    expect(!newCard.querySelector('[data-p2lrn-dnd-item-image]')&&newCard.textContent.includes('Papel reciclado'),
      'Removing an image must preserve card text');
    // Resetting a file input can empty the FileList shared with DataTransfer.
    // Simulate a real second upload with a new selection.
    const restoreFiles=new DataTransfer();
    restoreFiles.items.add(new File([pngBytes],'papel.png',{type:'image/png'}));
    cardImageInput.files=restoreFiles.files;
    cardImageInput.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<100&&!newCard.querySelector('[data-p2lrn-dnd-item-image]');i++)
      await new Promise(done=>setTimeout(done,25));
    expect(newCard.querySelector('[data-p2lrn-dnd-item-image]'),
      'Re-upload must restore a mixed image and text card');
    // Click a card itself to select it, without requiring a click on the target zone.
    const pictureOnly=activityDrop.querySelector('[data-p2lrn-dnd-item=item-2]');
    pictureOnly.click();
    expect(itemName.value==='','The editor must not invent a card caption when the teacher did not write one');
    const secondFiles=new DataTransfer();
    secondFiles.items.add(new File([pngBytes],'puente.png',{type:'image/png'}));
    cardImageInput.files=secondFiles.files;
    cardImageInput.dispatchEvent(new Event('change',{bubbles:true}));
    for(let i=0;i<100&&!pictureOnly.querySelector('[data-p2lrn-dnd-item-image]');i++)
      await new Promise(done=>setTimeout(done,25));
    expect(pictureOnly.querySelector('[data-p2lrn-dnd-item-image]'),'Second card image was not added');
    itemName.value='';
    itemName.dispatchEvent(new Event('change',{bubbles:true}));
    expect(!pictureOnly.querySelector('[data-p2lrn-dnd-text]') &&
      pictureOnly.querySelector('[data-p2lrn-dnd-item-image]'),
      'Image-only tiles must not render a blank or automatically numbered caption');
    altField.value='Puente de madera';
    altField.dispatchEvent(new Event('change',{bubbles:true}));
    expect(pictureOnly.querySelector('img')?.alt==='Puente de madera',
      'Image-only card lost its accessible description');
    // The board is percentage-based, so drop zones stay aligned when responsive.
    const hotspot=activityDrop.querySelector('[data-p2lrn-dnd-zone]');
    expect(hotspot.style.left.endsWith('%')&&hotspot.style.width.endsWith('%'),
      'Hotspots must use responsive percentage coordinates');
    // Direct authoring gestures run in Editar, including with the inspector open.
    expect(item.surface.classList.contains('p2lrn-studio-drop-editing'),
      'Drag editing must be active without switching to Vista alumno');
    expect(getComputedStyle(hotspot).userSelect==='none'&&
      getComputedStyle(hotspot).touchAction==='none'&&
      getComputedStyle(hotspot).cursor==='move',
      'Editor zones still permit text selection or lack a drag cursor');
    expect(getComputedStyle(newCard).cursor==='grab',
      'Editor cards do not expose direct drag affordances');
    const board=activityDrop.querySelector('[data-p2lrn-dnd-board]');
    const hotspotBefore={left:hotspot.style.left,top:hotspot.style.top};
    const hb=hotspot.getBoundingClientRect();
    const editPointer=(target,type,x,y,id=104)=>target.dispatchEvent(new PointerEvent(type,{
      bubbles:true,cancelable:true,pointerId:id,pointerType:'mouse',button:0,
      buttons:type==='pointerup'?0:1,clientX:x,clientY:y,
    }));
    const beforeZoneWrites=item.writes;
    editPointer(hotspot,'pointerdown',hb.left+12,hb.top+12);
    editPointer(hotspot,'pointermove',hb.left+40,hb.top+28);
    editPointer(hotspot,'pointerup',hb.left+40,hb.top+28);
    expect(hotspot.style.left!==hotspotBefore.left&&hotspot.style.top!==hotspotBefore.top,
      'Destination cannot be dragged directly while editing');
    expect(item.writes>beforeZoneWrites,'Moved zone position was not persisted');
    const movedZone=[...activityDrop.querySelectorAll('[data-p2lrn-dnd-zone]')]
      .find(z=>z.dataset.p2lrnDndAccept===newCard.dataset.p2lrnDndItem);
    const startPos={left:movedZone.style.left,top:movedZone.style.top};
    const br=board.getBoundingClientRect(),cr=newCard.getBoundingClientRect();
    const newX=br.left+br.width*.78,newY=br.top+br.height*.24;
    const beforeCardWrites=item.writes;
    editPointer(newCard,'pointerdown',cr.left+12,cr.top+12,105);
    editPointer(newCard,'pointermove',newX,newY,105);
    editPointer(newCard,'pointerup',newX,newY,105);
    expect(movedZone.style.left!==startPos.left&&movedZone.style.top!==startPos.top,
      'Dragging a card onto the picture did not reposition its corresponding target');
    expect(activityDrop.querySelector('[data-p2lrn-dnd-tray]').contains(newCard),
      'Authoring dragged the card out of the tray and broke the Player mapping');
    expect(item.writes>beforeCardWrites,'Dragging a card did not save its destination');
    const resizedCard=newCard.getBoundingClientRect();
    const cardWidth=resizedCard.width;
    editPointer(newCard,'pointerdown',resizedCard.right-3,resizedCard.bottom-3,106);
    editPointer(newCard,'pointermove',resizedCard.right+35,resizedCard.bottom+15,106);
    editPointer(newCard,'pointerup',resizedCard.right+35,resizedCard.bottom+15,106);
    expect(newCard.getBoundingClientRect().width>cardWidth,
      'Card resizing is unavailable in Editar');
    // The menu must be on a higher stacking layer than the canvas/selection.
    item.toolbar.querySelector('[role=tab][aria-controls*="-insert"]').click();
    zonesMenu.open=true;
    expect(getComputedStyle(item.mount).position!=='static'&&
      Number(getComputedStyle(item.mount).zIndex)>45&&
      Number(getComputedStyle(zonesMenu.querySelector('.p2lrn-file-pop')).zIndex)>80,
      'The open inspector is covered by the edit canvas');
    // The tiny QA host is not the full responsive Studio page. Place the
    // existing open menu in the viewport to test real hit-ordering over a
    // competing positioned canvas without introducing another menu.
    const priorMenuStyle=zonesMenu.getAttribute('style');
    Object.assign(zonesMenu.style,{position:'fixed',left:'20px',top:'20px'});
    const pop=zonesMenu.querySelector('.p2lrn-file-pop');
    const popBox=pop.getBoundingClientRect();
    expect(popBox.width>0&&popBox.height>0,'Drag editor menu is not visible');
    const blocker=document.createElement('div');
    Object.assign(blocker.style,{position:'fixed',left:(popBox.left+10)+'px',
      top:(popBox.top+10)+'px',width:'60px',height:'60px',background:'red',
      pointerEvents:'auto',zIndex:'45'});
    item.root.append(blocker);
    try{
      const hits=(typeof item.root.elementsFromPoint==='function'?
        item.root.elementsFromPoint(popBox.left+25,popBox.top+25):
        document.elementsFromPoint(popBox.left+25,popBox.top+25));
      expect(hits.some(el=>pop===el||pop.contains(el))&&
        !(hits[0]===blocker||blocker.contains(hits[0])),
        'Open drag editor menu is behind an overlapping canvas layer');
    }finally{
      blocker.remove();
      if(priorMenuStyle===null)zonesMenu.removeAttribute('style');
      else zonesMenu.setAttribute('style',priorMenuStyle);
    }
    // Reproduce the teacher's end-of-lesson insertion bug with a previously
    // selected exercise and a caret now positioned below its last activity.
    const endCaret=item.surface.querySelector('p[data-p2lrn-end-caret]');
    expect(endCaret&&endCaret.isConnected,'No editable caret exists below the final activity');
    const atEnd=document.createRange();atEnd.selectNodeContents(endCaret);atEnd.collapse(true);
    const browserSelection=(typeof item.root.getSelection==='function'?item.root.getSelection():null)||document.getSelection();
    browserSelection.removeAllRanges();browserSelection.addRange(atEnd);
    item.root.dispatchEvent(new Event('selectionchange'));
    document.dispatchEvent(new Event('selectionchange'));
    item.toolbar.querySelector('[role=tab][aria-controls$="-insert"]').click();
    item.toolbar.querySelector('[data-ui-layout=section]').click();
    const addedAfter=item.surface.querySelector(':scope > [data-p2lrn-layout=section]');
    const lastEndCaret=item.surface.querySelector(':scope > p[data-p2lrn-end-caret]');
    expect(addedAfter&&addedAfter.nextElementSibling===lastEndCaret,
      'The last inserted section must appear immediately above the ending caret');
    expect(!activityDrop.contains(addedAfter),
      'Inserting after an exercise must never accidentally nest inside its board');
    item.toolbar.querySelector('[data-ui-action=save]').click();
    const fileMenu=item.toolbar.querySelector('.p2lrn-file-menu');
    expect(fileMenu.querySelectorAll('[data-ui-action=export]').length===1,'Export action must exist once in Archivo');
    fileMenu.open=true;fileMenu.querySelector('[data-ui-action=export]').click();
    const lessonBeforePreview=item.surface.innerHTML;
    const student=item.toolbar.querySelector('[data-ui-action=preview]');
    const edit=item.toolbar.querySelector('[data-ui-action=edit]');
    expect(student&&edit,'Two explicit mode controls must remain visible');
    student.click();
    await new Promise(done=>setTimeout(done,0));
    expect(student.textContent==='Vista alumno'&&student.dataset.uiAction==='preview','Student option disappeared while viewing as a student');
    expect(student.getAttribute('aria-pressed')==='true'&&edit.getAttribute('aria-pressed')==='false','Preview mode not selected');
    expect(item.actions.includes('save')&&item.actions.includes('export')&&item.actions.includes('preview'),'One of the visible actions did not execute');
    edit.click();
    await new Promise(done=>setTimeout(done,0));
    expect(item.actions.includes('edit'),'Cannot return to editing from student view');
    expect(edit.getAttribute('aria-pressed')==='true'&&student.getAttribute('aria-pressed')==='false','Edit mode not restored');
    expect(item.surface.innerHTML===lessonBeforePreview,'Mode toggle modified the lesson content');
    const exported=await exportP2LRNPackage(item.course);
    const bytes=exported.bytes;
    const reopened=await openP2LRNPackageBytes(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    const activity=reopened.entities.get(item.lesson.id);
    const resource=reopened.entities.get(activity.resource);
    const path=resource.representations.find(rep=>rep.role==='primary').location.path;
    const html=new TextDecoder().decode(await reopened.payload(path).read());
    expect(html.includes('data-p2lrn-layout="columns"'),'Exported course lost visual layout');
    expect(html.includes('rgb(239, 246, 255)'),'Exported course lost design styles');
    expect(html.includes('La explicación debe conservarse.'),'Exported course lost original lesson text');
    expect(html.includes('data-p2lrn-shape="triangle"'),'Exported course lost the selected shape');
    const exportedShapes=new DOMParser().parseFromString(html,'text/html').querySelectorAll('figure[data-p2lrn-layout="shape"]');
    expect(exportedShapes.length>=2&&[...exportedShapes].every(figure=>!figure.querySelector('figcaption')),
      'Export or Player still contains automatically printed shape names');
    expect(html.includes('data-p2lrn-layout="dropdown"'),'Exported course lost native dropdown');
    expect(html.includes('data-p2lrn-dnd="1"')&&html.includes('data-p2lrn-dnd-accept="item-3"'),
      'Exported course lost image hotspot mapping');
    expect(html.includes('data:image/png;base64,'),'Exported course lost the author-provided background image');
    expect(html.includes('Papel reciclado')&&html.includes('Zona de reciclaje'),'Exported course lost customized hotspot answers');
    expect((html.match(/data-p2lrn-dnd-item-image/g)||[]).length>=2,
      'Export lost the embedded mixed and image-only draggable cards');
    expect(html.includes('Puente de madera')&&html.includes('data-p2lrn-dnd-text'),
      'Export lost image-only card alternative or text/image distinction');
    expect(!html.includes('<script')&&!html.includes('onerror='),'Lesson must remain inert HTML');
    const imagePlayer=prepareStudioDropSandbox(html);
    expect(imagePlayer?.html.includes('data-p2lrn-dnd-item-image')&&
      imagePlayer.html.includes('data:image/png;base64,')&&imagePlayer.html.includes('Puente de madera'),
      'The sandboxed Player lost embedded draggable images or alternative text');
    item.ui.setMessage('Cambios guardados');
    expect(item.toolbar.querySelector('[role=status]').textContent==='Cambios guardados','Status feedback is not visible');
  }
  // The Player only runs the bundled interaction script in an opaque iframe.
  // User HTML, event handlers, base/link/iframe tags and their scripts are removed.
  const hostile='<section data-p2lrn-layout="drag-drop" data-p2lrn-dnd="1"><div data-p2lrn-dnd-board></div></section>'
    +'<script>window.P2LRN_UNSAFE_EXECUTED=true</script>'
    +'<img src="javascript:alert(1)" onerror="window.P2LRN_UNSAFE_EXECUTED=true">';
  const secured=prepareStudioDropSandbox(hostile);
  expect(secured?.interactive===true,'Studio drop-lesson sanitizer is not enabled');
  expect(!secured.html.includes('P2LRN_UNSAFE_EXECUTED'),'Untrusted script was preserved in the Player iframe');
  expect(!secured.html.includes('onerror=')&&!secured.html.includes('javascript:alert'),'Unsafe URL or event handler survived the sandbox');
  expect(secured.html.includes("script-src 'nonce-"),'Player interactive sandbox lacks nonce CSP');
  expect(secured.html.includes('data-p2lrn-dnd-board'),'Approved hotspot model lost on sanitization');
  expect(prepareStudioDropSandbox('<p>Ordinary lesson</p>')===null,'Normal lessons must stay scriptless');
  const safeBox=document.createElement('div');
  const interactiveView=await renderPassiveText({container:safeBox,bytes:new TextEncoder().encode(hostile),representation:{mediaType:'text/html'}});
  const sandbox=safeBox.querySelector('iframe');
  expect(sandbox?.getAttribute('sandbox')==='allow-scripts','Drop Player must use opaque-origin, script-limited sandbox');
  expect(!sandbox.getAttribute('sandbox').includes('allow-same-origin'),'Sandbox accidentally grants same-origin privileges');
  interactiveView.destroy();
  const ordinaryBox=document.createElement('div');
  const ordinaryView=await renderPassiveText({container:ordinaryBox,bytes:new TextEncoder().encode('<p>safe</p>'),representation:{mediaType:'text/html'}});
  expect(ordinaryBox.querySelector('iframe')?.getAttribute('sandbox')==='','Ordinary HTML iframe unexpectedly gained script permission');
  ordinaryView.destroy();
  // Real interaction state: wrong answers stay in the tray, right answers move
  // into their specific zones, and completion locks the activity until reset.
  const scene=createStudioDropActivity(document);
  document.body.append(scene);
  const source=[...scene.querySelectorAll('[data-p2lrn-dnd-item]')];
  const targets=[...scene.querySelectorAll('[data-p2lrn-dnd-zone]')];
  // An image-only card must be usable with a screen reader, mouse and keyboard.
  const picture=document.createElement('img');
  picture.dataset.p2lrnDndItemImage='';
  picture.setAttribute('src','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y7lMqYAAAAASUVORK5CYII=');
  picture.alt='Un puente de madera';
  source[1].prepend(picture);
  const secondText=source[1].querySelector('[data-p2lrn-dnd-text]');
  secondText.textContent='';secondText.hidden=true;
  let originalCardStyle=source[1].getAttribute('style');
  // Player initialization already happened above; the new scene needs activation.
  bootStudioDropActivities();
  // Runtime intentionally removes the opaque backing from image-only cards
  // before capturing the reset baseline. Compare against that visible state.
  originalCardStyle=source[1].getAttribute('style');
  expect(source[1].style.backgroundColor==='transparent',
    'The Player flattened a transparent PNG onto an opaque tile');
  expect(source[1].getAttribute('aria-label')==='Ficha: Un puente de madera',
    'Image-only cards are not accessible to students');
  source[0].click();targets[1].click();
  expect(scene.querySelector('[data-p2lrn-dnd-tray]').contains(source[0]),'Wrong answer was accepted by Player');
  expect(scene.querySelector('[data-p2lrn-dnd-status]').textContent.includes('No corresponde'),
    'Wrong drop does not explain the error');
  targets[0].click();
  expect(targets[0].contains(source[0]),'Correct answer did not move to its assigned zone');
  source[1].click();targets[1].click();
  expect(targets[1].contains(picture)&&targets[1].querySelector('[data-p2lrn-dnd-label]').hidden,
    'The placed image did not replace the target label');
  expect(source[1].style.maxHeight==='100%','An image tile does not fit inside its destination');
  expect(scene.dataset.p2lrnDndCompleted==='true','Completion state was not reached');
  const reset=scene.querySelector('button');
  expect(reset?.textContent==='Reiniciar actividad','The student cannot restart a drop activity');
  reset.click();
  expect(scene.querySelector('[data-p2lrn-dnd-tray]').contains(source[0])&&!scene.dataset.p2lrnDndCompleted,
    'Reset did not restore draggable pieces');
  expect(scene.querySelector('[data-p2lrn-dnd-tray]').contains(source[1]) &&
    source[1].getAttribute('style')===originalCardStyle &&
    !targets[1].querySelector('[data-p2lrn-dnd-label]').hidden,
    'Reset did not restore image card dimensions and destination labels');
  scene.remove();
  // Assembly authoring must be a real shared editor, not an inert screenshot,
  // and its GLB must survive a complete .p2lrn round-trip in both DOM modes.
  const {renderQuestionnaireVisualEditor}=await import('/studio/questionnaire-editor.js');
  const {buildQuestionnaireGame}=await import('/questionnaire-games-core.js');
  const {create3DAuthoringScene}=await import('/player/current/dist/p2lrn.esm.js');
  const makeGLB=()=>{
    const body=new Uint8Array(44),dv=new DataView(body.buffer);
    const xyz=[0,0,0,0.8,0,0,0,0.8,0];
    xyz.forEach((v,i)=>dv.setFloat32(i*4,v,true));
    [0,1,2].forEach((v,i)=>dv.setUint16(36+i*2,v,true));
    const json={
      asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],
      nodes:[{name:'Pieza geométrica',mesh:0}],
      meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],
      buffers:[{byteLength:44}],
      bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],
      accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[0.8,0.8,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}],
    };
    const encoded=new TextEncoder().encode(JSON.stringify(json)),length=(encoded.length+3)&~3;
    const out=new Uint8Array(12+8+length+8+body.length);
    const h=new DataView(out.buffer);
    h.setUint32(0,0x46546c67,true);h.setUint32(4,2,true);h.setUint32(8,out.length,true);
    h.setUint32(12,length,true);h.setUint32(16,0x4e4f534a,true);
    out.fill(32,20,20+length);out.set(encoded,20);
    h.setUint32(20+length,body.length,true);h.setUint32(24+length,0x004e4942,true);
    out.set(body,28+length);
    return out;
  };
  for(const item of [website,npm]){
    const activity=item.course.addGame(item.course.rootId,{kind:'assembly-3d',title:'Ensamblaje validado'});
    const current=await item.course.readQuestionnaire(activity.id);
    expect(current.payload.questions[0].assembly3d?.targets?.length===2,'Assembly 3D activity was not created');
    const inspector=document.createElement('div');item.root.append(inspector);
    renderQuestionnaireVisualEditor(inspector,{model:item.course,activityId:activity.id,payload:current.payload,
      renderer:'https://p2lrn.org/renderer/questionnaire/3d-order-match',createScene:create3DAuthoringScene});
    await Promise.resolve();
    expect(inspector.querySelector('.p2lrn-assembly-editor svg'),'Native assembly geometry editor missing');
    const selected=inspector.querySelector('.a3-fields input');
    expect(selected,'Authoring transform field missing');
    const previous=Number(selected.value);
    selected.value=String(previous-0.45);
    selected.dispatchEvent(new Event('change',{bubbles:true}));
    const modified=await item.course.readQuestionnaire(activity.id);
    expect(Math.abs(modified.payload.questions[0].assembly3d.targets[0].transform.position[0]-(previous-0.45))<0.001,
      '3D authoring did not persist XYZ edits to native questionnaire bytes');
    const pieceSelect=[...inspector.querySelectorAll('.a3-tree button')].find(button=>button.textContent==='Pieza 1');
    expect(pieceSelect,'Teacher cannot select a piece for GLB assignment');
    pieceSelect.click();
    const upload=inspector.querySelector('input[type=file]');
    expect(upload,'Shared editor cannot import GLB through the visible UI');
    const transfer=new DataTransfer();
    transfer.items.add(new File([makeGLB()],'pieza.glb',{type:'model/gltf-binary'}));
    upload.files=transfer.files;
    upload.dispatchEvent(new Event('change',{bubbles:true}));
    let imported=null;
    for(let i=0;i<100;i++){
      await new Promise(done=>setTimeout(done,75));
      imported=await item.course.readQuestionnaire(activity.id);
      if(imported.payload.questions[0].assembly3d.assets[0]?.path&&imported.payload.questions[0].assembly3d.pieces[0].assetId)break;
    }
    const sceneDataImported=imported?.payload.questions[0].assembly3d;
    expect(sceneDataImported?.assets?.length===1&&sceneDataImported.pieces[0].assetId===sceneDataImported.assets[0].id,
      'Visible Studio import did not bind GLB asset to its selected piece');
    const asset=sceneDataImported.assets[0];
    const webgl=inspector.querySelector('canvas.a3-webgl');
    for(let i=0;i<100&&webgl?.hidden;i++)await new Promise(done=>setTimeout(done,75));
    expect(webgl&&!webgl.hidden&&webgl.width>=320&&Boolean(webgl.getContext('webgl2')),
      'Shared professor editor did not initialize a real Three.js WebGL2 scene');
    for(let i=0;i<100;i++){
      const warning=inspector.querySelector('.a3-error')?.textContent??'';
      if(warning.includes('No se pudo mostrar')||warning.includes('Vista 3D no disponible'))throw new Error(warning);
      if(!inspector.querySelector('.a3-scene svg')?.hidden)throw new Error('Three.js authoring unexpectedly switched back to SVG fallback');
      await new Promise(done=>setTimeout(done,40));
      if(i===7)break;
    }
    const exported=await exportP2LRNPackage(item.course);
    const opened=await openP2LRNPackageBytes(exported.bytes.buffer.slice(exported.bytes.byteOffset,exported.bytes.byteOffset+exported.bytes.byteLength));
    const rendered=opened.entities.get(activity.id);
    expect(rendered?.type==='activity','Round-trip removed assembly activity');
    const resource=opened.entities.get(rendered.resource);
    const file=resource?.representations.find(r=>r.role==='primary')?.location?.path;
    const data=JSON.parse(new TextDecoder().decode(await opened.payload(file).read()));
    const sceneData=data.questions[0].assembly3d;
    expect(sceneData.targets.length===2&&sceneData.assets[0].path===asset.path,'3D geometry or GLB references were lost on export');
    const glbBytes=await opened.payload(asset.path).read();
    expect(glbBytes.byteLength===asset.size,'GLB model bytes missing from portable P2LRN course');
    const game=buildQuestionnaireGame(data,'https://p2lrn.org/renderer/questionnaire/3d-order-match');
    expect(game.compatible&&game.data.trials[0].type==='assembly-3d','Exported assembly is not playable');
    inspector.remove();
  }
  const label=website.toolbar.querySelector('[role=tab][aria-selected=true]');
  expect(label.textContent==='Formato','Tab state is not consistent');
  const lightStyle=getComputedStyle(website.toolbar).fontFamily;
  const shadowStyle=getComputedStyle(npm.toolbar).fontFamily;
  expect(lightStyle===shadowStyle,'Stylesheets differ across light and Shadow DOM');
  return {ok:true,sameUI:true,sharedControls:website.toolbar.querySelectorAll('button').length,
    persisted:website.writes>0&&npm.writes>0,roundTrip:true,shadowDOM:true,stylesMatch:true};
}

const webRoot=resolve('packages/toolkit/web');
let chrome=null,profile=null,server=null,ws=null;
try{
  const browser=findChrome();
  if(!browser)throw new Error('Chrome or Edge required to verify Studio visually.');
  server=createServer((req,res)=>{
    let url;
    try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end();return;}
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body></body></html>');return;}
    const isPlayer=url.pathname.startsWith('/player/current/dist/');
    const root=isPlayer?resolve('packages/player/dist'):webRoot;
    const requested=isPlayer?url.pathname.slice('/player/current/dist/'.length):'.'+url.pathname;
    const path=resolve(root,decodeURIComponent(requested));
    if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    readFile(path).then(bytes=>{res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);}).catch(()=>{res.writeHead(404);res.end();});
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',done);});
  profile=await mkdtemp(join(tmpdir(),'p2lrn-unified-ui-'));
  chrome=spawn(browser,['--headless=new','--no-first-run','--disable-extensions','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let debugPort=0;
  for(let i=0;i<100;i++){
    const active=join(profile,'DevToolsActivePort');
    if(existsSync(active)){debugPort=Number((await readFile(active,'utf8')).split('\n')[0]);break;}
    await sleep(120);
  }
  if(!debugPort)throw new Error('Chrome debug port unavailable');
  const pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json')).json();
  const page=pages.find(x=>x.type==='page');
  if(!page)throw new Error('Chrome did not expose a page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done,fail)=>{ws.onopen=done;ws.onerror=fail;});
  const pending=new Map();let seq=0;
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),task=pending.get(message.id);
    if(!task)return;
    pending.delete(message.id);
    if(message.error)task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  };
  const send=(method,params={})=>new Promise((done,fail)=>{
    const id=++seq;pending.set(id,{resolve:done,reject:fail});
    ws.send(JSON.stringify({id,method,params}));
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});
  for(let i=0;i<60;i++){
    const r=await send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
    if(r.result?.value==='complete')break;
    await sleep(100);
  }
  const r=await send('Runtime.evaluate',{
    expression:'('+browserScenario.toString()+')()',returnByValue:true,awaitPromise:true
  });
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  assert.equal(r.result?.value?.ok,true);
  console.log(JSON.stringify(r.result.value,null,2));
}finally{
  try{ws?.close();}catch{}
  try{chrome?.kill();}catch{}
  if(server)await new Promise(done=>server.close(done));
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:180});
}

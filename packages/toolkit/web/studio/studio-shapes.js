// Shared shape library for the hosted and embedded Studio. No SVG markup is
// persisted in lessons: HTML/CSS shapes survive the strict editor sanitizer.
const regular=(points,rotation=-90)=>{
  const items=[];
  for(let i=0;i<points;i++){
    const angle=(rotation+i*360/points)*Math.PI/180;
    items.push((50+49*Math.cos(angle)).toFixed(2)+'% '+(50+49*Math.sin(angle)).toFixed(2)+'%');
  }
  return 'polygon('+items.join(',')+')';
};
const star=(points,inner=.43,rotation=-90)=>{
  const items=[];
  for(let i=0;i<points*2;i++){
    const angle=(rotation+i*180/points)*Math.PI/180;
    const r=i%2?49*inner:49;
    items.push((50+r*Math.cos(angle)).toFixed(2)+'% '+(50+r*Math.sin(angle)).toFixed(2)+'%');
  }
  return 'polygon('+items.join(',')+')';
};
export const STUDIO_SHAPES=Object.freeze([
  {id:'line',label:'Línea',kind:'stroke'},
  {id:'curve',label:'Arco',kind:'curve'},
  {id:'wave',label:'Línea ondulada',kind:'wave'},
  {id:'ellipse',label:'Óvalo',radius:'50%'},
  {id:'droplet',label:'Gota',clip:'polygon(50% 0,73% 25%,88% 47%,96% 65%,95% 77%,87% 90%,73% 98%,50% 100%,27% 98%,13% 90%,5% 77%,4% 65%,12% 47%,27% 25%)'},
  {id:'cloud',label:'Nube',clip:'polygon(9% 79%,3% 72%,1% 59%,5% 47%,14% 41%,21% 42%,25% 29%,36% 20%,49% 20%,60% 28%,65% 39%,72% 34%,83% 36%,93% 45%,99% 58%,97% 73%,90% 83%,77% 87%,22% 87%)'},
  {id:'freeform',label:'Forma libre',clip:'polygon(10% 25%,42% 5%,88% 18%,98% 62%,60% 92%,15% 75%)'},
  {id:'square',label:'Cuadrado',clip:'inset(0)'},
  {id:'rectangle',label:'Rectángulo',clip:'inset(0)'},
  {id:'parallelogram',label:'Paralelogramo',clip:'polygon(20% 0,100% 0,80% 100%,0 100%)'},
  {id:'triangle',label:'Triángulo',clip:regular(3)},
  {id:'right-triangle',label:'Triángulo rectángulo',clip:'polygon(0 100%,0 0,100% 100%)'},
  {id:'diamond',label:'Rombo',clip:'polygon(50% 0,100% 50%,50% 100%,0 50%)'},
  {id:'pentagon',label:'Pentágono',clip:regular(5)},
  {id:'hexagon',label:'Hexágono',clip:regular(6)},
  {id:'arrow-right',label:'Flecha derecha',clip:'polygon(0 27%,60% 27%,60% 0,100% 50%,60% 100%,60% 73%,0 73%)'},
  {id:'arrow-left',label:'Flecha izquierda',clip:'polygon(40% 0,40% 27%,100% 27%,100% 73%,40% 73%,40% 100%,0 50%)'},
  {id:'arrow-up',label:'Flecha arriba',clip:'polygon(50% 0,100% 40%,73% 40%,73% 100%,27% 100%,27% 40%,0 40%)'},
  {id:'arrow-down',label:'Flecha abajo',clip:'polygon(27% 0,73% 0,73% 60%,100% 60%,50% 100%,0 60%,27% 60%)'},
  {id:'curved-arrow',label:'Flecha curva',kind:'curved-arrow'},
  {id:'star-4',label:'Estrella de cuatro puntas',clip:star(4,.35)},
  {id:'star-5',label:'Estrella de cinco puntas',clip:star(5,.47)},
  {id:'star-6',label:'Estrella de seis puntas',clip:star(6,.56)},
  {id:'star-8',label:'Estrella de ocho puntas',clip:star(8,.58)},
  {id:'speech-rect',label:'Bocadillo rectangular',clip:'polygon(0 0,100% 0,100% 77%,42% 77%,28% 100%,30% 77%,0 77%)'},
  {id:'speech-oval',label:'Bocadillo ovalado',clip:'polygon(50% 0,78% 4%,95% 20%,100% 48%,90% 74%,61% 83%,37% 100%,40% 83%,12% 72%,0 48%,6% 21%,23% 5%)'},
  {id:'thought',label:'Bocadillo de pensamiento',clip:'polygon(10% 32%,0 20%,12% 11%,27% 14%,37% 0,55% 7%,67% 0,79% 12%,98% 15%,92% 35%,100% 54%,88% 69%,79% 82%,54% 82%,38% 100%,34% 85%,15% 79%,4% 59%)'},
]);
export const STUDIO_SHAPE_IDS=Object.freeze(STUDIO_SHAPES.map(shape=>shape.id));
export function getStudioShape(id){
  return STUDIO_SHAPES.find(shape=>shape.id===id)??null;
}
export function styleStudioShapeArt(art,id){
  const shape=getStudioShape(id);
  if(!shape)throw new RangeError('Forma no reconocida: '+id);
  art.dataset.p2lrnShapeArt=id;
  Object.assign(art.style,{
    display:'block',boxSizing:'border-box',width:'100%',height:'100%',
    minHeight:'56px',flex:'1 1 auto',backgroundColor:'#2563eb',
    border:'0',borderRadius:'0',clipPath:'none',
  });
  if(shape.radius)art.style.borderRadius=shape.radius;
  if(shape.clip)art.style.clipPath=shape.clip;
  if(shape.kind==='stroke'){
    art.style.backgroundColor='transparent';
    art.style.borderBottom='8px solid #2563eb';
    art.style.minHeight='20px';
    art.style.flex='0 0 50%';
  }else if(shape.kind==='curved-arrow'){
    art.style.backgroundColor='transparent';
    art.style.borderBottom='8px solid #2563eb';
    art.style.borderRight='8px solid #2563eb';
    art.style.borderRadius='0 0 75% 0';
    art.style.minHeight='54px';
    art.style.flex='1 1 auto';
    art.style.position='relative';
    // The arrowhead is an ordinary, inert HTML span. The exact same markup
    // persists in lessons and works in the Player without an SVG or runtime.
    let tip=art.querySelector(':scope > [data-p2lrn-connector-tip]');
    if(!tip){
      tip=art.ownerDocument.createElement('span');
      tip.dataset.p2lrnConnectorTip='1';
      tip.setAttribute('aria-hidden','true');
      art.append(tip);
    }
    Object.assign(tip.style,{
      position:'absolute',right:'-18px',top:'-9px',width:'30px',height:'33px',
      backgroundColor:'#2563eb',clipPath:'polygon(50% 0,100% 60%,67% 60%,67% 100%,33% 100%,33% 60%,0 60%)',
      display:'block',
    });
  }else if(shape.kind==='curve'||shape.kind==='wave'){
    art.style.backgroundColor='transparent';
    art.style.borderBottom='8px solid #2563eb';
    art.style.borderRadius=shape.kind==='curve'?'0 0 50% 50%':'30% 0 35% 0';
    art.style.minHeight='38px';
    art.style.flex='0 0 62%';
  }
  return art;
}
export function createStudioShape(doc,id='rectangle'){
  const shape=getStudioShape(id);
  if(!shape)throw new RangeError('Forma no reconocida: '+id);
  const figure=doc.createElement('figure');
  figure.dataset.p2lrnLayout='shape';
  figure.dataset.p2lrnShape=id;
  Object.assign(figure.style,{
    display:'flex',flexDirection:'column',gap:'10px',width:'240px',
    maxWidth:'100%',boxSizing:'border-box',minHeight:'150px',
    padding:'8px',margin:'16px 0',textAlign:'center',
  });
  const art=doc.createElement('span');
  art.setAttribute('aria-hidden','true');
  styleStudioShapeArt(art,id);
  // The shape name is for accessibility and the insert palette, not printed
  // beneath the shape in the authored lesson.
  figure.setAttribute('role','img');
  figure.setAttribute('aria-label',shape.label);
  figure.append(art);
  return figure;
}

// Remove only the historical, exact autogenerated caption. Teacher-written
// captions with different text are never deleted when an older course opens.
export function normalizeStudioShapeCaptions(surface){
  let updated=0;
  for(const figure of surface?.querySelectorAll?.('figure[data-p2lrn-layout="shape"][data-p2lrn-shape]')??[]){
    const shape=getStudioShape(figure.dataset.p2lrnShape);
    if(!shape)continue;
    const caption=figure.querySelector(':scope > figcaption');
    if(!caption||caption.children.length||caption.textContent?.trim()!==shape.label)continue;
    caption.remove();
    figure.setAttribute('role','img');
    figure.setAttribute('aria-label',shape.label);
    updated++;
  }
  return updated;
}

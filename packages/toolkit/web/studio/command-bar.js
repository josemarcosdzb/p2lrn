import {VISUAL_LAYOUT_BLOCKS,insertVisualLayoutBlock,STUDIO_SHAPES} from './visual-layout.js';
import {styleStudioShapeArt} from './studio-shapes.js';
import {addStudioDropPair,isStudioDropActivity,removeStudioDropPair,setStudioDropBackground,removeStudioDropBackground,mountStudioDropAuthoring,getStudioDropItemText,setStudioDropItemText,setStudioDropItemImage,setStudioDropItemImageAlt,removeStudioDropItemImage} from './studio-drop-activity.js';
import {mountAdvancedStudioTools} from './studio-advanced-tools.js';

// Canonical Studio chrome. Both the hosted Studio and @p2lrn/studio mount
// this exact control tree and CSS; platform-specific commands stay adapters.
export const STUDIO_COMMAND_BAR_VERSION='1';
const PALETTE=Object.freeze([
  ['white','Blanco','#ffffff'],['fog','Niebla','#f1f5f9'],
  ['blue','Azul','#eff6ff'],['sand','Arena','#fef3c7']
]);

export const STUDIO_CONTENT_CATALOG=Object.freeze([
  {group:'Contenido',items:[
    ['lesson','Lección','Texto, imágenes, tablas y diseño visual'],
    ['file','Archivo o multimedia','Inserta imágenes, vídeo, audio y otros archivos'],
    ['url','Recurso web','Añade un enlace a una página o recurso'],
    ['reader','Importar documento','Reader para PDF, DOCX, PPTX y más'],
    ['external','Paquete educativo','SCORM, H5P, QTI, cmi5 y otros perfiles'],
    ['shared-resource','Recurso compartido','Vincula un recurso verificable'],
    ['shared-library','Biblioteca conectada','Selecciona recursos del host']
  ]},
  {group:'Evaluación',items:[
    ['questionnaire','Cuestionario','Preguntas, corrección y seguimiento']
  ]},
  {group:'Juegos',items:[
    ['memory','Memoria','Encuentra parejas'],
    ['matching','Relacionar','Une conceptos y respuestas'],
    ['ordering','Ordenar','Organiza elementos en secuencia'],
    ['classification','Clasificar','Asigna elementos a categorías'],
    ['true-false','Verdadero o falso','Valora afirmaciones'],
    ['fill-blanks','Completar huecos','Rellena espacios vacíos'],
    ['word-search','Sopa de letras','Encuentra términos ocultos'],
    ['crossword','Crucigrama','Resuelve pistas'],
    ['rosco','Rosco','Responde a las pistas del alfabeto'],
    ['3d','Juego 3D','Ordena objetos 3D'],
    ['3d-matching','Relacionar 3D','Conecta objetos 3D'],
    ['3d-classification','Clasificar 3D','Clasifica objetos 3D']
  ]},
  {group:'Colaboración',items:[
    ['live-poll','Votación en directo','Participación conectada al host'],
    ['shared-board','Pizarra compartida','Trabajo colaborativo'],
    ['peer-review','Revisión entre pares','Comentarios entre alumnos']
  ]},
  {group:'Estructura avanzada',items:[
    ['component','Componente nativo','Avisos y líneas temporales'],
    ['composite','Grupo de actividades','Combina actividades existentes']
  ]}
]);

const FONT_FAMILIES=['Arial','Calibri','Georgia','Verdana','Times New Roman'];
const FONT_SIZES=[12,14,16,18,20,24,28,32,40,48];
const BLOCK_STYLES=[['p','Párrafo'],['h1','Título 1'],['h2','Título 2'],['h3','Título 3'],['blockquote','Cita']];
let instance=0;
const CSS=[
  '.p2lrn-studio-unified{display:block!important;padding:0!important;border:1px solid #dbe2eb!important;border-radius:13px!important;background:#fff!important;box-shadow:0 6px 22px rgba(15,23,42,.06)!important;overflow:visible!important;min-width:0!important}',
  '.p2lrn-studio-unified[hidden]{display:none!important}',
  '.p2lrn-studio-legacy-topbar{display:none!important}',
  '.p2lrn-studio-unified > :not(.p2lrn-studio-ribbon){display:none!important}',
  '.p2lrn-studio-ribbon,.p2lrn-studio-ribbon *{box-sizing:border-box}',
  '.p2lrn-studio-ribbon{font:500 13px/1.35 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1f2937;min-width:0}',
  '.p2lrn-ribbon-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 15px;border-bottom:1px solid #e8edf3}',
  '.p2lrn-ribbon-identity{display:flex;align-items:center;gap:10px;min-width:0}',
  '.p2lrn-ribbon-mark{display:grid;place-items:center;flex:none;width:33px;height:33px;border-radius:9px;background:#111827;color:#fff;font-weight:800;letter-spacing:-.08em;font-size:14px}',
  '.p2lrn-ribbon-name{display:grid;gap:1px;min-width:0}',
  '.p2lrn-ribbon-name strong{font-size:13px;letter-spacing:-.02em}',
  '.p2lrn-ribbon-name small{color:#667085;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:330px}',
  '.p2lrn-ribbon-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}',
  '.p2lrn-studio-ribbon button,.p2lrn-studio-ribbon select,.p2lrn-studio-ribbon input{font:inherit}',
  '.p2lrn-studio-ribbon button,.p2lrn-studio-ribbon .p2lrn-file-menu>summary,.p2lrn-studio-ribbon .p2lrn-import-menu>summary{min-height:34px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #dbe2eb;border-radius:7px;background:#fff;color:#344054;padding:7px 10px;cursor:pointer;text-decoration:none;white-space:nowrap}',
  '.p2lrn-studio-ribbon button:hover:not(:disabled),.p2lrn-studio-ribbon summary:hover{background:#f4f7fa;border-color:#bac6d5}',
  '.p2lrn-studio-ribbon button:focus-visible,.p2lrn-studio-ribbon summary:focus-visible,.p2lrn-studio-ribbon select:focus-visible,.p2lrn-studio-ribbon input:focus-visible{outline:2px solid #4b77bf;outline-offset:2px}',
  '.p2lrn-studio-ribbon button:disabled{opacity:.48;cursor:not-allowed}',
  '.p2lrn-studio-ribbon button.p2lrn-primary{background:#1f2937;color:white;border-color:#1f2937;font-weight:650}',
  '.p2lrn-studio-ribbon button.p2lrn-primary:hover:not(:disabled){background:#344054}',
  '.p2lrn-studio-ribbon button[aria-pressed=true]{background:#eaf1fa;border-color:#b7c9e4;color:#1d4c83}',
  '.p2lrn-ribbon-tabs{display:flex;align-items:center;gap:5px;padding:6px 14px 0;border-bottom:1px solid #e8edf3;overflow-x:auto}',
  '.p2lrn-studio-ribbon .p2lrn-ribbon-tab{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;min-height:36px;padding:8px 15px;color:#667085;font-weight:600}',
  '.p2lrn-studio-ribbon .p2lrn-ribbon-tab[aria-selected=true]{color:#243e64;border-bottom-color:#243e64}',
  '.p2lrn-ribbon-panel{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 15px;min-height:64px}',
  '.p2lrn-ribbon-panel[hidden]{display:none!important}',
  '.p2lrn-ribbon-tab[hidden]{display:none!important}',
  '.p2lrn-ribbon-feedback{padding:6px 15px 8px;border-top:1px solid #edf0f4;min-height:28px;font-size:11px;color:#64748b}',
  '.p2lrn-ribbon-modes{display:flex;align-items:center;gap:3px;padding:3px;border:1px solid #dbe2eb;border-radius:9px;background:#f7f9fc;flex:none}',
  '.p2lrn-ribbon-modes button{min-height:32px;padding:7px 12px;border:1px solid transparent;border-radius:6px;background:transparent;color:#475467;white-space:nowrap;font-weight:650}',
  '.p2lrn-ribbon-modes button[aria-pressed=true]{background:#fff;border-color:#cbd6e4;color:#243e64;box-shadow:0 1px 3px rgba(15,23,42,.08)}',
  '.p2lrn-ribbon-group{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
  '.p2lrn-ribbon-divider{width:1px;height:28px;background:#e5e9f0;flex:none}',
  '.p2lrn-ribbon-field{display:grid;gap:3px;font-size:10px;font-weight:650;color:#667085}',
  '.p2lrn-studio-ribbon select{height:35px;min-width:85px;max-width:155px;border:1px solid #dbe2eb;border-radius:7px;background:#fff;color:#344054;padding:0 7px}',
  '.p2lrn-ribbon-icon{font-weight:750;min-width:34px;padding:6px!important}',
  '.p2lrn-ribbon-icon[data-italic=true]{font-style:italic}',
  '.p2lrn-ribbon-icon[data-underline=true]{text-decoration:underline}',
  '.p2lrn-ribbon-icon[data-strike=true]{text-decoration:line-through}',
  '.p2lrn-ribbon-color{display:flex;align-items:center;gap:4px;min-height:34px;padding:3px 7px;border:1px solid #dbe2eb;border-radius:7px;color:#344054}',
  '.p2lrn-ribbon-color input{width:25px;height:25px;border:0;background:transparent;padding:0;cursor:pointer}',
  '.p2lrn-ribbon-caption{font-size:11px;color:#667085}',
  '.p2lrn-file-menu,.p2lrn-import-menu{position:relative}',
  '.p2lrn-file-menu>summary,.p2lrn-import-menu>summary{list-style:none}',
  '.p2lrn-file-menu>summary::-webkit-details-marker,.p2lrn-import-menu>summary::-webkit-details-marker{display:none}',
  '.p2lrn-file-pop{position:absolute;z-index:100;top:calc(100% + 8px);left:0;display:grid;gap:5px;width:235px;max-width:calc(100vw - 30px);background:#fff;border:1px solid #dbe2eb;border-radius:10px;padding:8px;box-shadow:0 18px 35px rgba(15,23,42,.13)}',
  '.p2lrn-file-pop button{justify-content:flex-start!important;border:0!important;width:100%}',
  '.p2lrn-file-pop label{font-size:11px;color:#667085;display:grid;gap:5px;padding:5px}',
  '.p2lrn-file-pop input{width:100%;min-height:34px;border:1px solid #dbe2eb;border-radius:7px;padding:5px 8px}',
  '.p2lrn-file-pop .p2lrn-menu-separator{border-top:1px solid #edf0f4;margin:3px 0}',
  '.p2lrn-import-menu .add-pop{position:absolute!important;top:calc(100% + 7px)!important;left:0!important;z-index:120!important;width:min(680px,calc(100vw - 38px))!important;max-height:min(76vh,650px);overflow:auto;background:white;border:1px solid #dbe2eb;border-radius:10px;box-shadow:0 20px 45px rgba(15,23,42,.16)}',
  '.p2lrn-activity-picker{width:min(880px,calc(100vw - 28px));max-height:min(86vh,850px);padding:0;border:1px solid #e2e7ee;border-radius:14px;background:#fff;color:#1f2937;box-shadow:0 24px 70px rgba(15,23,42,.22);font:500 13px/1.4 Inter,system-ui,sans-serif}',
  '.p2lrn-activity-picker::backdrop{background:rgba(15,23,42,.34)}',
  '.p2lrn-activity-picker-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:22px 24px 14px}',
  '.p2lrn-activity-picker-head h2{margin:0 0 5px;font-size:22px;letter-spacing:-.03em}',
  '.p2lrn-activity-picker-head p{margin:0;color:#667085}',
  '.p2lrn-activity-picker-head button{min-height:35px;padding:7px 11px;border:1px solid #dbe2eb;background:#fff;border-radius:8px;cursor:pointer}',
  '.p2lrn-activity-picker-search{display:block;margin:0 24px 14px;width:calc(100% - 48px);min-height:42px;border:1px solid #dbe2eb;border-radius:8px;padding:8px 13px;font:inherit}',
  '.p2lrn-activity-picker-content{max-height:min(62vh,615px);overflow:auto;padding:0 24px 24px}',
  '.p2lrn-activity-picker-group{padding:13px 0 4px;border-top:1px solid #edf0f4}',
  '.p2lrn-activity-picker-group h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:0 0 12px}',
  '.p2lrn-activity-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:9px}',
  '.p2lrn-activity-picker-grid button{display:grid;align-content:start;gap:5px;min-height:81px;text-align:left;padding:12px;border:1px solid #e2e7ee;border-radius:9px;background:#fff;color:#1f2937;cursor:pointer;font:inherit}',
  '.p2lrn-activity-picker-grid button:hover:not(:disabled){border-color:#aabbd1;background:#f7f9fc}',
  '.p2lrn-activity-picker-grid button:focus-visible{outline:2px solid #4b77bf;outline-offset:2px}',
  '.p2lrn-activity-picker-grid button:disabled{opacity:.45;cursor:not-allowed}',
  '.p2lrn-activity-picker-grid button strong{font-size:13px;font-weight:650}',
  '.p2lrn-activity-picker-grid button small{font-size:11px;color:#667085;line-height:1.45}',
  '.p2lrn-activity-picker [hidden]{display:none!important}',
  '.p2lrn-import-menu .add-help{display:none!important}',
  '.p2lrn-shape-picker>.p2lrn-file-pop{width:min(395px,calc(100vw - 34px));grid-template-columns:repeat(6,minmax(0,1fr));max-height:360px;overflow:auto}',
  '.p2lrn-shape-picker .p2lrn-shape-button{display:grid!important;justify-items:center!important;gap:4px!important;padding:6px 2px!important;min-width:0;white-space:normal!important;color:#334155}',
  '.p2lrn-shape-picker .p2lrn-shape-button small{font:500 9px/1.2 system-ui,sans-serif;text-align:center}',
  '.p2lrn-shape-picker .p2lrn-shape-button>span{display:block;flex:none;max-width:100%}',
  '.p2lrn-ribbon-swatch{width:17px;height:17px;display:inline-block;border-radius:5px;border:1px solid #d0d5dd;flex:none}',
  '.p2lrn-studio-workspace{display:grid!important;grid-template-columns:minmax(230px,260px) minmax(0,1fr)!important;gap:12px!important;min-height:630px}',
  '.p2lrn-studio-workspace[hidden]{display:none!important}',
  '.p2lrn-studio-outline{min-width:0;border:1px solid #e2e7ee;border-radius:11px;background:#fff;overflow:auto}',
  '.p2lrn-studio-outline .tree-actions{display:none!important}',
  '.p2lrn-studio-outline nav,.p2lrn-studio-outline[data-tree]{padding:8px!important}',
  '.p2lrn-studio-outline nav button,.p2lrn-studio-outline[data-tree] > button{color:#344054;font-weight:500;font-size:13px;border:0;background:transparent;min-height:35px;border-radius:7px}',
  '.p2lrn-studio-outline nav button:hover,.p2lrn-studio-outline[data-tree] > button:hover{background:#f4f7fa}',
  '.p2lrn-studio-outline nav button[aria-current=true],.p2lrn-studio-outline[data-tree] > button[aria-current=true]{background:#eaf1fa;color:#243e64;font-weight:650}',
  '.p2lrn-studio-canvas{min-width:0;padding:0!important;border:1px solid #e2e7ee;border-radius:11px;background:#f0f3f7;overflow:hidden}',
  '.p2lrn-studio-stage{min-height:630px;padding:20px;background:#f0f3f7}',
  '.p2lrn-studio-sheet{width:100%;max-width:1040px;min-height:520px;margin:0 auto;padding:30px;background:#fff;border:1px solid #e5e9ef;border-radius:9px;box-shadow:0 3px 13px rgba(15,23,42,.045);overflow-wrap:anywhere}',
  '.p2lrn-studio-sheet-head{display:grid;gap:7px;padding-bottom:20px;margin-bottom:22px;border-bottom:1px solid #edf0f4}',
  '.p2lrn-studio-sheet-head h1{font-size:clamp(24px,3vw,35px);font-weight:700;letter-spacing:-.035em;line-height:1.16}',
  '.p2lrn-studio-sheet-head p{font-size:14px;color:#667085}',
  '.p2lrn-studio-sheet-head .studio-entity-type{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#667085}',
  '.p2lrn-studio-outline-title{padding:15px;border-bottom:1px solid #edf0f4;background:#fafbfd;display:grid;gap:4px}',
  '.p2lrn-studio-outline-title small,.p2lrn-studio-outline-title span{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#667085}',
  '.p2lrn-studio-outline-title strong{font-size:13px}',
  '.p2lrn-studio-sheet :is(.studio-wysiwyg,.surface){min-height:360px;font-size:16px;line-height:1.7;color:#253044}',
  '.p2lrn-studio-sheet :is(img,video,table){max-width:100%}',
  '@media(max-width:860px){.p2lrn-studio-workspace{grid-template-columns:minmax(0,1fr)!important}.p2lrn-studio-outline{max-height:260px}.p2lrn-ribbon-top{align-items:flex-start}.p2lrn-studio-stage{padding:12px}.p2lrn-studio-sheet{padding:18px}.p2lrn-ribbon-actions{justify-content:flex-start}}',
  '.p2lrn-outline-toggle{display:none!important}',
  '.p2lrn-ribbon-group[hidden]{display:none!important}',
  '.p2lrn-ribbon-context[hidden],.p2lrn-ribbon-context .p2lrn-ribbon-group[hidden]{display:none!important}',
  '.studio-warning[data-unsaved-warning],.warn[data-warn]{display:flex;align-items:center;gap:7px;margin:7px 0!important;padding:8px 12px!important;border:1px solid #e9dbb7;border-radius:8px;background:#fffaf1;color:#75531b;font-size:12px;line-height:1.35}',
  '.studio-warning[data-unsaved-warning] strong,.warn[data-warn] strong{font-weight:750;flex:none}',
  '.studio-warning[data-unsaved-warning][hidden],.warn[data-warn][hidden]{display:none!important}',
  '.p2lrn-ribbon-context:not([hidden]){overflow:visible!important;flex-wrap:wrap!important;align-items:center}',
  '.p2lrn-ribbon-context .p2lrn-ribbon-group{flex-wrap:wrap!important}',
  '.p2lrn-ribbon-context .p2lrn-context-menu-pop button{white-space:nowrap}',
  '.p2lrn-ribbon-context .p2lrn-context-menu{position:relative;flex:0 0 auto;min-width:0}',
  '.p2lrn-ribbon-context .p2lrn-context-menu>summary{display:inline-flex;align-items:center;justify-content:center;gap:5px;list-style:none;min-height:34px;padding:7px 11px;border:1px solid #d6e0ec;border-radius:7px;background:#fff;color:#344054;font-size:12px;font-weight:650;cursor:pointer;white-space:nowrap}',
  '.p2lrn-ribbon-context .p2lrn-context-menu>summary::-webkit-details-marker{display:none}',
  '.p2lrn-ribbon-context .p2lrn-context-menu>summary::after{content:"⌄";font-size:12px;color:#64748b}',
  '.p2lrn-ribbon-context .p2lrn-context-menu>summary:focus-visible{outline:2px solid #4776b6;outline-offset:2px}',
  '.p2lrn-ribbon-context .p2lrn-context-menu-pop{display:flex;flex-direction:column;gap:4px;position:absolute;top:calc(100% + 5px);left:0;min-width:170px;max-height:360px;overflow:auto;padding:7px;border:1px solid #dce4ef;border-radius:9px;background:#fff;box-shadow:0 14px 32px #14213d25;z-index:80}',
  '.p2lrn-ribbon-context .p2lrn-context-menu:not([open])>.p2lrn-context-menu-pop{display:none!important}',
  '.p2lrn-ribbon-context .p2lrn-context-menu-pop>button{width:100%;justify-content:flex-start;text-align:left;min-height:33px;font-size:12px}',
  '.p2lrn-ribbon-context .p2lrn-context-menu-pop .p2lrn-ribbon-color{width:100%}',
  '.p2lrn-ribbon-context .p2lrn-ribbon-group{flex-shrink:0}',
  '.p2lrn-ribbon-context{display:flex;align-items:center;flex-wrap:wrap;gap:9px;width:100%;flex:1 0 100%;padding:10px 12px;margin:-3px -2px 3px;border:1px solid #dfe6ef;border-radius:9px;background:#f7f9fc}',
  '.p2lrn-ribbon-context-heading{font-size:11px;font-weight:750;color:#344054;white-space:nowrap;margin-right:4px}',
  '.p2lrn-ribbon-context .p2lrn-ribbon-group{flex-wrap:wrap;gap:6px}',
  '.p2lrn-ribbon-context .p2lrn-ribbon-divider{height:25px}',
  '.p2lrn-ribbon-context [data-studio-advanced-action^=delete]{color:#a02d32}',
  '@media(max-width:1200px){.p2lrn-ribbon-panel[aria-labelledby$="-home"]{flex-wrap:wrap;overflow-x:visible}.p2lrn-ribbon-panel[aria-labelledby$="-home"]>.p2lrn-ribbon-group{flex-shrink:0}.p2lrn-ribbon-context{order:9;flex-basis:100%;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;margin:2px 0;padding:8px}.p2lrn-ribbon-context .p2lrn-ribbon-group{flex-wrap:nowrap;flex-shrink:0}}',
  '@media(max-width:740px){.p2lrn-ribbon-panel[aria-labelledby$="-home"]{gap:5px}.p2lrn-ribbon-context{gap:7px}.p2lrn-ribbon-context-heading{font-size:11px}.p2lrn-ribbon-context button{min-height:32px}}',
  '.p2lrn-ribbon-panel{scrollbar-width:thin;scrollbar-color:#c1cfdd transparent}',
  '@media(max-width:1200px){.p2lrn-ribbon-panel{display:flex;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;min-height:66px;padding:9px 12px}.p2lrn-ribbon-panel>.p2lrn-ribbon-group,.p2lrn-ribbon-panel>.p2lrn-ribbon-divider,.p2lrn-ribbon-panel>.p2lrn-ribbon-caption{flex-shrink:0}.p2lrn-ribbon-panel .p2lrn-ribbon-group{flex-wrap:nowrap}.p2lrn-ribbon-panel::-webkit-scrollbar{height:6px}.p2lrn-ribbon-panel::-webkit-scrollbar-thumb{border-radius:6px;background:#c1cfdd}}',
  '@media(max-width:860px){.p2lrn-outline-toggle{display:inline-flex!important;margin-left:auto}.p2lrn-studio-workspace:not([data-outline-open=true]) .p2lrn-studio-outline{display:none!important}.p2lrn-ribbon-identity{width:100%}}',
  '@media(max-width:740px){.p2lrn-ribbon-top{padding:10px 11px;gap:8px}.p2lrn-ribbon-name small{max-width:min(180px,46vw)}.p2lrn-ribbon-identity{flex-basis:100%;width:100%}.p2lrn-ribbon-actions{display:flex;flex-wrap:nowrap;justify-content:space-between!important;gap:5px;width:100%}.p2lrn-ribbon-actions>button[data-ui-action=create],.p2lrn-ribbon-actions>button[data-ui-action=open],.p2lrn-ribbon-actions>button[data-ui-action=export]{display:none!important}.p2lrn-ribbon-actions .p2lrn-ribbon-modes{margin-left:auto}.p2lrn-ribbon-actions>button,.p2lrn-ribbon-actions>details>summary,.p2lrn-ribbon-actions .p2lrn-ribbon-modes button{padding:7px 8px;font-size:12px}.p2lrn-ribbon-tabs{padding:0 8px;gap:1px}.p2lrn-studio-ribbon .p2lrn-ribbon-tab{padding:8px 10px;min-height:36px}.p2lrn-ribbon-panel{gap:8px;padding:8px 10px;min-height:62px}.p2lrn-ribbon-group{gap:5px}.p2lrn-ribbon-feedback{padding:5px 11px;min-height:23px}.p2lrn-studio-stage{padding:10px}.p2lrn-studio-sheet{padding:16px}}',
  '.p2lrn-studio-lesson-properties{margin:0 0 15px;border:1px solid #e3e8f0;border-radius:9px;background:#fafbfd;overflow:hidden}',
  '.p2lrn-studio-lesson-properties>summary{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 13px;font:500 12px/1.3 Inter,system-ui,sans-serif;color:#475467;cursor:pointer}',
  '.p2lrn-studio-lesson-properties>summary:focus-visible{outline:2px solid #4776b6;outline-offset:-2px}',
  '.p2lrn-studio-property-label{font-size:10px;text-transform:uppercase;letter-spacing:.045em;font-weight:700;color:#64748b}',
  '.p2lrn-studio-property-name{font-size:12px;font-weight:650;color:#344054;min-width:0;max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.p2lrn-studio-property-edit{margin-left:auto;font-size:11px;color:#3264a1}',
  '.p2lrn-studio-lesson-properties .p2lrn-studio-sheet-head{padding:13px 15px;margin:0;border-top:1px solid #e3e8f0;border-bottom:0;background:#fff}',
  '.p2lrn-studio-lesson-properties .p2lrn-studio-sheet-head h1{font-size:23px;line-height:1.2}',
  '.p2lrn-ribbon-panel[aria-labelledby$="-home"]{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0}',
  '.p2lrn-core-format-strip{display:flex;align-items:center;flex-wrap:nowrap;gap:9px;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;padding:4px 2px 6px;scrollbar-width:thin;scrollbar-color:#c3cfdd transparent}',
  '.p2lrn-core-format-strip>.p2lrn-ribbon-group{display:flex;flex:0 0 auto;flex-wrap:nowrap;align-items:center}',
  '.p2lrn-core-format-strip>.p2lrn-ribbon-divider{flex:0 0 auto}',
  '.p2lrn-ribbon-context{order:2;min-width:0;max-width:100%;flex:0 0 auto;margin:2px 0 1px}',
  '@media(max-width:1200px){.p2lrn-ribbon-panel[aria-labelledby$="-home"]{flex-wrap:nowrap;overflow:visible}.p2lrn-core-format-strip{width:100%;flex-wrap:nowrap;overflow-x:auto}}',
  '@media(max-width:740px){.p2lrn-ribbon-panel[aria-labelledby$="-home"]{gap:3px;min-height:0}.p2lrn-core-format-strip{gap:7px;padding:2px 0 5px;min-height:44px}.p2lrn-ribbon-context{width:100%;min-height:44px}}',
  '.p2lrn-format-more-toggle{display:none!important}',
  '.p2lrn-format-more-panel{display:flex;align-items:center;gap:7px;min-width:0;flex:0 0 auto}',
  '.p2lrn-format-more-panel>.p2lrn-ribbon-field{flex:0 0 auto}',
  '.p2lrn-format-more-panel>.p2lrn-ribbon-group{display:flex;align-items:center;flex-wrap:nowrap;gap:5px}',
  '@media(max-width:740px){.p2lrn-core-format-strip{display:flex;flex-wrap:wrap;overflow:visible;align-items:center;gap:7px}.p2lrn-core-format-strip>.p2lrn-ribbon-group{flex-shrink:0}.p2lrn-core-format-strip .p2lrn-ribbon-field:first-child select{max-width:105px;min-width:86px}.p2lrn-format-more-toggle{display:inline-flex!important;margin-left:auto;font-size:12px;min-height:34px}.p2lrn-format-more-panel{flex:1 0 100%;width:100%;flex-wrap:wrap;gap:8px;padding:9px 0 2px;border-top:1px solid #e4eaf1}.p2lrn-format-more-panel[data-expanded=false]{display:none!important}.p2lrn-format-more-panel>.p2lrn-ribbon-group{flex-wrap:wrap}.p2lrn-format-more-panel>.p2lrn-ribbon-field{max-width:155px}}',
  '@media(max-width:520px){.p2lrn-ribbon-top{padding:10px}.p2lrn-ribbon-panel{padding:10px}.p2lrn-ribbon-name small{max-width:180px}.p2lrn-ribbon-group{gap:4px}.p2lrn-ribbon-divider{display:none}}'
].join('\n');

function node(doc,tag,cls,text){
  const el=doc.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=text;
  return el;
}
function button(doc,label,{title,cls,action,pressed}={}){
  const el=node(doc,'button',cls||'',label);
  el.type='button';if(title)el.title=title;if(action)el.dataset.uiAction=action;
  if(pressed!==undefined)el.setAttribute('aria-pressed',String(pressed));
  return el;
}
function select(doc,items,label){
  const el=node(doc,'select');el.setAttribute('aria-label',label);
  for(const [key,text] of items){
    const o=node(doc,'option','',text);o.value=String(key);el.append(o);
  }
  return el;
}
export function collapseStudioLessonProperties({header,title}={}){
  if(!header?.parentNode||!title)return null;
  const doc=header.ownerDocument;
  const details=doc.createElement('details');details.className='p2lrn-studio-lesson-properties';
  const summary=doc.createElement('summary');
  summary.setAttribute('aria-label','Editar título y descripción de la lección');
  const label=doc.createElement('span');label.className='p2lrn-studio-property-label';label.textContent='Propiedades de lección';
  const name=doc.createElement('strong');name.className='p2lrn-studio-property-name';
  const sync=()=>{name.textContent=title.textContent?.trim()||'Lección sin título';};
  sync();title.addEventListener('input',sync);
  const affordance=doc.createElement('span');affordance.className='p2lrn-studio-property-edit';affordance.textContent='Editar título y descripción';
  label.textContent='Lección';affordance.textContent='Editar título y descripción';
  summary.append(label,affordance);
  header.replaceWith(details);details.append(summary,header);
  return details;
}
export function applyUnifiedStudioWorkspace({workspace,outline,canvas,stage,sheet}={}){
  for(const [item,cls] of [[workspace,'p2lrn-studio-workspace'],[outline,'p2lrn-studio-outline'],[canvas,'p2lrn-studio-canvas'],[stage,'p2lrn-studio-stage'],[sheet,'p2lrn-studio-sheet']])
    if(item)item.classList.add(cls);
}
export function mountStudioCommandBar({mount,resolveSurface,actions={},onStatus=()=>{},addContentElement=null}={}){
  if(!mount||typeof resolveSurface!=='function')throw new TypeError('Studio necesita un contenedor y un editor activo.');
  const doc=mount.ownerDocument;
  const root=mount.getRootNode();
  const styleHost=root.nodeType===9?doc.head:root;
  if(!styleHost.querySelector('[data-p2lrn-shared-studio-style]')){
    const style=node(doc,'style');style.dataset.p2lrnSharedStudioStyle=STUDIO_COMMAND_BAR_VERSION;style.textContent=CSS;styleHost.append(style);
  }
  mount.classList.add('p2lrn-studio-unified');
  const bar=node(doc,'div','p2lrn-studio-ribbon');
  const top=node(doc,'div','p2lrn-ribbon-top');
  const identity=node(doc,'div','p2lrn-ribbon-identity');
  const mark=node(doc,'div','p2lrn-ribbon-mark','P');
  const name=node(doc,'div','p2lrn-ribbon-name');
  name.append(node(doc,'strong','', 'P2LRN Studio'));
  const documentName=node(doc,'small','', 'Editor visual de cursos');
  name.append(documentName);identity.append(mark,name);
  const outlineToggle=button(doc,'Esquema',{title:'Mostrar la estructura del curso',cls:'p2lrn-outline-toggle'});
  const workspace=root.querySelector('.p2lrn-studio-workspace');
  const outline=workspace?.querySelector('.p2lrn-studio-outline');
  if(outline&&workspace){
    if(!outline.id)outline.id='p2lrn-studio-outline';
    outlineToggle.setAttribute('aria-controls',outline.id);
    const sync=()=>outlineToggle.setAttribute('aria-expanded',String(workspace.dataset.outlineOpen==='true'));
    outlineToggle.addEventListener('click',()=>{workspace.dataset.outlineOpen=String(workspace.dataset.outlineOpen!=='true');sync();});
    sync();identity.append(outlineToggle);
  }
  top.append(identity);
  const topActions=node(doc,'div','p2lrn-ribbon-actions');
  const fileMenu=node(doc,'details','p2lrn-file-menu');
  fileMenu.append(node(doc,'summary','','Archivo'));
  const filePop=node(doc,'div','p2lrn-file-pop');
  const fileItems=[
    ['create','Nuevo curso'],['open','Abrir .p2lrn'],
    ['saveDraft','Guardar borrador local'],
    ['recoverDraft','Recuperar borrador'],['clearDraft','Eliminar borrador…'],
    ['export','Descargar .p2lrn'],
    ['offline','Entrega offline'],['review','Revisar entrega']
  ];
  for(const [id,label] of fileItems){if(actions[id])filePop.append(button(doc,label,{action:id}));}
  if(actions.openUrl){
    const field=node(doc,'label','','Abrir desde URL');
    const url=node(doc,'input');url.type='url';url.placeholder='https://.../curso.p2lrn';
    url.setAttribute('aria-label','URL del curso P2LRN');
    const openUrl=button(doc,'Abrir URL',{action:'openUrl'});
    openUrl.addEventListener('click',()=>{if(url.value.trim())void run('openUrl',url.value.trim());else onStatus('Introduce primero una URL válida.');});
    // Open URL bypasses the generic action router to pass its input.
    openUrl.removeAttribute('data-ui-action');
    field.append(url,openUrl);filePop.append(field);
  }
  fileMenu.append(filePop);
  topActions.append(fileMenu);
  const save=button(doc,'Guardar',{action:'save'});
  if(actions.save)topActions.append(save);
  // Keep both explicit modes visible. A single toggling label used to make
  // 'Vista alumno' disappear as soon as the student view was selected.
  const edit=button(doc,'Editar',{action:'edit',pressed:true,title:'Volver al editor del curso'});
  const preview=button(doc,'Vista alumno',{action:'preview',pressed:false,title:'Ver el contenido con el Player del alumno'});
  const modes=node(doc,'div','p2lrn-ribbon-modes');
  modes.setAttribute('role','group');modes.setAttribute('aria-label','Modo de visualización');
  if(actions.edit)modes.append(edit);
  if(actions.preview)modes.append(preview);
  if(modes.childElementCount)topActions.append(modes);
  top.append(topActions);bar.append(top);
  const tabs=node(doc,'div','p2lrn-ribbon-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Herramientas de edición');
  const panels=node(doc,'div');
  const tabDefs=[['home','Formato'],['insert','Insertar']];
  const tabControls=[];
  const panelMap=new Map();
  const uid=++instance;
  const activateTab=(id)=>{
    for(const [key,tab] of tabControls){const active=key===id;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panelMap.get(key).hidden=!active;}
  };
  for(const [id,title] of tabDefs){
    const tab=button(doc,title,{cls:'p2lrn-ribbon-tab'});
    tab.setAttribute('role','tab');tab.id='p2lrn-studio-tab-'+uid+'-'+id;
    tab.setAttribute('aria-controls','p2lrn-studio-panel-'+uid+'-'+id);
    const panel=node(doc,'div','p2lrn-ribbon-panel');
    panel.id='p2lrn-studio-panel-'+uid+'-'+id;panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('click',()=>activateTab(id));
    tab.addEventListener('keydown',(event)=>{
      if(event.key!=='ArrowRight'&&event.key!=='ArrowLeft')return;
      event.preventDefault();
      const index=tabDefs.findIndex(([key])=>key===id);
      const next=tabControls[(index+(event.key==='ArrowRight'?1:-1)+tabDefs.length)%tabDefs.length][1];
      next.focus();next.click();
    });
    tabs.append(tab);panels.append(panel);tabControls.push([id,tab]);panelMap.set(id,panel);
  }
  activateTab('home');bar.append(tabs,panels);
  const feedback=node(doc,'div','p2lrn-ribbon-feedback','Selecciona una lección para editarla.');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');bar.append(feedback);
  const home=panelMap.get('home'),insert=panelMap.get('insert');
  const formatStrip=node(doc,'div','p2lrn-core-format-strip');home.append(formatStrip);
  const context=node(doc,'section','p2lrn-ribbon-context');
  context.dataset.studioContextTools='true';context.hidden=true;
  context.setAttribute('aria-label','Propiedades del elemento seleccionado');
  const contextHead=node(doc,'div','p2lrn-ribbon-context-heading','Elemento seleccionado');
  context.append(contextHead);home.append(context);
  const group=(parent)=>{
    const g=node(doc,'div','p2lrn-ribbon-group');parent.append(g);return g;
  };
  const field=(parent,label,control)=>{
    const f=node(doc,'label','p2lrn-ribbon-field');
    f.append(node(doc,'span','',label),control);parent.append(f);return control;
  };
  const styleGroup=group(formatStrip);
  const block=field(styleGroup,'Párrafo',select(doc,BLOCK_STYLES,'Estilo de párrafo'));
  const font=field(styleGroup,'Fuente',select(doc,FONT_FAMILIES.map(v=>[v,v]),'Tipo de letra'));font.value='Calibri';
  const size=field(styleGroup,'Tamaño',select(doc,FONT_SIZES.map(v=>[v,String(v)]),'Tamaño de letra'));size.value='20';
  formatStrip.append(node(doc,'span','p2lrn-ribbon-divider'));
  const formatGroup=group(formatStrip);
  const formatButtons=[
    ['bold','B','Negrita'],['italic','I','Cursiva'],['underline','U','Subrayado'],['strikeThrough','S','Tachado'],
    ['justifyLeft','≡','Alinear a la izquierda'],['justifyCenter','≣','Centrar'],
    ['justifyRight','☷','Alinear a la derecha'],['insertUnorderedList','• Lista','Lista con viñetas'],
    ['insertOrderedList','1. Lista','Lista numerada'],['undo','↶','Deshacer'],['redo','↷','Rehacer']
  ];
  const commandButtons=new Map();
  for(const [id,label,title] of formatButtons){
    const b=button(doc,label,{title,cls:'p2lrn-ribbon-icon'});
    b.dataset.uiCommand=id;
    if(id==='italic')b.dataset.italic='true';
    if(id==='underline')b.dataset.underline='true';
    if(id==='strikeThrough')b.dataset.strike='true';
    b.addEventListener('mousedown',(event)=>event.preventDefault());
    b.addEventListener('click',()=>applyCommand(id));
    formatGroup.append(b);commandButtons.set(id,b);
  }
  formatStrip.append(node(doc,'span','p2lrn-ribbon-divider'));
  const colorGroup=group(formatStrip);
  for(const [label,value,cmd] of [['Texto','#1f2937','foreColor'],['Resaltar','#fff2ae','hiliteColor']]){
    const wrapper=node(doc,'label','p2lrn-ribbon-color');
    wrapper.append(node(doc,'span','',label));
    const input=node(doc,'input');input.type='color';input.value=value;input.title=label;input.setAttribute('aria-label','Color: '+label);
    input.addEventListener('input',()=>applyCommand(cmd,input.value));
    wrapper.append(input);colorGroup.append(wrapper);
  }
  // One location for ALL text formatting, with an explicit responsive overflow.
  // Move existing control nodes rather than making duplicate command buttons.
  const morePanel=node(doc,'div','p2lrn-format-more-panel');
  const moreToggle=button(doc,'Más formato',{title:'Fuente, tamaño, alineación, listas, colores y deshacer'});
  moreToggle.classList.add('p2lrn-format-more-toggle');
  moreToggle.setAttribute('aria-expanded','false');
  moreToggle.setAttribute('aria-controls','p2lrn-studio-more-'+uid);
  morePanel.id='p2lrn-studio-more-'+uid;morePanel.dataset.expanded='false';
  morePanel.append(font.closest('.p2lrn-ribbon-field'),size.closest('.p2lrn-ribbon-field'));
  for(const [command,control] of commandButtons){
    if(!['bold','italic','underline'].includes(command))morePanel.append(control);
  }
  morePanel.append(colorGroup);
  for(const separator of formatStrip.querySelectorAll(':scope > .p2lrn-ribbon-divider'))separator.remove();
  moreToggle.addEventListener('click',()=>{
    const next=moreToggle.getAttribute('aria-expanded')!=='true';
    moreToggle.setAttribute('aria-expanded',String(next));morePanel.dataset.expanded=String(next);
  });
  formatStrip.append(moreToggle,morePanel);
  const structure=group(insert);
  for(const [action,title] of [['addUnit','+ Unidad'],['addLesson','+ Lección']])
    if(actions[action])structure.append(button(doc,title,{action}));
  for(const [id,label] of [['insertImage','Imagen'],['insertVideo','Vídeo']]){
    if(actions[id])structure.append(button(doc,label,{action:id,title:'Insertar '+label.toLowerCase()+' en la lección'}));
  }
  let activityDialog=null;
  function openActivityPicker(){
    if(!hasDocument){onStatus('Crea o abre un curso primero.');return;}
    if(!activityDialog){
      const dialog=node(doc,'dialog','p2lrn-activity-picker');
      dialog.setAttribute('aria-label','Añadir contenido al curso');
      const header=node(doc,'header','p2lrn-activity-picker-head');
      const heading=node(doc,'div');
      heading.append(node(doc,'h2','','Añadir contenido'),node(doc,'p','','Elige una actividad o un recurso para el curso.'));
      const close=button(doc,'Cerrar',{title:'Cerrar el selector de contenido'});
      close.addEventListener('click',()=>dialog.close());
      header.append(heading,close);
      const search=node(doc,'input','p2lrn-activity-picker-search');
      search.type='search';search.placeholder='Buscar lecciones, juegos, preguntas…';
      search.setAttribute('aria-label','Buscar contenido');
      const content=node(doc,'div','p2lrn-activity-picker-content');
      const groups=[];
      for(const category of STUDIO_CONTENT_CATALOG){
        const section=node(doc,'section','p2lrn-activity-picker-group');
        section.append(node(doc,'h3','',category.group));
        const grid=node(doc,'div','p2lrn-activity-picker-grid');
        for(const [id,label,description] of category.items){
          const item=button(doc,'',{title:description});
          item.dataset.activityKind=id;
          item.replaceChildren(node(doc,'strong','',label),node(doc,'small','',description));
          item.addEventListener('click',async()=>{
            if(typeof actions.addKind!=='function')return;
            dialog.close();
            try{await actions.addKind(id);}
            catch(error){onStatus(String(error?.message??error));}
          });
          grid.append(item);
        }
        section.append(grid);content.append(section);groups.push(section);
      }
      search.addEventListener('input',()=>{
        const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        for(const section of groups){
          for(const item of section.querySelectorAll('[data-activity-kind]')){
            const name=item.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
            item.hidden=!name.includes(query);
          }
          section.hidden=![...section.querySelectorAll('[data-activity-kind]')].some(item=>!item.hidden);
        }
      });
      dialog.append(header,search,content);
      (root===doc?doc.body:root).append(dialog);
      activityDialog=dialog;
    }
    for(const item of activityDialog.querySelectorAll('[data-activity-kind]'))
      item.disabled=typeof actions.canAddKind==='function'&&!actions.canAddKind(item.dataset.activityKind);
    activityDialog.querySelector('input[type=search]').value='';
    activityDialog.querySelector('input[type=search]').dispatchEvent(new Event('input',{bubbles:true}));
    activityDialog.showModal();
    activityDialog.querySelector('input[type=search]').focus();
  }
  let contentButton=null;
  if(actions.addKind){
    contentButton=button(doc,'Añadir contenido',{title:'Lecciones, cuestionarios, juegos y recursos'});
    contentButton.addEventListener('click',openActivityPicker);
    structure.append(contentButton);
  }else if(addContentElement){
    addContentElement.classList.add('p2lrn-import-menu');
    for(const el of addContentElement.querySelectorAll('[data-help]'))if(!el.title)el.title=el.dataset.help;
    structure.append(addContentElement);
  }else if(actions.addContent)structure.append(button(doc,'Añadir actividad',{action:'addContent'}));
  insert.append(node(doc,'span','p2lrn-ribbon-divider'));
  const layouts=group(insert);
  for(const item of VISUAL_LAYOUT_BLOCKS){
    if(item.id==='shape'){
      // Keep the existing one-click Forma command for old courses and UI QA.
      const defaultShape=button(doc,'Forma',{title:'Insertar rectángulo redimensionable'});
      defaultShape.dataset.uiLayout='shape';
      defaultShape.addEventListener('mousedown',event=>event.preventDefault());
      defaultShape.addEventListener('click',()=>addLayout('shape'));
      layouts.append(defaultShape);
      const picker=node(doc,'details','p2lrn-file-menu p2lrn-shape-picker');
      picker.append(node(doc,'summary','','Formas'));
      const grid=node(doc,'div','p2lrn-file-pop');
      grid.setAttribute('role','group');
      grid.setAttribute('aria-label','Tipos de formas geométricas');
      for(const shape of STUDIO_SHAPES){
        const b=button(doc,'',{title:'Insertar '+shape.label,cls:'p2lrn-shape-button'});
        b.dataset.uiLayout='shape:'+shape.id;
        const art=node(doc,'span');
        styleStudioShapeArt(art,shape.id);
        Object.assign(art.style,{width:'26px',height:'21px',minHeight:'21px',maxHeight:'21px',flex:'none',borderBottomWidth:'3px'});
        b.append(art,node(doc,'small','',shape.label));
        b.addEventListener('mousedown',event=>event.preventDefault());
        b.addEventListener('click',()=>{addLayout('shape:'+shape.id);picker.open=false;});
        grid.append(b);
      }
      picker.append(grid);layouts.append(picker);
      continue;
    }
    const b=button(doc,item.label,{title:'Insertar '+item.label.toLowerCase()});
    b.dataset.uiLayout=item.id;
    b.addEventListener('mousedown',(event)=>event.preventDefault());
    b.addEventListener('click',()=>addLayout(item.id));
    layouts.append(b);
  }
  const dropMenu=node(doc,'details','p2lrn-file-menu');
  dropMenu.append(node(doc,'summary','','Zonas de arrastre'));
  const dropActions=node(doc,'div','p2lrn-file-pop');
  for(const [action,label] of [
    ['add','Añadir zona y ficha'],['remove','Eliminar zona seleccionada'],
    ['image','Elegir imagen de fondo'],['remove-image','Quitar imagen de fondo'],
    ['item-image','Poner imagen en la ficha'],['remove-item-image','Quitar imagen de la ficha'],
  ]){
    const b=button(doc,label,{title:label});
    b.addEventListener('mousedown',event=>event.preventDefault());
    b.addEventListener('click',()=>{
      if(action==='image')dropFile.click();
      else if(action==='item-image')dropItemFile.click();
      else void runDropAction(action);
      if(action!=='item-image'&&action!=='image')dropMenu.open=false;
    });
    dropActions.append(b);
  }
  const dropFile=node(doc,'input');dropFile.type='file';
  dropFile.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
  dropFile.setAttribute('aria-label','Imagen de fondo del ejercicio de arrastre');
  dropFile.hidden=true;
  dropFile.addEventListener('change',async()=>{
    const file=dropFile.files?.[0];dropFile.value='';
    if(file)await runDropAction('image',file);
  });
  const dropItemFile=node(doc,'input');dropItemFile.type='file';
  dropItemFile.accept='image/png,image/jpeg,image/webp,image/gif,image/avif';
  dropItemFile.dataset.p2lrnDropImage='item';
  dropItemFile.setAttribute('aria-label','Imagen de la ficha seleccionada');
  dropItemFile.hidden=true;
  dropItemFile.addEventListener('change',async()=>{
    const file=dropItemFile.files?.[0];dropItemFile.value='';
    if(file)await runDropAction('item-image',file);
  });
  // In-menu labels let the teacher name exact hotspots and their matching
  // draggable items without accidental text editing while moving a zone.
  const dropNameFields=[];
  for(const [key,label] of [['zone','Texto de la zona'],['item','Texto de la ficha'],['alt','Descripción de imagen de la ficha']]){
    const field=node(doc,'label','',label);
    const input=node(doc,'input');input.type='text';input.maxLength=120;
    input.dataset.p2lrnDropName=key;
    input.placeholder='Selecciona una zona de destino';
    input.disabled=true;
    field.append(input);dropActions.append(field);dropNameFields.push(input);
    input.addEventListener('change',()=>{
      const zone=dropAuthoring?.selectedZone;
      const s=surface();
      if(!zone||!s)return;
      const activity=zone.closest('[data-p2lrn-dnd="1"]');
      const tile=[...(activity?.querySelectorAll('[data-p2lrn-dnd-item]')??[])]
        .find(item=>item.dataset.p2lrnDndItem===zone.dataset.p2lrnDndAccept);
      const text=input.value.trim();
      try{
        if(key==='zone'){
          if(!text)throw new Error('El texto de la zona no puede quedar vacío.');
          const label=zone.querySelector('[data-p2lrn-dnd-label]');
          if(!label)throw new Error('Falta la etiqueta de la zona.');
          label.textContent=text;
        }else if(key==='item')setStudioDropItemText(activity,tile,text);
        else setStudioDropItemImageAlt(activity,tile,text);
        changed(s);
      }catch(error){onStatus(error.message);updateDropNameFields(zone);}
    });
  }
  const updateDropNameFields=zone=>{
    for(const input of dropNameFields){
      const activity=zone?.closest?.('[data-p2lrn-dnd="1"]');
      const item=[...(activity?.querySelectorAll('[data-p2lrn-dnd-item]')??[])]
        .find(tile=>tile.dataset.p2lrnDndItem===zone?.dataset.p2lrnDndAccept);
      const kind=input.dataset.p2lrnDropName;
      const image=item?.querySelector('[data-p2lrn-dnd-item-image]');
      const label=zone?.querySelector('[data-p2lrn-dnd-label]');
      input.disabled=kind==='zone'?!label:kind==='item'?!item:!image;
      input.value=kind==='zone'?label?.textContent||'':kind==='item'?getStudioDropItemText(item):image?.alt||'';
    }
  };
  dropMenu.addEventListener('toggle',()=>{if(dropMenu.open)updateDropNameFields(dropAuthoring?.selectedZone);});
  dropActions.append(dropFile,dropItemFile);dropMenu.append(dropActions);layouts.append(dropMenu);
  const colors=group(context);colors.classList.add('p2lrn-object-colors');
  const colorMenu=node(doc,'details','p2lrn-context-menu');colorMenu.dataset.studioContextMenu='fondo';
  const colorSummary=node(doc,'summary','','Fondo');colorSummary.setAttribute('aria-label','Color de fondo del bloque');
  const colorPop=node(doc,'div','p2lrn-context-menu-pop');
  colorMenu.append(colorSummary,colorPop);colors.append(colorMenu);
  for(const [,label,color] of PALETTE){
    const b=button(doc,label,{title:'Aplicar fondo '+label.toLowerCase()});
    const swatch=node(doc,'span','p2lrn-ribbon-swatch');swatch.style.backgroundColor=color;
    b.prepend(swatch);b.addEventListener('mousedown',(e)=>e.preventDefault());
    b.addEventListener('click',()=>{colorBlock(color);colorMenu.open=false;});colorPop.append(b);
  }

  let savedRange=null,savedSurface=null,lastVisualBlock=null,previewMode=false,hasDocument=false;
  let dropSurface=null,dropAuthoring=null;
  const allowedWithoutDocument=new Set(['create','open','openUrl','recoverDraft','clearDraft','review']);
  function surface(){
    const value=resolveSurface();
    return value?.isContentEditable&&value.dataset?.studioHtmlSurface==='true'?value:null;
  }
  function selection(){
    const rootSelection=root!==doc&&typeof root.getSelection==='function'?root.getSelection():null;
    return rootSelection??doc.getSelection();
  }
  function remember(){
    const s=surface(),sel=selection();
    if(!s||!sel?.rangeCount||!sel.anchorNode||!s.contains(sel.anchorNode))return;
    savedSurface=s;savedRange=sel.getRangeAt(0).cloneRange();
  }
  function restore(s){
    const prior=savedRange&&savedSurface===s&&s.contains(savedRange.commonAncestorContainer)?savedRange.cloneRange():null;
    s.focus();
    const sel=selection();
    if(prior&&sel){sel.removeAllRanges();sel.addRange(prior);}
    return sel;
  }
  function changed(s){
    s.dispatchEvent(new Event('input',{bubbles:true}));
    remember();
  }
  function applyCommand(name,value=null){
    const s=surface();
    if(!s){onStatus('Selecciona una lección HTML para aplicar formato.');return;}
    restore(s);
    const commandDoc=s.ownerDocument;
    if(typeof commandDoc.execCommand!=='function'){onStatus('El navegador no permite aplicar este formato.');return;}
    if(['fontName','fontSize','foreColor','hiliteColor'].includes(name))
      commandDoc.execCommand('styleWithCSS',false,true);
    const ok=commandDoc.execCommand(name,false,name==='fontSize'?'7':value);
    if(!ok){onStatus('No se pudo aplicar '+name+'. Selecciona texto e inténtalo de nuevo.');return;}
    if(name==='fontSize'){
      for(const element of s.querySelectorAll('[style]'))
        if(element.style.fontSize==='xxx-large')element.style.fontSize=value+'px';
      for(const element of [...s.querySelectorAll('font[size="7"]')]){
        const span=commandDoc.createElement('span');span.style.fontSize=value+'px';span.append(...element.childNodes);
        element.replaceWith(span);
      }
    }
    changed(s);
    refreshButtons();
  }
  function ensureDropAuthoring(next){
    if(dropSurface===next)return;
    dropAuthoring?.dispose();dropAuthoring=null;dropSurface=next;
    if(next)dropAuthoring=mountStudioDropAuthoring({
      surface:next,
      onSelected:updateDropNameFields,
      onChange:()=>{
        dropAuthoring?.selectedZone?.removeAttribute('data-p2lrn-studio-zone-selected');
        changed(next);
      },
    });
  }
  function refreshButtons(){
    const enabled=Boolean(surface())&&!previewMode;
    ensureDropAuthoring(enabled?surface():null);
    for(const button of bar.querySelectorAll('[data-ui-action=insertImage],[data-ui-action=insertVideo]'))button.disabled=!enabled;
    for(const b of commandButtons.values())b.disabled=!enabled;
    for(const cmd of ['bold','italic','underline','strikeThrough']){
      const b=commandButtons.get(cmd);if(!b)continue;
      let selected=false;
      try{selected=enabled&&doc.queryCommandState?.(cmd)===true;}catch{}
      b.setAttribute('aria-pressed',String(selected));
    }
    advanced.refresh();
  }
  function addLayout(kind){
    const s=surface();
    if(!s){onStatus('Selecciona una lección HTML para insertar un bloque visual.');return;}
    const anchor=savedSurface===s&&savedRange&&s.contains(savedRange.commonAncestorContainer)?savedRange.commonAncestorContainer:null;
    try{
      const targetElement=advanced.insertionTarget()||s.__p2lrnMediaInsertionTarget?.()||null;
      lastVisualBlock=insertVisualLayoutBlock(s,kind,{anchorNode:anchor,targetElement});
      advanced.selectObject(lastVisualBlock);
      onStatus(targetElement?'Elemento insertado dentro del bloque seleccionado.':'Bloque insertado. Selecciónalo para editarlo.');
    }
    catch(error){onStatus(error.message);}
  }
  async function runDropAction(action,file=null){
    const s=surface();
    if(!s){onStatus('Selecciona una lección HTML editable.');return;}
    const zone=dropAuthoring?.selectedZone||null;
    const selection=advanced.current();
    const activity=isStudioDropActivity(selection)?selection:
      zone?.closest?.('[data-p2lrn-dnd="1"]')||
      (isStudioDropActivity(lastVisualBlock)?lastVisualBlock:null);
    if(!activity||!s.contains(activity)){
      onStatus('Primero inserta o selecciona una actividad de arrastrar y soltar.');return;
    }
    try{
      if(action==='add'){
        const count=activity.querySelectorAll('[data-p2lrn-dnd-zone]').length;
        const {zone:newZone}=addStudioDropPair(activity,{x:9+(count%3)*26,y:10+(count%4)*18,width:24,height:22});
        dropAuthoring?.select(newZone);
      }else if(action==='remove'){
        if(!zone){onStatus('Selecciona primero una zona de destino.');return;}
        removeStudioDropPair(activity,zone);dropAuthoring?.select(null);
      }else if(action==='image')await setStudioDropBackground(activity,file);
      else if(action==='remove-image')removeStudioDropBackground(activity);
      else if(action==='item-image'||action==='remove-item-image'){
        const selectedItem=[...activity.querySelectorAll('[data-p2lrn-dnd-item]')]
          .find(item=>item.dataset.p2lrnDndItem===zone?.dataset.p2lrnDndAccept);
        if(!selectedItem)throw new Error('Selecciona una ficha o su zona antes de editar la imagen.');
        if(action==='item-image')await setStudioDropItemImage(activity,selectedItem,file);
        else removeStudioDropItemImage(activity,selectedItem);
        updateDropNameFields(zone);
      }else throw new RangeError('Acción de zonas no reconocida.');
      changed(s);onStatus(action.includes('item-image')?'Imagen de la ficha actualizada.':'Actividad actualizada. Arrastra los bordes de una zona para redimensionarla.');
    }catch(error){onStatus(error.message);}
  }
  function colorBlock(color){
    const s=surface();
    if(!s){onStatus('Selecciona una lección con un bloque visual.');return;}
    let anchor=savedSurface===s&&savedRange&&s.contains(savedRange.commonAncestorContainer)?savedRange.commonAncestorContainer:null;
    if(anchor?.nodeType===3)anchor=anchor.parentElement;
    const block=advanced.current()||anchor?.closest?.('[data-p2lrn-layout]')||lastVisualBlock;
    if(!block||!s.contains(block)){onStatus('Selecciona un bloque visual antes de cambiar su fondo.');return;}
    const art=block.querySelector?.('[data-p2lrn-shape-art]');
    if(art){
      if(['line','curve','wave'].includes(art.dataset.p2lrnShapeArt))art.style.borderBottomColor=color;
      else art.style.backgroundColor=color;
    }else block.style.backgroundColor=color;
    changed(s);
    onStatus('Diseño del bloque actualizado.');
  }
  async function run(name,...args){
    if(!hasDocument&&!allowedWithoutDocument.has(name)){onStatus('Abre o crea un curso primero.');return;}
    if(typeof actions[name]!=='function')return;
    try{await actions[name](...args);if(name==='preview')setPreviewMode(true);if(name==='edit')setPreviewMode(false);fileMenu.open=false;}
    catch(error){onStatus(String(error?.message??error));}
  }
  bar.addEventListener('click',(event)=>{
    const target=event.target.closest?.('[data-ui-action]');
    if(!target||!bar.contains(target))return;
    const action=target.dataset.uiAction;
    void run(action);
  });
  block.addEventListener('change',()=>applyCommand('formatBlock',block.value));
  font.addEventListener('change',()=>applyCommand('fontName',font.value));
  size.addEventListener('change',()=>applyCommand('fontSize',size.value));
  bar.addEventListener('pointerenter',refreshButtons);
  bar.addEventListener('focusin',refreshButtons);
  doc.addEventListener('selectionchange',remember);
  if(root!==doc)root.addEventListener('selectionchange',remember);
  mount.append(bar);
  const advanced=mountAdvancedStudioTools({bar,root,resolveSurface,onStatus});
  const dismissFileMenu=event=>{if(fileMenu.open&&!fileMenu.contains(event.target))fileMenu.open=false;};
  const dismissFileKeys=event=>{if(event.key==='Escape'&&fileMenu.open){fileMenu.open=false;fileMenu.querySelector('summary')?.focus();event.stopPropagation();}};
  root.addEventListener('pointerdown',dismissFileMenu,true);
  root.addEventListener('keydown',dismissFileKeys,true);
  function setPreviewMode(value){
    previewMode=Boolean(value);
    preview.setAttribute('aria-pressed',String(previewMode));
    edit.setAttribute('aria-pressed',String(!previewMode));
    refreshButtons();
  }
  function setDocument(value,label=''){
    hasDocument=Boolean(value);
    documentName.textContent=label||'Editor visual de cursos';
    for(const b of bar.querySelectorAll('[data-ui-action]')){
      const action=b.dataset.uiAction;
      b.disabled=!hasDocument&&!allowedWithoutDocument.has(action);
    }
    if(contentButton)contentButton.disabled=!hasDocument;
    refreshButtons();
  }
  setDocument(false);
  return {
    element:bar,
    setDocument,
    setPreviewMode,
    setMessage:(message)=>{feedback.textContent=String(message??'');},
    refresh:refreshButtons,
    openTab:activateTab,
    openActivities:openActivityPicker,
    recordChange:advanced.recordChange,
    resetHistory:advanced.resetHistory,
    selectObject:advanced.selectObject,
    selectedObject:()=>advanced.insertionTarget(),
    performObject:advanced.performObject,
    get history(){return advanced.history;},
    dispose(){
      root.removeEventListener('pointerdown',dismissFileMenu,true);
      root.removeEventListener('keydown',dismissFileKeys,true);
      dropAuthoring?.dispose();dropAuthoring=null;dropSurface=null;
      advanced.dispose();
      activityDialog?.remove();
      doc.removeEventListener('selectionchange',remember);
      if(root!==doc)root.removeEventListener('selectionchange',remember);
      bar.remove();
    }
  };
}

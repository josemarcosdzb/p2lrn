import {englishRouteFor} from './site-routes.mjs';
/**
 * Shared public website footer. Spanish is the canonical source language and
 * English pages are published under /en/ with the same route structure.
 */
const ES_GROUPS=Object.freeze([
  {label:'Crear y explorar',links:[
    ['/crear-cursos-interactivos/','Crear cursos interactivos'],
    ['/juegos-educativos-3d/','Juegos educativos 2D y 3D'],
    ['/cursos-offline/','Cursos offline'],
    ['/demo/','Player y visor'],
  ]},
  {label:'Documentación',links:[
    ['/docs/','Centro de documentación'],
    ['/docs/empezar/','Antes de empezar'],
    ['/docs/instalar/','Instalación'],
    ['/docs/conectores/','Conectores e integración'],
  ]},
  {label:'Recursos',links:[
    ['/analytics/','P2LRN Analytics'],
    ['/skills/','Skills para IA'],
    ['/docs/troubleshooting/','Solución de problemas'],
    ['/contacto/','Contacto'],
    ['https://github.com/josemarcosdzb/p2lrn','GitHub · Repositorio'],
  ]},
]);
const EN_GROUPS=Object.freeze([
  {label:'Create and explore',links:[
    ['/crear-cursos-interactivos/','Create interactive courses'],
    ['/juegos-educativos-3d/','3D educational games'],
    ['/cursos-offline/','Offline courses'],
    ['/demo/','Player and viewer'],
  ]},
  {label:'Documentation',links:[
    ['/docs/','Documentation center'],
    ['/docs/empezar/','Before you start'],
    ['/docs/instalar/','Installation'],
    ['/docs/conectores/','Connectors and integration'],
  ]},
  {label:'Resources',links:[
    ['/analytics/','P2LRN Analytics'],
    ['/skills/','AI Skills'],
    ['/docs/troubleshooting/','Troubleshooting'],
    ['/contacto/','Contact'],
    ['https://github.com/josemarcosdzb/p2lrn','GitHub · Repository'],
  ]},
]);
const ES_LEGAL=Object.freeze([
  ['/licencia/','Licencia'],
  ['/privacidad/','Privacidad'],
  ['/terminos/','Términos'],
  ['/aviso-legal/','Aviso legal'],
  ['/cookies/','Cookies'],
  ['/cookies/#configuracion','Configurar cookies'],
]);
const EN_LEGAL=Object.freeze([
  ['/licencia/','License'],
  ['/privacidad/','Privacy'],
  ['/terminos/','Terms'],
  ['/aviso-legal/','Legal notice'],
  ['/cookies/','Cookies'],
  ['/cookies/#configuracion','Cookie settings'],
]);

export const SITE_FOOTER_GROUPS=ES_GROUPS;
export const SITE_FOOTER_LEGAL_LINKS=ES_LEGAL;

const localHref=(href,locale)=>{
  if(locale!=='en'||!href.startsWith('/'))return href;
  const base=href.split(/[?#]/,1)[0];
  return englishRouteFor(base)+href.slice(base.length);
};
const localizedGroups=(locale)=>(locale==='en'?EN_GROUPS:ES_GROUPS).map(group=>({
  label:group.label,
  links:group.links.map(([href,text])=>[localHref(href,locale),text]),
}));
const localizedLegal=(locale)=>(locale==='en'?EN_LEGAL:ES_LEGAL).map(([href,text])=>[localHref(href,locale),text]);

export function getSiteFooterLinks(locale='es'){
  return Object.freeze([
    localHref('/',locale),
    localHref('/studio/',locale),
    ...localizedGroups(locale).flatMap(group=>group.links.map(([href])=>href)),
    ...localizedLegal(locale).map(([href])=>href),
  ]);
}
export const SITE_FOOTER_LINKS=getSiteFooterLinks('es');

const listItem=([href,text])=>'<li><a href="'+href+'"'+(href.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':'')+'>'+text+'</a></li>';

export function renderSiteFooter(locale='es'){
  const english=locale==='en';
  const groups=localizedGroups(locale);
  const legalLinks=localizedLegal(locale);
  const menus=groups.map(({label,links})=>
    '<nav class="site-footer__menu" aria-label="'+label+'">'+
      '<h2 class="site-footer__heading">'+label+'</h2>'+
      '<ul class="site-footer__links">'+links.map(listItem).join('')+'</ul>'+
    '</nav>').join('');
  const legal=legalLinks.map(([href,text])=>'<a href="'+href+'">'+text+'</a>').join('');
  const home=localHref('/',locale);
  const studio=localHref('/studio/',locale);
  return '<footer class="site-footer" aria-label="'+(english?'P2LRN footer':'Pie de página de P2LRN')+'">'+
    '<div class="site-footer__inner">'+
      '<div class="site-footer__main">'+
        '<div class="site-footer__intro">'+
          '<a class="site-footer__brand" href="'+home+'" aria-label="'+(english?'P2LRN — Home':'P2LRN — Inicio')+'">'+
            '<span class="site-footer__brand-mark" aria-hidden="true"></span>'+
            '<span class="site-footer__brand-text">P2LRN</span>'+
          '</a>'+
          '<p class="site-footer__description">'+(english
            ?'Create, play, and share interactive learning content in a portable format.'
            :'Crea, reproduce y comparte contenidos educativos interactivos en un formato portable.')+'</p>'+
          '<a class="site-footer__primary-link" href="'+studio+'">'+(english?'Open Studio':'Abrir Studio')+' <span aria-hidden="true">→</span></a>'+
        '</div>'+menus+
      '</div>'+
      '<div class="site-footer__bottom">'+
        '<p class="site-footer__signature">P2LRN <span aria-hidden="true">·</span> '+(english?'Resources and documentation':'Recursos y documentación')+'</p>'+
        '<nav class="site-footer__legal" data-legal-links aria-label="'+(english?'Legal information':'Información legal')+'">'+legal+'</nav>'+
      '</div>'+
      '<p class="site-footer__credit">'+(english?'Created by':'Creado por')+' <strong>Jose Marcos Diaz</strong></p>'+
    '</div>'+
  '</footer>';
}

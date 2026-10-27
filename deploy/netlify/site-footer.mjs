/**
 * Shared public website footer. Rendered once by build-site.mjs into each
 * page footer after </main>. Application/form action footers are unaffected.
 */
export const SITE_FOOTER_GROUPS = Object.freeze([
  {
    label: 'Crear y explorar',
    links: [
      ['/docs/paquetes/', 'Crear paquetes'],
      ['/demo/', 'Player y visor'],
      ['/docs/questionnaires/', 'Cuestionarios y juegos'],
      ['/docs/ejemplos/', 'Ejemplos'],
    ],
  },
  {
    label: 'Documentación',
    links: [
      ['/docs/', 'Centro de documentación'],
      ['/docs/empezar/', 'Antes de empezar'],
      ['/docs/instalar/', 'Instalación'],
      ['/docs/conectores/', 'Conectores e integración'],
    ],
  },
  {
    label: 'Recursos',
    links: [
      ['/docs/toolkit/', 'Toolkit'],
      ['/docs/cli/', 'Herramientas CLI'],
      ['/docs/troubleshooting/', 'Solución de problemas'],
      ['/contacto/', 'Contacto'],
      ['/index.json', 'Índice técnico (JSON)'],
    ],
  },
]);

export const SITE_FOOTER_LEGAL_LINKS = Object.freeze([
  ['/licencia/', 'Licencia'],
  ['/privacidad/', 'Privacidad'],
  ['/terminos/', 'Términos'],
  ['/aviso-legal/', 'Aviso legal'],
  ['/cookies/', 'Cookies'],
  ['/cookies/#configuracion', 'Configurar cookies'],
]);

export const SITE_FOOTER_LINKS = Object.freeze([
  '/',
  '/studio/',
  ...SITE_FOOTER_GROUPS.flatMap(group => group.links.map(([href])=>href)),
  ...SITE_FOOTER_LEGAL_LINKS.map(([href])=>href),
]);

const listItem = ([href,text]) => '<li><a href="' + href + '">' + text + '</a></li>';

export function renderSiteFooter() {
  const menus=SITE_FOOTER_GROUPS.map(({label,links})=>
    '<nav class="site-footer__menu" aria-label="'+label+'">'+
      '<h2 class="site-footer__heading">'+label+'</h2>'+
      '<ul class="site-footer__links">'+links.map(listItem).join('')+'</ul>'+
    '</nav>').join('');
  const legal=SITE_FOOTER_LEGAL_LINKS.map(([href,text])=>
    '<a href="'+href+'">'+text+'</a>').join('');
  return '<footer class="site-footer" aria-label="Pie de página de P2LRN">'+
    '<div class="site-footer__inner">'+
      '<div class="site-footer__main">'+
        '<div class="site-footer__intro">'+
          '<a class="site-footer__brand" href="/" aria-label="P2LRN — Inicio">'+
            '<span class="site-footer__brand-mark" aria-hidden="true"></span>'+
            '<span class="site-footer__brand-text">P2LRN</span>'+
          '</a>'+
          '<p class="site-footer__description">Crea, reproduce y comparte contenidos educativos interactivos en un formato portable.</p>'+
          '<a class="site-footer__primary-link" href="/studio/">Abrir Studio <span aria-hidden="true">→</span></a>'+
        '</div>'+menus+
      '</div>'+
      '<div class="site-footer__bottom">'+
        '<p class="site-footer__signature">P2LRN <span aria-hidden="true">·</span> Recursos y documentación</p>'+
        '<nav class="site-footer__legal" data-legal-links aria-label="Información legal">'+legal+'</nav>'+
      '</div>'+
    '</div>'+
  '</footer>';
}

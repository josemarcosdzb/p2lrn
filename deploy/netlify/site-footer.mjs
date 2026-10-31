/**
 * Shared public website footer. Rendered once by build-site.mjs into each
 * page footer after </main>. Application/form action footers are unaffected.
 */
export const SITE_FOOTER_GROUPS = Object.freeze([
  {
    label: 'Create and explore',
    links: [
      ['/crear-cursos-interactivos/', 'Create interactive courses'],
      ['/juegos-educativos-3d/', 'Juegos educativos 3D'],
      ['/cursos-offline/', 'Cursos sin LMS'],
      ['/demo/', 'Player and viewer'],
    ],
  },
  {
    label: 'Documentation',
    links: [
      ['/docs/', 'Documentation center'],
      ['/docs/empezar/', 'Before you start'],
      ['/docs/instalar/', 'Installation'],
      ['/docs/conectores/', 'Connectors and integration'],
    ],
  },
  {
    label: 'Resources',
    links: [
      ['/analytics/', 'P2LRN Analytics'],
      ['/skills/', 'Skills para IA'],
      ['/docs/troubleshooting/', 'Troubleshooting'],
      ['/contacto/', 'Contact'],
    ],
  },
]);

export const SITE_FOOTER_LEGAL_LINKS = Object.freeze([
  ['/licencia/', 'License'],
  ['/privacidad/', 'Privacy'],
  ['/terminos/', 'Terms'],
  ['/aviso-legal/', 'Legal notice'],
  ['/cookies/', 'Cookies'],
  ['/cookies/#configuracion', 'Cookie settings'],
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
  return '<footer class="site-footer" aria-label="P2LRN footer">'+
    '<div class="site-footer__inner">'+
      '<div class="site-footer__main">'+
        '<div class="site-footer__intro">'+
          '<a class="site-footer__brand" href="/" aria-label="P2LRN — Home">'+
            '<span class="site-footer__brand-mark" aria-hidden="true"></span>'+
            '<span class="site-footer__brand-text">P2LRN</span>'+
          '</a>'+
          '<p class="site-footer__description">Create, play, and share interactive learning content in a portable format.</p>'+
          '<a class="site-footer__primary-link" href="/studio/">Open Studio <span aria-hidden="true">→</span></a>'+
        '</div>'+menus+
      '</div>'+
      '<div class="site-footer__bottom">'+
        '<p class="site-footer__signature">P2LRN <span aria-hidden="true">·</span> Resources y documentación</p>'+
        '<nav class="site-footer__legal" data-legal-links aria-label="Legal information">'+legal+'</nav>'+
      '</div>'+
    '</div>'+
  '</footer>';
}

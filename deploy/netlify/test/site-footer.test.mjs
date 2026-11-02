import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {
  renderSiteFooter,
  SITE_FOOTER_GROUPS,
  SITE_FOOTER_LEGAL_LINKS,
  SITE_FOOTER_LINKS,
} from '../site-footer.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const contentAt=(relative)=>readFileSync(join(root,relative),'utf8');

test('one footer supplies clear product, documentation and resource groups',()=>{
  const footer=renderSiteFooter();
  assert(footer.startsWith('<footer class="site-footer"'));
  assert(footer.endsWith('</footer>'));
  assert.equal((footer.match(/<footer\b/g)||[]).length,1);
  assert.equal((footer.match(/<\/footer>/g)||[]).length,1);
  assert.equal((footer.match(/<nav\b/g)||[]).length,4);
  assert.equal((footer.match(/<h2\b/g)||[]).length,3);
  assert.equal(SITE_FOOTER_GROUPS.length,3);
  for(const {label,links} of SITE_FOOTER_GROUPS){
    assert(footer.includes('<h2 class="site-footer__heading">'+label+'</h2>'));
    assert(footer.includes('aria-label="'+label+'"'));
    assert(links.length>=4,'Footer link group is too small: '+label);
  }
  assert(footer.includes('href="/studio/"'));
  assert(footer.includes('href="/docs/conectores/"'));
  assert(footer.includes('href="/analytics/"'));
  assert(footer.includes('href="/skills/"'));
  assert(!footer.includes('href="/index.json"'));
  assert(footer.includes('href="/contacto/"'));
  assert(!footer.includes('http://')&&!footer.includes('https://'));
});

test('English footer mirrors the Spanish navigation with localized routes',()=>{
  const footer=renderSiteFooter('en');
  assert(footer.includes('aria-label="P2LRN footer"'));
  assert(footer.includes('href="/en/" aria-label="P2LRN — Home"'));
  assert(footer.includes('href="/en/studio/"'));
  assert(footer.includes('href="/en/docs/"'));
  assert(footer.includes('href="/en/contacto/"'));
  assert(footer.includes('href="/en/cookies/#configuracion"'));
  assert(footer.includes('>Documentation</'));
  assert(footer.includes('>Contact</'));
});

test('legal links remain complete and the cookies link points to the actual explanation',()=>{
  const footer=renderSiteFooter();
  assert(footer.includes('data-legal-links aria-label="Información legal"'));
  for(const [href,label] of SITE_FOOTER_LEGAL_LINKS){
    assert(footer.includes('href="'+href+'">'+label+'</a>'),'Missing '+label);
    assert(SITE_FOOTER_LINKS.includes(href));
  }
  assert(footer.includes('href="/cookies/#configuracion"'));
  assert(contentAt('deploy/netlify/site/cookies/index.html').includes('id="configuracion"'));
  assert.equal(new Set(SITE_FOOTER_LINKS).size,SITE_FOOTER_LINKS.length,
    'Site footer source must not list duplicate navigation destinations');
});

test('footer markup is accessible and all styling is scoped to the public footer',()=>{
  const footer=renderSiteFooter();
  const css=contentAt('deploy/netlify/site/p2lrn.css');
  assert(footer.includes('aria-label="Pie de página de P2LRN"'));
  assert(footer.includes('class="site-footer__brand" href="/" aria-label="P2LRN — Inicio"'));
  assert(footer.includes('aria-hidden="true"'));
  assert(footer.includes('class="site-footer__primary-link"'));
  assert(css.includes('.site-footer__main{'));
  assert(css.includes('grid-template-columns:minmax(255px,1.6fr) repeat(3,minmax(0,1fr))'));
  assert(css.includes('@media(max-width:960px)'));
  assert(css.includes('@media(max-width:620px)'));
  assert(css.includes('@media(max-width:360px)'));
  assert(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert(!css.includes('\nfooter{\n'),'Bare footer selector could style Studio form actions');
});

test('the build selects page footer after main and protects Studio inner form actions',()=>{
  const build=contentAt('deploy/netlify/build-site.mjs');
  const studio=contentAt('deploy/netlify/site/studio/index.html');
  assert(studio.includes('<footer class="studio-offline-actions">'));
  assert(studio.includes('data-offline-generate'));
  assert(build.includes("html.toLowerCase().lastIndexOf('</main>')"));
  assert(build.includes('match.index>mainEnd'));
  assert(build.includes("studioActionFooter.includes('data-legal-links')"));
  assert(build.includes('renderSiteFooter(locale)'));
  assert(build.includes('const minimumFooterPages=bilingualSite?80:40;'));
  assert(build.includes('publicFooterPages<minimumFooterPages'));

});

test('mobile integration card maintains readable text and button contrast',()=>{
  const css=contentAt('deploy/netlify/site/p2lrn.css');
  const html=contentAt('deploy/netlify/site/index.html');
  assert(html.includes('class="cdn-minimal bridge-cdn"'));
  for(const selector of ['.bridge-cdn','.bridge-cdn > p','.bridge-cdn > p .button','.bridge-cdn > p .button:focus-visible']){
    assert(css.includes(selector+'{'),'Missing contrast rule: '+selector);
  }
  const background='#0d1117';
  const foreground='#e1eaf8';
  const luminance=(color)=>{
    const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
      .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const ratio=(luminance(foreground)+.05)/(luminance(background)+.05);
  assert(ratio>=7,'Integration card body text must meet WCAG AAA contrast: '+ratio);
  assert(css.includes('color:#e1eaf8;'));
  assert(css.includes('border-color:#95b9fa;'));
});

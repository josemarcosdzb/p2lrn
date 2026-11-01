import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const site=join(root,'deploy','netlify','site');
const headers=readFileSync(join(site,'_headers'),'utf8');
for(const d of ['X-Content-Type-Options: nosniff','Referrer-Policy:','Permissions-Policy:','X-Frame-Options:','Content-Security-Policy:',"object-src 'none'","base-uri 'none'",'frame-ancestors'])assert.ok(headers.includes(d),'Missing: '+d);
assert.ok(headers.includes('/player/')===false,'Runtime headers must not inherit restrictive iframe policy');
assert.ok(headers.includes('/docs/*')&&headers.includes('/studio/*')&&headers.includes('/demo/*')&&headers.includes('/analytics/*'),'Missing protected web sections');
const sections=headers.replaceAll('\r\n','\n').split('\n');
const cspForRoute=(route)=>{
  const pos=sections.findIndex(line=>line===route);
  assert.ok(pos>=0,'Missing route '+route);
  const policy=sections.slice(pos+1).find(line=>line.startsWith('  Content-Security-Policy: '));
  assert.ok(policy,'Missing policy for '+route);
  return policy;
};
for(const route of ['/studio/*','/demo/*']){
  const policy=cspForRoute(route);
  const connect=/connect-src ([^;]+)/u.exec(policy)?.[1]??'';
  assert.match(connect,/(?:^|\s)blob:(?:\s|$)/u,route+' must allow verified local Blob packages');
  assert.ok(!policy.includes("script-src 'unsafe-inline'"),'Authoring script CSP must remain strict');
}
for(const route of ['/','/contacto/*','/docs/*','/analytics/*']){
  const connect=/connect-src ([^;]+)/u.exec(cspForRoute(route))?.[1]??'';
  assert.ok(!connect.includes('blob:'),'Do not widen Blob connections beyond authoring/player: '+route);
}
const scripts=headers.split('script-src ')[1]?.split(';',1)[0]??'';
assert.ok(scripts.includes("'self'")&&!scripts.includes("'unsafe-inline'")&&!scripts.includes("'unsafe-eval'"),'Script CSP permits unsafe JS');
for(const [page,marker] of [['studio/index.html','data-studio-status'],['demo/index.html','data-viewer-status'],['analytics/index.html','p2lrn-analytics']]){
  const html=readFileSync(join(site,...page.split('/')),'utf8');
  assert.ok(html.includes('data-functional-status'),'Functional status marker missing from '+page);
  assert.ok(html.includes(marker),'Application status element missing from '+page);
}
let pages=0;
function scan(dir){
  for(const e of readdirSync(dir,{withFileTypes:true})){
    const f=join(dir,e.name);
    if(e.isDirectory()){scan(f);continue}
    if(!e.name.endsWith('.html'))continue;
    pages++;
    const h=readFileSync(f,'utf8');
    for(const m of h.matchAll(/<script\b([^>]*)>/gi)){
      if(/\bsrc\s*=/i.test(m[1]))continue;
      // application/ld+json is inert structured data, never executable JS.
      // Validate allowed public URLs and schema identity instead of widening script-src.
      assert.match(m[1],/^\s*type=["']application\/ld\+json["']\s*$/i,'Forbidden inline script: '+f);
      const rel=relative(site,f).replaceAll('\\','/');
      const allow=new Map([
        ['index.html',{kind:'root',type:'WebSite',name:'P2LRN',url:'https://p2lrn.org/'}],
        ['en/index.html',{kind:'root',type:'WebSite',name:'P2LRN',url:'https://p2lrn.org/en/'}],
        ['analytics/index.html',{kind:'analytics',type:'WebApplication',name:'P2LRN Analytics',url:'https://p2lrn.org/analytics/'}],
        ['en/analytics/index.html',{kind:'analytics',type:'WebApplication',name:'P2LRN Analytics',url:'https://p2lrn.org/en/analytics/'}],
        ['docs/analytics/index.html',{kind:'article',type:'TechArticle',headline:'P2LRN Analytics:',url:'https://p2lrn.org/docs/analytics/'}],
        ['en/docs/analytics/index.html',{kind:'article',type:'TechArticle',headline:'P2LRN Analytics:',url:'https://p2lrn.org/en/docs/analytics/'}],
        ['skills/index.html',{kind:'skills',type:'CollectionPage',name:'Descargar Skills P2LRN para asistentes de IA',url:'https://p2lrn.org/skills/'}],
        ['en/skills/index.html',{kind:'skills',type:'CollectionPage',name:'Download P2LRN Skills for AI Assistants',url:'https://p2lrn.org/en/skills/'}]
      ]);
      assert.ok(allow.has(rel),'JSON-LD outside approved public pages: '+rel);
      const trailing=h.slice(m.index+m[0].length);
      const close=trailing.toLowerCase().indexOf('</script>');
      assert.ok(close>=0,'Unclosed JSON-LD: '+rel);
      const text=trailing.slice(0,close);
      assert.ok(!text.includes('<'),'JSON-LD must not embed markup: '+rel);
      let schema;
      try{schema=JSON.parse(text)}catch{assert.fail('Invalid JSON-LD: '+rel)}
      const expected=allow.get(rel);
      assert.equal(schema['@context'],'https://schema.org');
      assert.equal(schema['@type'],expected.type);
      if(expected.name)assert.equal(schema.name,expected.name);
      if(expected.headline)assert.ok(schema.headline?.startsWith(expected.headline),'Unrelated article schema on '+rel);
      assert.equal(schema.url,expected.url);
      const validKeys=expected.kind==='root'
        ? ['@context','@type','@id','name','url','inLanguage','description']
        : expected.kind==='analytics'
          ? ['@context','@type','name','url','applicationCategory','operatingSystem','inLanguage','description']
          : expected.kind==='article'
            ? ['@context','@type','headline','description','url','inLanguage','about']
            : ['@context','@type','name','description','url','inLanguage','isPartOf','mainEntity'];
      assert.ok(Object.keys(schema).every(key=>validKeys.includes(key)),'Unrecognized schema field: '+rel);
      if(expected.kind==='skills'){
        assert.equal(schema.mainEntity?.['@type'],'ItemList');
        const links=schema.mainEntity?.itemListElement;
        assert.ok(Array.isArray(links)&&links.length===4,'Expected four Skill packages in JSON-LD');
        const expectedFiles=['p2lrn-chatgpt-plugin.zip','p2lrn-claude-skill.zip','p2lrn-gemini-skill.zip','p2lrn-grok-skill.zip'];
        for(let i=0;i<expectedFiles.length;i++){
          assert.equal(links[i].position,i+1);
          assert.equal(links[i].url,'https://p2lrn.org/downloads/skills/'+expectedFiles[i]);
          assert.equal(links[i]['@type'],'ListItem');
        }
      }
    }
    // Preserve the prohibition of all inline event handlers.
    assert.ok(!/\son(?:load|error|click|submit|change|input)\s*=/i.test(h),'Inline handler: '+f);
  }
}
scan(site);assert.ok(pages>=30,'Unexpected HTML coverage');
console.log('Website CSP and '+pages+' HTML pages verified');

// Read-only gate for supplemental P2LRN Skills. Run after build-extra-skill-downloads.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
const folder=join(resolve(process.cwd()),'.netlify-cdn','downloads','skills');
const manifest=JSON.parse(await readFile(join(folder,'extensions-manifest.json'),'utf8'));
const slugs=['p2lrn-curso-ilustrado','edicion-visual-con-codigo','entregables-con-codigo'];
const prefixes={chatgpt:'skills/',codex:'.agents/skills/',claude:'',gemini:'',grok:'.grok/skills/'};
assert.equal(manifest.packages.length,15,'Three Skills x five platforms');
const unique=new Set(),parity=new Map();
for(const item of manifest.packages){
  assert.ok(slugs.includes(item.slug),'Known Skill');
  assert.ok(Object.hasOwn(prefixes,item.platform),'Known platform');
  assert.equal(item.filename,item.slug+'-'+item.platform+'-skill.zip','Stable URL');
  assert.ok(!unique.has(item.filename),'No duplicate');unique.add(item.filename);
  const bytes=await readFile(join(folder,item.filename));
  assert.equal(bytes.length,item.bytes,'ZIP length');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,'ZIP digest');
  const e=bytes.length-22;assert.equal(bytes.readUInt32LE(e),0x06054b50,'ZIP end');
  const count=bytes.readUInt16LE(e+10);let offset=bytes.readUInt32LE(e+16);
  assert.equal(count,item.members,'Manifest member count');
  const files=new Map();
  for(let i=0;i<count;i++){
    assert.equal(bytes.readUInt32LE(offset),0x02014b50,'Central header');
    const method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20);
    const length=bytes.readUInt32LE(offset+24),n=bytes.readUInt16LE(offset+28);
    const extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32);
    const local=bytes.readUInt32LE(offset+42),name=bytes.subarray(offset+46,offset+46+n).toString('utf8');
    assert.ok(!name.includes('..')&&!name.startsWith('/')&&!name.includes('\\'),'Safe ZIP member');
    assert.equal(bytes.readUInt32LE(local),0x04034b50,'Local header');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
    const packed=bytes.subarray(start,start+size);
    const data=method===8?inflateRawSync(packed):method===0?packed:null;
    assert.ok(data&&data.length===length,'ZIP content');
    assert.ok(!files.has(name),'Unique member');files.set(name,data);
    offset+=46+n+extra+comment;
  }
  assert.equal(offset,e,'End central directory');
  const prefix=prefixes[item.platform]+item.slug+'/';
  for(const path of ['SKILL.md','assets/icon.svg','scripts/check_capabilities.py',
    'references/COMPATIBILIDAD_AGENTES.md'])assert.ok(files.has(prefix+path),item.filename+' missing '+path);
  if(item.slug==='p2lrn-curso-ilustrado'){
    for(const path of ['scripts/p2lrn_package.py','scripts/p2lrn_official.mjs',
      'references/official-packages.json','references/official-runtime.md'])assert.ok(files.has(prefix+path),item.filename+' missing '+path);
  }
  const content=files.get(prefix+'SKILL.md').toString('utf8');
  assert.ok(content.startsWith('---\nname: '+item.slug+'\n'),'Skill metadata');
  const canonical=parity.get(item.slug)??content;
  assert.equal(content,canonical,'Identical Skill instructions across models');
  parity.set(item.slug,canonical);
  console.log('P2LRN_EXTRA_SKILL_VERIFIED '+item.slug+' '+item.platform+' '+item.sha256);
}
assert.equal(unique.size,15);
console.log('P2LRN_EXTRA_SKILL_PARITY_VERIFIED 15/15');

// Verify the five published-format Skill ZIPs made by build-skill-downloads.mjs.
// Read-only: no deployment, no installs, no network or release actions.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

const root=resolve(process.cwd());
const dir=join(root,'.netlify-cdn','downloads','skills');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const platformPrefixes={
  chatgpt:'skills/p2lrn-creator/',
  codex:'.agents/skills/p2lrn-creator/',
  claude:'p2lrn-creator/',
  gemini:'',
  grok:'.grok/skills/p2lrn-creator/',
};
const expectedFiles={
  chatgpt:'p2lrn-chatgpt-plugin.zip',
  codex:'p2lrn-codex-skill.zip',
  claude:'p2lrn-claude-skill.zip',
  gemini:'p2lrn-gemini-skill.zip',
  grok:'p2lrn-grok-skill.zip',
};
const requiredTopics=['drag-drop','drag-scored','assembly-3d','GLB','studio-object-tools.js',
  'studio-drop-activity.js','assembly-3d-editor.js','Player','modelador-3d'];
function zipEntries(bytes){
  assert.ok(bytes.length>22,'Truncated ZIP');
  const end=bytes.length-22;
  assert.equal(bytes.readUInt32LE(end),0x06054b50,'ZIP end marker');
  const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);
  assert.ok(count>0&&count<=200&&offset<end,'ZIP entry count/offset');
  let position=offset;
  const result=new Map();
  for(let i=0;i<count;i++){
    assert.equal(bytes.readUInt32LE(position),0x02014b50,'ZIP central header');
    const method=bytes.readUInt16LE(position+10);
    const zipped=bytes.readUInt32LE(position+20),unzipped=bytes.readUInt32LE(position+24);
    const nameSize=bytes.readUInt16LE(position+28),extra=bytes.readUInt16LE(position+30),comment=bytes.readUInt16LE(position+32);
    const start=bytes.readUInt32LE(position+42);
    const name=bytes.subarray(position+46,position+46+nameSize).toString('utf8');
    assert.ok(!name.startsWith('/')&&!name.includes('..')&&!name.includes('\\'),'Safe ZIP path');
    assert.equal(bytes.readUInt32LE(start),0x04034b50,'ZIP local header');
    const localName=bytes.readUInt16LE(start+26),localExtra=bytes.readUInt16LE(start+28);
    const dataStart=start+30+localName+localExtra;
    assert.ok(dataStart+zipped<=bytes.length,'ZIP data bounds');
    const packed=bytes.subarray(dataStart,dataStart+zipped);
    const body=method===8?inflateRawSync(packed):method===0?packed:null;
    assert.ok(body,'Supported ZIP method');
    assert.equal(body.length,unzipped,'ZIP uncompressed size');
    assert.ok(!result.has(name),'Unique ZIP paths');
    result.set(name,body);
    position+=46+nameSize+extra+comment;
  }
  assert.equal(position,end,'ZIP central directory bounds');
  return result;
}

const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
const versions=JSON.parse(await readFile(join(root,'skills','p2lrn-creator','references','official-packages.json'),'utf8'));
assert.equal(manifest.toolkitVersion,versions.packages.toolkit,'Toolkit compatibility');
assert.deepEqual(new Set(manifest.packages.map(pkg=>pkg.platform)),
  new Set(Object.keys(platformPrefixes)),'Every provider packaged exactly once');
const hashes=new Set();
for(const item of manifest.packages){
  assert.equal(item.filename,expectedFiles[item.platform],'Expected archive filename');
  const bytes=await readFile(join(dir,item.filename));
  assert.equal(bytes.length,item.bytes,'ZIP size in manifest');
  assert.equal(sha(bytes),item.sha256,'ZIP SHA-256 in manifest');
  const entries=zipEntries(bytes);
  const prefix=platformPrefixes[item.platform];
  const skill=entries.get(prefix+'SKILL.md')?.toString('utf8');
  const guide=entries.get(prefix+'references/studio-arrastre-ensamblaje-3d.md')?.toString('utf8');
  assert.ok(skill?.startsWith('---\nname: p2lrn-creator'),'Skill metadata');
  assert.ok(skill?.includes('references/studio-arrastre-ensamblaje-3d.md'),'Skill loads new guide');
  assert.ok(guide&&requiredTopics.every(topic=>guide.includes(topic)),'Complete Studio authoring guide');
  for(const required of ['scripts/p2lrn_official.mjs','scripts/p2lrn_package.py',
    'references/toolkit-parity.md','references/official-packages.json']){
    assert.ok(entries.has(prefix+required),item.platform+' missing '+required);
  }
  const advertised=JSON.parse(entries.get(prefix+'references/official-packages.json').toString('utf8'));
  assert.deepEqual(advertised.packages,versions.packages,'Each provider has current version matrix');
  hashes.add(sha(Buffer.from(guide)));
  console.log('P2LRN_SKILL_VERIFIED '+JSON.stringify({provider:item.platform,members:entries.size,bytes:bytes.length,sha256:item.sha256}));
}
assert.equal(hashes.size,1,'Guide must be byte-identical in all five provider ZIPs');
console.log('P2LRN_SKILL_PARITY_VERIFIED 5/5');

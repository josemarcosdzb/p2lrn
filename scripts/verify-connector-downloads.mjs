import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';

const root=resolve(process.cwd());
const archiveDirectory=join(root,'.netlify-cdn','downloads');
const manifest=JSON.parse(await readFile(join(archiveDirectory,'manifest.json'),'utf8'));
assert.equal(manifest.format,'p2lrn-connector-downloads/1');
const target=await mkdtemp(join(tmpdir(),'p2lrn-bundle-check-'));
const results=[];
async function extract(buffer,destination){
  const files=new Set();
  let cursor=0;
  for(;;){
    const signature=buffer.readUInt32LE(cursor);
    if(signature===0x02014b50||signature===0x06054b50)break;
    assert.equal(signature,0x04034b50,'Expected ZIP local header');
    const flags=buffer.readUInt16LE(cursor+6),method=buffer.readUInt16LE(cursor+8);
    assert.equal(flags&0x0008,0,'ZIP data descriptors are not expected');
    const compressedSize=buffer.readUInt32LE(cursor+18);
    const rawSize=buffer.readUInt32LE(cursor+22);
    const filenameBytes=buffer.readUInt16LE(cursor+26);
    const extraBytes=buffer.readUInt16LE(cursor+28);
    const filename=buffer.subarray(cursor+30,cursor+30+filenameBytes).toString('utf8');
    assert(!filename.startsWith('/')&&!filename.includes('..')&&!filename.includes('\\')&&filename.includes('/'),
      'Invalid ZIP member path '+filename);
    const offset=cursor+30+filenameBytes+extraBytes;
    const packed=buffer.subarray(offset,offset+compressedSize);
    const bytes=method===8?inflateRawSync(packed):method===0?packed:null;
    assert(bytes,'Unsupported ZIP compression');
    assert.equal(bytes.length,rawSize,'Corrupt ZIP member: '+filename);
    assert(!files.has(filename),'Duplicate ZIP member');
    files.add(filename);
    const absolute=join(destination,...filename.split('/'));
    await mkdir(dirname(absolute),{recursive:true});
    await writeFile(absolute,bytes);
    cursor=offset+compressedSize;
  }
  assert(files.size>0,'Empty connector ZIP');
  return files;
}
function runNode(args,cwd){
  const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,'Node command failed: node '+args.join(' ')+'\n'+result.stdout+'\n'+result.stderr);
}
try{
  for(const item of manifest.artifacts){
    const buffer=await readFile(join(archiveDirectory,item.file));
    assert.equal(buffer.length,item.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'),item.sha256);
    const files=await extract(buffer,target);
    assert.equal(files.size,item.members);
    results.push({file:item.file,bytes:item.bytes,members:files.size,sha256Verified:true});
  }
  const lti=join(target,'p2lrn-lti');
  const local=join(target,'p2lrn-mcp');
  for(const relative of [
    'integration/mcp/Conectar-P2LRN.cmd',
    'integration/mcp/connect-local.mjs',
    'integration/mcp/server.mjs',
    'integration/mcp/service.mjs',
    'packages/toolkit/package.json',
    'packages/toolkit/tsconfig.json',
    'packages/toolkit/src/authoring/index.ts',
    'packages/toolkit/web/questionnaire-games-core.js',
    'LEEME-PRIMERO.md'
  ])await readFile(join(local,...relative.split('/')));
  for(const relative of [
    'integration/lms/ARCHITECTURE.md',
    'integration/lms/launch-contract.mjs',
    'integration/lms/host-adapter.mjs',
    'integration/lms/lms-contracts.test.mjs',
    'packages/toolkit/web/host-adapter.js',
    'LEEME-PRIMERO.md'
  ])await readFile(join(lti,...relative.split('/')));
  for(const filename of ['server.mjs','service.mjs','connect-local.mjs','local-clients.mjs','prepare-connectors.mjs'])
    runNode(['--check',join(local,'integration','mcp',filename)],local);
  // Execute the LTI contract tests from the ZIP, not from the source checkout.
  runNode(['--test','integration/lms/lms-contracts.test.mjs'],lti);
  console.log(JSON.stringify({ok:true,artifacts:results,ltiContractsExecutedFromDownloadedZip:true,mcpSourceSyntaxVerified:true},null,2));
}finally{
  await rm(target,{recursive:true,force:true});
}

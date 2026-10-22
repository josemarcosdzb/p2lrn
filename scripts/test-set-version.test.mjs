import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const script=resolve(root,'scripts/set-version.mjs');
const list=[
  'packages/player/package.json','packages/studio/package.json',
  'packages/toolkit/package.json','packages/h5p-libraries/package.json',
  'packages/toolkit/config/capabilities.json','packages/studio/src/p2lrn-studio.js',
  'packages/toolkit/web/p2lrn-player.js','packages/toolkit/web-sdk-src/p2lrn.js',
  'PUBLISHING.md',
];
test('version bump dry-run validates four packages including Studio without writing any file',async()=>{
  const paths=list.map(file=>resolve(root,file));
  const before=await Promise.all(paths.map(path=>readFile(path,'utf8')));
  const version=JSON.parse(before[0]).version;
  const candidate=version.replace(/-.*/u,'')+'-releaseqa.99999';
  const {stdout}=await execFileAsync(process.execPath,[script,candidate,'--dry-run','--expect-current='+version],{cwd:root,timeout:25000});
  const result=JSON.parse(stdout);
  assert.equal(result.dryRun,true);
  assert.equal(result.previous,version);
  assert.equal(result.version,candidate);
  assert.equal(result.publication,'NOT_PERFORMED');
  for(const p of list)assert(result.touched.includes(p),'Dry-run missed '+p);
  const after=await Promise.all(paths.map(path=>readFile(path,'utf8')));
  assert.deepEqual(after,before,'--dry-run changed a release file');
});
test('version bump refuses stale expected version without changes',async()=>{
  const before=await readFile(resolve(root,'packages/studio/package.json'),'utf8');
  const version=JSON.parse(before).version;
  const candidate=version.replace(/-.*/u,'')+'-releaseqa.99999';
  await assert.rejects(
    execFileAsync(process.execPath,[script,candidate,'--dry-run','--expect-current=0.0.0'],{cwd:root,timeout:25000}),
    /Version changed under us/u,
  );
  const after=await readFile(resolve(root,'packages/studio/package.json'),'utf8');
  assert.equal(after,before);
});
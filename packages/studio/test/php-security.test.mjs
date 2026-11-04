import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const cli=fileURLToPath(new URL('../bin/p2lrn-studio.mjs',import.meta.url));

test('PHP routes deny access until Host auth and disallow executable filenames',async()=>{
 const root=await mkdtemp(join(tmpdir(),'p2lrn-php-guard-'));
 try{
  const {stdout}=await exec(process.execPath,[cli,'setup','php','--cwd',root]);
  assert.equal(JSON.parse(stdout).target,'php');
  const auth=await readFile(join(root,'p2lrn-setup','studio-auth.php'),'utf8');
  assert.match(auth,/p2lrn_studio_host_authorize/);
  assert.match(auth,/return false;/);
  assert.match(auth,/p2lrn_studio_host_authenticate/);
  assert.match(auth,/p2lrn_studio_host_check_csrf/);
  assert.match(auth,/p2lrn_studio_host_authorize/);
  const bridge=await readFile(join(root,'p2lrn-setup','studio-php-bridge.php'),'utf8');
  assert.match(bridge,/UPLOAD_TOO_LARGE/);
  for(const op of ['save','read','import']){
   const code=await readFile(join(root,'api','p2lrn','studio',op,'index.php'),'utf8');
   assert.match(code,/studio-auth\.php/);
   assert.match(code,new RegExp("p2lrn_studio_require_authorization\\('"+op+"'"));
   assert.match(code,/__COURSE_PATH__|course/);
  }
  const save=await readFile(join(root,'api','p2lrn','studio','save','index.php'),'utf8');
  assert.match(save,/\.p2lrn\$/);
  assert.match(save,/tempnam\(/);
  assert.match(save,/@rename\(/);
  assert.doesNotMatch(save,/file_put_contents/);
  assert.doesNotMatch(save,/basename\(\$_SERVER/);
 }finally{await rm(root,{recursive:true,force:true});}
});

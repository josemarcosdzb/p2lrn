import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const templates=new URL('../templates/',import.meta.url);
const source=async(name)=>readFile(new URL(name,templates),'utf8');
const operationNames=['save','read','import'];

const mustGuard=[
  ['laravel-controller.php',[
    "guard($request,'save')","guard($request,'read')","guard($request,'import')",
    "p2lrn_studio_csrf_ok","p2lrn_studio_operation","p2lrn_studio_course",
    "AUTHENTICATION_REQUIRED","COURSE_ACCESS_DENIED",
  ]],
  ['symfony-controller.php',[
    "guard($request,'save')","guard($request,'read')","guard($request,'import')",
    "p2lrn_studio_csrf_ok","p2lrn_studio_operation","p2lrn_studio_course",
    "AUTHENTICATION_REQUIRED","COURSE_ACCESS_DENIED",
  ]],
  ['rails-controller.rb',[
    'before_action :require_studio_host_access!',
    'p2lrn.studio.principal','p2lrn.studio.operation',
    'p2lrn.studio.course','p2lrn.studio.csrf_ok',
    'AUTHENTICATION_REQUIRED','COURSE_ACCESS_DENIED',
  ]],
  ['go-handler.go',[
    'type HostAccess struct','Authenticate func','Authorize func','VerifyCSRF func',
    'func Register(','guard(w,r,operation,host)',
    'HOST_AUTHORIZATION_NOT_CONFIGURED',
  ]],
  ['aspnet-endpoint.cs',[
    'private static IResult? Guard(','Guard(req,"save")','Guard(req,"read")','Guard(req,"import")',
    'p2lrn.studio.csrf_ok','p2lrn.studio.operation','p2lrn.studio.course',
    'AUTHENTICATION_REQUIRED','COURSE_ACCESS_DENIED',
  ]],
  ['spring-controller.java',[
    'guard(req,"save")','guard(req,"read")','guard(req,"import")',
    'p2lrn.studio.csrf_ok','p2lrn.studio.operation','p2lrn.studio.course',
    'AUTHENTICATION_REQUIRED','COURSE_ACCESS_DENIED',
  ]],
  ['nest-controller.ts',[
    '@UseGuards(P2LRNStudioHostGuard)','P2LRNStudioHostGuard implements CanActivate',
    'p2lrnStudioCsrfVerified','p2lrnStudioAuthorizedOperation',
    'p2lrnStudioAuthorizedCourse',
    'AUTHENTICATION_REQUIRED','COURSE_ACCESS_DENIED',
  ]],
  ['rust-axum.rs',[
    'pub struct StudioHostAccess','fn guard(req:&Request<Body>,operation:&str)',
    'guard(&req,"save")','guard(&req,operation)',
    'run(req,"read"','run(req,"import"',
    'csrf_verified','course_path','AUTHENTICATION_REQUIRED','COURSE_ACCESS_DENIED',
  ]],
];

for(const [name,expected] of mustGuard){
  test(name+' cannot reach Studio operations without Host auth, course ACL and CSRF',async()=>{
    const text=await source(name);
    for(const token of expected)
      assert.ok(text.includes(token),name+' missing mandatory control '+token);
    assert.ok(!text.includes('__HOST_AUTHORIZED__'),name+' contains unresolved auth placeholder');
  });
}

test('all PHP template saves restrict executable names and replace packages atomically',async()=>{
  for(const name of ['php-save.php','laravel-controller.php','symfony-controller.php']){
    const text=await source(name);
    assert.match(text,/\.p2lrn/);
    assert.match(text,/phtml/);
    assert.match(text,/rename\(/);
    assert.match(text,/tempnam\(/);
    assert.match(text,/UPLOAD_TOO_LARGE/);
    assert.match(text,/UNSAFE_STORAGE_PATH/);
  }
});

test('Laravel and Symfony bound unknown-length uploads while streaming instead of unbounded getContent',async()=>{
  for(const name of ['laravel-controller.php','symfony-controller.php']){
    const text=await source(name);
    assert.match(text,/getContent\(true\)/);
    assert.match(text,/fread\(\$stream,65536\)/);
    assert.match(text,/strlen\(\$body\)\+strlen\(\$chunk\)>\$limit/);
    assert.doesNotMatch(text,/\$data=\$request->getContent\(\)/);
  }
});

test('generated native and framework handlers bound file uploads and avoid direct truncation',async()=>{
  for(const name of ['go-handler.go','aspnet-endpoint.cs','spring-controller.java','rust-axum.rs','nest-controller.ts','rails-controller.rb']){
    const text=await source(name);
    assert.match(text,/512\s*[*<]|512L\s*\*|536870912|MAX_COURSE|MaxCourse|maxCourseBytes/i);
    assert.match(text,/INVALID_FILENAME/i);
    assert.doesNotMatch(text,/File\.Create\(file\)|Files\.write\(file,body\)|os\.WriteFile\(filepath\.Join\(dir,name\)/);
  }
});

test('setup course paths restrict quotes, shell metacharacters and sibling traversal',async()=>{
  const cli=await readFile(new URL('../bin/p2lrn-studio.mjs',import.meta.url),'utf8');
  assert.match(cli,/Unsafe course path/);
  assert.match(cli,/A-Za-z0-9/);
  assert.match(cli,/dest!==resolve\(cwd\)&&!dest\.startsWith\(resolve\(cwd\)\+sep\)/);
});

test('PHP syntax is valid when an interpreter is installed',async(t)=>{
  const probe=spawnSync('php',['-v'],{encoding:'utf8',timeout:5000});
  if(probe.error?.code==='ENOENT'){t.skip('PHP not installed in test environment');return;}
  assert.equal(probe.status,0);
  for(const name of ['php-save.php','laravel-controller.php','symfony-controller.php']){
    const path=fileURLToPath(new URL(name,templates));
    const check=spawnSync('php',['-l',path],{encoding:'utf8',timeout:5000});
    assert.equal(check.status,0,name+' PHP syntax: '+check.stdout+check.stderr);
  }
});

test('Rails syntax is valid when Ruby is installed',async(t)=>{
  const probe=spawnSync('ruby',['--version'],{encoding:'utf8',timeout:5000});
  if(probe.error?.code==='ENOENT'){t.skip('Ruby not installed in test environment');return;}
  assert.equal(probe.status,0);
  const path=fileURLToPath(new URL('rails-controller.rb',templates));
  const check=spawnSync('ruby',['-c',path],{encoding:'utf8',timeout:5000});
  assert.equal(check.status,0,'Rails template syntax: '+check.stdout+check.stderr);
});

test('Go handler parses when Go and gofmt are available',async(t)=>{
  const probe=spawnSync('gofmt',['-h'],{encoding:'utf8',timeout:5000});
  if(probe.error?.code==='ENOENT'){t.skip('gofmt not installed');return;}
  const path=fileURLToPath(new URL('go-handler.go',templates));
  const check=spawnSync('gofmt',['-e',path],{encoding:'utf8',timeout:5000});
  assert.equal(check.status,0,'Go syntax: '+check.stdout+check.stderr);
});

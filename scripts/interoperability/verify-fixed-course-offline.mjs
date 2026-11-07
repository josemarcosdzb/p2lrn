// Real original-course Windows offline delivery. No course modification and
// no automatic claims that user-controlled result hashes prove authentic grades.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {openP2LRNPackageBytes} from '../../packages/toolkit/web/p2lrn-player.js';
import {P2LRNStudioDocument} from '../../packages/toolkit/web/studio/authoring-document.js';
import {
  inspectOfflineAssignmentCompatibility,
  exportOfflineAssignmentBundle,
  parseOfflineAssignmentResult,
} from '../../packages/toolkit/web/studio/offline-assignment.js';
import {createInteropStudioServer} from './studio-lab-server.mjs';
import {launchInteropChrome} from './chrome-visual.mjs';

const SHA='cce43503ea425ec4f1e6203c8ef6556beb999e71c08e59d5511091a6b931a380';
const args=process.argv.slice(2),arg=name=>{let i=args.indexOf(name);return i>=0?args[i+1]:null;};
const coursePath=resolve(arg('--course')||'seguridad-informatica.p2lrn');
const siteRoot=resolve(arg('--site')||'.netlify-cdn');
const repoRoot=resolve(arg('--repo')||process.cwd());
const output=resolve(arg('--output')||'.interop-evidence');
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={
 schema:'https://p2lrn.org/schema/interoperability-real-qa/1',
 kind:'OFFLINE_WINDOWS_ORIGINAL_STUDIO_COURSE',version:'1',
 status:'IN_PROGRESS',startedAt:new Date().toISOString(),
 originalSha256:SHA,authoredCourseModified:false,variantsCreated:0,
 offlineBundle:null,sourceMatches:null,learnerResult:null,officialGradeTrusted:false,
 phases:[],fullAcceptance:false,
};
const save=()=>writeFile(join(output,'offline-windows-report.json'),JSON.stringify(report,null,2)+'\n');
const phase=async(name,body)=>{
  const row={name,status:'IN_PROGRESS'};report.phases.push(row);await save();
  try{const value=await body();row.status='PASS';row.detail=value;await save();return value;}
  catch(error){row.status='BLOCKED_OR_FAILED';row.error=String(error?.message||error).slice(0,700);await save();throw error;}
};
let server=null,chrome=null,launcher=null;
await mkdir(output,{recursive:true});
try{
  const course=await phase('verify-one-original-file',async()=>{
    const data=await readFile(coursePath);
    assert.equal(sha(data),SHA,'Authoritative original course SHA differs');
    const opened=await openP2LRNPackageBytes(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
    return {bytes:data.length,sha256:SHA,contentRoot:opened.manifest.integrity.contentRoot};
  });
  const raw=await readFile(coursePath);
  const pkg=await openP2LRNPackageBytes(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  const doc=new P2LRNStudioDocument(pkg,{sourceName:'seguridad-informatica.p2lrn'});
  const rights=typeof doc.getCourseRights==='function'?doc.getCourseRights():{};
  report.sourceRights={
    authorProvided:Boolean(String(rights?.author||'').trim()),
    holderProvided:Boolean(String(rights?.copyrightHolder||'').trim()),
    createdDateProvided:Boolean(String(rights?.createdAt||'').trim()),
  };
  const compatible=inspectOfflineAssignmentCompatibility(doc);
  report.offlineCompatibility={ok:compatible.ok,issues:compatible.issues};
  await save();
  if(!compatible.ok)throw new Error('Official offline capability requirements of original course not met: '+compatible.issues.map(x=>x.code).join(', '));
  if(!report.sourceRights.authorProvided||!report.sourceRights.holderProvided){
    report.status='BLOCKED_MISSING_AUTHORED_PROVENANCE';
    console.log('P2LRN_OFFLINE_PROVENANCE_BLOCKED='+JSON.stringify(report.sourceRights));
  }else{
    server=await createInteropStudioServer({siteRoot,repoRoot,coursePath});
    const bundle=await phase('official-offline-bundle-from-original-unchanged-bytes',async()=>{
      const exported=await exportOfflineAssignmentBundle(doc,{
        packageExporter:async()=>({bytes:new Uint8Array(raw),manifest:pkg.manifest,filename:'seguridad-informatica.p2lrn'}),
        signAssignment:true,issuerName:'Laboratorio de pruebas de interoperabilidad P2LRN',
        participantLabel:'Alumno de pruebas P2LRN',
        title:'Evaluación de seguridad informática - entrega original',
        filenameBase:'seguridad-informatica',
        runtimeBaseUrl:server.base+'/player/current/dist/p2lrn.js',
      });
      const bundlePath=join(output,exported.filename);
      const launcherPath=join(output,exported.windowsLauncher.filename);
      await writeFile(bundlePath,exported.bytes);
      await writeFile(launcherPath,exported.windowsLauncher.bytes);
      const receiptPath=exported.teacherReceipt?join(output,exported.teacherReceipt.filename):null;
      if(receiptPath)await writeFile(receiptPath,exported.teacherReceipt.bytes);
      return {bundlePath,launcherPath,receiptPath,
        assignmentId:exported.assignment.assignmentId,contentRoot:exported.assignment.contentRoot,
        launcherDigest:exported.windowsLauncher.payloadDigest,
        runtimeVersion:exported.runtimeRelease.webSdkVersion,
        courseOriginalSha256:sha(raw),bytes:exported.bytes.length,
        __bundle:exported};
    });
    // Save public evidence without persisting the full binary bundle object.
    report.offlineBundle=Object.fromEntries(Object.entries(bundle).filter(([k])=>k!=='__bundle'));
    await save();
    const source=bundle.__bundle;
    // Drive the real bundled CMD on a Windows host (same method the learner
    // uses by double-clicking it), not an in-memory reimplementation.
    if(process.platform!=='win32')throw new Error('Real offline Windows launcher must run on Windows');
    const launched=await phase('double-click-windows-launcher',()=>new Promise((ok,fail)=>{
      let outputText='';
      launcher=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','call',bundle.launcherPath],{
        cwd:output,windowsHide:true,stdio:['ignore','pipe','pipe'],
      });
      let completed=false;
      const done=(fn,value)=>{if(completed)return;completed=true;clearTimeout(timer);fn(value);};
      const check=chunk=>{
        outputText=(outputText+chunk.toString()).slice(-10000);
        const url=/http:\/\/127\.0\.0\.1:\d+\/index\.html/.exec(outputText)?.[0];
        if(url)done(ok,{url,launchOutput:outputText.slice(-900)});
      };
      launcher.stdout.on('data',check);launcher.stderr.on('data',check);
      launcher.on('error',error=>done(fail,error));
      launcher.on('exit',code=>done(fail,new Error('Offline launcher exited before URL, exit '+code+': '+outputText.slice(-500))));
      const timer=setTimeout(()=>done(fail,new Error('Windows offline launcher did not start: '+outputText.slice(-900))),30000);
    }));
    report.launcher=launched;await save();
    const localBase=new URL(launched.url).origin;
    const embedded=Buffer.from(await(await fetch(localBase+'/course.p2lrn')).arrayBuffer());
    assert.equal(sha(embedded),SHA,'Offline wrapper modified the ORIGINAL course file');
    report.sourceMatches={originalSha256:SHA,offlineSha256:sha(embedded),sameBytes:true};
    chrome=await launchInteropChrome({downloadDir:join(output,'offline-results'),
      evidenceDir:join(output,'offline-screenshots')});
    await phase('learner-opens-same-course-on-windows',async()=>{
      await chrome.navigate(launched.url);
      await chrome.wait("Boolean(document.getElementById('start')&&!document.getElementById('start').disabled)",{timeout:30000,label:'offline learner start screen'});
      const start=await chrome.evaluate("(()=>{const b=document.getElementById('start');b.click();return true})()");
      assert(start);
      await chrome.wait("Boolean(document.querySelector('#player p2lrn-player')?.shadowRoot?.querySelector('.p2lrn-nav'))",{timeout:40000,label:'offline course loaded'});
      return {screenshot:await chrome.screenshot('offline-learner-opened'),sourceSha256:SHA};
    });
    await phase('student-completes-real-offline-questionnaire',async()=>{
      const chosen=await chrome.evaluate("(()=>{const root=document.querySelector('#player p2lrn-player')?.shadowRoot;const nav=[...root.querySelectorAll('.p2lrn-nav button:not([disabled])')];const quiz=nav.find(x=>x.textContent.includes('Cuestionario'));if(!quiz)throw Error('Original course has no offline questionnaire');quiz.click();return true})()");
      assert(chosen);
      await chrome.wait("Boolean(document.querySelector('#player p2lrn-player')?.shadowRoot?.querySelector('.p2lrn-q-card'))",{timeout:25000,label:'offline quiz ready'});
      const answer=await chrome.evaluate("(()=>{const root=document.querySelector('#player p2lrn-player')?.shadowRoot;const input=root.querySelector('.p2lrn-q-card input[type=radio]');if(!input)throw Error('Quiz answer control missing');input.click();const finish=[...root.querySelectorAll('.p2lrn-q-shell button')].find(x=>x.textContent.trim()==='Finalizar');if(!finish)throw Error('Quiz submit missing');finish.click();return true})()");
      assert(answer);
      await chrome.wait("Boolean(document.querySelector('#player p2lrn-player')?.shadowRoot?.querySelector('.p2lrn-q-result'))",{timeout:25000,label:'offline result displayed'});
      return {screenshot:await chrome.screenshot('offline-questionnaire-submitted'),result:'real-player-state'};
    });
    await phase('download-and-validate-learner-result',async()=>{
      await chrome.evaluate("(()=>{const b=document.getElementById('finish');if(!b||b.disabled)throw Error('Offline result submission unavailable');b.click();return true})()");
      let file=null;
      for(let i=0;i<220;i++){
        const files=(await readdir(join(output,'offline-results'))).filter(x=>x.endsWith('.p2lrn-result'));
        if(files.length){file=join(output,'offline-results',files.sort().at(-1));const size=(await stat(file)).size;if(size>150)break;}
        await new Promise(done=>setTimeout(done,120));
      }
      if(!file)throw new Error('Offline Windows did not download .p2lrn-result');
      const text=await readFile(file,'utf8');
      const receipt=source.teacherReceipt?JSON.parse(new TextDecoder().decode(source.teacherReceipt.bytes)):null;
      const parsed=await parseOfflineAssignmentResult(text,{
        expectedContentRoot:pkg.manifest.integrity.contentRoot,
        expectedAssignmentId:source.assignment.assignmentId,
        trustedReceipt:receipt,
      });
      report.learnerResult={
        file,bytes:Buffer.byteLength(text),integrityValid:parsed.integrityValid,
        evidenceValid:parsed.evidenceValid,summaryValid:parsed.summaryValid,
        assignmentAuthenticated:parsed.assignmentAuthenticated,
        note:'Teacher signature authenticates assignment, not learner-controlled grades',
        score:parsed.summary.latestScore,events:parsed.summary.events.length,
      };
      if(!parsed.integrityValid||!parsed.evidenceValid||!parsed.summaryValid||!parsed.courseMatches)
        throw new Error('Offline result failed structural verification');
      return report.learnerResult;
    });
    report.status='OFFLINE_SINGLE_COURSE_RUN_WITH_LIMITED_SCORE_TRUST';
  }
}catch(error){
  report.status=report.status==='BLOCKED_MISSING_AUTHORED_PROVENANCE'?report.status:'OFFLINE_TEST_FAILED';
  report.error=String(error?.message||error).slice(0,800);
  console.error('P2LRN_REAL_OFFLINE_ERROR='+report.error);
}finally{
  report.completedAt=new Date().toISOString();
  await save();
  if(chrome)await chrome.close();
  if(launcher?.pid){
    await new Promise(done=>{
      const killer=spawn('taskkill.exe',['/PID',String(launcher.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      killer.on('exit',done);killer.on('error',done);setTimeout(done,3200);
    });
  }
  if(server)await server.close();
}
console.log('P2LRN_REAL_OFFLINE_REPORT='+JSON.stringify(report));
if(report.status==='OFFLINE_TEST_FAILED')process.exitCode=1;

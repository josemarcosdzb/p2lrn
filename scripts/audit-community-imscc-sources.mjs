// Read-only check of MIT-licensed, commit-pinned Instructure cartridges.
// It never executes extracted HTML and never changes fixture provenance.
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';
const commit='3a4e1da4215a5de646e6230ed092647822168563';
const base='https://raw.githubusercontent.com/instructure/common-cartridge-viewer/'+commit+'/public/test-cartridges/';
for(const name of ['single-page.imscc','canvas_cc_gem_course.imscc','latex.imscc','allyworkshop.imscc','ushistory.imscc']){
  const response=await fetch(base+name,{signal:AbortSignal.timeout(45000),redirect:'error'});
  if(!response.ok)throw Error(name+' HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>12*1024*1024)throw Error('Asset too large: '+name);
  const archive=ZipArchive.open(bytes);
  const htmls=[];
  for(const f of archive.names().filter(x=>/\.(?:html?|xhtml)$/iu.test(x)).slice(0,1200)){
    const data=archive.read(f);if(data.length>1e6)continue;
    const html=new TextDecoder().decode(data);
    const body=/<body\b[^>]*>([\s\S]*?)<\/body>/iu.exec(html)?.[1]??html;
    const text=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu,' ').replace(/<[^>]+>/gu,' ').replace(/&(?:nbsp|amp|lt|gt|quot);/g,' ').replace(/\s+/g,' ').trim();
    htmls.push({member:f,textLength:text.length,preview:text.slice(0,110)});
  }
  const nonEmpty=htmls.filter(x=>x.textLength>25);
  console.log('IMSCC_SOURCE_AUDIT='+JSON.stringify({
    name,bytes:bytes.length,totalMembers:archive.names().length,htmlFiles:htmls.length,
    nonemptyHtml:nonEmpty.length,nonemptySamples:nonEmpty.slice(0,7),
    emptyExamples:htmls.filter(x=>x.textLength===0).slice(0,5)
  }));
}

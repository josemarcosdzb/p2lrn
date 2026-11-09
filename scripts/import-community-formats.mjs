// Import licensed community examples with the official P2LRN converter.
// No downloaded source code is executed. Browser playback is NOT certified here.
// Re-run safely: pre-existing .p2lrn artifacts and their provenance are immutable.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {ZipArchive,writeZip} from '../packages/toolkit/dist/core/zip.js';
import {convertExternalPackage} from '../packages/toolkit/dist/creator/external.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir=join(root,'examples','canonical','external','free');
const provenanceFile=join(dir,'provenance.json');
const schema='https://p2lrn.org/schema/community-samples/1';
const mirror='4d76f01918d85cbb06a9e246d3e71c9d10b92019';
const ims='3a4e1da4215a5de646e6230ed092647822168563';
const originalScript='https://github.com/josemarcosdzb/p2lrn/blob/mejorastudio/scripts/import-community-formats.mjs';
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const raw=(owner,project,commit,path)=>'https://raw.githubusercontent.com/'+owner+'/'+project+'/'+commit+'/'+path;
const h5ps=[
  ['h5p-arithmetic','Arithmetic Quiz — Addition','arithmetic-quiz-example-addition-57854.h5p'],
  ['h5p-crossword-real','Crossword — Example Content','example-content-crossword-1209160.h5p'],
  ['h5p-question-set','Quiz — Question Set','question-set-616.h5p'],
  ['h5p-course-presentation','Interactive Course Presentation','course-presentation-21-21180.h5p'],
  ['h5p-drag-and-drop','Drag and Drop','drag-and-drop-712.h5p'],
  ['h5p-interactive-video','Interactive Video','interactive-video-2-618.h5p'],
  ['h5p-column','Column — Multiple Interactions','h5p-column-34794.h5p'],
].map(([slug,title,name])=>({
  slug,title,kind:'h5p',license:'CC-BY-4.0',licenseUrl:'https://h5p.org/licensing',
  sourceUrl:raw('justineuro','h5p-view',mirror,name),origin:'H5P.org sample mirrored by justineuro/h5p-view',
  ext:'.h5p',maxBytes:24*1024*1024,
}));
const cartridges=[
  ['imscc-single-page','Common Cartridge — Single Page','single-page.imscc'],
  ['imscc-canvas-cc-gem','Common Cartridge — Canvas Test Course','canvas_cc_gem_course.imscc'],
  ['imscc-latex','Common Cartridge — Mathematics and LaTeX','latex.imscc'],
].map(([slug,title,name])=>({
  slug,title,kind:'imscc',license:'MIT',
  licenseUrl:'https://github.com/instructure/common-cartridge-viewer/blob/'+ims+'/LICENSE',
  sourceUrl:raw('instructure','common-cartridge-viewer',ims,'public/test-cartridges/'+name),
  origin:'Instructure test fixtures',ext:'.imscc',maxBytes:12*1024*1024,
}));
const qtis=[
  {slug:'qti22-two-questions',kind:'qti',title:'QTI 2.2 — Two Interactive Questions',license:'MIT',
   licenseUrl:'https://github.com/josemarcosdzb/p2lrn/blob/mejorastudio/examples/canonical/external/free/GENERATED-LICENSE.md',
   sourceUrl:originalScript,origin:'P2LRN-authored deterministic QTI fixture',ext:'.zip',generatedVersion:'2.2'},
  {slug:'qti30-two-questions',kind:'qti',title:'QTI 3.0 — Two Interactive Questions',license:'MIT',
   licenseUrl:'https://github.com/josemarcosdzb/p2lrn/blob/mejorastudio/examples/canonical/external/free/GENERATED-LICENSE.md',
   sourceUrl:originalScript,origin:'P2LRN-authored deterministic QTI fixture',ext:'.zip',generatedVersion:'3.0'},
];
const sources=[...h5ps,...cartridges,...qtis];

function qtiZip(version){
  const newer=version==='3.0';
  const ns=newer?'http://www.imsglobal.org/xsd/imsqtiasi_v3p0':'http://www.imsglobal.org/xsd/imsqti_v2p2';
  const tag=(name)=>newer?'qti-'+name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()):name;
  const q=[
    {id:'arithmetic',prompt:'What is 2 + 2?',answers:['3','4','5'],correct:'B'},
    {id:'geography',prompt:'Which city is the capital of France?',answers:['Madrid','Rome','Paris'],correct:'C'},
  ];
  const items=q.map(question=>{
    const t=tag;
    return ['<?xml version="1.0" encoding="UTF-8"?>',
      '<'+t('assessmentItem')+' xmlns="'+ns+'" identifier="'+question.id+'" title="'+question.prompt+'" adaptive="false" timeDependent="false">',
      '<'+t('responseDeclaration')+' identifier="RESPONSE" cardinality="single" baseType="identifier">',
      '<'+t('correctResponse')+'><'+t('value')+'>'+question.correct+'</'+t('value')+'></'+t('correctResponse')+'>',
      '</'+t('responseDeclaration')+'>',
      '<'+t('outcomeDeclaration')+' identifier="SCORE" cardinality="single" baseType="float"><'+t('defaultValue')+'><'+t('value')+'>0</'+t('value')+'></'+t('defaultValue')+'></'+t('outcomeDeclaration')+'>',
      '<'+t('itemBody')+'><'+t('choiceInteraction')+' responseIdentifier="RESPONSE" maxChoices="1"><'+t('prompt')+'>'+question.prompt+'</'+t('prompt')+'>',
      ...question.answers.map((answer,i)=>'<'+t('simpleChoice')+' identifier="'+String.fromCharCode(65+i)+'">'+answer+'</'+t('simpleChoice')+'>'),
      '</'+t('choiceInteraction')+'></'+t('itemBody')+'>',
      '<'+t('responseProcessing')+' template="http://www.imsglobal.org/question/qti_v2p1/rptemplates/match_correct"/>',
      '</'+t('assessmentItem')+'>',
    ].join('\n');
  });
  const type=newer?'imsqti_item_xmlv3p0':'imsqti_item_xmlv2p2';
  const resources=q.map(x=>'<resource identifier="'+x.id+'" type="'+type+'" href="items/'+x.id+'.xml"><file href="items/'+x.id+'.xml"/></resource>').join('\n');
  const manifest=['<?xml version="1.0" encoding="UTF-8"?>',
    '<manifest xmlns="http://www.imsglobal.org/xsd/imscp_v1p1" identifier="p2lrn-qti-'+version.replace('.','-')+'">',
    '<metadata><schema>QTI Package</schema><schemaversion>'+version+'</schemaversion></metadata>',
    '<organizations/>','<resources>',resources,'</resources>','</manifest>'].join('\n');
  const te=new TextEncoder();
  return writeZip([
    {path:'imsmanifest.xml',data:te.encode(manifest),method:8},
    ...q.map((x,i)=>({path:'items/'+x.id+'.xml',data:te.encode(items[i]),method:8}))
  ]);
}

async function download(source){
  assert(source.sourceUrl.startsWith('https://raw.githubusercontent.com/'));
  assert(/\/[a-f0-9]{40}\//.test(source.sourceUrl),'Download URLs must pin source commit');
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(source.sourceUrl,{
        headers:{'User-Agent':'P2LRN-community-examples/1.0'},
        signal:AbortSignal.timeout(45000),
        redirect:'follow'
      });
      assert(response.ok,'HTTP '+response.status+' for '+source.slug);
      const length=Number(response.headers.get('content-length')||0);
      assert(length<=source.maxBytes,'Source too large by header');
      const bytes=new Uint8Array(await response.arrayBuffer());
      assert(bytes.length>100&&bytes.length<=source.maxBytes,'Source size outside limits');
      return bytes;
    }catch(e){lastError=e;if(attempt<2)await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  throw new Error('Unable to download '+source.slug+': '+String(lastError));
}
function inspectSource(spec,data){
  const z=ZipArchive.open(data);
  const names=new Set(z.names());
  assert(names.size>=2,'Missing internal source members: '+spec.slug);
  if(spec.kind==='h5p'){
    assert(names.has('h5p.json')&&names.has('content/content.json'),'H5P needs metadata and real content');
    const h=JSON.parse(new TextDecoder().decode(z.read('h5p.json')));
    assert(typeof h.mainLibrary==='string'&&h.mainLibrary.length>0,'Missing H5P library');
  }else if(spec.kind==='qti'){
    assert(names.has('imsmanifest.xml'),'QTI manifest missing');
    assert([...names].filter(n=>n.startsWith('items/')&&n.endsWith('.xml')).length>=2,'QTI needs both items');
  }else if(spec.kind==='imscc'){
    assert(names.has('imsmanifest.xml'),'IMSCC manifest missing');
  }
}
async function main(){
  const provenance=JSON.parse(readFileSync(provenanceFile,'utf8'));
  assert.equal(provenance.schema,schema);assert.equal(provenance.version,1);
  const known=new Map(provenance.samples.map(s=>[s.slug,s]));
  const temp=mkdtempSync(join(tmpdir(),'p2lrn-external-import-'));
  const added=[];
  try{
    for(const spec of sources){
      if(known.has(spec.slug)){
        const old=known.get(spec.slug);
        assert(old.kind===spec.kind&&old.license===spec.license,'Existing provenance has diverged: '+spec.slug);
        assert(existsSync(join(dir,spec.slug+'.p2lrn')),'Existing source package missing: '+spec.slug);
        console.log('Existing immutable sample:',spec.slug);
        continue;
      }
      const data=spec.generatedVersion?qtiZip(spec.generatedVersion):await download(spec);
      inspectSource(spec,data);
      const sourcePath=join(temp,spec.slug+spec.ext);
      const outputPath=join(temp,spec.slug+'.p2lrn');
      writeFileSync(sourcePath,data);
      const report=convertExternalPackage(sourcePath,outputPath);
      const detected=spec.kind==='imscc'?'common-cartridge':spec.kind;
      assert.equal(report.detectedFormat,detected,'Wrong detected profile');
      assert.equal(report.sourceSha256,sha(data),'Source hash discrepancy');
      assert(report.preservedBitForBit===true,'Source package was normalized');
      assert(report.validation&&report.validation.summary,'Core validation missing');
      const packageBytes=readFileSync(outputPath);
      assert(packageBytes.byteLength<64*1024*1024,'Oversized new .p2lrn');
      writeFileSync(join(dir,spec.slug+'.p2lrn'),packageBytes,{flag:'wx'});
      const entry={slug:spec.slug,kind:spec.kind,title:spec.title,license:spec.license,
        sourceUrl:spec.sourceUrl,licenseUrl:spec.licenseUrl,sourceSha256:sha(data),
        packageSha256:sha(packageBytes),browserVerified:false,origin:spec.origin,
        ...(report.details?.dependencyMode?{dependencyMode:report.details.dependencyMode}:{})};
      provenance.samples.push(entry);known.set(spec.slug,entry);added.push(entry);
      console.log('Converted:',JSON.stringify({slug:entry.slug,sourceBytes:data.length,p2lrnBytes:packageBytes.length,sha256:entry.packageSha256,dependencyMode:entry.dependencyMode??null}));
    }
    provenance.samples.sort((a,b)=>a.slug.localeCompare(b.slug));
    writeFileSync(provenanceFile,JSON.stringify(provenance,null,2)+'\n');
    console.log(JSON.stringify({added:added.length,totals:provenance.samples.length,formats:[...new Set(provenance.samples.map(s=>s.kind))],browserPlayback:'NOT TESTED'},null,2));
  }finally{rmSync(temp,{recursive:true,force:true});}
}
await main();

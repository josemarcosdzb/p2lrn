// Educational derivative of a provably empty MIT-licensed Common Cartridge fixture.
// The original IMSCC remains embedded unchanged and provenance records both hashes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {ZipArchive,writeZip} from '../packages/toolkit/dist/core/zip.js';
import {convertExternalPackage} from '../packages/toolkit/dist/creator/external.js';
import {openP2LRNPackageBytes} from '../packages/toolkit/web/p2lrn-player.js';
const root=resolve(import.meta.dirname,'..'),dir=join(root,'examples/canonical/external/free');
const provenancePath=join(dir,'provenance.json'),slug='imscc-single-page';
const html="<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Accessible Online Learning — Practical Lesson</title><meta name=\"identifier\" content=\"i21fcf1e322b1d8263285fb6012b2b46c\"><style>html{color-scheme:light}body{font:1rem/1.7 system-ui,sans-serif;color:#172337;background:white;max-width:72ch;padding:clamp(1rem,4vw,2.5rem);margin:auto}h1,h2{line-height:1.25}h2{margin-top:1.6rem}details{padding:.75rem;border:1px solid #8494aa;border-radius:.4rem;margin:.7rem 0}summary{cursor:pointer;font-weight:600}summary:focus-visible{outline:3px solid #1856b5;outline-offset:3px}a{color:#0756a6;text-decoration:underline}</style></head><body>\n<main><h1>Accessible Online Learning: A Practical Lesson</h1>\n<p><strong>Learning objective:</strong> Identify four practical ways to make online course pages accessible to readers with different needs. This is a real educational lesson written by P2LRN for an offline Common Cartridge demonstration, derived from an intentionally empty Instructure test fixture.</p>\n<section><h2>1. Give the lesson a clear structure</h2>\n<p>Every lesson should start with a descriptive heading and a short statement of what students will learn. Divide longer explanations into meaningful sections. A screen reader can present a list of headings so that learners can navigate without hearing every paragraph.</p><p>Use headings in a logical hierarchy. Do not choose a heading just because it looks larger. Lists should represent related steps or ideas. Keep instructions independent of visual position: say “Open the next question” rather than “Click the blue button on the right”.</p></section>\n<section><h2>2. Support keyboard interaction</h2>\n<p>Not everyone uses a mouse or a touch screen. Links and controls need a visible focus indicator and should follow the reading order when a student presses Tab. A button must respond to a normal keyboard action; it should not require dragging or a hidden gesture.</p><p>To practise, move through the questions below using only Tab, Shift+Tab and Enter. These questions use standard HTML disclosure controls. They work without JavaScript, external websites or permissions to execute untrusted code.</p></section>\n<section><h2>3. Provide alternatives for media</h2>\n<p>Meaningful images need alternative text that communicates the information they contribute. Decorative images can have empty alternative text. Audio explanations should include a transcript, and videos should offer captions. These alternatives help people who cannot see or hear the content and students learning in noisy environments.</p><p>A course that merely imports a video file is not automatically accessible. Verify that a student can play it, follow the transcript and complete the surrounding activity. The same principle applies to imported SCORM, H5P and Common Cartridge learning objects.</p></section>\n<section><h2>4. Keep the experience readable</h2>\n<p>Make sure that text remains legible when enlarged and that a narrow screen does not force horizontal scrolling. Avoid conveying important results only through colour. Explain errors next to the relevant control and provide a clear way to try again. Check the page with the browser zoom set to 200 percent.</p></section>\n<section><h2>Practice questions</h2><p>Decide on an answer, then open its explanation.</p>\n<details><summary>Question 1: Why are meaningful headings important?</summary><p><strong>Answer:</strong> Headings give learners an outline and let screen-reader users move directly to the section they need.</p></details>\n<details><summary>Question 2: Is using red text alone enough to indicate a wrong answer?</summary><p><strong>Answer:</strong> No. Add a textual explanation or another indicator in addition to colour.</p></details>\n<details><summary>Question 3: How can you test whether a page is keyboard-accessible?</summary><p><strong>Answer:</strong> Navigate with Tab and Shift+Tab, activate each control with Enter or Space, and make sure focus stays visible.</p></details>\n<details><summary>Question 4: What should accompany an instructional video?</summary><p><strong>Answer:</strong> Captions and an accurate transcript should communicate the important spoken information.</p></details>\n</section>\n<section><h2>Summary</h2><p>Accessible course pages combine a meaningful structure, keyboard operation, media alternatives and readable feedback. Before distributing an imported package, test not just its manifest but the content actually displayed by the Player. This lesson is self-contained and includes no third-party scripts or remote media.</p></section>\n<footer><small>Original lesson content by the P2LRN project, released under MIT. The upstream empty Common Cartridge fixture is preserved byte-for-byte inside this derived archive for verification.</small></footer></main></body></html>";
const digest=data=>'sha256:'+createHash('sha256').update(data).digest('hex');
const obj=JSON.parse(await readFile(provenancePath,'utf8'));
const sample=obj.samples.find(s=>s.slug===slug);
assert(sample?.kind==='imscc'&&sample.browserVerified===false);
const schema='https://p2lrn.org/schema/derived-imscc-learning-page/1';
if(sample.enrichment?.schema===schema){console.log('IMSCC_ALREADY_DERIVED');process.exit(0);}
const oldPackage=new Uint8Array(await readFile(join(dir,slug+'.p2lrn')));
assert.equal(digest(oldPackage),sample.packageSha256);
const pkg=await openP2LRNPackageBytes(oldPackage.buffer.slice(oldPackage.byteOffset,oldPackage.byteOffset+oldPackage.byteLength));
const src=pkg.manifest.files.filter(f=>f.mediaType==='application/zip');
assert.equal(src.length,1);
const original=await pkg.payload(src[0].path).read();
assert.equal(digest(original),sample.sourceSha256);
const archive=ZipArchive.open(original);
const sourceMember='wiki_content/our-purpose.html',upstreamMember='p2lrn-provenance/upstream-original.imscc';
const names=archive.names();
assert(names.includes(sourceMember)&&!names.includes(upstreamMember));
const old=new TextDecoder().decode(archive.read(sourceMember));
assert(!(/<body\b[^>]*>([\s\S]*?)<\/body>/iu.exec(old)?.[1]??'').replace(/<[^>]+>/gu,'').trim(),
  'Refusing to overwrite an upstream page containing real content');
assert(html.length>3300,'Lesson requires substantive body');
const entries=names.map(name=>({path:name,data:name===sourceMember?new TextEncoder().encode(html):archive.read(name),method:8}));
entries.push({path:upstreamMember,data:original,method:8});
const derivative=writeZip(entries),verify=ZipArchive.open(derivative);
assert.equal(digest(verify.read(upstreamMember)),digest(original),'Upstream bytes lost');
assert.equal(new TextDecoder().decode(verify.read(sourceMember)),html);
const temp=await mkdtemp(join(tmpdir(),'p2lrn-imscc-lesson-'));
try{
  const sourcePath=join(temp,slug+'.imscc'),outPath=join(temp,slug+'.p2lrn');
  await writeFile(sourcePath,derivative);
  const result=convertExternalPackage(sourcePath,outPath);
  assert.equal(result.detectedFormat,'common-cartridge');
  assert(result.preservedBitForBit,'Toolkit must preserve the derived source');
  const packageBytes=await readFile(outPath);
  assert(packageBytes.length<64*1024*1024);
  const oldSource={sourceUrl:sample.sourceUrl,sourceSha256:sample.sourceSha256,packageSha256:sample.packageSha256};
  sample.title='Common Cartridge — Accessible Learning Lesson';
  sample.sourceUrl='https://github.com/josemarcosdzb/p2lrn/blob/mejorastudio/scripts/enrich-community-imscc-page.mjs';
  sample.sourceSha256=digest(derivative);
  sample.packageSha256=digest(packageBytes);
  sample.enrichment={
    schema,originalPageWasEmpty:true,derivedContentAuthor:'P2LRN',
    derivedContentLicense:'MIT',noExternalMedia:true,scriptFree:true,
    upstreamSourceUrl:oldSource.sourceUrl,upstreamSourceSha256:oldSource.sourceSha256,
    upstreamPackageSha256:oldSource.packageSha256,upstreamEmbeddedAs:upstreamMember,
  };
  sample.browserVerified=false;
  await writeFile(join(dir,slug+'.p2lrn'),packageBytes);
  await writeFile(provenancePath,JSON.stringify(obj,null,2)+'\n');
  console.log('IMSCC_DERIVED_SAMPLE_OK='+JSON.stringify({
    original:oldSource.sourceSha256,derivative:sample.sourceSha256,
    package:sample.packageSha256,lessonBytes:new TextEncoder().encode(html).length,
    sourcePreserved:true
  }));
}finally{await rm(temp,{recursive:true,force:true})}

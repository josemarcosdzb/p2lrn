// Inspect only repository-pinned public example packages; no code execution from archives.
// Fails if an expected package is absent or structurally invalid. The printed
// report describes whether its leaves can be launched by the standalone Player.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ZipArchive} from '../packages/toolkit/dist/core/zip.js';

const root=resolve(import.meta.dirname,'..');
const examples=[
  'cmi5-catapult-pre-post.p2lrn',
  'qti3-minimal.p2lrn',
  'scorm12-real.p2lrn',
  'h5p-crossword.p2lrn',
];
const decoder=new TextDecoder();
const report=[];
const titleOf=(entity)=>{
  const value=entity?.title;
  return typeof value==='string'?value:Object.values(value??{})[0]??entity?.id??'';
};
for(const file of examples){
  const outer=ZipArchive.open(new Uint8Array(readFileSync(resolve(root,'examples','canonical','external',file))));
  const manifest=JSON.parse(decoder.decode(outer.read('META-INF/manifest.json')));
  const graph=JSON.parse(decoder.decode(outer.read('content/graph.json')));
  const byId=new Map(graph.entities.map(x=>[x.id,x]));
  const nestedCache=new Map();
  const getNested=path=>{
    if(!path||!outer.entries.has(path))return null;
    if(!nestedCache.has(path))nestedCache.set(path,ZipArchive.open(outer.read(path)));
    return nestedCache.get(path);
  };
  const activities=graph.entities.filter(x=>x.type==='activity').map(entity=>{
    const resource=byId.get(entity.resource);
    const representations=(resource?.representations??[]).map(rep=>{
      const loc=rep.location??{};
      const zip=getNested(loc.package??loc.path);
      const extensions=rep.extensions?.[rep.profile]??{};
      const member=loc.type==='package-member'?loc.member:
        (extensions.member??extensions.href??extensions.url??extensions.launch??extensions.launchUrl??null);
      const localLaunch=typeof member==='string'&&zip?zip.names().includes(member.replace(/^\.\//,'')):false;
      const htmlCount=zip?zip.names().filter(name=>/\.x?html?$/iu.test(name)).length:0;
      return {
        role:rep.role,profile:rep.profile,mediaType:rep.mediaType,
        location:loc.type,member,localLaunch,htmlCount,
        archivePath:loc.package??loc.path??null,
        remoteUrl:loc.type==='remote'?loc.href:null,
      };
    });
    return {title:titleOf(entity),activityType:entity.activityType,representations};
  });
  const sample={file,profiles:manifest.profiles.map(x=>x.id),activities};
  report.push(sample);
}
console.log('P2LRN_EXTERNAL_VISUAL_QA='+JSON.stringify(report));

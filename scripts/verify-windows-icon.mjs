import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(process.env.P2LRN_ICON_PROJECT_ROOT??join(dirname(fileURLToPath(import.meta.url)),'..'));
const source=readFileSync(join(root,'integration/windows/register-p2lrn-reader.ps1'));
const packagedScript=readFileSync(join(root,'.npm-pack-gate/install/node_modules/@p2lrn/toolkit/windows/register-p2lrn-reader.ps1'));
if(!source.equals(packagedScript))throw Error('Windows file-association scripts differ between integration and npm');
const built=readFileSync(join(root,'packages/toolkit/assets/p2lrn.ico'));
const packaged=readFileSync(join(root,'.npm-pack-gate/install/node_modules/@p2lrn/toolkit/assets/p2lrn.ico'));
if(!built.equals(packaged))throw Error('npm icon differs from the icon built from the canonical logo');
if(packaged.readUInt16LE(0)!==0||packaged.readUInt16LE(2)!==1||packaged.readUInt16LE(4)!==4)throw Error('Invalid Windows ICO header');
const sizes=[16,32,48,256],pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
let last=6+sizes.length*16;
for(let i=0;i<sizes.length;i++){
 const p=6+i*16,w=packaged[p]||256,h=packaged[p+1]||256,n=packaged.readUInt32LE(p+8),at=packaged.readUInt32LE(p+12);
 if(w!==sizes[i]||h!==w||at<last||at+n>packaged.length||!packaged.subarray(at,at+8).equals(pngMagic)||packaged.readUInt32BE(at+16)!==w||packaged.readUInt32BE(at+20)!==h)throw Error('Invalid ICO frame '+sizes[i]);
 last=at+n;
}
if(last!==packaged.length)throw Error('Unexpected trailing bytes in Windows icon');
console.log(JSON.stringify({ok:true,iconSizes:sizes,iconBytes:packaged.length,registrarIncluded:true,registryNotModified:true}));

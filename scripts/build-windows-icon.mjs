import {inflateSync,deflateSync} from 'node:zlib';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Build a Windows ICO from the existing official P2LRN PNG without external
// converters or a second, independently maintained logo.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(process.env.P2LRN_ICON_SOURCE??join(root,'deploy/netlify/site/p2lrn-mark.png'));
const output=resolve(process.env.P2LRN_ICON_OUTPUT??join(root,'packages/toolkit/assets/p2lrn.ico'));
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?(0xEDB88320^(n>>>1)):(n>>>1);return n>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,body){const kind=Buffer.from(type,'ascii');const size=Buffer.alloc(4);size.writeUInt32BE(body.length);const tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(Buffer.concat([kind,body])));return Buffer.concat([size,kind,body,tail]);}
function readRgbaPng(bytes){
 if(!bytes.subarray(0,8).equals(signature))throw Error('P2LRN logo must be a PNG');
 let pos=8,width=0,height=0,depth=0,color=0,interlace=0;const idat=[];
 while(pos<bytes.length){
  if(pos+12>bytes.length)throw Error('Truncated PNG chunk');
  const size=bytes.readUInt32BE(pos),type=bytes.toString('ascii',pos+4,pos+8),end=pos+12+size;
  if(end>bytes.length)throw Error('Truncated PNG payload');
  const data=bytes.subarray(pos+8,pos+8+size);
  if(crc32(bytes.subarray(pos+4,pos+8+size))!==bytes.readUInt32BE(pos+8+size))throw Error('Invalid PNG CRC');
  if(type==='IHDR'){
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];
  } else if(type==='IDAT')idat.push(data);
  else if(type==='IEND')break;
  pos=end;
 }
 if(!width||!height||width>4096||height>4096||depth!==8||color!==6||interlace!==0)throw Error('Official icon must be 8-bit RGBA non-interlaced PNG');
 const rowBytes=width*4,raw=inflateSync(Buffer.concat(idat),{maxOutputLength:(rowBytes+1)*height});
 if(raw.length!==(rowBytes+1)*height)throw Error('Invalid PNG scanline size');
 const rgba=Buffer.alloc(rowBytes*height);
 for(let y=0;y<height;y++){
  const filter=raw[y*(rowBytes+1)],start=y*rowBytes,scan=y*(rowBytes+1)+1;
  if(filter>4)throw Error('Unsupported PNG filter');
  for(let x=0;x<rowBytes;x++){
   const left=x>=4?rgba[start+x-4]:0,above=y?rgba[start+x-rowBytes]:0,upLeft=y&&x>=4?rgba[start+x-rowBytes-4]:0;
   let predictor=0;
   if(filter===1)predictor=left;
   if(filter===2)predictor=above;
   if(filter===3)predictor=(left+above)>>>1;
   if(filter===4){const p=left+above-upLeft,da=Math.abs(p-left),db=Math.abs(p-above),dc=Math.abs(p-upLeft);predictor=da<=db&&da<=dc?left:db<=dc?above:upLeft;}
   rgba[start+x]=(raw[scan+x]+predictor)&255;
  }
 }
 return {width,height,rgba};
}
function resized(image,size){
 const {width,height,rgba}=image,dest=Buffer.alloc(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const fx=Math.max(0,Math.min(width-1,(x+.5)*width/size-.5)),fy=Math.max(0,Math.min(height-1,(y+.5)*height/size-.5));
  const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),tx=fx-x0,ty=fy-y0;
  const taps=[[x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty]];
  let alpha=0,r=0,g=0,b=0;
  for(const [xx,yy,w] of taps){const k=(yy*width+xx)*4,a=rgba[k+3]*w;alpha+=a;r+=rgba[k]*a;g+=rgba[k+1]*a;b+=rgba[k+2]*a;}
  const k=(y*size+x)*4;dest[k]=alpha?Math.round(r/alpha):0;dest[k+1]=alpha?Math.round(g/alpha):0;dest[k+2]=alpha?Math.round(b/alpha):0;dest[k+3]=Math.round(alpha);
 }
 return dest;
}
function rgbaPng(size,rgba){
 const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc(size*(1+size*4));for(let y=0;y<size;y++)rgba.copy(raw,y*(1+size*4)+1,y*size*4,(y+1)*size*4);
 return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const image=readRgbaPng(readFileSync(input));
const sizes=[16,32,48,256],frames=sizes.map(size=>rgbaPng(size,resized(image,size)));
const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
for(let i=0;i<sizes.length;i++){
 const size=sizes[i],p=6+i*16;header[p]=size===256?0:size;header[p+1]=size===256?0:size;
 header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(frames[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=frames[i].length;
}
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,Buffer.concat([header,...frames]));
console.log(JSON.stringify({source:input,output,sizes,bytes:offset}));

// Dependence-free PNG social card. Uses the actual Studio preview already
// shipped by the P2LRN website; no synthetic UI screenshot or external API.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {deflateSync,inflateSync} from 'node:zlib';
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const read32=(bytes,offset)=>bytes.readUInt32BE(offset);
const CRC_TABLE=Uint32Array.from({length:256},(_,v)=>{
  for(let k=0;k<8;k++)v=v&1?0xedb88320^(v>>>1):v>>>1;
  return v>>>0;
});
function crc32(data){
  let v=0xffffffff;
  for(const b of data)v=CRC_TABLE[(v^b)&255]^(v>>>8);
  return (v^0xffffffff)>>>0;
}
const paeth=(a,b,c)=>{
  const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
  return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
};
function decodePng(bytes){
  if(!bytes.subarray(0,8).equals(SIGNATURE))throw Error('Invalid Studio PNG signature');
  let width=0,height=0,depth=0,type=0,interlace=0,palette=null,transparency=null;
  const compressed=[];
  for(let at=8;at<bytes.length;){
    const length=read32(bytes,at);const kind=bytes.toString('ascii',at+4,at+8);
    const data=bytes.subarray(at+8,at+8+length);
    if(at+12+length>bytes.length)throw Error('Truncated source PNG');
    if(kind==='IHDR'){width=read32(data,0);height=read32(data,4);depth=data[8];type=data[9];interlace=data[12];}
    if(kind==='IDAT')compressed.push(data);
    if(kind==='PLTE')palette=data;
    if(kind==='tRNS')transparency=data;
    at+=12+length;
    if(kind==='IEND')break;
  }
  const components={0:1,2:3,3:1,4:2,6:4}[type];
  if(depth!==8||interlace||!components||!width||!height||width>10000||height>10000)
    throw Error('Studio social image requires an 8-bit, non-interlaced PNG');
  const stride=width*components;
  const inflated=inflateSync(Buffer.concat(compressed));
  if(inflated.length!==(stride+1)*height)throw Error('Incorrect source PNG data length');
  const rgba=new Uint8Array(width*height*4);
  let prior=Buffer.alloc(stride),current=Buffer.alloc(stride),at=0;
  for(let y=0;y<height;y++){
    const filter=inflated[at++];
    for(let x=0;x<stride;x++){
      const sample=inflated[at++];
      const a=x>=components?current[x-components]:0,b=prior[x],c=x>=components?prior[x-components]:0;
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):-1;
      if(predictor<0)throw Error('Unsupported PNG filter');
      current[x]=(sample+predictor)&255;
    }
    for(let x=0;x<width;x++){
      const offset=(y*width+x)*4,k=x*components,d=x*4;
      if(type===6){rgba[offset]=current[k];rgba[offset+1]=current[k+1];rgba[offset+2]=current[k+2];rgba[offset+3]=current[k+3];}
      else if(type===2){rgba[offset]=current[k];rgba[offset+1]=current[k+1];rgba[offset+2]=current[k+2];rgba[offset+3]=255;}
      else if(type===0){rgba[offset]=rgba[offset+1]=rgba[offset+2]=current[k];rgba[offset+3]=255;}
      else if(type===4){rgba[offset]=rgba[offset+1]=rgba[offset+2]=current[k];rgba[offset+3]=current[k+1];}
      else {const p=current[k]*3;rgba[offset]=palette?.[p]??0;rgba[offset+1]=palette?.[p+1]??0;rgba[offset+2]=palette?.[p+2]??0;rgba[offset+3]=transparency?.[current[k]]??255;}
      if(type===2&&transparency?.length===6&&current[k]===transparency[1]&&current[k+1]===transparency[3]&&current[k+2]===transparency[5])rgba[offset+3]=0;
    }
    [prior,current]=[current,prior];
  }
  return {width,height,rgba};
}
const W=1200,H=630;
function makeCanvas(){
  const px=Buffer.alloc(W*H*3);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*3;const tint=Math.round(16*y/H+11*x/W);
    px[i]=8+tint/4|0;px[i+1]=17+tint/2|0;px[i+2]=37+tint|0;
  }
  return px;
}
function fill(px,x,y,w,h,color){
  const x0=Math.max(0,x|0),x1=Math.min(W,(x+w)|0),y0=Math.max(0,y|0),y1=Math.min(H,(y+h)|0);
  for(let j=y0;j<y1;j++)for(let i=x0;i<x1;i++){
    const p=(j*W+i)*3;px[p]=color[0];px[p+1]=color[1];px[p+2]=color[2];
  }
}
const FONT={
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'],
  X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10011','10101','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01111','10000','10000','11110','10001','10001','01110'],
  '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00001','11110'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '/':['00001','00001','00010','00100','01000','10000','10000'],
  '.':['00000','00000','00000','00000','00000','00110','00110']
};
function drawText(px,text,x,y,scale,color){
  for(const char of text.toUpperCase()){
    const rows=FONT[char]||FONT[' '];
    for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(rows[j][i]==='1')
      fill(px,x+i*scale,y+j*scale,scale,scale,color);
    x+=6*scale;
  }
}
function stampScreenshot(px,image){
  // A real and wholly visible Studio capture, fitted inside a window-like card.
  fill(px,489,88,690,460,[1,8,24]);
  fill(px,493,92,682,452,[218,228,244]);
  fill(px,498,97,672,442,[247,249,253]);
  fill(px,498,97,672,35,[18,36,69]);
  fill(px,514,113,8,8,[255,112,127]);
  fill(px,531,113,8,8,[255,209,100]);
  fill(px,548,113,8,8,[95,220,164]);
  const area={x:507,y:140,w:654,h:394};
  const scale=Math.min(area.w/image.width,area.h/image.height);
  const dw=Math.round(image.width*scale),dh=Math.round(image.height*scale);
  const dx=area.x+Math.floor((area.w-dw)/2),dy=area.y+Math.floor((area.h-dh)/2);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const ix=Math.min(image.width-1,Math.floor(x/scale)),iy=Math.min(image.height-1,Math.floor(y/scale));
    const src=(iy*image.width+ix)*4,dst=((dy+y)*W+dx+x)*3;
    const alpha=image.rgba[src+3]/255;
    for(let c=0;c<3;c++)px[dst+c]=Math.round(image.rgba[src+c]*alpha+247*(1-alpha));
  }
}
function pngChunk(kind,data){
  const label=Buffer.from(kind,'ascii'),size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([label,data])));
  return Buffer.concat([size,label,data,crc]);
}
function encodeRgb(px){
  const raw=Buffer.alloc((W*3+1)*H);
  for(let y=0;y<H;y++){
    raw[y*(W*3+1)]=0;
    px.copy(raw,y*(W*3+1)+1,y*W*3,(y+1)*W*3);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([SIGNATURE,pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
export async function buildSocialImage({siteRoot,outputRoot}){
  const source=await readFile(join(siteRoot,'assets','hero','studio.png'));
  const image=decodePng(source);
  const canvas=makeCanvas();
  fill(canvas,46,86,80,6,[74,130,255]);
  drawText(canvas,'P2LRN',46,127,11,[240,246,255]);
  fill(canvas,46,243,389,2,[91,125,189]);
  drawText(canvas,'CURSOS',46,280,7,[239,245,255]);
  drawText(canvas,'INTERACTIVOS',46,343,5,[159,188,252]);
  drawText(canvas,'STUDIO + PLAYER',46,459,3,[207,223,255]);
  drawText(canvas,'SCORM / H5P',46,500,3,[142,170,221]);
  stampScreenshot(canvas,image);
  const target=join(outputRoot,'assets','social','p2lrn-studio-1200x630.png');
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,encodeRgb(canvas));
  return {file:target,width:W,height:H,sourceWidth:image.width,sourceHeight:image.height};
}

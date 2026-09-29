import {gunzipSync} from 'node:zlib';
import {DocumentReaderError, type ReaderOptions} from './types.js';

export interface TarEntry {
  name: string;
  buffer: Buffer;
}

function octal(field:Buffer){
  const text=field.toString('utf8').replace(/\0.*$/u,'').trim();
  return text?parseInt(text,8):0;
}

export function readTarGz(buffer:Buffer, options:ReaderOptions={}):TarEntry[]{
  let tar:Buffer;
  try{tar=gunzipSync(buffer);}catch{throw new DocumentReaderError('TAR.GZ cannot be decompressed.','P2LRN_READER_TAR_GZ');}
  const maxEntries=options.maxZipEntries??5000;
  const maxEntry=options.maxZipEntryBytes??128*1024*1024;
  const maxTotal=options.maxZipTotalBytes??512*1024*1024;
  const entries:TarEntry[]=[];
  let offset=0; let total=0;
  while(offset+512<=tar.length){
    const header=tar.subarray(offset,offset+512);
    if(header.every(byte=>byte===0)) break;
    const rawName=header.subarray(0,100).toString('utf8').replace(/\0.*$/u,'');
    const prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/u,'');
    const name=(prefix?`${prefix}/${rawName}`:rawName).replace(/\\/g,'/').replace(/^\/+/, '');
    const size=octal(header.subarray(124,136));
    const type=String.fromCharCode(header[156]??48);
    if(!name||name.includes('..')) throw new DocumentReaderError('Unsafe TAR entry path.','P2LRN_READER_TAR_PATH');
    if(size>maxEntry) throw new DocumentReaderError(`TAR entry too large: ${name}`,'P2LRN_READER_TAR_LIMIT');
    const dataStart=offset+512; const dataEnd=dataStart+size;
    if(dataEnd>tar.length) throw new DocumentReaderError('Truncated TAR entry.','P2LRN_READER_TAR_INVALID');
    if(type==='0'||type==='\0'){
      total+=size;
      if(total>maxTotal) throw new DocumentReaderError('TAR exceeds total byte limit.','P2LRN_READER_TAR_LIMIT');
      entries.push({name,buffer:tar.subarray(dataStart,dataEnd)});
      if(entries.length>maxEntries) throw new DocumentReaderError('TAR has too many entries.','P2LRN_READER_TAR_LIMIT');
    }
    offset=dataStart+Math.ceil(size/512)*512;
  }
  return entries;
}

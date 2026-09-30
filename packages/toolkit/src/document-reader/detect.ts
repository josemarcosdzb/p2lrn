import {ZipArchive} from '../core/zip.js';
import type {DocumentReaderFileType,DocumentReaderInput} from './types.js';
import {extensionOf} from './utils.js';

const EXTENSIONS:Record<string,DocumentReaderFileType>={
  pdf:'PDF',docx:'DOCX',pptx:'PPTX',txt:'TXT',md:'MARKDOWN',markdown:'MARKDOWN',
  html:'HTML',htm:'HTML',rtf:'RTF',tex:'TEX',xml:'XML',yaml:'YAML',yml:'YAML',
  odt:'ODT',epub:'EPUB',
};

function zipType(input:DocumentReaderInput):DocumentReaderFileType|undefined{
  try{
    const archive=ZipArchive.open(input.data);
    const names=new Set(archive.names());
    if(names.has('word/document.xml')) return 'DOCX';
    if([...names].some(name=>/^ppt\/slides\/slide\d+\.xml$/i.test(name))) return 'PPTX';
    if(names.has('content.xml')&&names.has('mimetype')){
      try{
        const mime=new TextDecoder().decode(archive.read('mimetype')).trim();
        if(mime==='application/vnd.oasis.opendocument.text') return 'ODT';
        if(mime==='application/epub+zip') return 'EPUB';
      }catch{}
    }
    if(names.has('META-INF/container.xml')) return 'EPUB';
  }catch{}
  return undefined;
}

export function detectDocumentType(input:DocumentReaderInput):DocumentReaderFileType{
  const ext=extensionOf(input.name);
  const byExt=EXTENSIONS[ext];
  const magic=input.data;
  const isPdf=magic.byteLength>=5
    &&magic[0]===0x25&&magic[1]===0x50&&magic[2]===0x44&&magic[3]===0x46&&magic[4]===0x2d;
  if(isPdf) return 'PDF';

  const isZip=magic.byteLength>=4&&magic[0]===0x50&&magic[1]===0x4b
    &&((magic[2]===0x03&&magic[3]===0x04)||(magic[2]===0x05&&magic[3]===0x06)||(magic[2]===0x07&&magic[3]===0x08));
  if(isZip){
    const detected=zipType(input);
    if(detected) return detected;
  }
  if(byExt) return byExt;

  const media=String(input.mediaType??'').toLowerCase();
  if(media.includes('pdf')) return 'PDF';
  if(media.includes('wordprocessingml')) return 'DOCX';
  if(media.includes('presentationml')) return 'PPTX';
  if(media.includes('opendocument.text')) return 'ODT';
  if(media.includes('epub')) return 'EPUB';
  if(media.includes('markdown')) return 'MARKDOWN';
  if(media.includes('html')) return 'HTML';
  if(media.includes('xml')) return 'XML';
  if(media.includes('yaml')) return 'YAML';
  if(media.startsWith('text/')) return 'TXT';

  throw new Error(`Unsupported lightweight document type: ${input.name}`);
}

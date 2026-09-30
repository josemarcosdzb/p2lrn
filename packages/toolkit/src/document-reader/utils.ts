import {basename, extname} from 'node:path';
import type {DocumentAsset, DocumentBlock, DocumentBlockType, DocumentPosition, DocumentReaderInput, DocumentTable} from './types.js';

export function normalizeBytes(bytes:Uint8Array):Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : new Uint8Array(bytes);
}

export function extensionOf(name:string):string {
  return extname(String(name || '')).replace(/^\./u,'').toLowerCase();
}

export function baseName(name:string):string {
  return basename(String(name || 'document'));
}

export function decodeXml(value:string):string {
  return String(value)
    .replace(/&nbsp;/giu,' ')
    .replace(/&amp;/giu,'&')
    .replace(/&lt;/giu,'<')
    .replace(/&gt;/giu,'>')
    .replace(/&quot;/giu,'"')
    .replace(/&apos;/giu,"'")
    .replace(/&#(\d+);/gu,(_m,code)=>String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu,(_m,code)=>String.fromCodePoint(parseInt(code,16)));
}

export function stripXml(value:string):string {
  return decodeXml(String(value)
    .replace(/<w:(?:br|cr)[^>]*\/>/giu,'\n')
    .replace(/<w:tab[^>]*\/>/giu,'\t')
    .replace(/<a:br[^>]*\/>/giu,'\n')
    .replace(/<br\s*\/?>/giu,'\n')
    .replace(/<[^>]+>/gu,' '))
    .replace(/[ \t]+/gu,' ')
    .replace(/ *\n */gu,'\n')
    .replace(/\n{3,}/gu,'\n\n')
    .trim();
}

export function normalizeText(value:string):string {
  return String(value)
    .replace(/\r\n?/gu,'\n')
    .replace(/[\t ]+\n/gu,'\n')
    .replace(/\n{3,}/gu,'\n\n')
    .trim();
}

export function blockTypeForText(text:string, fallback:DocumentBlockType='PARAGRAPH'):DocumentBlockType {
  const value=String(text).trim();
  if (!value) return fallback;
  if (/^(?:respuesta|soluci[oó]n|answer)\s*:/iu.test(value)) return 'SOLUTION';
  if (/^(?:[A-H][.)]|[-*•]\s*\[[ xX]?\]|\([A-H]\))\s+/u.test(value)) return 'OPTION';
  if (value.endsWith('?') && value.length <= 400) return 'QUESTION';
  if (/^(?:[-*•]|\d+[.)])\s+/u.test(value)) return 'LIST';
  return fallback;
}

export function mediaTypeFromPath(path:string):string {
  const ext=extensionOf(path);
  return ({
    png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',
    bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',svg:'image/svg+xml',emf:'image/emf',
    wmf:'image/wmf',xml:'application/xml',html:'text/html',htm:'text/html',txt:'text/plain',
  } as Record<string,string>)[ext] ?? 'application/octet-stream';
}

export function stableId(prefix:string,index:number):string {
  return prefix + '_' + String(index).padStart(4,'0');
}

export function compactPosition(value:DocumentPosition|undefined):DocumentPosition|undefined {
  if (!value) return undefined;
  const out:DocumentPosition={};
  for (const key of ['x','y','width','height'] as const) {
    const number=Number(value[key]);
    if (Number.isFinite(number)) out[key]=Math.round(number*100)/100;
  }
  return Object.keys(out).length ? out : undefined;
}

export function finalizeBlocks(blocks:DocumentBlock[]):DocumentBlock[] {
  return blocks.map((block,index)=>({...block,order:index+1}));
}

export function finalizeTables(tables:DocumentTable[]):DocumentTable[] {
  return tables.map((table,index)=>({...table,order:index+1}));
}

export function ensureLimits(input:DocumentReaderInput, maxInputBytes:number):void {
  if (!input?.bytes?.byteLength) throw new Error('Document reader received an empty file.');
  if (input.bytes.byteLength > maxInputBytes) {
    throw new Error('Document exceeds lightweight reader input limit (' + input.bytes.byteLength + ' > ' + maxInputBytes + ' bytes).');
  }
}

export function assetByPath(assets:DocumentAsset[]):Map<string,DocumentAsset> {
  return new Map(assets.map(asset=>[asset.path.replace(/^\/+/u,'').replace(/\\/gu,'/'),asset]));
}

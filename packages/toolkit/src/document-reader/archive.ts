import {DEFAULT_ZIP_LIMITS, ZipArchive, type ZipLimits} from '../core/zip.js';
import type {DocumentAsset} from './types.js';
import {mediaTypeFromPath, stableId} from './utils.js';

const LIGHT_ZIP_LIMITS:ZipLimits=Object.freeze({
  ...DEFAULT_ZIP_LIMITS,
  entries:5000,
  entryBytes:512*1024*1024,
  totalUncompressedBytes:2*1024*1024*1024,
  centralDirectoryBytes:32*1024*1024,
  compressionRatio:250,
});

export function openDocumentZip(bytes:Uint8Array):ZipArchive {
  return ZipArchive.open(bytes,LIGHT_ZIP_LIMITS);
}

export function readZipEntries(bytes:Uint8Array):Map<string,Uint8Array> {
  const archive=openDocumentZip(bytes);
  return new Map(archive.names().map(name=>[name,archive.read(name)]));
}

export function imageAssetsFromEntries(
  entries:Map<string,Uint8Array>,
  prefixes:string[],
  maxAssets:number,
  maxAssetBytes:number,
):DocumentAsset[] {
  const assets:DocumentAsset[]=[];
  const normalizedPrefixes=prefixes.map(prefix=>prefix.replace(/\\/gu,'/'));
  for(const [path,bytes] of entries){
    const normalized=path.replace(/\\/gu,'/');
    if(!normalizedPrefixes.some(prefix=>normalized.startsWith(prefix))) continue;
    const mediaType=mediaTypeFromPath(normalized);
    if(!mediaType.startsWith('image/')) continue;
    if(bytes.byteLength>maxAssetBytes) continue;
    assets.push({
      id:stableId('asset',assets.length+1),
      path:normalized,
      name:normalized.split('/').at(-1)??normalized,
      mediaType,
      bytes,
    });
    if(assets.length>=maxAssets) break;
  }
  return assets;
}

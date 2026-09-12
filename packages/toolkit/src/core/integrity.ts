import {createHash} from 'node:crypto';
import {canonicalizeBytes} from './jcs.js';
import {parseIJson} from './ijson.js';
import type {Manifest} from './types.js';

export function sha256(data: Uint8Array): string { return `sha256:${createHash('sha256').update(data).digest('hex')}`; }
export function baseMediaType(mediaType: string | undefined): string { return String(mediaType ?? 'application/octet-stream').split(';', 1)[0]!.trim().toLowerCase(); }
export function contentDigest(data: Uint8Array, mediaType: string, label: string): string {
  const base = baseMediaType(mediaType);
  if (base === 'application/json' || base.endsWith('+json')) return sha256(canonicalizeBytes(parseIJson(data, label)));
  return sha256(data);
}
export function normalizeIntegrityInput(manifest: Manifest): unknown {
  const entrypoints = manifest.entrypoints.map(({id, type, role}) => ({id, type, role})).sort((a,b) => tuple(a,b,['role','type','id']));
  const profiles = manifest.profiles.map(({id, version, requirement}) => ({id, version, requirement})).sort((a,b) => tuple(a,b,['id','version','requirement']));
  const files = manifest.files.map(({path, mediaType, contentDigest}) => ({path, mediaType, contentDigest})).sort((a,b) => compare(a.path,b.path));
  const g = manifest.graph;
  return {format:manifest.format, formatVersion:manifest.formatVersion, entrypoints, graph:{schema:g.schema, mediaType:g.mediaType, contentDigest:g.contentDigest}, profiles, files};
}
export function computeContentRoot(manifest: Manifest): string { return sha256(canonicalizeBytes(normalizeIntegrityInput(manifest))); }
function compare(a: unknown,b: unknown): number { const x=String(a??''), y=String(b??''); return x<y?-1:x>y?1:0; }
function tuple(a: Record<string,unknown>,b:Record<string,unknown>,keys:string[]):number { for(const k of keys){const c=compare(a[k],b[k]); if(c)return c;} return 0; }

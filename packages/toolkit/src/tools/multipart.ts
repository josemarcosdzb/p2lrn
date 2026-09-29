#!/usr/bin/env node
import {mkdirSync, writeFileSync} from 'node:fs';
import {basename, dirname, extname, join} from 'node:path';
import {computeContentRoot, contentDigest, sha256} from '../core/integrity.js';
import {PROFILE} from '../core/constants.js';
import {validatePackageBytes, validatePackageFile} from '../core/validator.js';
import {writeZip} from '../core/zip.js';
import {parse, flag, opt, printJson, req, fail, CliExit, isMain} from '../cli/util.js';

const enc = new TextEncoder();
const MULTIPART_MEDIA = 'application/vnd.p2lrn.multipart+json';

function jsonBytes(value:any):Uint8Array {
  return enc.encode(JSON.stringify(value, null, 2) + '\n');
}
function descriptor(path:string, data:Uint8Array, mediaType:string):any {
  return {
    path,
    mediaType,
    size:data.byteLength,
    byteDigest:sha256(data),
    contentDigest:contentDigest(data, mediaType, path),
  };
}
function allRepresentations(graph:any):Array<{resource:any;representation:any}> {
  const out:Array<{resource:any;representation:any}> = [];
  for (const entity of graph.entities ?? []) {
    if (entity?.type !== 'resource') continue;
    for (const representation of entity.representations ?? []) out.push({resource:entity, representation});
  }
  return out;
}
function partName(base:string, index:number):string {
  return `${base}.part${String(index + 1).padStart(3, '0')}`;
}
function parsePartSize(value:unknown):number {
  const size = value == null ? 25 * 1024 * 1024 : Number(value);
  if (!Number.isSafeInteger(size) || size < 1024 * 1024) throw new Error('part size must be a safe integer >= 1048576 bytes');
  return size;
}
function chooseTarget(validated:any, representationId:string|undefined, partSize:number) {
  const manifestByPath = new Map(validated.manifest.files.map((file:any) => [file.path, file]));
  const candidates = allRepresentations(validated.graph)
    .filter(({representation}) => representation?.location?.type === 'embedded')
    .filter(({representation}) => !representation?.extensions?.[PROFILE.multipart])
    .map((item) => ({...item, file:manifestByPath.get(item.representation.location.path)}))
    .filter((item) => item.file);

  if (representationId) {
    const found = candidates.find(({representation}) => representation.id === representationId);
    if (!found) throw new Error(`embedded representation not found: ${representationId}`);
    return found;
  }
  const large = candidates.filter(({file}:any) => Number(file.size) > partSize).sort((a:any,b:any) => b.file.size - a.file.size);
  if (large.length) return large[0]!;
  const any = candidates.sort((a:any,b:any) => b.file.size - a.file.size)[0];
  if (!any) throw new Error('package has no embedded representation that can be split');
  return any;
}

export function createMultipartPackage(
  source:string,
  output:string,
  options:{representationId?:string;partSize?:number} = {},
):any {
  const before = validatePackageFile(source, {strictProfiles:true, validateProfilePayloads:true});
  const manifest:any = structuredClone(before.manifest);
  const graph:any = structuredClone(before.graph);
  const partSize = parsePartSize(options.partSize);
  const target = chooseTarget(before, options.representationId, partSize);
  const targetPath = String(target.representation.location.path);
  const targetDescriptor:any = before.manifest.files.find((file:any) => file.path === targetPath);
  if (!targetDescriptor) throw new Error(`target payload is not inventoried: ${targetPath}`);

  const refs = allRepresentations(graph).filter(({representation}) => {
    const location = representation?.location ?? {};
    return (location.type === 'embedded' && location.path === targetPath)
      || (location.type === 'package-member' && location.package === targetPath);
  });
  const raw = before.archive.read(targetPath);
  if (raw.byteLength <= partSize) throw new Error(`payload is only ${raw.byteLength} bytes; choose a smaller --part-size to produce at least two parts`);

  const outputDir = dirname(output);
  mkdirSync(outputDir, {recursive:true});
  const base = basename(output, extname(output));
  const parts:any[] = [];
  for (let offset = 0, index = 0; offset < raw.byteLength; offset += partSize, index += 1) {
    const bytes = raw.slice(offset, Math.min(raw.byteLength, offset + partSize));
    const name = partName(base, index);
    writeFileSync(join(outputDir, name), bytes);
    parts.push({href:name, size:bytes.byteLength, byteDigest:sha256(bytes)});
  }
  if (parts.length < 2) throw new Error('multipart conversion produced fewer than two parts');

  const multipart = {
    version:'1',
    mediaType:String(targetDescriptor.mediaType),
    size:raw.byteLength,
    byteDigest:sha256(raw),
    parts,
  };
  const multipartBytes = jsonBytes(multipart);
  const multipartPath = `multipart/${multipart.byteDigest.slice(7)}.json`;
  const multipartDescriptor = descriptor(multipartPath, multipartBytes, MULTIPART_MEDIA);

  for (const {representation} of refs) {
    const previousLocation = representation.location;
    representation.location = {type:'embedded', path:multipartPath};
    representation.extensions = {
      ...(representation.extensions ?? {}),
      [PROFILE.multipart]: previousLocation.type === 'package-member'
        ? {version:'1', member:String(previousLocation.member)}
        : {version:'1'},
    };
  }

  manifest.files = manifest.files
    .filter((file:any) => file.path !== targetPath)
    .concat([multipartDescriptor])
    .sort((a:any,b:any) => String(a.path).localeCompare(String(b.path)));

  if (!manifest.profiles.some((profile:any) => profile.id === PROFILE.multipart)) {
    manifest.profiles.push({id:PROFILE.multipart, version:'0.4.0', requirement:'required'});
  }
  manifest.profiles.sort((a:any,b:any) => String(a.id).localeCompare(String(b.id)));

  const graphBytes = jsonBytes(graph);
  manifest.graph.size = graphBytes.byteLength;
  manifest.graph.byteDigest = sha256(graphBytes);
  manifest.graph.contentDigest = contentDigest(graphBytes, manifest.graph.mediaType, manifest.graph.path);
  manifest.integrity.contentRoot = computeContentRoot(manifest);
  const manifestBytes = jsonBytes(manifest);

  const entries:any[] = [
    {path:'META-INF/manifest.json', data:manifestBytes, mediaType:'application/json', method:8},
    {path:'content/graph.json', data:graphBytes, mediaType:'application/json', method:8},
  ];
  for (const file of manifest.files) {
    if (file.path === multipartPath) {
      entries.push({path:multipartPath, data:multipartBytes, mediaType:MULTIPART_MEDIA, method:8});
      continue;
    }
    const data = before.archive.read(file.path);
    const method = before.archive.entries.get(file.path)?.method ?? 8;
    entries.push({path:file.path, data, mediaType:file.mediaType, method});
  }

  const bytes = writeZip(entries);
  writeFileSync(output, bytes);
  const after = validatePackageBytes(bytes, {strictProfiles:true, validateProfilePayloads:true});
  return {
    source,
    output,
    representationIds:refs.map(({representation}) => representation.id),
    removedEmbeddedPath:targetPath,
    multipartDescriptor:multipartPath,
    logicalBytes:raw.byteLength,
    partSize,
    parts,
    outerBytes:bytes.byteLength,
    contentRoot:after.summary.contentRoot,
  };
}

export function main(argv=process.argv.slice(2)) {
  try {
    const p = parse(argv);
    if (flag(p,'help')) {
      process.stdout.write(
        'Usage: p2lrn-multipart <source.p2lrn> <output.p2lrn> [--representation <id>] [--part-size <bytes>]\n' +
        'Default part size: 26214400 bytes (25 MiB). Parts are written beside the output package.\n',
      );
      return;
    }
    const representationId = opt(p,'representation');
    const rawPartSizeValue = opt(p,'part-size');
    const rawPartSize = rawPartSizeValue == null ? undefined : Number(rawPartSizeValue);
    printJson(createMultipartPackage(
      req(p.positional[0],'source'),
      req(p.positional[1],'output'),
      {representationId, partSize:rawPartSize},
    ));
  } catch (error) {
    if (error instanceof CliExit) return;
    fail('P2LRN Multipart error', error);
  }
}
if (isMain(import.meta.url)) main();

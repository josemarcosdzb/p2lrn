const H5P_PROFILE = 'https://p2lrn.org/profile/h5p';
const decoder = new TextDecoder('utf-8', {fatal: true});

function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function depKey(dep) {
  if (!dep?.machineName) return null;
  const major = Number.isInteger(Number(dep.majorVersion)) ? Number(dep.majorVersion) : null;
  const minor = Number.isInteger(Number(dep.minorVersion)) ? Number(dep.minorVersion) : null;
  return major == null || minor == null ? String(dep.machineName) : `${String(dep.machineName)}-${major}.${minor}`;
}
function readJson(bytes, label) {
  try { return JSON.parse(decoder.decode(bytes)); }
  catch (error) {
    const failure = new Error(`Invalid H5P JSON in ${label}: ${error?.message ?? String(error)}`);
    failure.code = 'P2LRN_H5P_INVALID_JSON';
    throw failure;
  }
}
function libraryFolders(names) {
  const set = new Set();
  for (const name of names) {
    const match = /^([^/]+)\/library\.json$/i.exec(String(name));
    if (match) set.add(match[1]);
  }
  return [...set].sort();
}
function dependencyList(value, label = 'dependencies') {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    const error = new Error(`H5P ${label} must be an array.`); error.code = 'P2LRN_H5P_MANIFEST_INVALID'; throw error;
  }
  return value.map((entry, index) => {
    if (!record(entry) || typeof entry.machineName !== 'string' || !entry.machineName.trim()) {
      const error = new Error(`H5P ${label}[${index}] requires machineName.`); error.code = 'P2LRN_H5P_MANIFEST_INVALID'; throw error;
    }
    const majorVersion = Number(entry.majorVersion); const minorVersion = Number(entry.minorVersion);
    if (!Number.isInteger(majorVersion) || !Number.isInteger(minorVersion) || majorVersion < 0 || minorVersion < 0) {
      const error = new Error(`H5P ${label}[${index}] requires non-negative integer majorVersion/minorVersion.`); error.code = 'P2LRN_H5P_MANIFEST_INVALID'; throw error;
    }
    return {machineName:String(entry.machineName), majorVersion, minorVersion};
  });
}


const MAX_H5P_DEPENDENCY_SCAN_NODES=50000;
const MAX_H5P_DEPENDENCY_CLOSURE=1024;
function collectContentLibraryDependencies(content){
  const found=new Map(),stack=[content],seen=new Set();
  let visited=0;
  while(stack.length){
    const value=stack.pop();
    if(!value||typeof value!=='object')continue;
    if(seen.has(value))continue;
    seen.add(value);
    if(++visited>MAX_H5P_DEPENDENCY_SCAN_NODES){
      const error=new Error('H5P content dependency scan exceeds the safe node limit.');
      error.code='P2LRN_H5P_DEPENDENCY_SCAN_LIMIT';
      throw error;
    }
    if(Array.isArray(value)){for(const item of value)stack.push(item);continue;}
    for(const [key,child] of Object.entries(value)){
      if(key==='library'&&typeof child==='string'){
        const match=/^([A-Za-z][A-Za-z0-9_.-]{0,127})\s+(\d+)\.(\d+)$/u.exec(child.trim());
        if(match){
          const entry={machineName:match[1],majorVersion:Number(match[2]),minorVersion:Number(match[3])};
          if(Number.isSafeInteger(entry.majorVersion)&&Number.isSafeInteger(entry.minorVersion))
            found.set(depKey(entry),entry);
        }
      }
      stack.push(child);
    }
  }
  return [...found.values()];
}
function inspectH5PDependencyClosure(required,content,libraries){
  // Only exact machineName+major.minor versions may satisfy a dependency.
  // Package-provided metadata never authorizes fetching arbitrary code.
  const direct=[...required,...collectContentLibraryDependencies(content)];
  const queued=new Map(direct.map(dep=>[depKey(dep),dep]));
  const checked=new Set(),resolved=new Map(),bundled=[],missing=[],conditional=[];
  const enqueue=(dep,into=queued)=>{
    const key=depKey(dep);
    if(!key||checked.has(key)||into.has(key))return;
    if(checked.size+into.size>=MAX_H5P_DEPENDENCY_CLOSURE){
      const error=new Error('H5P transitive dependency closure exceeds the safe limit.');
      error.code='P2LRN_H5P_DEPENDENCY_LIMIT';
      throw error;
    }
    into.set(key,dep);
  };
  while(queued.size){
    const [key,dep]=queued.entries().next().value;
    queued.delete(key);
    if(checked.has(key))continue;
    checked.add(key);resolved.set(key,dep);
    const lib=libraries.get(key);
    if(!lib){missing.push(dep);continue;}
    bundled.push(dep);
    for(const child of lib.preloadedDependencies)enqueue(child);
    // Dynamic dependencies are noted but not considered required at launch.
    for(const child of lib.dynamicDependencies){
      if(!conditional.some(item=>depKey(item)===depKey(child)))
        conditional.push(child);
    }
  }
  const stable=list=>Object.freeze([...list].sort((a,b)=>depKey(a).localeCompare(depKey(b))).map(item=>Object.freeze({...item})));
  return Object.freeze({
    complete:missing.length===0,required:stable(resolved.values()),
    bundled:stable(bundled),missing:stable(missing),dynamic:stable(conditional),
    requiresTrustedLibraryResolver:missing.length>0,
  });
}

export async function inspectH5PPackage(nested) {
  const names = nested?.names?.() ?? [];
  if (!names.includes('h5p.json') || !names.includes('content/content.json')) {
    const error = new Error('H5P package requires h5p.json and content/content.json.');
    error.code = 'P2LRN_H5P_STRUCTURE_INVALID';
    throw error;
  }
  const h5p = readJson(await nested.read('h5p.json'), 'h5p.json');
  const content = readJson(await nested.read('content/content.json'), 'content/content.json');
  if (!record(h5p) || typeof h5p.mainLibrary !== 'string' || !h5p.mainLibrary.trim()) {
    const error = new Error('H5P h5p.json must declare mainLibrary.');
    error.code = 'P2LRN_H5P_MANIFEST_INVALID';
    throw error;
  }
  const required = dependencyList(h5p.preloadedDependencies, 'preloadedDependencies');
  if (!required.some((dep) => dep.machineName === h5p.mainLibrary)) {
    const error = new Error(`H5P mainLibrary ${h5p.mainLibrary} is not present in preloadedDependencies.`);
    error.code = 'P2LRN_H5P_MAIN_LIBRARY_UNDECLARED';
    throw error;
  }

  const libraries = new Map();
  for (const folder of libraryFolders(names)) {
    const metadata = readJson(await nested.read(`${folder}/library.json`), `${folder}/library.json`);
    if (!record(metadata) || typeof metadata.machineName !== 'string' || !metadata.machineName.trim()) {
      const error = new Error(`H5P ${folder}/library.json requires machineName.`); error.code = 'P2LRN_H5P_LIBRARY_METADATA_INVALID'; throw error;
    }
    const majorVersion = Number(metadata.majorVersion); const minorVersion = Number(metadata.minorVersion);
    if (!Number.isInteger(majorVersion) || !Number.isInteger(minorVersion) || majorVersion < 0 || minorVersion < 0) {
      const error = new Error(`H5P ${folder}/library.json requires non-negative integer majorVersion/minorVersion.`); error.code = 'P2LRN_H5P_LIBRARY_METADATA_INVALID'; throw error;
    }
    const descriptor = Object.freeze({
      folder,
      machineName: String(metadata.machineName),
      majorVersion,
      minorVersion,
      patchVersion: Number(metadata.patchVersion ?? 0),
      runnable: Number(metadata.runnable ?? 0) === 1,
      preloadedDependencies: dependencyList(metadata.preloadedDependencies, `${folder}/library.json preloadedDependencies`),
      dynamicDependencies: dependencyList(metadata.dynamicDependencies, `${folder}/library.json dynamicDependencies`),
      editorDependencies: dependencyList(metadata.editorDependencies, `${folder}/library.json editorDependencies`),
      preloadedJs: Array.isArray(metadata.preloadedJs) ? metadata.preloadedJs.map((entry) => String(entry?.path ?? '')).filter(Boolean) : [],
      preloadedCss: Array.isArray(metadata.preloadedCss) ? metadata.preloadedCss.map((entry) => String(entry?.path ?? '')).filter(Boolean) : [],
      raw: metadata,
    });
    const exactKey=depKey(descriptor);
    if(libraries.has(exactKey)){
      const error=new Error('Duplicate H5P library version in separate folders: '+exactKey);
      error.code='P2LRN_H5P_DUPLICATE_LIBRARY_VERSION';
      throw error;
    }
    libraries.set(exactKey, descriptor);
    if (!libraries.has(descriptor.machineName)) libraries.set(descriptor.machineName, descriptor);
  }

  const missing = [];
  const bundled = [];
  for (const dep of required) {
    const exact = libraries.get(depKey(dep));
    const loose = libraries.get(dep.machineName);
    const match = exact ?? loose;
    if (match && (dep.majorVersion == null || (match.majorVersion === dep.majorVersion && match.minorVersion === dep.minorVersion))) bundled.push(dep);
    else missing.push(dep);
  }
  const dependencyMode = missing.length === 0 ? 'bundled' : bundled.length === 0 ? 'external' : 'mixed';
  const dependencyClosure=inspectH5PDependencyClosure(required,content,libraries);

  return Object.freeze({
    profile: H5P_PROFILE,
    title: typeof h5p.title === 'string' ? h5p.title : '',
    language: typeof h5p.language === 'string' ? h5p.language : 'und',
    mainLibrary: h5p.mainLibrary,
    embedTypes: Array.isArray(h5p.embedTypes) ? h5p.embedTypes.map(String) : [],
    required: Object.freeze(required),
    bundled: Object.freeze(bundled),
    missing: Object.freeze(missing),
    dependencyMode,
    dependencyClosure,
    libraryCount: new Set([...libraries.values()].map((value) => value.folder)).size,
    h5p,
    content,
    names: Object.freeze([...names]),
  });
}

export async function encodeH5PSession(nested, inspection, {maxFiles = 10000, maxBytes = 512 * 1024 * 1024, protocol = 'p2lrn-h5p-session/1'} = {}) {
  const names = inspection?.names ?? nested?.names?.() ?? [];
  if (names.length > maxFiles) {
    const error = new Error(`H5P package contains too many files (${names.length}).`);
    error.code = 'P2LRN_H5P_RUNTIME_TOO_LARGE';
    throw error;
  }
  const descriptors = [];
  const chunks = [];
  let offset = 0;
  for (const path of names) {
    const entry = nested.archive?.entries?.get(path);
    if (!entry) continue;
    const size = Number(entry.uncompressedSize ?? 0);
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > maxBytes) {
      const error = new Error(`H5P runtime payload exceeds ${maxBytes} bytes.`);
      error.code = 'P2LRN_H5P_RUNTIME_TOO_LARGE';
      throw error;
    }
    const bytes = await nested.read(path);
    descriptors.push({path, offset, length:bytes.byteLength});
    chunks.push(bytes);
    offset += bytes.byteLength;
  }
  const manifest = new TextEncoder().encode(JSON.stringify({
    protocol,
    dependencyMode:inspection.dependencyMode,
    mainLibrary:inspection.mainLibrary,
    missing:inspection.missing,
    files:descriptors,
  }));
  const header = new ArrayBuffer(8);
  const view = new DataView(header);
  view.setUint32(0, 0x50324835, false); // P2H5
  view.setUint32(4, manifest.byteLength, false);
  const type = protocol === 'p2rln-h5p-session/1' ? 'application/vnd.p2rln.h5p-session' : 'application/vnd.p2lrn.h5p-session';
  return new Blob([header, manifest, ...chunks], {type});
}

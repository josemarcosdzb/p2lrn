import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectH5PPackage} from '../web/h5p-package.js';

const enc=new TextEncoder();
const dep=(name,major=1,minor=0)=>({machineName:name,majorVersion:major,minorVersion:minor});
function nested({required=[dep('H5P.Parent')],libraries=[],content={}}={}){
  const files=new Map([
    ['h5p.json',{mainLibrary:'H5P.Parent',title:'Test',preloadedDependencies:required}],
    ['content/content.json',content],
  ]);
  for(const {folder,metadata} of libraries)files.set(folder+'/library.json',metadata);
  return {
    names:()=>[...files.keys()],
    read:async path=>{
      if(!files.has(path))throw Error('Unexpected nested read: '+path);
      return enc.encode(JSON.stringify(files.get(path)));
    },
  };
}
const lib=(name,version={majorVersion:1,minorVersion:0},deps=[],dynamic=[])=>({
  folder:name+'-'+version.majorVersion+'.'+version.minorVersion,
  metadata:{machineName:name,...version,runnable:1,preloadedDependencies:deps,dynamicDependencies:dynamic},
});

test('H5P preflight recursively resolves exact preloaded versions before playback',async()=>{
  const pkg=nested({libraries:[
    lib('H5P.Parent',undefined,[dep('H5P.Child')]),
    lib('H5P.Child'),
  ]});
  const result=await inspectH5PPackage(pkg);
  const closure=result.dependencyClosure;
  assert.equal(closure.complete,true);
  assert.equal(closure.requiresTrustedLibraryResolver,false);
  assert.equal(closure.missing.length,0);
  assert.equal(closure.required.length,2);
  assert.deepEqual(closure.bundled.map(x=>x.machineName),['H5P.Child','H5P.Parent']);
});
test('transitive dependencies missing exact versions are surfaced before iframe launch',async()=>{
  const pkg=nested({libraries:[
    lib('H5P.Parent',undefined,[dep('H5P.Child',2,0)]),
    lib('H5P.Child',{majorVersion:1,minorVersion:0}),
  ]});
  const result=await inspectH5PPackage(pkg);
  assert.equal(result.missing.length,0,'legacy direct-only field remains backward compatible');
  assert.equal(result.dependencyClosure.complete,false);
  assert.deepEqual(result.dependencyClosure.missing,[dep('H5P.Child',2,0)]);
});
test('nested H5P interactive content dependencies are included even when parent manifest omits them',async()=>{
  const pkg=nested({
    content:{panels:[{library:'H5P.Child 1.0',params:{nested:{library:'H5P.Sub 1.2'}}}]},
    libraries:[lib('H5P.Parent'),lib('H5P.Child')],
  });
  const inspection=await inspectH5PPackage(pkg);
  assert.deepEqual(inspection.dependencyClosure.missing,[dep('H5P.Sub',1,2)]);
  assert.equal(inspection.dependencyClosure.required.length,3);
});
test('dynamic H5P library dependencies remain conditional, not fake required installations',async()=>{
  const result=await inspectH5PPackage(nested({libraries:[
    lib('H5P.Parent',undefined,[],[dep('H5P.Optional')]),
  ]}));
  assert.equal(result.dependencyClosure.complete,true);
  assert.deepEqual(result.dependencyClosure.dynamic,[dep('H5P.Optional')]);
});
test('dependency cycles are bounded and do not loop indefinitely',async()=>{
  const result=await inspectH5PPackage(nested({libraries:[
    lib('H5P.Parent',undefined,[dep('H5P.Child')]),
    lib('H5P.Child',undefined,[dep('H5P.Parent')]),
  ]}));
  assert.equal(result.dependencyClosure.required.length,2);
  assert.equal(result.dependencyClosure.complete,true);
});
test('ambiguous duplicate H5P library versions are rejected instead of silently selecting a folder',async()=>{
  const first=lib('H5P.Parent');
  const second={folder:'H5P.Parent-1.0-other',metadata:structuredClone(first.metadata)};
  await assert.rejects(inspectH5PPackage(nested({libraries:[first,second]})),{
    code:'P2LRN_H5P_DUPLICATE_LIBRARY_VERSION',
  });
});
test('H5P content dependency scan is bounded against excessive JSON graphs',async()=>{
  await assert.rejects(inspectH5PPackage(nested({
    content:{children:Array.from({length:50100},()=>({}))},
    libraries:[lib('H5P.Parent')],
  })),{code:'P2LRN_H5P_DEPENDENCY_SCAN_LIMIT'});
});

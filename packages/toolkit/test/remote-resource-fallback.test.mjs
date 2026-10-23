import assert from 'node:assert/strict';
import test from 'node:test';
import {RendererRegistry} from '../web/renderer-registry.js';

const load=async()=>({render(){}});

test('remote resources require an explicit remote renderer opt-in',async()=>{
  const registry=new RendererRegistry();
  registry.register({id:'urn:test:passive',priority:80,mediaTypes:['video/*'],load});
  const remote={id:'remote',role:'primary',mediaType:'video/mp4',location:{type:'remote',href:'https://example.invalid/video.mp4',expectedDigest:'sha256:'+'a'.repeat(64)}};
  const selected=await registry.select({representations:[remote]});
  assert.equal(selected,null);
});

test('remote failure can fall through to an embedded representation without losing the passive renderer',async()=>{
  const registry=new RendererRegistry();
  registry.register({
    id:'urn:test:remote',priority:90,mediaTypes:['video/*'],acceptsRemoteLocation:true,
    supports:({representation})=>representation?.location?.type==='remote',load,
  });
  registry.register({id:'urn:test:passive',priority:80,mediaTypes:['video/*'],load});
  const representations=[
    {id:'remote',role:'primary',mediaType:'video/mp4',location:{type:'remote',href:'https://example.invalid/video.mp4',expectedDigest:'sha256:'+'a'.repeat(64)}},
    {id:'embedded',role:'fallback',mediaType:'video/mp4',location:{type:'embedded',path:'media/video.mp4'}},
  ];
  const first=await registry.select({representations,roleRank:(rep)=>rep.role==='primary'?10:0});
  assert.equal(first.descriptor.id,'urn:test:remote');
  assert.equal(first.representation.id,'remote');
  const fallback=await registry.select({representations,roleRank:(rep)=>rep.role==='primary'?10:0,excludeRendererIds:['urn:test:remote']});
  assert.equal(fallback.descriptor.id,'urn:test:passive');
  assert.equal(fallback.representation.id,'embedded');
});

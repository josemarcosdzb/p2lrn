#!/usr/bin/env python3
"""Deterministic P2LRN multipart transport and cross-conversation plan assembly."""
import argparse, hashlib, json, pathlib, re, sys

def digest(b): return hashlib.sha256(b).hexdigest()
def write_json(path, data): pathlib.Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
def read_json(path): return json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
def split(args):
    src=pathlib.Path(args.input); data=src.read_bytes(); assert data, 'Empty input'
    out=pathlib.Path(args.output); out.mkdir(parents=True, exist_ok=True)
    parts=[]
    for i,off in enumerate(range(0,len(data),args.size),1):
        chunk=data[off:off+args.size]; name=f'part-{i:04d}.bin'; (out/name).write_bytes(chunk)
        parts.append({'index':i,'file':name,'bytes':len(chunk),'sha256':digest(chunk)})
    manifest={'schema':'p2lrn-multipart/1','name':src.name,'bytes':len(data),'sha256':digest(data),'parts':parts}
    write_json(out/'multipart.json',manifest); return manifest
def join(args):
    manifest=read_json(args.manifest); assert manifest['schema']=='p2lrn-multipart/1'
    root=pathlib.Path(args.manifest).parent; pieces=[]
    for i,p in enumerate(manifest['parts'],1):
        assert p['index']==i and re.fullmatch(r'part-\d{4}\.bin',p['file']), 'Invalid part'
        b=(root/p['file']).read_bytes(); assert len(b)==p['bytes'] and digest(b)==p['sha256'],f'Corrupt part {i}'
        pieces.append(b)
    data=b''.join(pieces); assert len(data)==manifest['bytes'] and digest(data)==manifest['sha256'],'Final checksum mismatch'
    target=pathlib.Path(args.output); target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
    if target.suffix=='.p2lrn':
        sys.path.insert(0,str(pathlib.Path(__file__).parent))
        from p2lrn_package import verify
        try: verify(target)
        except Exception:
            target.unlink(missing_ok=True); raise
    return {'valid':True,'output':str(target),'bytes':len(data),'sha256':digest(data)}
def assemble(args):
    project=read_json(args.project); assert project['schema']=='p2lrn-course-project/1'
    root=pathlib.Path(args.project).parent; units=[]; seen=set()
    for ref in project['parts']:
        filename=ref['file']; assert filename==pathlib.Path(filename).name and filename.endswith('.json'),'Unsafe part filename'
        data=(root/filename).read_bytes(); assert digest(data)==ref['sha256'],f'Changed part: {filename}'
        part=json.loads(data); assert part['schema']=='p2lrn-course-part/1'
        assert part['projectId']==project['projectId'] and part['partId']==ref['partId'],'Wrong project/part'
        assert part['partId'] not in seen,'Duplicate part'; seen.add(part['partId'])
        assert isinstance(part['units'],list) and part['units'],'Empty units'
        units.extend(part['units'])
    assert len(seen)==len(project['parts']) and seen,'No parts'
    plan={'title':project['title'],'language':project.get('language','es'),'units':units}
    if project.get('description'):plan['description']=project['description']
    for key in ('author','license','copyrightHolder','createdAt'):
        if key in project:plan[key]=project[key]
    sys.path.insert(0,str(pathlib.Path(__file__).parent))
    from p2lrn_package import build
    return build(plan,args.output)
def main():
    p=argparse.ArgumentParser(); subs=p.add_subparsers(dest='cmd',required=True)
    a=subs.add_parser('split'); a.add_argument('input');a.add_argument('output');a.add_argument('--size',type=int,default=5*1024*1024)
    a=subs.add_parser('join');a.add_argument('manifest');a.add_argument('output')
    a=subs.add_parser('assemble');a.add_argument('project');a.add_argument('output')
    args=p.parse_args()
    try:
        if args.cmd=='split':assert 1024<=args.size<=100*1024*1024; result=split(args)
        elif args.cmd=='join':result=join(args)
        else:result=assemble(args)
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except Exception as e:
        print(json.dumps({'valid':False,'error':str(e)},ensure_ascii=False),file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())

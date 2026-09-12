#!/usr/bin/env python3
from pathlib import Path
import importlib.util, json, zipfile
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v',ROOT/'tools/validate.py'); v=importlib.util.module_from_spec(spec); spec.loader.exec_module(v)

def rebuild(name):
    d=ROOT/'examples'/name
    mpath=d/'META-INF/manifest.json'; gpath=d/'content/graph.json'
    m=json.loads(mpath.read_text()); gbytes=gpath.read_bytes()
    m['graph']['size']=len(gbytes); m['graph']['byteDigest']=v.sha256(gbytes); m['graph']['contentDigest']=v.content_digest(gbytes,'application/json','graph')
    for f in m['files']:
        data=(d/f['path']).read_bytes(); f['size']=len(data); f['byteDigest']=v.sha256(data); f['contentDigest']=v.content_digest(data,f['mediaType'],f['path'])
    m['integrity']['contentRoot']=v.compute_content_root(m)
    mpath.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    out=ROOT/'examples'/f'{name}-course.p2rln' if name=='minimal' else ROOT/'examples'/'web-course.p2rln'
    if name=='minimal': out=ROOT/'examples'/'minimal-course.p2rln'
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,allowZip64=True) as z:
        for p in sorted(d.rglob('*')):
            if p.is_file(): z.write(p,p.relative_to(d).as_posix())
    print(name, v.validate_package(out, strict_profiles=True))

rebuild('minimal'); rebuild('web')

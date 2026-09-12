#!/usr/bin/env python3
from __future__ import annotations
import hashlib, importlib.util, json, uuid, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v',ROOT/'tools/validate.py')
v=importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
NS=uuid.UUID('e01958d7-cd85-4726-a105-851467546888')
def uid(name): return 'urn:uuid:'+str(uuid.uuid5(NS,name))
def asset_path(data):
    h=hashlib.sha256(data).hexdigest(); return f'assets/sha256/{h[:2]}/{h[2:4]}/{h}'

def main():
    normal=b'<!doctype html><html lang="es"><body><h1>Actividad accesible</h1><p>Contenido principal.</p></body></html>\n'
    accessible=b'<!doctype html><html lang="es"><body><main><h1>Actividad accesible</h1><p>Version alternativa textual.</p></main></body></html>\n'
    np=asset_path(normal); ap=asset_path(accessible)
    course=uid('course'); unit=uid('unit'); lti_a=uid('lti-activity'); lti_r=uid('lti-resource'); web_a=uid('web-activity'); web_r=uid('web-resource'); obj=uid('objective')
    LTI='https://p2rln.org/profile/lti'; XAPI='https://p2rln.org/profile/xapi'; CASE='https://p2rln.org/profile/case'; ACC='https://p2rln.org/profile/accessibility'; WEB='https://p2rln.org/profile/web-content'
    graph={
      'graphVersion':'0.4.0',
      'entities':[
        {'id':course,'type':'course','revision':1,'title':{'es':'Curso avanzado P2RLN'},'languages':['es'],'children':[unit]},
        {'id':unit,'type':'unit','role':'module','title':{'es':'Interoperabilidad'},'children':[lti_a,web_a]},
        {'id':obj,'type':'objective','title':{'es':'Resolver una actividad interoperable'},'alignments':[{'framework':'CASE 1.1','target':'https://example.invalid/case/CFItems/demo','relation':'alignsTo'}],'extensions':{CASE:{'target':'https://example.invalid/case/CFItems/demo'}}},
        {'id':lti_r,'type':'resource','title':{'es':'Herramienta externa'},'representations':[{
          'id':uid('lti-rep'),'role':'primary','mediaType':'application/vnd.ims.lti.v1.ltilink','profile':LTI,
          'location':{'type':'remote','href':'https://tool.example.invalid/launch'},
          'extensions':{LTI:{'sourceStandard':'LTI','sourceVersion':'1.3','targetLinkUri':'https://tool.example.invalid/launch','rebindRequired':True}}
        }]},
        {'id':lti_a,'type':'activity','activityType':'https://p2rln.org/type/external-tool','title':{'es':'Herramienta LTI'},'resource':lti_r,'objectives':[obj],
          'extensions':{XAPI:{'activityId':'https://example.invalid/xapi/activity/lti-demo','verbs':['http://adlnet.gov/expapi/verbs/completed']}}},
        {'id':web_r,'type':'resource','title':{'es':'Contenido con alternativa accesible'},'representations':[
          {'id':uid('web-normal'),'role':'rendered','mediaType':'text/html','profile':WEB,'language':'es','location':{'type':'embedded','path':np}},
          {'id':uid('web-accessible'),'role':'accessible','mediaType':'text/html','profile':WEB,'language':'es','accessibility':['textual-alternative'],'location':{'type':'embedded','path':ap},'extensions':{ACC:{'relationship':'accessible-alternative'}}}
        ]},
        {'id':web_a,'type':'activity','activityType':'https://p2rln.org/type/resource-view','title':{'es':'Leer recurso'},'resource':web_r,'objectives':[obj]}
      ],
      'relations':[
        {'source':lti_a,'predicate':'https://p2rln.org/relation/assesses','target':obj},
        {'source':web_a,'predicate':'https://p2rln.org/relation/teaches','target':obj}
      ]
    }
    gb=(json.dumps(graph,ensure_ascii=False,indent=2)+'\n').encode()
    files=[]
    payloads={np:normal,ap:accessible}
    for path,data in sorted(payloads.items()):
        d=v.sha256(data); files.append({'path':path,'mediaType':'text/html','size':len(data),'byteDigest':d,'contentDigest':d})
    manifest={
      'format':'P2RLN','formatVersion':'0.4.0','packageId':uid('package'),
      'entrypoints':[{'id':course,'type':'course','role':'primary'}],
      'graph':{'path':'content/graph.json','schema':'https://p2rln.org/schema/graph/0.4.0','mediaType':'application/json','size':len(gb),'byteDigest':v.sha256(gb),'contentDigest':v.sha256(v.jcs_bytes(graph))},
      'profiles':[
        {'id':'https://p2rln.org/profile/course','version':'0.4.0','requirement':'required'},
        {'id':WEB,'version':'0.4.0','requirement':'required'},
        {'id':LTI,'version':'0.4.0','requirement':'optional'},
        {'id':CASE,'version':'0.4.0','requirement':'optional'},
        {'id':XAPI,'version':'0.4.0','requirement':'optional'},
        {'id':ACC,'version':'0.4.0','requirement':'optional'}
      ],
      'files':files,'integrity':{'algorithm':'sha256','contentRoot':'sha256:'+'0'*64}
    }
    manifest['integrity']['contentRoot']=v.compute_content_root(manifest)
    mb=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
    out=ROOT/'examples'/'advanced-interoperability.p2rln'
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('META-INF/manifest.json',mb); z.writestr('content/graph.json',gb)
        for path,data in payloads.items(): z.writestr(path,data)
    print(json.dumps(v.validate_package(out,strict_profiles=True),ensure_ascii=False,indent=2))

if __name__=='__main__': main()

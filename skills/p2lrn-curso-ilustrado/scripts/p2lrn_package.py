#!/usr/bin/env python3
"""P2LRN Core 0.4.0 portable package writer/verifier, no external dependencies.

Offline subset for ChatGPT skills: author new courses with units, static lessons,
questionnaires, games, callout components and safe URL resources. Does not claim
full official Toolkit parity or lossless re-authoring of arbitrary third-party ZIPs.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import stat
import sys
import unicodedata
import uuid
import zipfile
from pathlib import Path
from datetime import date
from urllib.parse import urlparse

FORMAT_VERSION = '0.4.0'
NS = 'https://p2lrn.org/'
RENDERER_HINT = NS + 'ext/renderer-preference/1'
COURSE_RIGHTS_EXTENSION = NS + 'ext/course-rights/1'
RIGHTS_LIMITS = {'author':300,'createdAt':10,'license':2000,'copyrightHolder':300}
QUIZ_PROFILE = NS + 'profile/native-questionnaire'
COMPONENT_PROFILE = NS + 'profile/native-component'
COMPOSITE_PROFILE = NS + 'profile/native-composite'
QUIZ_MIME = 'application/vnd.p2lrn.questionnaire+json'
COMPONENT_MIME = 'application/vnd.p2lrn.component+json'
COMPOSITE_MIME = 'application/vnd.p2lrn.composite+json'
QUESTION_SCHEMA = NS + 'schema/native-questionnaire/0.4.0'
COMPONENT_SCHEMA = NS + 'schema/native-component/0.1'
COMPOSITE_SCHEMA = NS + 'schema/native-composite/0.1'
RENDERER_BASE = NS + 'renderer/questionnaire/'
RENDERERS = {
    'memory': 'memory', 'matching': 'matching', 'ordering': 'ordering',
    'classification': 'classification', 'true-false': 'true-false',
    'fill-blanks': 'fill-blanks', 'word-search': 'word-search',
    'crossword': 'crossword', 'rosco': 'rosco',
    '3d': '3d-order-match', '3d-matching': '3d-order-match',
    '3d-ordering': '3d-order-match', '3d-classification': '3d-order-match',
}
FILE_LIMIT = 40 * 1024 * 1024
# Deliberate limits for this self-contained chat subset, not the normative P2LRN format.
MAX_PACKAGE_BYTES = 256 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_ZIP_MEMBERS = 2000
QUESTION_TOKEN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]*$')

class CourseError(ValueError):
    pass

def require(ok, msg):
    if not ok:
        raise CourseError(msg)

def sha(data: bytes) -> str:
    return 'sha256:' + hashlib.sha256(data).hexdigest()

def canonical_bytes(obj) -> bytes:
    """JCS for the restricted P2LRN authoring domain: ASCII JSON keys, no floats.
    All generated metadata keys are ASCII, and educational strings are values.
    This avoids introducing a second general-purpose RFC8785 implementation.
    """
    def walk(v):
        if isinstance(v, dict):
            for k, val in v.items():
                require(isinstance(k,str) and k.isascii(), 'Only ASCII JSON object keys are supported')
                walk(val)
        elif isinstance(v, list):
            for val in v: walk(val)
        else:
            require(v is None or isinstance(v,(str,bool,int)) and not isinstance(v,float),
                    'Only integer numerical values are supported in portable authoring')
    walk(obj)
    return json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')

def digest_json(obj) -> str:
    return sha(canonical_bytes(obj))

def ident(value, field):
    require(isinstance(value,str) and bool(value.strip()) and len(value)<=3000, f'{field}: required text')
    return value.strip()

def uri_valid(value):
    if not isinstance(value,str):return False
    p=urlparse(value)
    return bool(p.scheme and (p.scheme == 'urn' or p.netloc))

def key_slug(text, fallback):
    if not isinstance(text,str) or not text.strip():text=fallback
    s=unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode('ascii')
    s=re.sub(r'[^A-Za-z0-9_-]+','-',s).strip('-').lower()
    return s[:58] or fallback

def unique_ids(items):
    return len(items)==len(set(items)) if all(isinstance(item, (str,int)) for item in items) else False

def question_id(value, field):
    require(isinstance(value,str) and bool(QUESTION_TOKEN.fullmatch(value)) and len(value)<=160,
            f'{field}: invalid question identifier')
    return value

def valid_question(q, index):
    require(isinstance(q,dict),f'Question {index}: expected object')
    question_id(q.get('id'), f'Question {index} id')
    ident(q.get('prompt'), f'Question {index} prompt')
    require(isinstance(q.get('points'),int) and not isinstance(q.get('points'),bool) and q['points'] > 0,
            f'Question {index}: points must be a positive integer')
    ty=q.get('type')
    require(ty in ('single-choice','multiple-choice','true-false','text','fill-blanks','ordering','matching','classification'),
            f'Question {index}: unsupported type {ty}')
    sol=q.get('solution')
    require(isinstance(sol,dict),f'Question {index}: embedded grading solution required')
    if ty=='true-false':
        mode=q.get('trueFalseMode','single')
        require(mode in ('single','multiple'), f'{index}: trueFalseMode must be single or multiple')
        if mode=='multiple':
            require('choices' not in q,f'{index}: multiple statements cannot use legacy choices')
            statements=q.get('statements')
            require(isinstance(statements,list) and len(statements)>=2,
                    f'{index}: multiple true/false needs at least two statements')
            statement_ids=[]
            for j,item in enumerate(statements,1):
                require(isinstance(item,dict) and set(item)=={'id','text'} and isinstance(item['text'],str)
                        and 0<len(item['text'].strip())<=2000,
                        f'{index}: invalid statement {j}')
                statement_ids.append(question_id(item['id'],f'{index} statement {j}'))
            require(unique_ids(statement_ids),f'{index}: duplicate true/false statement IDs')
            answers=sol.get('answers')
            require(isinstance(answers,dict) and set(answers)==set(statement_ids)
                    and all(type(value) is bool for value in answers.values())
                    and set(sol)=={'answers'},
                    f'{index}: one boolean answer is required for each true/false statement')
            return
        require('statements' not in q,f'{index}: single true/false must use choices')
    if ty in ('single-choice','multiple-choice','true-false'):
        choices=q.get('choices')
        require(isinstance(choices,list) and len(choices)>=2,f'{index}: at least 2 choices required')
        ids=[c.get('id') for c in choices if isinstance(c,dict)]
        require(len(ids)==len(choices) and all(isinstance(c.get('text'),str) and c['text'].strip() for c in choices) and unique_ids(ids)
                and all(isinstance(id,str) and bool(QUESTION_TOKEN.fullmatch(id)) for id in ids),
                f'{index}: invalid choices')
        answers=sol.get('choiceIds')
        require(isinstance(answers,list) and len(answers)>=1 and set(answers)<=set(ids) and unique_ids(answers),
                f'{index}: answer ids not contained in choices')
        if ty in ('single-choice','true-false'):
            require(len(answers)==1,f'{index}: single correct answer required')
        if ty=='true-false':require(len(choices)==2,f'{index}: true/false single mode has exactly 2 choices')
    elif ty=='text':
        answers=sol.get('acceptedAnswers')
        require(isinstance(answers,list) and len(answers)>0 and all(isinstance(a,str) and a.strip() for a in answers),
                f'{index}: text answer required')
    elif ty=='ordering':
        items=q.get('items')
        require(isinstance(items,list) and len(items)>=2,f'{index}: ordering requires >=2 items')
        ids=[it.get('id') for it in items if isinstance(it,dict)]
        require(len(ids)==len(items) and all(isinstance(it.get('text'),str) and it['text'].strip() for it in items) and unique_ids(ids),
                f'{index}: invalid ordering items')
        order=sol.get('order')
        require(isinstance(order,list) and len(order)==len(ids) and set(order)==set(ids) and unique_ids(order),
                f'{index}: incomplete order')
    elif ty=='matching':
        left,right=q.get('left'),q.get('right')
        require(isinstance(left,list) and isinstance(right,list) and len(left)>=1 and len(right)>=1,
                f'{index}: both matching sides required')
        li=[a.get('id') for a in left if isinstance(a,dict)]
        ri=[a.get('id') for a in right if isinstance(a,dict)]
        require(len(li)==len(left) and len(ri)==len(right) and unique_ids(li) and unique_ids(ri),
                f'{index}: matching IDs invalid')
        pairs=sol.get('pairs')
        require(isinstance(pairs,list) and pairs and all(isinstance(p,dict) and p.get('left') in li and p.get('right') in ri for p in pairs),
                f'{index}: incomplete matching pairs')
    elif ty=='classification':
        items,cats=q.get('items'),q.get('categories')
        require(isinstance(items,list) and isinstance(cats,list) and len(items)>=2 and len(cats)>=2,
                f'{index}: classification needs items and categories')
        ids=[i.get('id') for i in items if isinstance(i,dict)]
        ci=[i.get('id') for i in cats if isinstance(i,dict)]
        assigns=sol.get('assignments')
        require(len(ids)==len(items) and len(ci)==len(cats) and unique_ids(ids) and unique_ids(ci)
                and isinstance(assigns,list) and len(assigns)==len(items)
                and all(a.get('item') in ids and a.get('category') in ci for a in assigns)
                and unique_ids([a['item'] for a in assigns]),f'{index}: invalid classification')
    elif ty=='fill-blanks':
        require(q.get('inputMode','text') in ('text','drag'),f'{index}: invalid fill-blanks inputMode')
        blanks=q.get('blanks')
        require(isinstance(blanks,list) and len(blanks)>=1,f'{index}: blanks missing')
        ids=[b.get('id') for b in blanks if isinstance(b,dict)]
        require(len(ids)==len(blanks) and unique_ids(ids) and
                all(isinstance(x,str) and bool(QUESTION_TOKEN.fullmatch(x)) for x in ids),
                f'{index}: blank identifiers invalid')
        answers=sol.get('answers')
        require(isinstance(answers,dict) and set(answers)==set(ids) and
                all(isinstance(answers[b],list) and bool(answers[b]) and
                    all(isinstance(a,str) and a.strip() for a in answers[b]) for b in ids),
                f'{index}: fill answers incomplete')

def normalize_word(s):
    return ''.join(ch for ch in unicodedata.normalize('NFD',s.upper()) if unicodedata.category(ch)!='Mn' and ch.isalpha())

def game_check(game,payload):
    """Conservative compatibility guard, not an alternative to the Player runtime check."""
    qs=payload['questions']
    require(payload['grading']['mode']=='embedded-key', 'Game requires embedded answer key')
    if game in ('matching','memory'):
        require(all(q['type']=='matching' for q in qs),f'{game} requires matching questions')
        require(sum(len(q['solution']['pairs']) for q in qs)>=3,f'{game} needs at least three pairs')
    if game in ('ordering','3d-ordering'):
        require(all(q['type']=='ordering' for q in qs),'Ordering game requires ordering questions')
        require(all(len(q['items'])>=3 for q in qs),'Ordering requires at least three items')
    if game in ('classification','3d-classification'):
        require(all(q['type']=='classification' for q in qs),'Classification requires classification questions')
    if game=='3d-matching':
        require(all(q['type']=='matching' and len(q['left'])>=2 and len(q['right'])>=2 for q in qs),'3D matching needs 2 items per side')
    if game=='3d':
        require(all(q['type'] in ('matching','ordering','classification') for q in qs),'3D supports matching, ordering, classification')
    if game=='true-false':
        count=sum(len(q.get('statements',[])) if q.get('trueFalseMode')=='multiple' else 1 for q in qs)
        require(all(q['type']=='true-false' for q in qs) and count>=2,
                'True/false game requires >=2 statements')
    if game=='fill-blanks':require(all(q['type']=='fill-blanks' for q in qs),'Fill game requires blanks')
    if game in ('word-search','crossword','rosco'):
        require(all(q['type']=='text' and len(q['solution']['acceptedAnswers'])==1 for q in qs),
                f'{game} requires one text answer per question')
        words=[normalize_word(q['solution']['acceptedAnswers'][0]) for q in qs]
        require(unique_ids(words),f'{game}: duplicate answer words')
        if game=='word-search':
            require(len(words)>=3 and all(3<=len(w)<=16 for w in words),'Word search needs >=3 distinct answers of 3-16 letters')
        if game=='crossword':
            require(len(words)>=4,'Crossword needs >=4 words; layout must also be tested in Player')
        if game=='rosco':
            require(1<=len(words)<=27 and all(len(w)>=2 for w in words),'Rosco requires 1-27 unique words')
            # The renderer assigns distinct letters that occur in each answer.
            # A direct injective assignment is a safe lower bound.
            possible=[set(w) & set('ABCDEFGHIJKLMNÑOPQRSTUVWXYZ') for w in words]
            used=set()
            def assign(i):
                if i==len(possible):return True
                for letter in sorted(possible[i]):
                    if letter not in used:
                        used.add(letter)
                        if assign(i+1):return True
                        used.remove(letter)
                return False
            require(assign(0),'Rosco cannot assign distinct letters to the answers')

def quiz_payload(item,lang):
    if 'payload' in item:
        payload=item['payload']
        require(isinstance(payload,dict), 'quiz.payload must be object')
        require(payload.get('schema')==QUESTION_SCHEMA and payload.get('version')=='0.4.0','Invalid native questionnaire schema/version')
    else:
        payload={'schema':QUESTION_SCHEMA,'version':'0.4.0','title':ident(item.get('title'),'quiz title'),
                 'language':lang,'grading':{'mode':'embedded-key'},'questions':item.get('questions')}
    require(isinstance(payload.get('questions'),list) and payload['questions'],'Questionnaire must have questions')
    require(len(payload['questions'])<=150,'Maximum 150 questions per activity')
    qids=[q.get('id') for q in payload['questions'] if isinstance(q,dict)]
    require(len(qids)==len(payload['questions']) and unique_ids(qids),'Question IDs must be unique')
    for i,q in enumerate(payload['questions'],1):valid_question(q,i)
    game=item.get('kind')
    if game:
        require(game in RENDERERS,'Unsupported game renderer '+str(game))
        game_check(game,payload)
    canonical_bytes(payload) # reject unsupported numeric types early
    return payload

def clean_html(value):
    require(isinstance(value,str) and value.strip(),'Lesson text or HTML is required')
    require(len(value)<=500_000,'HTML text is too large')
    if re.search(r'(?i)<\s*(script|iframe|object|embed|form|svg|math)\b|\bon[a-z]+\s*=|javascript\s*:',value):
        raise CourseError('Active scripts/forms/embeds are not allowed in passive lessons')
    return value

def course_rights(course):
    """Only content authorship and rights, never package generator attribution."""
    rights={}
    for key,limit in RIGHTS_LIMITS.items():
        raw=course.get(key, date.today().isoformat() if key=='createdAt' else None)
        if raw is None:continue
        require(isinstance(raw,str) and 0 < len(raw.strip()) <= limit, f'Invalid {key} rights field')
        require(raw==raw.strip(), f'{key} may not have leading or trailing whitespace')
        if key=='createdAt':
            require(bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])',raw)), 'createdAt requires YYYY-MM-DD')
            try: parsed=date.fromisoformat(raw)
            except ValueError:raise CourseError('createdAt must be a real calendar date')
            require(parsed.isoformat()==raw,'createdAt must be a real calendar date')
        rights[key]=raw
    return rights

def verify_course_rights(entities):
    for entity in entities:
        extension=(entity.get('extensions') or {}).get(COURSE_RIGHTS_EXTENSION)
        if extension is None:continue
        require(entity.get('type')=='course','Course rights extension must belong to a course')
        require(isinstance(extension,dict) and bool(extension) and set(extension)<=set(RIGHTS_LIMITS),
                'Course rights contain unsupported fields')
        for key,value in extension.items():
            require(isinstance(value,str) and value==value.strip() and 0<len(value)<=RIGHTS_LIMITS[key],
                    'Invalid course rights: '+key)
            if key=='createdAt':
                require(bool(re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])',value)), 'Invalid creation date')
                try: parsed=date.fromisoformat(value)
                except ValueError:raise CourseError('Invalid creation date')
                require(parsed.isoformat()==value,'Invalid creation date')

def normalized_input(course):
    require(isinstance(course,dict),'Course input must be an object')
    title=ident(course.get('title'),'course title')
    language=course.get('language','es')
    require(isinstance(language,str) and bool(re.fullmatch(r'[a-zA-Z]{2,8}(?:-[A-Za-z0-9]{1,8})*',language)),
            'Invalid course language')
    units=course.get('units')
    require(isinstance(units,list) and 1<=len(units)<=70,'Course must have 1-70 units')
    return title,language,units

class Composer:
    def __init__(self,course):
        self.course=course
        self.title,self.lang,self.units=normalized_input(course)
        self.seed=uuid.uuid4()
        self.entities=[]
        self.payloads={}
        self.profiles={NS+'profile/course':'required'}
        self.stats={'units':0,'lessons':0,'questionnaires':0,'games':0,'components':0,'urls':0,'composites':0}
        self.warnings=[]
    def urn(self,kind,key):
        return 'urn:uuid:'+str(uuid.uuid5(self.seed,kind+':'+key))
    def titlemap(self,name):return {self.lang:ident(name,'entity title')}
    def add_asset(self,data,mime):
        require(isinstance(data,bytes) and len(data)<=FILE_LIMIT,'Invalid embedded asset size')
        digest=sha(data).split(':',1)[1]
        path=f'assets/sha256/{digest[:2]}/{digest[2:4]}/{digest}'
        if path in self.payloads: require(self.payloads[path][0]==data,'Asset digest collision')
        self.payloads[path]=(data,mime)
        return path
    def add_activity(self,name,mime,body,kind,key,parent,game=None):
        asset=self.add_asset(body,mime)
        rid=self.urn('resource',key);aid=self.urn('activity',key)
        self.entities.append({'id':rid,'type':'resource','title':self.titlemap(name),'representations':[
            {'id':self.urn('representation',key),'role':'primary','mediaType':mime,
             **({'profile':QUIZ_PROFILE} if kind=='questionnaire' else
                {'profile':COMPONENT_PROFILE} if kind=='component' else
                {'profile':COMPOSITE_PROFILE} if kind=='composite' else {}),
             'location':{'type':'embedded','path':asset}}]})
        activity={'id':aid,'type':'activity','title':self.titlemap(name),'resource':rid,
                  'activityType':(NS+'type/assessment' if kind=='questionnaire' else
                                  NS+'type/component' if kind=='component' else
                                  NS+'type/composite' if kind=='composite' else NS+'type/resource')}
        if game:activity['extensions']={RENDERER_HINT:{'preferred':RENDERER_BASE+RENDERERS[game],'required':False}}
        self.entities.append(activity)
        parent['children'].append(aid)
        return activity
    def compose(self):
        root={'id':self.urn('course','root'),'type':'course','revision':1,
              'title':self.titlemap(self.title),'languages':[self.lang],'children':[]}
        if self.course.get('description'):root['description']=self.titlemap(self.course['description'])
        rights=course_rights(self.course)
        if rights:root['extensions']={COURSE_RIGHTS_EXTENSION:rights}
        self.entities.append(root)
        for idx,unit in enumerate(self.units,1):
            require(isinstance(unit,dict),'Unit must be an object')
            key=f'u{idx:03d}'; uname=ident(unit.get('title'),f'unit {idx} title')
            u={'id':self.urn('unit',key),'type':'unit','role':unit.get('role') or 'module','title':self.titlemap(uname),'children':[]}
            require(isinstance(u['role'],str),'Unit role must be text')
            self.entities.append(u);root['children'].append(u['id']);self.stats['units']+=1
            lessons=unit.get('lessons',unit.get('activities',[]))
            require(isinstance(lessons,list) and len(lessons)<=130,'Unit lessons must be an array of <=130 items')
            for j,item in enumerate(lessons,1):
                require(isinstance(item,dict),'Activity must be an object')
                name=ident(item.get('title'),f'activity {idx}.{j} title')
                key=f'{key}-a{j:03d}';ty=item.get('type','lesson')
                if ty in ('lesson','html','text'):
                    if item.get('html') is not None: content=clean_html(item['html'])
                    else:
                        body=ident(item.get('text'),f'{name} text')
                        content='<p>'+html.escape(body).replace('\n','</p><p>')+'</p>'
                    body=f'<!doctype html><html lang="{self.lang}"><head><meta charset="utf-8"><title>{html.escape(name)}</title></head><body>{content}</body></html>'.encode('utf-8')
                    self.add_activity(name,'text/html',body,'resource',key,u)
                    self.stats['lessons']+=1
                elif ty in ('quiz','questionnaire','game'):
                    payload=quiz_payload(item,self.lang)
                    game=item.get('kind') if ty=='game' else None
                    if ty=='game':require(bool(game),'A game kind is required')
                    if game in ('crossword',):self.warnings.append(f'{name}: validación completa del diseño del crucigrama requiere Player')
                    self.profiles[QUIZ_PROFILE]='optional'
                    self.add_activity(name,QUIZ_MIME,canonical_bytes(payload),'questionnaire',key,u,game)
                    self.stats['games' if game else 'questionnaires']+=1
                elif ty=='component':
                    tone=item.get('tone','note')
                    require(tone in ('info','note','warning','success'),'Invalid callout tone')
                    payload={'schema':COMPONENT_SCHEMA,'version':'0.1',
                             'component':{'id':NS+'component/callout','componentVersion':'1','dataVersion':'1','runtimeContractVersion':'1'},
                             'data':{'heading':ident(item.get('heading',name),'component heading'),
                                     'text':ident(item.get('text'),'component text'), 'tone':tone}}
                    self.profiles[COMPONENT_PROFILE]='optional'
                    self.add_activity(name,COMPONENT_MIME,canonical_bytes(payload),'component',key,u)
                    self.stats['components']+=1
                elif ty=='url':
                    href=ident(item.get('url'),'URL resource');require(uri_valid(href),'Invalid URL')
                    aid=self.urn('activity',key);rid=self.urn('resource',key)
                    self.entities.append({'id':rid,'type':'resource','title':self.titlemap(name),'representations':[
                        {'id':self.urn('representation',key),'role':'primary','mediaType':'text/html',
                         'location':{'type':'remote','href':href}}]})
                    self.entities.append({'id':aid,'type':'activity','title':self.titlemap(name),
                                          'activityType':NS+'type/resource','resource':rid})
                    u['children'].append(aid);self.stats['urls']+=1
                else:
                    raise CourseError('Unsupported activity type: '+str(ty))
        require(self.stats['lessons']+self.stats['questionnaires']+self.stats['games']+self.stats['components']+self.stats['urls']>0,
                'Course has no activities')
        return {'graphVersion':FORMAT_VERSION,'entities':self.entities,'relations':[]},root


def descriptor(path, data, media, json_content=False, schema=None):
    d={'path':path,'mediaType':media,'size':len(data),'byteDigest':sha(data),
       'contentDigest':digest_json(json.loads(data.decode('utf-8'))) if json_content else sha(data)}
    if schema:d['schema']=schema
    return d

def integrity_input(manifest):
    ep=sorted(({k:e[k] for k in ('id','type','role')} for e in manifest['entrypoints']),
              key=lambda d:(d['role'],d['type'],d['id']))
    profiles=sorted(({k:p[k] for k in ('id','version','requirement')} for p in manifest['profiles']),
                    key=lambda d:(d['id'],d['version'],d['requirement']))
    files=sorted(({k:f[k] for k in ('path','mediaType','contentDigest')} for f in manifest['files']),key=lambda d:d['path'])
    return {'format':manifest['format'],'formatVersion':manifest['formatVersion'],
            'entrypoints':ep,
            'graph':{k:manifest['graph'][k] for k in ('schema','mediaType','contentDigest')},
            'profiles':profiles,'files':files}

def build(course,output):
    c=Composer(course);graph,root=c.compose()
    graph_bytes=canonical_bytes(graph)
    gdesc=descriptor('content/graph.json',graph_bytes,'application/json',True,NS+'schema/graph/'+FORMAT_VERSION)
    files=[descriptor(path,data,media,json_content=(media.endswith('+json') or media=='application/json'))
           for path,(data,media) in c.payloads.items()]
    files.sort(key=lambda d:d['path'])
    manifest={'format':'P2LRN','formatVersion':FORMAT_VERSION,'packageId':'urn:uuid:'+str(uuid.uuid4()),
              'entrypoints':[{'id':root['id'],'type':'course','role':'primary'}],
              'graph':gdesc,
              'profiles':sorted([{'id':p,'version':FORMAT_VERSION,'requirement':req} for p,req in c.profiles.items()],key=lambda p:p['id']),
              'files':files,'integrity':{'algorithm':'sha256','contentRoot':'sha256:'+'0'*64}}
    manifest['integrity']['contentRoot']=sha(canonical_bytes(integrity_input(manifest)))
    out=Path(output);require(out.suffix.lower()=='.p2lrn','Output file must end in .p2lrn')
    out.parent.mkdir(parents=True,exist_ok=True)
    files_to_write={'META-INF/manifest.json':canonical_bytes(manifest),'content/graph.json':graph_bytes,
                    **{p:data for p,(data,media) in c.payloads.items()}}
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for path,data in sorted(files_to_write.items()):
            item=zipfile.ZipInfo(path,date_time=(2024,1,1,0,0,0))
            item.compress_type=zipfile.ZIP_DEFLATED
            item.external_attr=0o644 <<16
            archive.writestr(item,data)
    report=verify(out)
    report.update({'counts':c.stats,'warnings':c.warnings})
    return report

def verify(path):
    path=Path(path)
    require(path.is_file(),'P2LRN file not found')
    require(path.stat().st_size<=MAX_PACKAGE_BYTES,'P2LRN archive exceeds portable verification limit')
    with zipfile.ZipFile(path) as z:
        infos=z.infolist()
        require(0<len(infos)<=MAX_ZIP_MEMBERS,'P2LRN has too many ZIP members')
        require(all(0<=info.file_size<=FILE_LIMIT for info in infos),
                'ZIP member exceeds portable verification limit')
        require(sum(info.file_size for info in infos)<=MAX_EXPANDED_BYTES,
                'Expanded P2LRN payload exceeds portable verification limit')
        require(all(not (info.flag_bits&1) for info in infos),'Encrypted ZIP members are not supported')
        require(all(stat.S_IFMT(info.external_attr>>16)!=stat.S_IFLNK for info in infos),
                'Symbolic links are not valid P2LRN members')
        names=z.namelist()
        require(len(names)==len(set(names)),'Duplicate ZIP members')
        require('META-INF/manifest.json' in names and 'content/graph.json' in names,'Missing required files')
        require(all(not n.startswith('/') and '..' not in n.split('/') and '\\' not in n for n in names),'Unsafe ZIP path')
        manifest=json.loads(z.read('META-INF/manifest.json'));graph=json.loads(z.read('content/graph.json'))
        require(manifest.get('format')=='P2LRN' and manifest.get('formatVersion')==FORMAT_VERSION,'Wrong manifest format')
        require(graph.get('graphVersion')==FORMAT_VERSION,'Wrong graph version')
        require(len(manifest.get('entrypoints',[]))>=1,'No entrypoint')
        require(manifest.get('integrity',{}).get('contentRoot')==sha(canonical_bytes(integrity_input(manifest))),'contentRoot mismatch')
        descriptors=[manifest['graph']]+manifest['files']
        expected={'META-INF/manifest.json'}|set(d['path'] for d in descriptors)
        require(expected==set(names),'Physical inventory does not match manifest')
        for d in descriptors:
            raw=z.read(d['path'])
            require(d['size']==len(raw) and d['byteDigest']==sha(raw),'Byte digest mismatch: '+d['path'])
            mimetype=d['mediaType']
            dg=digest_json(json.loads(raw.decode('utf-8'))) if (mimetype=='application/json' or mimetype.endswith('+json')) else sha(raw)
            require(d['contentDigest']==dg,'Content digest mismatch: '+d['path'])
            if mimetype in (QUIZ_MIME,COMPONENT_MIME,COMPOSITE_MIME):
                obj=json.loads(raw.decode('utf-8'))
                if mimetype==QUIZ_MIME:
                    require(obj.get('schema')==QUESTION_SCHEMA and isinstance(obj.get('questions'),list),'Questionnaire schema invalid')
                    for i,q in enumerate(obj['questions'],1):valid_question(q,i)
        entities=graph.get('entities');require(isinstance(entities,list) and entities,'Empty graph')
        entityids=[e.get('id') for e in entities]
        require(unique_ids(entityids) and all(uri_valid(e) for e in entityids),'Entity IDs invalid')
        verify_course_rights(entities)
        byid={e['id']:e for e in entities}
        for ent in entities:
            for child in ent.get('children',[]):require(child in byid,'Unknown child entity '+child)
            if ent.get('type')=='activity' and 'resource' in ent:require(ent['resource'] in byid,'Unknown activity resource')
            if ent.get('type')=='resource':
                for rep in ent['representations']:
                    loc=rep['location']
                    if loc['type']=='embedded':require(loc['path'] in names,'Unknown resource payload')
                    if 'profile' in rep:
                        require(rep['profile'] in [p['id'] for p in manifest['profiles']],'Undeclared profile')
        for ep in manifest['entrypoints']:require(ep['id'] in byid,'Unknown entrypoint')
        return {'valid':True,'format':'P2LRN Core 0.4.0','bytes':path.stat().st_size,
                'entities':len(entities),'contentRoot':manifest['integrity']['contentRoot'],
                'package':str(path)}

def main():
    parser=argparse.ArgumentParser(description='Create and verify P2LRN Core packages offline, without MCP or a tunnel')
    sub=parser.add_subparsers(dest='command',required=True)
    make=sub.add_parser('build');make.add_argument('--input',required=True);make.add_argument('--output',required=True)
    check=sub.add_parser('verify');check.add_argument('course')
    args=parser.parse_args()
    try:
        result=build(json.loads(Path(args.input).read_text(encoding='utf-8')),args.output) if args.command=='build' else verify(args.course)
    except (CourseError,ValueError,KeyError,TypeError,OSError,RuntimeError,zipfile.BadZipFile,UnicodeDecodeError) as e:
        print(json.dumps({'valid':False,'error':str(e)},ensure_ascii=False),file=sys.stderr);return 1
    print(json.dumps(result,ensure_ascii=False,indent=2));return 0

if __name__=='__main__':sys.exit(main())

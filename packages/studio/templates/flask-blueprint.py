from pathlib import Path
import subprocess
from urllib.parse import unquote
from flask import Blueprint,request,jsonify,Response

p2lrn_studio=Blueprint('p2lrn_studio',__name__)
BRIDGE=Path.cwd()/'p2lrn-setup'/'p2lrn-studio-bridge.mjs'

def _bridge(action,fallback):
    name=unquote(request.headers.get('X-P2LRN-Filename',fallback))
    media=request.headers.get('Content-Type','application/octet-stream')
    result=subprocess.run(['node',str(BRIDGE),action,name,media],input=request.get_data(),capture_output=True)
    if result.returncode!=0:
        raise RuntimeError(result.stderr.decode('utf-8','replace').strip() or 'P2LRN Studio bridge failed')
    return result.stdout

@p2lrn_studio.post('__ENDPOINT__')
def save():
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('X-P2LRN-Filename','course.p2lrn')).name
    (root/name).write_bytes(request.get_data())
    return jsonify(ok=True,filename=name)

@p2lrn_studio.post('__READER_ENDPOINT__')
def read():
    try:return Response(_bridge('read','document.bin'),content_type='application/json; charset=utf-8')
    except Exception as error:return jsonify(ok=False,error=str(error)),422

@p2lrn_studio.post('__IMPORT_ENDPOINT__')
def import_package():
    try:return Response(_bridge('import','package.zip'),content_type='application/vnd.p2lrn+zip')
    except Exception as error:return jsonify(ok=False,error=str(error)),422

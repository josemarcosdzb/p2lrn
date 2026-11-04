from pathlib import Path
import os
import re
import subprocess
import tempfile
from flask import Blueprint, request, jsonify, Response

p2lrn_studio = Blueprint('p2lrn_studio',__name__)
BRIDGE = Path.cwd() / 'p2lrn-setup' / 'p2lrn-studio-bridge.mjs'
COURSE_PATH = '__COURSE_PATH__'
MAX_COURSE_BYTES = 512 * 1024 * 1024
MAX_READER_BYTES = 128 * 1024 * 1024

# This must be replaced with the Host's authenticated user, per-course
# teacher/editor permission and CSRF/origin verification. Fail closed.
def p2lrn_studio_host_authorize(request,operation,course_path):
    return False

def _guard(operation):
    try:
        if p2lrn_studio_host_authorize(request,operation,COURSE_PATH) is True:
            return None
    except Exception:
        pass
    return jsonify(ok=False,error='COURSE_ACCESS_DENIED'),403

def _name(fallback,suffix=None):
    raw=request.headers.get('X-P2LRN-Filename',fallback)
    if not isinstance(raw,str) or len(raw)>180 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,160}',raw):
        raise ValueError('INVALID_FILENAME')
    if suffix and (not raw.lower().endswith(suffix) or re.search(r'\.(?:php\d*|phtml|phar|cgi|asp|aspx|jsp|shtml)\.',raw,re.I)):
        raise ValueError('INVALID_FILENAME')
    return raw

def _body(limit):
    length=request.content_length
    if length is not None and (length<0 or length>limit):
        raise OverflowError('UPLOAD_TOO_LARGE')
    result=bytearray()
    while True:
        chunk=request.stream.read(min(1024*1024,limit+1-len(result)))
        if not chunk:
            break
        if len(result)+len(chunk)>limit:
            raise OverflowError('UPLOAD_TOO_LARGE')
        result.extend(chunk)
    return bytes(result)

def _bridge(action,fallback,limit):
    body=_body(limit)
    name=_name(fallback)
    media=request.headers.get('Content-Type','application/octet-stream')
    result=subprocess.run(
        ['node',str(BRIDGE),action,name,media],input=body,
        capture_output=True,check=False,timeout=120,
    )
    if result.returncode!=0 or len(result.stdout)>limit:
        raise RuntimeError('P2LRN Studio processing failed')
    return result.stdout

@p2lrn_studio.post('__ENDPOINT__')
def save():
    denied=_guard('save')
    if denied is not None:
        return denied
    try:
        name=_name('course.p2lrn','.p2lrn')
        data=_body(MAX_COURSE_BYTES)
    except ValueError:
        return jsonify(ok=False,error='INVALID_FILENAME'),400
    except OverflowError:
        return jsonify(ok=False,error='UPLOAD_TOO_LARGE'),413
    base=Path.cwd().resolve()
    directory=base/COURSE_PATH
    directory.mkdir(parents=True,exist_ok=True)
    directory=directory.resolve()
    if not directory.is_relative_to(base):
        return jsonify(ok=False,error='UNSAFE_STORAGE_PATH'),403
    target=directory/name
    if target.is_symlink() or target.is_dir():
        return jsonify(ok=False,error='UNSAFE_DESTINATION'),403
    temp_path=None
    try:
        with tempfile.NamedTemporaryFile(dir=directory,prefix='.p2lrn-save-',delete=False) as stream:
            temp_path=Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if target.is_symlink():
            return jsonify(ok=False,error='UNSAFE_DESTINATION'),403
        os.replace(temp_path,target)
        temp_path=None
        return jsonify(ok=True,filename=name,bytes=len(data))
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

@p2lrn_studio.post('__READER_ENDPOINT__')
def read():
    denied=_guard('read')
    if denied is not None:
        return denied
    try:
        return Response(_bridge('read','document.bin',MAX_READER_BYTES),
                        content_type='application/json; charset=utf-8')
    except ValueError:
        return jsonify(ok=False,error='INVALID_FILENAME'),400
    except OverflowError:
        return jsonify(ok=False,error='UPLOAD_TOO_LARGE'),413
    except (OSError,subprocess.TimeoutExpired,RuntimeError):
        return jsonify(ok=False,error='READER_FAILED'),422

@p2lrn_studio.post('__IMPORT_ENDPOINT__')
def import_package():
    denied=_guard('import')
    if denied is not None:
        return denied
    try:
        return Response(_bridge('import','package.zip',MAX_COURSE_BYTES),
                        content_type='application/vnd.p2lrn+zip')
    except ValueError:
        return jsonify(ok=False,error='INVALID_FILENAME'),400
    except OverflowError:
        return jsonify(ok=False,error='UPLOAD_TOO_LARGE'),413
    except (OSError,subprocess.TimeoutExpired,RuntimeError):
        return jsonify(ok=False,error='IMPORT_FAILED'),422

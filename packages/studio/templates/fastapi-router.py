from pathlib import Path
import asyncio
import os
import re
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

router = APIRouter()
BRIDGE = Path.cwd() / 'p2lrn-setup' / 'p2lrn-studio-bridge.mjs'
COURSE_PATH = '__COURSE_PATH__'
MAX_COURSE_BYTES = 512 * 1024 * 1024
MAX_READER_BYTES = 128 * 1024 * 1024

# Replace with real Host authentication + course authorization + CSRF/origin
# checks. This example intentionally rejects all requests until configured.
async def p2lrn_studio_host_authorize(request: Request, operation: str, course_path: str) -> bool:
    return False

async def _guard(request: Request, operation: str):
    try:
        if await p2lrn_studio_host_authorize(request, operation, COURSE_PATH) is True:
            return
    except Exception:
        pass
    raise HTTPException(status_code=403, detail='COURSE_ACCESS_DENIED')

async def _body(request: Request, limit: int) -> bytes:
    length = request.headers.get('content-length')
    if length is not None:
        if not length.isdecimal():
            raise HTTPException(status_code=400, detail='INVALID_LENGTH')
        if int(length) > limit:
            raise HTTPException(status_code=413, detail='UPLOAD_TOO_LARGE')
    output = bytearray()
    async for chunk in request.stream():
        if len(output) + len(chunk) > limit:
            raise HTTPException(status_code=413, detail='UPLOAD_TOO_LARGE')
        output.extend(chunk)
    return bytes(output)

def _name(request: Request, fallback: str, suffix: str | None = None) -> str:
    raw = request.headers.get('x-p2lrn-filename', fallback)
    if not isinstance(raw, str) or len(raw) > 180 or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,160}',raw):
        raise HTTPException(status_code=400, detail='INVALID_FILENAME')
    if suffix and (not raw.lower().endswith(suffix) or re.search(r'\.(?:php\d*|phtml|phar|cgi|asp|aspx|jsp|shtml)\.',raw,re.I)):
        raise HTTPException(status_code=400, detail='INVALID_FILENAME')
    return raw

async def _bridge(action: str, request: Request, fallback: str, limit: int):
    body = await _body(request,limit)
    name = _name(request,fallback)
    media = request.headers.get('content-type','application/octet-stream')
    def run():
        return subprocess.run(
            ['node',str(BRIDGE),action,name,media],input=body,
            capture_output=True,check=False,timeout=120,
        )
    result = await asyncio.to_thread(run)
    if result.returncode != 0 or len(result.stdout) > limit:
        raise RuntimeError('P2LRN Studio processing failed')
    return result.stdout

@router.post('__ENDPOINT__')
async def save(request: Request):
    await _guard(request,'save')
    name = _name(request,'course.p2lrn','.p2lrn')
    data = await _body(request,MAX_COURSE_BYTES)
    base = Path.cwd().resolve()
    root = base / COURSE_PATH
    root.mkdir(parents=True,exist_ok=True)
    root = root.resolve()
    if not root.is_relative_to(base):
        raise HTTPException(status_code=403,detail='UNSAFE_STORAGE_PATH')
    target = root / name
    if target.is_symlink() or target.is_dir():
        raise HTTPException(status_code=403,detail='UNSAFE_DESTINATION')
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=root,prefix='.p2lrn-save-',delete=False) as stream:
            temp_path = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if target.is_symlink():
            raise HTTPException(status_code=403,detail='UNSAFE_DESTINATION')
        os.replace(temp_path,target)
        temp_path = None
        return {'ok':True,'filename':name,'bytes':len(data)}
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

@router.post('__READER_ENDPOINT__')
async def read(request: Request):
    await _guard(request,'read')
    try:
        return Response(await _bridge('read',request,'document.bin',MAX_READER_BYTES),
                        media_type='application/json')
    except HTTPException:
        raise
    except (OSError,subprocess.TimeoutExpired,RuntimeError):
        return JSONResponse({'ok':False,'error':'READER_FAILED'},status_code=422)

@router.post('__IMPORT_ENDPOINT__')
async def import_package(request: Request):
    await _guard(request,'import')
    try:
        return Response(await _bridge('import',request,'package.zip',MAX_COURSE_BYTES),
                        media_type='application/vnd.p2lrn+zip')
    except HTTPException:
        raise
    except (OSError,subprocess.TimeoutExpired,RuntimeError):
        return JSONResponse({'ok':False,'error':'IMPORT_FAILED'},status_code=422)

from pathlib import Path
import subprocess
from urllib.parse import unquote
from fastapi import APIRouter,Request
from fastapi.responses import JSONResponse,Response

router=APIRouter()
BRIDGE=Path.cwd()/'p2lrn-setup'/'p2lrn-studio-bridge.mjs'

async def _bridge(action: str,request: Request,fallback: str):
    body=await request.body()
    name=unquote(request.headers.get('x-p2lrn-filename',fallback))
    media=request.headers.get('content-type','application/octet-stream')
    result=subprocess.run(['node',str(BRIDGE),action,name,media],input=body,capture_output=True)
    if result.returncode!=0:
        raise RuntimeError(result.stderr.decode('utf-8','replace').strip() or 'P2LRN Studio bridge failed')
    return result.stdout

@router.post('__ENDPOINT__')
async def save(request:Request):
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('x-p2lrn-filename','course.p2lrn')).name
    data=await request.body(); (root/name).write_bytes(data)
    return {'ok':True,'filename':name}

@router.post('__READER_ENDPOINT__')
async def read(request:Request):
    try:return Response(await _bridge('read',request,'document.bin'),media_type='application/json')
    except Exception as error:return JSONResponse({'ok':False,'error':str(error)},status_code=422)

@router.post('__IMPORT_ENDPOINT__')
async def import_package(request:Request):
    try:return Response(await _bridge('import',request,'package.zip'),media_type='application/vnd.p2lrn+zip')
    except Exception as error:return JSONResponse({'ok':False,'error':str(error)},status_code=422)

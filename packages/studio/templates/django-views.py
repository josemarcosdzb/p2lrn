from pathlib import Path
import subprocess
from urllib.parse import unquote
from django.http import JsonResponse,HttpResponse,HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt

BRIDGE=Path.cwd()/'p2lrn-setup'/'p2lrn-studio-bridge.mjs'

def _bridge(action,request,fallback):
    name=unquote(request.headers.get('X-P2LRN-Filename',fallback))
    media=request.headers.get('Content-Type','application/octet-stream')
    result=subprocess.run(['node',str(BRIDGE),action,name,media],input=request.body,capture_output=True)
    if result.returncode!=0:
        raise RuntimeError(result.stderr.decode('utf-8','replace').strip() or 'P2LRN Studio bridge failed')
    return result.stdout

@csrf_exempt
def save(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('X-P2LRN-Filename','course.p2lrn')).name
    (root/name).write_bytes(request.body)
    return JsonResponse({'ok':True,'filename':name})

@csrf_exempt
def read(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    try:return HttpResponse(_bridge('read',request,'document.bin'),content_type='application/json; charset=utf-8')
    except Exception as error:return JsonResponse({'ok':False,'error':str(error)},status=422)

@csrf_exempt
def import_package(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    try:return HttpResponse(_bridge('import',request,'package.zip'),content_type='application/vnd.p2lrn+zip')
    except Exception as error:return JsonResponse({'ok':False,'error':str(error)},status=422)

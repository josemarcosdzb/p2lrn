from pathlib import Path
from django.http import JsonResponse,HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_exempt
@csrf_exempt
def save(request):
    if request.method!='POST': return HttpResponseNotAllowed(['POST'])
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('X-P2LRN-Filename','course.p2lrn')).name
    (root/name).write_bytes(request.body)
    return JsonResponse({'ok':True,'filename':name})

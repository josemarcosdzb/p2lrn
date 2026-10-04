from pathlib import Path
from fastapi import APIRouter,Request
router=APIRouter()
@router.post('__ENDPOINT__')
async def save(request:Request):
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('x-p2lrn-filename','course.p2lrn')).name
    data=await request.body(); (root/name).write_bytes(data)
    return {'ok':True,'filename':name}

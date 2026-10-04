from pathlib import Path
from flask import Blueprint,request,jsonify
p2lrn_studio=Blueprint('p2lrn_studio',__name__)
@p2lrn_studio.post('__ENDPOINT__')
def save():
    root=Path.cwd()/'__COURSE_PATH__'; root.mkdir(parents=True,exist_ok=True)
    name=Path(request.headers.get('X-P2LRN-Filename','course.p2lrn')).name
    (root/name).write_bytes(request.get_data())
    return jsonify(ok=True,filename=name)

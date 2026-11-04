"""Security regressions for generated Python Studio routes.

Run explicitly with Python and the target framework's dependencies.
"""
from contextlib import contextmanager
from importlib.util import find_spec,spec_from_file_location,module_from_spec
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import subprocess
import unittest

ROOT=Path(__file__).resolve().parents[3]
CLI=ROOT/'packages/studio/bin/p2lrn-studio.mjs'
ROUTE='/api/p2lrn/studio/save'

@contextmanager
def generated(target):
    with TemporaryDirectory(prefix='p2lrn-secure-'+target+'-') as root:
        subprocess.run(['node',str(CLI),'setup',target,'--cwd',root],
                       check=True,capture_output=True)
        file=Path(root)/'p2lrn_studio.py'
        spec=spec_from_file_location('p2lrn_test_'+target,file)
        module=module_from_spec(spec)
        spec.loader.exec_module(module)
        current=os.getcwd()
        os.chdir(root)
        try:
            yield module,Path(root)
        finally:
            os.chdir(current)

@unittest.skipUnless(find_spec('flask'),'Flask not installed')
class FlaskStudioSecurity(unittest.TestCase):
    def test_fail_closed_and_safe_course_write(self):
        from flask import Flask
        with generated('flask') as (module,root):
            app=Flask('p2lrn-studio-security')
            app.register_blueprint(module.p2lrn_studio)
            client=app.test_client()
            denied=client.post(ROUTE,data=b'secret',
                              headers={'X-P2LRN-Filename':'course.p2lrn'})
            self.assertEqual(denied.status_code,403)
            self.assertFalse((root/'course/course.p2lrn').exists())
            self.assertEqual(client.post('/api/p2lrn/studio/read').status_code,403)
            self.assertEqual(client.post('/api/p2lrn/studio/import').status_code,403)
            module.p2lrn_studio_host_authorize=lambda request,op,course:True
            for name in ['shell.php','shell.php.p2lrn','../evil.p2lrn']:
                res=client.post(ROUTE,data=b'bad',headers={'X-P2LRN-Filename':name})
                self.assertEqual(res.status_code,400,(name,res.data))
            for content in (b'created',b'updated'):
                accepted=client.post(ROUTE,data=content,
                    headers={'X-P2LRN-Filename':'course.p2lrn'})
                self.assertEqual(accepted.status_code,200,accepted.data)
                self.assertEqual((root/'course/course.p2lrn').read_bytes(),content)
            self.assertEqual([x.name for x in (root/'course').iterdir()],['course.p2lrn'])

@unittest.skipUnless(find_spec('fastapi') and find_spec('httpx'),'FastAPI/HTTPX not installed')
class FastApiStudioSecurity(unittest.TestCase):
    def test_fail_closed_and_safe_course_write(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        with generated('fastapi') as (module,root):
            app=FastAPI()
            app.include_router(module.router)
            client=TestClient(app)
            denied=client.post(ROUTE,content=b'secret',
                              headers={'X-P2LRN-Filename':'course.p2lrn'})
            self.assertEqual(denied.status_code,403)
            self.assertFalse((root/'course/course.p2lrn').exists())
            self.assertEqual(client.post('/api/p2lrn/studio/read').status_code,403)
            self.assertEqual(client.post('/api/p2lrn/studio/import').status_code,403)
            async def allow(request,op,course):
                return True
            module.p2lrn_studio_host_authorize=allow
            for name in ['shell.php','shell.php.p2lrn','../evil.p2lrn']:
                res=client.post(ROUTE,content=b'bad',headers={'X-P2LRN-Filename':name})
                self.assertEqual(res.status_code,400,(name,res.text))
            for content in (b'created',b'updated'):
                accepted=client.post(ROUTE,content=content,
                    headers={'X-P2LRN-Filename':'course.p2lrn'})
                self.assertEqual(accepted.status_code,200,accepted.text)
                self.assertEqual((root/'course/course.p2lrn').read_bytes(),content)
            self.assertEqual([x.name for x in (root/'course').iterdir()],['course.p2lrn'])

if __name__=='__main__':
    unittest.main(verbosity=2)

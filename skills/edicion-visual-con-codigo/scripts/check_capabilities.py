#!/usr/bin/env python3
"""Portable, read-only preflight for Agent Skills. Python >=3.9, stdlib only.

Never installs anything, touches repos or downloads assets. Browser launch only
when --browser-smoke is explicitly supplied. Does not execute P2LRN code.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

MODULES=('PIL','numpy','scipy','playwright','cv2','skimage','matplotlib','reportlab','docx','pptx','openpyxl')
COMMANDS=('python','python3','node','npm','git','ffmpeg','ffprobe','magick','convert','rsvg-convert','mmdc','pdftoppm','libreoffice')

def safe_module(name):
    try:return importlib.util.find_spec(name) is not None
    except (ImportError,AttributeError,ValueError):return False

def describe_toolkit(root:Path):
    candidates=[root/'node_modules/@p2lrn/toolkit/package.json',root/'packages/toolkit/package.json']
    found=[]
    for file in candidates:
        if file.is_file():
            try:
                d=json.loads(file.read_text(encoding='utf-8'))
                found.append({'path':str(file),'version':d.get('version'),'dist_exists':(file.parent/'dist').is_dir()})
            except (ValueError,OSError): found.append({'path':str(file),'error':'package.json no legible'})
    return {'found':bool(found),'candidates':found,'runtime_verified':False}

def browser_smoke():
    """Render local HTML with an installed Chromium; do not install or download."""
    if not safe_module('playwright'):
        return {'status':'blocked','reason':'playwright Python no instalado'}
    executable_names=('chromium','chromium-browser','google-chrome','google-chrome-stable','chrome')
    candidates=[('playwright',None)]
    seen=set()
    for name in executable_names:
        path=shutil.which(name)
        if path and path not in seen:
            candidates.append(('system',path))
            seen.add(path)
    errors=[]
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            for source, executable in candidates:
                browser=None
                try:
                    options={'headless':True}
                    if executable:options['executable_path']=executable
                    browser=playwright.chromium.launch(**options)
                    page=browser.new_page()
                    page.set_content('<!doctype html><html><head><title>P2LRN smoke</title></head><body><h1>OK</h1></body></html>')
                    assert page.title()=='P2LRN smoke'
                    assert page.locator('h1').inner_text()=='OK'
                    return {'status':'pass','reason':'Chromium real renderizo HTML local',
                            'source':source,'executable':executable or 'playwright-managed',
                            'version':browser.version,
                            'limitations':'No verifica Player, Studio, tactil real ni LMS'}
                except Exception as ex:
                    errors.append(f'{source} ({executable or "managed"}): {type(ex).__name__}: {str(ex)[:160]}')
                finally:
                    if browser is not None:browser.close()
    except Exception as ex:
        errors.append(f'Playwright: {type(ex).__name__}: {str(ex)[:160]}')
    return {'status':'blocked' if len(candidates)==1 and "doesn't exist" in ' '.join(errors) else 'fail',
            'reason':' | '.join(errors)[:540],
            'attempts':len(candidates)}

def main(argv=None):
    ap=argparse.ArgumentParser(description='Inventario local no destructivo de capacidades')
    ap.add_argument('--project-root',default='.',help='Checkout P2LRN o directorio de trabajo')
    ap.add_argument('--json',action='store_true',help='Salida JSON')
    ap.add_argument('--browser-smoke',action='store_true',help='Intentar iniciar Chromium sin descargar nada')
    ap.add_argument('--require',action='append',default=[],help='Capacidad obligatoria: command:git, python_module:PIL, p2lrn_packager, p2lrn_toolkit')
    a=ap.parse_args(argv)
    project=Path(a.project_root).expanduser().resolve()
    modules={name:safe_module(name) for name in MODULES}
    commands={name:bool(shutil.which(name)) for name in COMMANDS}
    packager=os.environ.get('P2LRN_PKG','').strip()
    pkg=Path(packager).expanduser() if packager else None
    pkg_ok=bool(pkg and pkg.is_file() and pkg.name=='p2lrn_package.py')
    result={
      'python':sys.version.split()[0],
      'platform':sys.platform,
      'project_root':str(project),
      'commands':commands,
      'python_modules':modules,
      'p2lrn_packager':{'configured':bool(packager),'exists':pkg_ok,'path':str(pkg) if pkg else None,'executed':False},
      'p2lrn_toolkit':describe_toolkit(project),
      'browser':{'status':'not-tested','reason':'Usar --browser-smoke para lanzar Chromium localmente'},
      'notes':['Existencia no significa version, API o integracion verificada','No se instalo ni descargo nada']}
    if a.browser_smoke:result['browser']=browser_smoke()
    capabilities={**{'command:'+k:v for k,v in commands.items()},
                  **{'python_module:'+k:v for k,v in modules.items()},
                  'p2lrn_packager':pkg_ok,
                  'p2lrn_toolkit':result['p2lrn_toolkit']['found'],
                  'browser_smoke':result['browser']['status']=='pass'}
    errors=[]
    for cap in a.require:
        if cap not in capabilities:errors.append('Capacidad desconocida: '+cap)
        elif not capabilities[cap]:errors.append('Capacidad ausente: '+cap)
    result['requirements_met']=not errors
    result['errors']=errors
    if a.json:print(json.dumps(result,indent=2,ensure_ascii=False))
    else:
        print('Python:',result['python'],'OS:',result['platform'])
        print('Comandos:',', '.join(k for k,v in commands.items() if v) or 'ninguno')
        print('Modulos Python:',', '.join(k for k,v in modules.items() if v) or 'ninguno')
        print('Empaquetador P2LRN:', 'localizado (NO ejecutado)' if pkg_ok else 'NO disponible')
        print('Toolkit P2LRN:', 'localizado (NO probado)' if result['p2lrn_toolkit']['found'] else 'NO disponible')
        print('Navegador:',result['browser']['status'])
        for e in errors:print('ERROR:',e,file=sys.stderr)
    return 0 if not errors else 2

if __name__=='__main__':raise SystemExit(main())

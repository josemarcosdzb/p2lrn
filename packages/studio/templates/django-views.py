from pathlib import Path
import json
import logging
import os
import re
import subprocess
import tempfile
from django.conf import settings
from django.http import JsonResponse, HttpResponse, HttpResponseNotAllowed
from django.views.decorators.csrf import csrf_protect

# Generated Django endpoints are fail-closed until the host configures an
# authenticated, course-scoped authorization callback. Do not expose them with
# csrf_exempt, or assume that a valid CSRF token grants course-edit permission.
BRIDGE = Path.cwd() / 'p2lrn-setup' / 'p2lrn-studio-bridge.mjs'
COURSE_PATH = '__COURSE_PATH__'
MAX_SAVE_BYTES = 512 * 1024 * 1024
MAX_READER_BYTES = 128 * 1024 * 1024
MAX_IMPORT_BYTES = 512 * 1024 * 1024
LOGGER = logging.getLogger('p2lrn.studio')


def _deny(request, operation):
    user = getattr(request, 'user', None)
    if not getattr(user, 'is_authenticated', False):
        return JsonResponse({'ok': False, 'error': 'Authentication required'}, status=401)
    authorize = getattr(settings, 'P2LRN_STUDIO_AUTHORIZE', None)
    if not callable(authorize) or authorize(request, operation, COURSE_PATH) is not True:
        return JsonResponse({'ok': False, 'error': 'Course access denied'}, status=403)
    return None


def _read_bounded(request, maximum):
    length = request.headers.get('Content-Length')
    if length is not None:
        if not length.isascii() or len(length) > 18 or not length.isdecimal():
            raise ValueError('invalid-length')
        if int(length) > maximum:
            raise ValueError('too-large')
    chunks = []
    total = 0
    while True:
        chunk = request.read(min(1024 * 1024, maximum + 1 - total))
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            raise ValueError('too-large')
        chunks.append(chunk)
    return b''.join(chunks)


def _safe_filename(raw, default):
    supplied = str(raw or default)
    if '/' in supplied or chr(92) in supplied:
        raise ValueError('invalid-filename')
    name = Path(supplied).name
    name = re.sub(r'[^A-Za-z0-9._-]+', '-', name)
    if not name or name in {'.', '..'} or len(name) > 160:
        raise ValueError('invalid-filename')
    return name


def _bridge(action, request, fallback, maximum):
    payload = _read_bounded(request, maximum)
    name = _safe_filename(request.headers.get('X-P2LRN-Filename', fallback), fallback)
    media = request.headers.get('Content-Type', 'application/octet-stream')
    process = subprocess.run(
        ['node', str(BRIDGE), action, name, media],
        input=payload, capture_output=True, timeout=120, check=False,
    )
    if process.returncode != 0:
        raise RuntimeError('P2LRN Studio conversion failed')
    return process.stdout


@csrf_protect
def save(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])
    denied = _deny(request, 'save')
    if denied is not None:
        return denied
    base = Path.cwd().resolve()
    root = base / COURSE_PATH
    root.mkdir(parents=True, exist_ok=True)
    if not root.resolve().is_relative_to(base):
        return JsonResponse({'ok': False, 'error': 'Invalid course storage path'}, status=403)
    try:
        name = _safe_filename(request.headers.get('X-P2LRN-Filename', 'course.p2lrn'), 'course.p2lrn')
        if not name.lower().endswith('.p2lrn'):
            return JsonResponse({'ok': False, 'error': 'Invalid course filename'}, status=400)
    except ValueError:
        return JsonResponse({'ok': False, 'error': 'Invalid course filename'}, status=400)
    target = root / name
    if target.is_symlink() or target.exists() and not target.is_file():
        return JsonResponse({'ok': False, 'error': 'Unsafe course file'}, status=400)
    temporary = None
    try:
        header = request.headers.get('Content-Length')
        if header is not None:
            if not header.isascii() or len(header) > 18 or not header.isdecimal():
                return JsonResponse({'ok': False, 'error': 'Invalid Content-Length'}, status=400)
            if int(header) > MAX_SAVE_BYTES:
                return JsonResponse({'ok': False, 'error': 'Course too large'}, status=413)
        total = 0
        with tempfile.NamedTemporaryFile(
            mode='wb', dir=root, prefix='.p2lrn-save-', suffix='.tmp',
            delete=False,
        ) as file:
            temporary = Path(file.name)
            while True:
                chunk = request.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_SAVE_BYTES:
                    return JsonResponse({'ok': False, 'error': 'Course too large'}, status=413)
                file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        if target.is_symlink() or not root.resolve().is_relative_to(base):
            return JsonResponse({'ok': False, 'error': 'Unsafe course destination'}, status=403)
        os.replace(temporary, target)
        temporary = None
        return JsonResponse({'ok': True, 'filename': name, 'bytes': total})
    except OSError:
        LOGGER.exception('Studio failed to write course')
        return JsonResponse({'ok': False, 'error': 'Course storage unavailable'}, status=507)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


@csrf_protect
def read(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])
    denied = _deny(request, 'read')
    if denied is not None:
        return denied
    try:
        return HttpResponse(
            _bridge('read', request, 'document.bin', MAX_READER_BYTES),
            content_type='application/json; charset=utf-8',
        )
    except ValueError as error:
        status = 413 if str(error) == 'too-large' else 400
        return JsonResponse({'ok': False, 'error': 'Invalid document upload'}, status=status)
    except (subprocess.TimeoutExpired, OSError, RuntimeError):
        LOGGER.exception('Studio Reader failed')
        return JsonResponse({'ok': False, 'error': 'Reader processing failed'}, status=422)


@csrf_protect
def import_package(request):
    if request.method != 'POST':
        return HttpResponseNotAllowed(['POST'])
    denied = _deny(request, 'import')
    if denied is not None:
        return denied
    try:
        return HttpResponse(
            _bridge('import', request, 'package.zip', MAX_IMPORT_BYTES),
            content_type='application/vnd.p2lrn+zip',
        )
    except ValueError as error:
        status = 413 if str(error) == 'too-large' else 400
        return JsonResponse({'ok': False, 'error': 'Invalid package upload'}, status=status)
    except (subprocess.TimeoutExpired, OSError, RuntimeError):
        LOGGER.exception('Studio import failed')
        return JsonResponse({'ok': False, 'error': 'Package conversion failed'}, status=422)

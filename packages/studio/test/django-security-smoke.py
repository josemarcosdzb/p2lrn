#!/usr/bin/env python3
"""Integration security checks for generated P2LRN Studio Django routes.

Run with: python packages/studio/test/django-security-smoke.py
Requires Django 5.2.x in the selected Python environment.
"""
import importlib.util
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace

from django.conf import settings

settings.configure(
    SECRET_KEY="test-only-never-use-in-production",
    ALLOWED_HOSTS=["testserver"],
    CSRF_TRUSTED_ORIGINS=["http://testserver"],
    INSTALLED_APPS=[],
    MIDDLEWARE=[],
    ROOT_URLCONF=__name__,
    USE_TZ=True,
)
import django
django.setup()

from django.middleware.csrf import _get_new_csrf_string
from django.test import RequestFactory, override_settings

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "templates" / "django-views.py"
CSRF = _get_new_csrf_string()
rf = RequestFactory()


def assert_status(response, expected, message):
    assert response.status_code == expected, (
        f"{message}: expected HTTP {expected}, got {response.status_code}"
    )


def post(author, *, content=b"test-p2lrn", csrf=True, name="course.p2lrn"):
    req = rf.post(
        "/api/p2lrn/studio/save",
        data=content,
        content_type="application/octet-stream",
        HTTP_X_P2LRN_FILENAME=name,
    )
    req.user = SimpleNamespace(is_authenticated=author)
    if csrf:
        req.COOKIES[settings.CSRF_COOKIE_NAME] = CSRF
        req.META["HTTP_X_CSRFTOKEN"] = CSRF
        req.META["HTTP_ORIGIN"] = "http://testserver"
    return req


def run():
    with tempfile.TemporaryDirectory(prefix="p2lrn-django-security-") as temp:
        previous = os.getcwd()
        os.chdir(temp)
        try:
            generated = Path(temp) / "generated_views.py"
            generated.write_text(
                TEMPLATE.read_text(encoding="utf-8").replace(
                    "__COURSE_PATH__", "academy/courses"
                ),
                encoding="utf-8",
            )
            spec = importlib.util.spec_from_file_location("test_p2lrn_studio_django", generated)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            target = Path(temp) / "academy" / "courses" / "course.p2lrn"
            assert_status(module.save(post(True, csrf=False)), 403, "CSRF protection")
            assert not target.exists(), "CSRF denial must not create course data"
            with override_settings(P2LRN_STUDIO_AUTHORIZE=lambda *_args: True):
                assert_status(module.save(post(False)), 401, "Anonymous user")
            assert not target.exists(), "Anonymous denial must not write data"

            assert_status(module.save(post(True)), 403, "Missing host authorization")
            assert not target.exists(), "No auth callback must fail closed"

            observed = []
            def authorize(_request, operation, course):
                observed.append((operation, course))
                return operation == "save" and course == "academy/courses"

            with override_settings(P2LRN_STUDIO_AUTHORIZE=authorize):
                assert_status(module.save(post(True)), 200, "Authorized save")
                assert target.read_bytes() == b"test-p2lrn"
                assert_status(module.save(post(True, content=b"updated")), 200, "Atomic update")
                assert target.read_bytes() == b"updated"
                assert_status(module.save(post(True, name="not-p2lrn.txt")), 400, "Extension policy")
                assert_status(module.save(post(True, name="../course.p2lrn")), 400,
                              "Filename traversal must be rejected")
                huge = post(True)
                huge.META["CONTENT_LENGTH"] = str(module.MAX_SAVE_BYTES + 1)
                assert_status(module.save(huge), 413, "Oversized Content-Length")
                assert target.read_bytes() == b"updated", "Rejected body must not truncate the course"
                assert_status(module.read(post(True)), 403, "Reader course authorization")
                assert_status(module.import_package(post(True)), 403, "Import course authorization")
            assert observed.count(("save", "academy/courses")) >= 3
            assert sorted(p.name for p in target.parent.iterdir()) == ["course.p2lrn"], (
                "No temporary file may remain after successful or rejected upload"
            )
            print("DJANGO_STUDIO_SECURITY_OK: csrf, authentication, course authorization, atomic writes, size limits")
        finally:
            os.chdir(previous)


if __name__ == "__main__":
    run()

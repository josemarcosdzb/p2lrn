"""Smoke test for the native P2LRN executable (Windows or Linux console build)."""
import hashlib
import io
import os
import pathlib
import struct
import subprocess
import sys
import time
import tempfile
import urllib.error
import urllib.request
import zipfile

MAGIC=b"P2LRN-EXE-V1"+bytes(4)
base=pathlib.Path(sys.argv[1]).resolve()
assert base.is_file(), "Pass the compiled launcher path"
GUI_MODE='--gui' in sys.argv[2:]

def pack(exe,content):
    return exe+content+MAGIC+struct.pack("<Q",len(content))+hashlib.sha256(content).digest()

def expect_error(url,status,headers=None,method="GET"):
    req=urllib.request.Request(url,headers=headers or {},method=method)
    try:
        urllib.request.urlopen(req,timeout=5)
        raise AssertionError("Unsafe request accepted")
    except urllib.error.HTTPError as exc:
        assert exc.code==status,(exc.code,status)

smoke_parent=os.environ.get("P2LRN_SMOKE_ROOT") or None
if smoke_parent:
    pathlib.Path(smoke_parent).mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix="p2lrn-native-smoke-",dir=smoke_parent) as temporary:
    root=pathlib.Path(temporary)
    data=io.BytesIO()
    with zipfile.ZipFile(data,"w",zipfile.ZIP_STORED) as archive:
        for name,payload in {
            "www/index.html":"<!doctype html><title>P2LRN</title><p>Offline smoke test</p>",
            "www/app.js":"console.log('QA')",
            "www/assignment.json":"{}",
            "www/course.p2lrn":"PK",
            "www/player/release.json":"{}",
        }.items():archive.writestr(name,payload)
    zip_bytes=data.getvalue()
    binary=base.read_bytes()
    target=root/("test-offline.exe" if os.name=="nt" else "test-offline")
    target.write_bytes(pack(binary,zip_bytes))
    if os.name!="nt":target.chmod(0o755)

    def launch():
        process=subprocess.Popen([str(target)],env={**os.environ,"P2LRN_OFFLINE_LAUNCH_TEST":"1"},
                                 stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        if GUI_MODE:
            digest=hashlib.sha256(zip_bytes).digest()
            port=20000+int.from_bytes(digest[:2],"big")%30000
            url=f"http://127.0.0.1:{port}/index.html"
            for _ in range(150):
                if process.poll() is not None:raise AssertionError("GUI EXE exited early")
                try:
                    with urllib.request.urlopen(url,timeout=1) as response:
                        if response.status==200:break
                except Exception:time.sleep(0.1)
            else:raise AssertionError("GUI EXE did not start")
            return process,url
        line=process.stdout.readline().strip()
        assert line.startswith("P2LRN_TEST_URL=http://127.0.0.1:"),line
        return process,line.split("=",1)[1]

    process,address=launch()
    try:
        with urllib.request.urlopen(address,timeout=5) as response:
            assert response.status==200
            assert b"Offline smoke test" in response.read()
            assert response.headers["X-Content-Type-Options"]=="nosniff"
        with urllib.request.urlopen(address.replace("index.html","course.p2lrn"),timeout=5) as response:
            assert response.headers["Content-Type"].startswith("application/vnd.p2lrn+zip")
        expect_error(address,403,{"Host":"malicious.example"})
        expect_error(address,405,method="POST")
        expect_error(address.replace("index.html","%2e%2e/secret"),404)
    finally:
        process.terminate();process.wait(timeout=10)
    print("NATIVE_LOOPBACK_HTTP_PASS",address)

    # The same assignment must keep a stable origin to support localStorage resume.
    process,again=launch()
    try:assert again==address,(address,again)
    finally:process.terminate();process.wait(timeout=10)
    print("NATIVE_STABLE_RESUME_ORIGIN_PASS")

    if GUI_MODE:
        print("NATIVE_GUI_EXE_LAUNCH_PASS")
        sys.exit(0)

    tampered=bytearray(pack(binary,zip_bytes))
    tampered[-57]^=1
    damaged=root/("damaged-offline.exe" if os.name=="nt" else "damaged-offline")
    damaged.write_bytes(tampered)
    if os.name!="nt":damaged.chmod(0o755)
    fail=subprocess.run([str(damaged)],env={**os.environ,"P2LRN_OFFLINE_LAUNCH_TEST":"1"},
                        capture_output=True,text=True,timeout=20)
    assert fail.returncode!=0,"Tampered executable unexpectedly started"
    print("NATIVE_TAMPERED_EXECUTABLE_REJECTED")
print("NATIVE_OFFLINE_WINDOWS_LAUNCHER_E2E_PASS")

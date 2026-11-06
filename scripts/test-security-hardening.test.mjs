import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('file association passes filename as an argument rather than PowerShell code',()=>{
 const p=read('integration/windows/register-p2lrn-reader.ps1');
 assert.doesNotMatch(p,/powershell\.exe -NoProfile -ExecutionPolicy Bypass -Command/i);
 assert.match(p,/node\.exe/);assert.match(p,/-NoProfile -File/);
 assert.match(p,/%1/);assert.match(p,/\$command\s*=\s*'"'/);assert.match(p,/\[switch\]\$InspectOnly/);
});
test('Only the hosted workflow runs on untrusted pull requests',()=>{
 const src=read('.github/workflows/p2lrn-ci.yml');
 assert.doesNotMatch(src,/^\s{2}pull_request:\s*$/m);
 const pr=read('.github/workflows/p2lrn-pr-safe.yml');
 assert.match(pr,/^\s{2}pull_request:\s*$/m);
 assert.match(pr,/runs-on: ubuntu-latest/);
 assert.doesNotMatch(pr,/self-hosted/i);
 const jobs=src.split(/\n(?=  [a-z][\w-]*:\s*\n)/).filter(x=>/runs-on: \[self-hosted, Windows, X64, p2lrn-windows\]/.test(x));
 assert.equal(jobs.length,11);
 for(const job of jobs)assert.match(job.split(/\n    runs-on:/)[0],/if: \$\{\{ github\.event_name != 'pull_request'/);
});
test('native Windows workflow pins uploaded-artifact to immutable SHA',()=>{
 const p=read('.github/workflows/p2lrn-native-offline-windows.yml');
 assert.match(p,/actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
});

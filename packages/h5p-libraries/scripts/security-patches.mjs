import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// The pinned Lumi archive contains jQuery UI 1.13.0 with the vulnerable
// checkboxradio label path. Apply only the official upstream change from
// https://github.com/jquery/jquery-ui/commit/8cc5bae1caa1fcf96bf5862c5646c787020ba3f9
// and fail closed if the source does not match the audited bytes.
export const SECURITY_PATCH=Object.freeze({
  file:'jQuery.ui-1.10/h5p-jquery-ui.js',
  advisory:'CVE-2022-31160',
  upstreamCommit:'8cc5bae1caa1fcf96bf5862c5646c787020ba3f9',
  originalSha256:'c97ce1981a8a5bc7c22d5e3afc824dc0c25629e554f7e3f4c408cc3494cf98ad',
  patchedSha256:'082af49919f57b9e0a51a4a8edf6a17424b7c7a2079dd3b6eae7e8419b2e4cd5'
});
const sha=x=>createHash('sha256').update(x).digest('hex');
const declarationBefore='\t\t\tvar disabled, labels;\n\t\t\tvar that = this;\n\t\t\tvar options = this._super() || {};';
const declarationAfter='\t\t\tvar disabled, labels, labelContents;\n\t\t\tvar options = this._super() || {};';
const labelBefore=[
"\t\t\tthis.label.contents().not( this.element[ 0 ] ).each( function() {",
"",
"\t\t\t\t// The label contents could be text, html, or a mix. We concat each element to get a",
"\t\t\t\t// string representation of the label, without the input as part of it.",
"\t\t\t\tthat.originalLabel += this.nodeType === 3 ? $( this ).text() : this.outerHTML;",
"\t\t\t} );",
].join('\n');
const labelAfter=[
"\t\t\t// The label contents could be text, html, or a mix. We wrap all elements",
"\t\t\t// and read the wrapper's innerHTML to get a string representation of",
"\t\t\t// the label, without the input as part of it.",
"\t\t\tlabelContents = this.label.contents().not( this.element[ 0 ] );",
"",
"\t\t\tif ( labelContents.length ) {",
"\t\t\t\tthis.originalLabel += labelContents",
"\t\t\t\t\t.clone()",
"\t\t\t\t\t.wrapAll( \"<div></div>\" )",
"\t\t\t\t\t.parent()",
"\t\t\t\t\t.html();",
"\t\t\t}",
].join('\n');
function replaceExact(source,from,to){
  if(source.split(from).length!==2)throw new Error('Pinned jQuery UI checkboxradio security patch anchor changed.');
  return source.replace(from,to);
}
export async function applyPinnedH5pSecurityPatches(librariesPath){
  const target=join(librariesPath,...SECURITY_PATCH.file.split('/'));
  const original=await readFile(target,'utf8');
  if(sha(original)!==SECURITY_PATCH.originalSha256)
    throw new Error('Pinned jQuery UI source hash mismatch. Refusing unverified patch.');
  const corrected=replaceExact(replaceExact(original,declarationBefore,declarationAfter),
    labelBefore,labelAfter);
  if(sha(corrected)!==SECURITY_PATCH.patchedSha256)
    throw new Error('Pinned jQuery UI patched hash mismatch. Refusing build.');
  await writeFile(target,corrected,'utf8');
  return [{
    file:SECURITY_PATCH.file,
    advisory:SECURITY_PATCH.advisory,
    upstreamCommit:SECURITY_PATCH.upstreamCommit,
    originalSha256:'sha256:'+SECURITY_PATCH.originalSha256,
    patchedSha256:'sha256:'+SECURITY_PATCH.patchedSha256
  }];
}

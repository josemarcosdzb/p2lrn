import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// This is an external registry inventory, NOT a prerequisite to validating a
// release candidate's locally packed artifacts. After release, pass
// --require-published to turn missing/unreachable packages into a release gate.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const registry = 'https://registry.npmjs.org';
const directories = ['h5p-libraries', 'toolkit', 'player', 'studio'];
const packages = await Promise.all(directories.map(async (directory) => {
  const pkg = JSON.parse(await readFile(resolve(root, 'packages', directory, 'package.json'), 'utf8'));
  return {name:pkg.name, version:pkg.version};
}));
if (new Set(packages.map(pkg=>pkg.version)).size !== 1) {
  throw new Error('The four P2LRN npm packages do not share one release version.');
}

// Native HTTPS requests avoid Windows cmd/npm.cmd launch and quoting failures.
// Query the exact immutable version; a 404 is NOT a network failure.
async function inspectVersion({name, version}) {
  const url = `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  try {
    const response = await fetch(url, {
      method:'GET',
      headers:{Accept:'application/json'},
      redirect:'error',
      signal:AbortSignal.timeout(20000),
    });
    if (response.status === 404) return {name, version, status:'not-published', httpStatus:404};
    if (!response.ok) {
      return {name, version, status:'registry-unavailable', httpStatus:response.status};
    }
    let metadata;
    try { metadata = await response.json(); }
    catch (error) {
      return {name, version, status:'registry-unavailable', httpStatus:200, detail:'Invalid JSON: '+error.message};
    }
    if (metadata?.name !== name || metadata?.version !== version || typeof metadata?.dist?.tarball !== 'string') {
      return {
        name, version, status:'registry-metadata-mismatch', httpStatus:200,
        actualName:metadata?.name??null,
        actualVersion:metadata?.version??null,
        tarballAvailable:typeof metadata?.dist?.tarball==='string',
      };
    }
    return {name, version, status:'published-exact', httpStatus:200, integrityAvailable:typeof metadata.dist.integrity==='string'};
  } catch (error) {
    return {
      name, version, status:'registry-unavailable',
      reason:String(error?.message??error).slice(0,220),
      causeCode:String(error?.cause?.code??error?.code??'unknown').slice(0,50),
    };
  }
}

const items = await Promise.all(packages.map(inspectVersion));
const allPublished=items.every(item=>item.status==='published-exact');
const anyUnavailable=items.some(item=>item.status==='registry-unavailable');
const report = {
  schema:'https://p2lrn.org/schema/npm-registry-readiness/1',
  checkedPublicRegistry:true,
  registry,
  checkedAt:new Date().toISOString(),
  source:'Official npm package-version metadata over HTTPS (GET /<encoded-name>/<version>)',
  status:allPublished?'all-published':anyUnavailable?'inconclusive':'publication-required',
  readyForCleanRegistryInstall:allPublished,
  publicationCheckIsInformational:!process.argv.includes('--require-published'),
  items,
};
const destination=resolve(root,'.npm-registry-report.json');
await writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

if (!allPublished && process.argv.includes('--require-published')) {
  console.error('The exact release is not verifiably available in the public npm registry.');
  process.exitCode=1;
}

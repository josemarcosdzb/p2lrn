import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const directories=['h5p-libraries','toolkit','player','studio'];
const packages=await Promise.all(directories.map(async dir=>{
  const pkg=JSON.parse(await readFile(resolve(root,'packages',dir,'package.json'),'utf8'));
  return {name:pkg.name,version:pkg.version};
}));
const versions=new Set(packages.map(p=>p.version));
if(versions.size!==1)throw new Error('The four P2LRN npm packages do not share one release version.');

async function query({name,version}){
  const identifier=name+'@'+version;
  try{
    const result=await execFileAsync('npm',['view',identifier,'version','--json','--registry=https://registry.npmjs.org','--fetch-retries=0','--fetch-timeout=10000'],{
      cwd:root,timeout:15000,maxBuffer:1024*1024,windowsHide:true,env:{...process.env,NPM_CONFIG_AUDIT:'false'},
    });
    const actual=JSON.parse(result.stdout.trim());
    return {name,version,status:actual===version?'published-exact':'unexpected-registry-version',actual};
  }catch(error){
    const stderr=String(error?.stderr??error?.message??'');
    if(/E404|404 Not Found|is not in this registry/iu.test(stderr))return {name,version,status:'not-published'};
    return {name,version,status:'registry-unavailable',detail:stderr.slice(0,340)};
  }
}
const items=await Promise.all(packages.map(query));
const report={
  checkedPublicRegistry:true,
  registry:'https://registry.npmjs.org',
  source:'npm view <scope/name>@<version> version --json',
  status:items.every(item=>item.status==='published-exact')?'all-published':items.some(item=>item.status==='registry-unavailable')?'inconclusive':'publication-required',
  readyForCleanRegistryInstall:items.every(item=>item.status==='published-exact'),
  items,
};
console.log(JSON.stringify(report,null,2));
if(report.status==='inconclusive')process.exitCode=2;

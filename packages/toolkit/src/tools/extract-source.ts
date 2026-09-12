#!/usr/bin/env node
// @ts-nocheck
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {P2LRNReader} from '../reader/index.js';
import {sha256} from '../core/integrity.js';
import {parse,printJson,req,fail,CliExit,flag,isMain} from '../cli/util.js';
export function extractPreservedSource(pkg:string,output:string):any{
  const r=new P2LRNReader(pkg,{strictProfiles:true}),report:any=r.transformationReport();if(!report)throw new Error('package has no transformation report');const source=report.source??{},path=source.preservedPath;if(!path)throw new Error('transformation report has no preservedPath');const data=r.readEmbeddedFile(path,2*1024*1024*1024),digest=sha256(data);if(digest!==source.preservedPackageDigest)throw new Error('preserved source digest mismatch');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,data);return{output,digest,preservation:source.preservation};
}
export function main(argv=process.argv.slice(2)){try{const p=parse(argv);if(flag(p,'help')){process.stdout.write('Usage: p2lrn-extract-source <package.p2lrn> <output.zip>\n');return;}printJson(extractPreservedSource(req(p.positional[0],'package'),req(p.positional[1],'output')));}catch(e){if(e instanceof CliExit)return;fail('P2LRN Extract source error',e);}}
if(isMain(import.meta.url))main();

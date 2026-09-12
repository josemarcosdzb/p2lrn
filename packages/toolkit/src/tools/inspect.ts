#!/usr/bin/env node
// @ts-nocheck
import {readFileSync} from 'node:fs';
import {P2LRNReader,CapabilitySet} from '../reader/index.js';
import {parse,flag,opt,printJson,req,fail,CliExit,isMain} from '../cli/util.js';
const td=new TextDecoder('utf-8',{fatal:true});
function printTree(node:any,prefix=''){process.stdout.write(`${prefix}${node.type}: ${node.title} [${node.id}]\n`);for(const child of node.children??[])printTree(child,prefix+'  ');}
function defaultCapabilities():URL{return new URL('../../config/capabilities.json',import.meta.url);}
export function main(argv=process.argv.slice(2)){try{const p=parse(argv);if(flag(p,'help')){process.stdout.write('Usage: p2lrn-inspect <package> [--summary] [--tree] [--plan] [--transformation] [--import-plan] [--capabilities FILE] [--mode MODE]\n');return;}const pkg=req(p.positional[0],'package'),capsPath=opt(p,'capabilities'),capsDoc=JSON.parse(td.decode(readFileSync(capsPath??defaultCapabilities()))),caps=CapabilitySet.fromDocument(capsDoc),r=new P2LRNReader(pkg,{strictProfiles:true,validateProfilePayloads:flag(p,'validate-profile-payloads')}),mode=opt(p,'mode','deliver')!;let summary=flag(p,'summary'),tree=flag(p,'tree'),plan=flag(p,'plan')||flag(p,'read-plan'),transformation=flag(p,'transformation'),importPlan=flag(p,'import-plan');if(!summary&&!tree&&!plan&&!transformation&&!importPlan)summary=tree=plan=true;if(summary)printJson(r.summary(pkg));if(tree)printTree(r.tree());if(plan)printJson(r.courseReadPlan(caps,undefined,mode));if(transformation)printJson(r.transformationReport());if(importPlan)printJson(r.importPlan(caps));}catch(e){if(e instanceof CliExit)return;fail('P2LRN Inspect error',e);}}
if(isMain(import.meta.url))main();

from __future__ import annotations

import json
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("node"), "Node.js required")
class ScormWebRuntimeTests(unittest.TestCase):
    def run_node(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "--input-type=module", "-e", script, *args],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_scorm_12_api_lifecycle_state_and_score_fields(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const seen=[];
const runtime=createScormApi({version:'1.2',learnerId:'u1',learnerName:'Learner',onChange:(state,meta)=>seen.push([state,meta])});
const api=runtime.api;
if(api.LMSGetValue('cmi.core.student_id')!=='')process.exit(2);
if(api.LMSGetLastError()!=='301')process.exit(3);
if(api.LMSInitialize('')!=='true')process.exit(4);
if(api.LMSGetValue('cmi.core.student_id')!=='u1')process.exit(5);
if(api.LMSSetValue('cmi.core.student_id','forged')!=='false'||api.LMSGetLastError()!=='403')process.exit(6);
if(api.LMSSetValue('cmi.core.score.raw','80')!=='true')process.exit(7);
if(api.LMSSetValue('cmi.core.score.max','100')!=='true')process.exit(8);
if(api.LMSSetValue('cmi.core.lesson_status','passed')!=='true')process.exit(9);
if(api.LMSCommit('')!=='true')process.exit(10);
if(api.LMSFinish('')!=='true')process.exit(11);
const snap=runtime.snapshot();
if(snap.values['cmi.core.score.raw']!=='80'||snap.values['cmi.core.lesson_status']!=='passed')process.exit(12);
if(!seen.some(([,meta])=>meta.reason==='commit')||!seen.some(([,meta])=>meta.reason==='terminate'))process.exit(13);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_scorm_2004_api_dynamic_counts_and_resume(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const runtime=createScormApi({version:'2004',initialState:{values:{'cmi.exit':'suspend','cmi.location':'page-2'}}});
const api=runtime.api;
if(api.Initialize('')!=='true')process.exit(2);
if(api.GetValue('cmi.entry')!=='resume')process.exit(3);
if(api.GetValue('cmi.location')!=='page-2')process.exit(4);
if(api.SetValue('cmi.interactions.0.id','q1')!=='true')process.exit(5);
if(api.SetValue('cmi.interactions.1.id','q2')!=='true')process.exit(6);
if(api.GetValue('cmi.interactions._count')!=='2')process.exit(7);
if(api.SetValue('cmi.progress_measure','2')!=='false'||api.GetLastError()!=='407')process.exit(8);
if(api.SetValue('cmi.completion_status','completed')!=='true')process.exit(9);
if(api.Terminate('')!=='true')process.exit(10);
if(api.GetValue('cmi.location')!==''||api.GetLastError()!=='123')process.exit(11);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_aulap2p_scorm_12_cmi_rules_are_adapted(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const runtime=createScormApi({version:'1.2',masteryScore:80});
const api=runtime.api;
if(api.LMSInitialize('')!=='true')process.exit(2);
if(api.LMSGetValue('cmi.student_data.mastery_score')!=='80')process.exit(3);
if(api.LMSSetValue('cmi.core.lesson_location','x'.repeat(256))!=='false'||api.LMSGetLastError()!=='405')process.exit(4);
if(api.LMSSetValue('cmi.suspend_data','x'.repeat(4097))!=='false'||api.LMSGetLastError()!=='405')process.exit(5);
if(api.LMSSetValue('cmi.core.session_time','01:02:03.45')!=='true')process.exit(6);
if(api.LMSSetValue('cmi.core.session_time','PT1H')!=='false'||api.LMSGetLastError()!=='405')process.exit(7);
if(api.LMSSetValue('cmi.interactions.2.id','q2')!=='true')process.exit(8);
if(api.LMSSetValue('cmi.interactions.7.id','q7')!=='true')process.exit(9);
if(api.LMSGetValue('cmi.interactions._count')!=='2')process.exit(10);
if(api.LMSSetValue('cmi.interactions.2.type','long-fill-in')!=='false'||api.LMSGetLastError()!=='405')process.exit(11);
if(api.LMSSetValue('cmi.interactions.2.type','choice')!=='true')process.exit(12);
if(api.LMSSetValue('cmi.objectives.0.id','x'.repeat(256))!=='false'||api.LMSGetLastError()!=='405')process.exit(13);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_aulap2p_scorm_2004_cmi_ranges_limits_and_dynamic_rules_are_adapted(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const runtime=createScormApi({version:'2004'});
const api=runtime.api;
if(api.Initialize('')!=='true')process.exit(2);
if(api.SetValue('cmi.progress_measure','-0.01')!=='false'||api.GetLastError()!=='407')process.exit(3);
if(api.SetValue('cmi.progress_measure','0.75')!=='true')process.exit(4);
if(api.SetValue('cmi.score.scaled','1.01')!=='false'||api.GetLastError()!=='407')process.exit(5);
if(api.SetValue('cmi.score.scaled','-1')!=='true')process.exit(6);
if(api.SetValue('cmi.session_time','PT1H2M3.5S')!=='true')process.exit(7);
if(api.SetValue('cmi.session_time','01:00:00')!=='false'||api.GetLastError()!=='406')process.exit(8);
if(api.SetValue('cmi.suspend_data','x'.repeat(64001))!=='false'||api.GetLastError()!=='407')process.exit(9);
if(api.SetValue('cmi.interactions.0.type','long-fill-in')!=='true')process.exit(10);
if(api.SetValue('cmi.interactions.0.result','wrong')!=='false'||api.GetLastError()!=='406')process.exit(11);
if(api.SetValue('cmi.interactions.0.result','incorrect')!=='true')process.exit(12);
if(api.SetValue('cmi.objectives.0.description','x'.repeat(4001))!=='false'||api.GetLastError()!=='407')process.exit(13);
if(api.SetValue('adl.nav.request','continue')!=='true')process.exit(14);
if(api.SetValue('adl.nav.request','jump')!=='false'||api.GetLastError()!=='406')process.exit(15);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_package_member_payload_reads_preserved_scorm_member(self):
        package = ROOT / "examples" / "external" / "scorm12-real.p2rln"
        script = r'''
import fs from 'node:fs';
globalThis.HTMLElement=class {};
import {openP2RLNPackageBytes} from './p2rln_reader/web/p2rln-player.js';
import {representationPayload} from './p2rln_reader/web/package-member.js';
const data=fs.readFileSync(process.argv[1]);
const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
const pkg=await openP2RLNPackageBytes(buffer);
const resource=pkg.graph.entities.find((e)=>e.type==='resource'&&e.representations?.some((r)=>r.location?.type==='package-member'));
const rep=resource.representations.find((r)=>r.location?.type==='package-member');
const payload=await representationPayload(pkg,rep);
if(payload.locationType!=='package-member')process.exit(2);
if(payload.member!=='shared/launchpage.html')process.exit(3);
if(!payload.nested.has('imsmanifest.xml'))process.exit(4);
const text=new TextDecoder().decode(await payload.read());
if(!text.includes('Course Launch Page'))process.exit(5);
'''
        result = self.run_node(script, str(package))
        self.assertEqual(0, result.returncode, result.stderr)

    def test_scorm_renderer_is_registered_ahead_of_passive_html(self):
        script = r'''
globalThis.HTMLElement=class {};
import {defaultRendererRegistry} from './p2rln_reader/web/p2rln-player.js';
const rep={id:'r',profile:'https://p2rln.org/profile/scorm',role:'primary',mediaType:'text/html',location:{type:'package-member',package:'a.zip',member:'index.html'}};
const candidate=await defaultRendererRegistry.select({representations:[rep],entity:{id:'a'},resource:{id:'r'}});
if(candidate?.descriptor?.id!=='https://p2rln.org/renderer/scorm/runtime')process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_isolated_runtime_url_requires_a_different_origin_and_keeps_route_prefix(self):
        script = r'''
import {configureRuntimeHost,getRuntimeHostConfig,resolveScormRuntimeUrl} from './p2rln_reader/web/runtime-host-config.js';
configureRuntimeHost({baseUrl:'https://runtime.example.test/runtime'});
if(getRuntimeHostConfig().baseUrl!=='https://runtime.example.test/runtime/')process.exit(2);
const url=resolveScormRuntimeUrl(null,{applicationOrigin:'https://app.example.test'});
if(url!=='https://runtime.example.test/runtime/scorm/')process.exit(3);
try{resolveScormRuntimeUrl('https://app.example.test/runtime/',{applicationOrigin:'https://app.example.test'});process.exit(4)}
catch(error){if(error.code!=='P2RLN_SCORM_RUNTIME_ORIGIN_NOT_ISOLATED')process.exit(5)}
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_isolated_runtime_shell_uses_private_message_channel_and_parent_api_bridge(self):
        source = (ROOT / "p2rln_reader" / "web" / "runtime-host" / "scorm-host.js").read_text(encoding="utf-8")
        self.assertIn("Object.defineProperty(window, name", source)
        self.assertIn("channelSend = port.postMessage.bind(port)", source)
        self.assertIn("window.opener", source)
        self.assertNotIn("location.hash", source)
        self.assertNotIn("params.get('token')", source)


    def test_aulap2p_manifest_sequencing_parser_and_linear_resolver_are_recovered(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<?xml version="1.0"?><manifest identifier="m" xmlns:imsss="http://www.imsglobal.org/xsd/imsss" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"><metadata><schemaversion>2004 4th Edition</schemaversion></metadata><organizations default="org"><organization identifier="org"><title>Course</title><item identifier="a" identifierref="ra"><title>A</title><imsss:sequencing><imsss:controlMode flow="true" choice="true"/><imsss:deliveryControls tracked="true"/><imsss:sequencingRules><imsss:preConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="attempted" operator="not"/></imsss:ruleConditions><imsss:ruleAction action="skip"/></imsss:preConditionRule><imsss:postConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="completed"/></imsss:ruleConditions><imsss:ruleAction action="continue"/></imsss:postConditionRule><imsss:exitConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="satisfied"/></imsss:ruleConditions><imsss:ruleAction action="exit"/></imsss:exitConditionRule></imsss:sequencingRules><imsss:rollupRules><imsss:rollupRule childActivitySet="all"/></imsss:rollupRules></imsss:sequencing></item><item identifier="hidden" identifierref="rh" isvisible="false"><title>Hidden</title></item><item identifier="b" identifierref="rb"><title>B</title></item></organization></organizations><resources><resource identifier="ra" href="a.html" adlcp:scormType="sco"/><resource identifier="rh" href="hidden.html" adlcp:scormType="sco"/><resource identifier="rb" href="b.html" adlcp:scormType="sco"/></resources></manifest>`;
const manifest=parseScormManifest(xml);
if(manifest.version!=='2004'||manifest.defaultOrganization!=='org')process.exit(2);
const parsed=manifest.organizations[0].raw.sequencing;
if(parsed.controlMode.flow!=='true'||parsed.deliveryControls.tracked!=='true')process.exit(3);
if(parsed.rules.length!==3||parsed.rules[0].type!=='preCondition'||parsed.rules[0].action!=='skip')process.exit(4);
if(parsed.rollupRules.length!==1)process.exit(5);
const seq=createScorm2004Sequencer(manifest,{launchMember:'a.html'});
if(seq.requestValid('adl.nav.request_valid.continue')!=='true')process.exit(6);
if(seq.requestValid('adl.nav.request_valid.previous')!=='false')process.exit(7);
if(seq.requestValid('adl.nav.request_valid.choice.{target=hidden}')!=='false')process.exit(8);
if(seq.state().requestValid['adl.nav.request_valid.jump.{target=b}']!=='true')process.exit(12);
const next=seq.navigate('continue');
if(next.targetItemIdentifier!=='b'||next.targetMember!=='b.html')process.exit(9);
const previous=seq.navigate('previous');
if(previous.targetItemIdentifier!=='a')process.exit(10);
const choice=seq.navigate('choice{target=b}');
if(choice.targetItemIdentifier!=='b')process.exit(11);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_scorm_2004_request_valid_and_navigation_fire_after_terminate(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const requests=[];
const runtime=createScormApi({version:'2004',requestValid:{'adl.nav.request_valid.continue':'true','adl.nav.request_valid.previous':'false'},onNavigationRequest:(request,state)=>requests.push([request,state])});
const api=runtime.api;
if(api.Initialize('')!=='true')process.exit(2);
if(api.GetValue('adl.nav.request_valid.continue')!=='true')process.exit(3);
if(api.GetValue('adl.nav.request_valid.previous')!=='false')process.exit(4);
if(api.SetValue('adl.nav.request_valid.continue','false')!=='false'||api.GetLastError()!=='404')process.exit(5);
if(api.SetValue('adl.nav.request','choice{target=lesson-b}')!=='true')process.exit(6);
if(requests.length!==0)process.exit(7);
if(api.Commit('')!=='true'||requests.length!==0)process.exit(8);
if(api.Terminate('')!=='true')process.exit(9);
if(requests.length!==1||requests[0][0]!=='choice{target=lesson-b}')process.exit(10);
if(requests[0][1].reason!=='terminate')process.exit(11);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_scorm_renderer_wires_sequencer_to_both_runtime_topologies(self):
        source = (ROOT / "p2rln_reader" / "web" / "renderers" / "scorm-runtime.js").read_text(encoding="utf-8")
        host = (ROOT / "p2rln_reader" / "web" / "runtime-host" / "scorm-host.js").read_text(encoding="utf-8")
        self.assertIn("createScorm2004Sequencer", source)
        self.assertIn("action === 'navigation-request'", source)
        self.assertIn("action:'navigate'", source)
        self.assertIn("onNavigationRequest", host)
        self.assertIn("data.action === 'navigate'", host)

    def test_alpha15_rollup_parser_preserves_conditions_thresholds_and_action(self):
        script = r'''
import {parseScormManifest} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="http://www.imsglobal.org/xsd/imsss"><metadata><schemaversion>2004 4th Edition</schemaversion></metadata><organizations><organization identifier="org"><item identifier="cluster"><imsss:sequencing><imsss:rollupRules rollupProgressCompletion="true"><imsss:rollupRule childActivitySet="atLeastPercent" minimumPercent="0.5"><imsss:rollupConditions conditionCombination="all"><imsss:rollupCondition condition="completed"/><imsss:rollupCondition operator="not" condition="satisfied"/></imsss:rollupConditions><imsss:rollupAction action="completed"/></imsss:rollupRule></imsss:rollupRules></imsss:sequencing></item></organization></organizations><resources/></manifest>`;
const seq=parseScormManifest(xml).organizations[0].raw.sequencing;
const rule=seq.rollupRules[0];
if(rule.childActivitySet!=='atLeastPercent'||rule.minimumPercent!==0.5)process.exit(2);
if(rule.conditionCombination!=='all'||rule.conditions.length!==2||rule.conditions[1].operator!=='not')process.exit(3);
if(rule.action!=='completed'||seq.rollupControls.rollupProgressCompletion!=='true')process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_hierarchical_flow_skips_non_launchable_cluster_nodes(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></item><item identifier="c" identifierref="rc"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/><resource identifier="rc" href="c.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
let r=seq.navigate('continue'); if(r.targetItemIdentifier!=='b')process.exit(2);
r=seq.navigate('continue'); if(r.targetItemIdentifier!=='c')process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_precondition_skip_removes_activity_from_flow(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"/><item identifier="skip" identifierref="rs"><imsss:sequencing><imsss:sequencingRules><imsss:preConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="always"/></imsss:ruleConditions><imsss:ruleAction action="skip"/></imsss:preConditionRule></imsss:sequencingRules></imsss:sequencing></item><item identifier="b" identifierref="rb"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rs" href="skip.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
const r=seq.navigate('continue'); if(r.targetItemIdentifier!=='b')process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_precondition_disabled_blocks_choice_target(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"><imsss:sequencing><imsss:sequencingRules><imsss:preConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="always"/></imsss:ruleConditions><imsss:ruleAction action="disabled"/></imsss:preConditionRule></imsss:sequencingRules></imsss:sequencing></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
if(seq.requestValid('adl.nav.request_valid.choice.{target=b}')!=='false')process.exit(2);
if(!seq.navigate('choice{target=b}').blocked)process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_hidden_from_choice_remains_flow_navigable(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"><imsss:sequencing><imsss:sequencingRules><imsss:preConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="always"/></imsss:ruleConditions><imsss:ruleAction action="hiddenFromChoice"/></imsss:preConditionRule></imsss:sequencingRules></imsss:sequencing></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
if(seq.requestValid('adl.nav.request_valid.choice.{target=b}')!=='false')process.exit(2);
if(seq.navigate('continue').targetItemIdentifier!=='b')process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_postcondition_continue_overrides_none_after_termination(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"><imsss:sequencing><imsss:sequencingRules><imsss:postConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="completed"/></imsss:ruleConditions><imsss:ruleAction action="continue"/></imsss:postConditionRule></imsss:sequencingRules></imsss:sequencing></item><item identifier="b" identifierref="rb"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
const r=seq.navigate('_none',{values:{'cmi.completion_status':'completed'}});
if(r.ruleAction!=='continue'||r.targetItemIdentifier!=='b'||r.terminal)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_postcondition_retry_starts_a_new_attempt(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"><imsss:sequencing><imsss:sequencingRules><imsss:postConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="completed" operator="not"/></imsss:ruleConditions><imsss:ruleAction action="retry"/></imsss:postConditionRule></imsss:sequencingRules></imsss:sequencing></item></organization></organizations><resources><resource identifier="ra" href="a.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
const r=seq.navigate('_none',{values:{'cmi.completion_status':'incomplete'}});
if(r.ruleAction!=='retry'||r.targetItemIdentifier!=='a')process.exit(2);
if(seq.state().tracking.a.attemptCount!==2)process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_exit_parent_closes_only_the_current_cluster(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization identifier="org"><item identifier="cluster"><item identifier="a" identifierref="ra"><imsss:sequencing><imsss:sequencingRules><imsss:postConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="completed"/></imsss:ruleConditions><imsss:ruleAction action="exitParent"/></imsss:postConditionRule></imsss:sequencingRules></imsss:sequencing></item><item identifier="inside" identifierref="ri"/></item><item identifier="outside" identifierref="ro"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="ri" href="inside.html"/><resource identifier="ro" href="outside.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
const r=seq.navigate('_none',{values:{'cmi.completion_status':'completed'}});
if(r.ruleAction!=='continue'||r.targetItemIdentifier!=='outside')process.exit(2);
const state=seq.state().tracking;
if(state.cluster.active||state.a.active||state.outside.attemptCount!==1)process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_exit_condition_bubbles_one_cluster_without_closing_sibling_branch(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><imsss:sequencing><imsss:sequencingRules><imsss:exitConditionRule><imsss:ruleConditions><imsss:ruleCondition condition="completed"/></imsss:ruleConditions><imsss:ruleAction action="exit"/></imsss:exitConditionRule></imsss:sequencingRules></imsss:sequencing><item identifier="a" identifierref="ra"/></item><item identifier="b" identifierref="rb"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
seq.updateTracking({values:{'cmi.completion_status':'completed'}},'cluster');
const r=seq.navigate('continue',{values:{'cmi.completion_status':'completed'}});
if(r.targetItemIdentifier!=='b')process.exit(2);
if(seq.state().tracking.cluster.active)process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_suspend_all_marks_active_path_suspended(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><item identifier="a" identifierref="ra"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
const r=seq.navigate('suspendAll',{values:{'cmi.completion_status':'incomplete'}});
const t=seq.state().tracking;
if(!r.terminal||!r.suspended||!t.cluster.suspended||!t.a.suspended||t.a.active)process.exit(2);
if(seq.serialize().suspendedActivityIdentifier!=='a')process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_suspend_all_resume_does_not_increment_attempt(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><item identifier="a" identifierref="ra"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/></resources></manifest>`;
const manifest=parseScormManifest(xml);
const first=createScorm2004Sequencer(manifest,{launchMember:'a.html'});
first.navigate('suspendAll',{values:{'cmi.completion_status':'incomplete'}});
const saved=first.serialize();
const resumed=createScorm2004Sequencer(manifest,{launchMember:'a.html',sequencingState:saved});
const t=resumed.state().tracking;
if(t.a.attemptCount!==1||t.cluster.attemptCount!==1||!t.a.active||t.a.suspended)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_non_suspended_reentry_increments_attempt_and_keeps_previous_progress(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
seq.navigate('continue',{values:{'cmi.completion_status':'completed','cmi.progress_measure':'1'}});
seq.navigate('choice{target=a}',{values:{'cmi.completion_status':'completed'}});
const a=seq.state().tracking.a;
if(a.attemptCount!==2||a.attemptProgressStatus||a.previousAttempt?.attemptCompletionStatus!==true)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_rollup_all_completed_marks_parent_completed(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><imsss:sequencing><imsss:rollupRules><imsss:rollupRule childActivitySet="all"><imsss:rollupConditions><imsss:rollupCondition condition="completed"/></imsss:rollupConditions><imsss:rollupAction action="completed"/></imsss:rollupRule></imsss:rollupRules></imsss:sequencing><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
seq.navigate('continue',{values:{'cmi.completion_status':'completed'}});
seq.updateTracking({values:{'cmi.completion_status':'completed'}},'b');
const c=seq.state().tracking.cluster;
if(!c.attemptProgressStatus||!c.attemptCompletionStatus)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_rollup_at_least_percent_applies_threshold(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><imsss:sequencing><imsss:rollupRules><imsss:rollupRule childActivitySet="atLeastPercent" minimumPercent="0.5"><imsss:rollupConditions><imsss:rollupCondition condition="satisfied"/></imsss:rollupConditions><imsss:rollupAction action="satisfied"/></imsss:rollupRule></imsss:rollupRules></imsss:sequencing><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const seq=createScorm2004Sequencer(parseScormManifest(xml),{launchMember:'a.html'});
seq.updateTracking({values:{'cmi.success_status':'passed'}},'a');
const c=seq.state().tracking.cluster;
if(!c.objectiveProgressStatus||!c.objectiveSatisfiedStatus)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_use_current_attempt_progress_true_ignores_previous_attempt(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><imsss:sequencing><imsss:controlMode useCurrentAttemptProgressInfo="true"/><imsss:rollupRules><imsss:rollupRule childActivitySet="all"><imsss:rollupConditions><imsss:rollupCondition condition="completed"/></imsss:rollupConditions><imsss:rollupAction action="completed"/></imsss:rollupRule></imsss:rollupRules></imsss:sequencing><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const manifest=parseScormManifest(xml);
const saved={currentItemIdentifier:'a',tracking:{cluster:{attemptCount:1,active:true},a:{attemptCount:2,active:true,previousAttempt:{attemptProgressStatus:true,attemptCompletionStatus:true}},b:{attemptCount:1,attemptProgressStatus:true,attemptCompletionStatus:true}}};
const seq=createScorm2004Sequencer(manifest,{launchMember:'a.html',sequencingState:saved});
seq.updateTracking({values:{}},'a');
if(seq.state().tracking.cluster.attemptCompletionStatus)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_use_current_attempt_progress_false_reuses_previous_attempt_for_rollup(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest xmlns:imsss="y"><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><imsss:sequencing><imsss:controlMode useCurrentAttemptProgressInfo="false"/><imsss:rollupRules><imsss:rollupRule childActivitySet="all"><imsss:rollupConditions><imsss:rollupCondition condition="completed"/></imsss:rollupConditions><imsss:rollupAction action="completed"/></imsss:rollupRule></imsss:rollupRules></imsss:sequencing><item identifier="a" identifierref="ra"/><item identifier="b" identifierref="rb"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/><resource identifier="rb" href="b.html"/></resources></manifest>`;
const manifest=parseScormManifest(xml);
const saved={currentItemIdentifier:'a',tracking:{cluster:{attemptCount:1,active:true},a:{attemptCount:2,active:true,previousAttempt:{attemptProgressStatus:true,attemptCompletionStatus:true}},b:{attemptCount:1,attemptProgressStatus:true,attemptCompletionStatus:true}}};
const seq=createScorm2004Sequencer(manifest,{launchMember:'a.html',sequencingState:saved});
seq.updateTracking({values:{}},'a');
const c=seq.state().tracking.cluster;
if(!c.attemptProgressStatus||!c.attemptCompletionStatus)process.exit(2);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_sequencing_state_serializes_and_restores_attempt_tree(self):
        script = r'''
import {parseScormManifest,createScorm2004Sequencer} from './p2rln_reader/web/scorm2004-sequencing.js';
const xml=`<manifest><metadata><schemaversion>2004</schemaversion></metadata><organizations><organization><item identifier="cluster"><item identifier="a" identifierref="ra"/></item></organization></organizations><resources><resource identifier="ra" href="a.html"/></resources></manifest>`;
const manifest=parseScormManifest(xml);
const first=createScorm2004Sequencer(manifest,{launchMember:'a.html'});
first.updateTracking({values:{'cmi.completion_status':'incomplete','cmi.progress_measure':'0.4','cmi.success_status':'passed'}},'a');
const saved=first.serialize();
const second=createScorm2004Sequencer(manifest,{launchMember:'a.html',sequencingState:saved});
const a=second.state().tracking.a;
if(a.attemptCount!==1||a.attemptCompletionAmount!==0.4||!a.objectiveSatisfiedStatus)process.exit(2);
if(second.serialize().schema!=='https://p2rln.org/schema/scorm2004-sequencing-state/1')process.exit(3);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)

    def test_alpha15_scorm_runtime_emits_none_navigation_on_terminate_for_manifest_rules(self):
        script = r'''
import {createScormApi} from './p2rln_reader/web/scorm-runtime-core.js';
const requests=[];
const runtime=createScormApi({version:'2004',onNavigationRequest:(request,state)=>requests.push([request,state.reason])});
if(runtime.api.Initialize('')!=='true')process.exit(2);
if(runtime.api.Terminate('')!=='true')process.exit(3);
if(requests.length!==1||requests[0][0]!=='_none'||requests[0][1]!=='terminate')process.exit(4);
'''
        result = self.run_node(script)
        self.assertEqual(0, result.returncode, result.stderr)


if __name__ == "__main__":
    unittest.main()

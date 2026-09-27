import test from 'node:test';
import assert from 'node:assert/strict';
import {createScorm2004Sequencer,parseNavigationRequest,parseScormManifest} from '../web/scorm2004-sequencing.js';

function manifestXml({postAction=null}={}){
  const post=postAction?`
    <imsss:sequencingRules>
      <imsss:postConditionRule>
        <imsss:ruleConditions conditionCombination="all"><imsss:ruleCondition condition="completed"/></imsss:ruleConditions>
        <imsss:ruleAction action="${postAction}"/>
      </imsss:postConditionRule>
    </imsss:sequencingRules>`:'';
  return `<?xml version="1.0"?>
<manifest identifier="m" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3" xmlns:imsss="http://www.imsglobal.org/xsd/imsss">
  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="org"><organization identifier="org"><title>SCORM 2004 gate</title>
    <item identifier="cluster"><title>Cluster</title>
      <imsss:sequencing>
        <imsss:controlMode choice="true" flow="true"/>
        <imsss:rollupRules>
          <imsss:rollupRule childActivitySet="atLeastCount" minimumCount="2">
            <imsss:rollupConditions conditionCombination="all"><imsss:rollupCondition condition="completed"/></imsss:rollupConditions>
            <imsss:rollupAction action="completed"/>
          </imsss:rollupRule>
        </imsss:rollupRules>
      </imsss:sequencing>
      <item identifier="item1" identifierref="r1"><title>One</title><imsss:sequencing>${post}</imsss:sequencing></item>
      <item identifier="skip" identifierref="rSkip"><title>Skip</title>
        <imsss:sequencing><imsss:sequencingRules><imsss:preConditionRule>
          <imsss:ruleConditions><imsss:ruleCondition condition="always"/></imsss:ruleConditions>
          <imsss:ruleAction action="skip"/>
        </imsss:preConditionRule></imsss:sequencingRules></imsss:sequencing>
      </item>
      <item identifier="item2" identifierref="r2"><title>Two</title></item>
    </item>
    <item identifier="after" identifierref="rAfter"><title>After cluster</title></item>
  </organization></organizations>
  <resources>
    <resource identifier="r1" adlcp:scormType="sco" href="one.html"/>
    <resource identifier="rSkip" adlcp:scormType="sco" href="skip.html"/>
    <resource identifier="r2" adlcp:scormType="sco" href="two.html"/>
    <resource identifier="rAfter" adlcp:scormType="sco" href="after.html"/>
  </resources>
</manifest>`;
}
function completed(){
  return{values:{'cmi.completion_status':'completed','cmi.progress_measure':'1','cmi.success_status':'passed','cmi.score.scaled':'1'}};
}

test('SCORM 2004 parser preserves version, hierarchy and sequencing rules',()=>{
  const manifest=parseScormManifest(manifestXml());
  assert.equal(manifest.version,'2004');
  assert.equal(manifest.title,'SCORM 2004 gate');
  assert.equal(manifest.organizations[0].identifier,'cluster');
  assert.equal(manifest.organizations[0].children.length,3);
  const cluster=manifest.organizations[0];
  assert.equal(cluster.raw.sequencing.controlMode.flow,'true');
  assert.equal(cluster.raw.sequencing.rollupRules[0].childActivitySet,'atLeastCount');
  assert.equal(cluster.raw.sequencing.rollupRules[0].minimumCount,2);
  assert.equal(cluster.children[1].raw.sequencing.rules[0].action,'skip');
});

test('SCORM 2004 flow skips precondition skip activities and supports previous/choice/jump',()=>{
  const manifest=parseScormManifest(manifestXml());
  const seq=createScorm2004Sequencer(manifest,{launchMember:'one.html'});
  assert.equal(seq.currentItemIdentifier,'item1');
  assert.equal(seq.requestValid('adl.nav.request_valid.continue'),'true');
  assert.equal(seq.requestValid('adl.nav.request_valid.previous'),'false');
  assert.equal(seq.requestValid('adl.nav.request_valid.choice.{target=item2}'),'true');

  const next=seq.navigate('continue',completed());
  assert.equal(next.blocked,false);
  assert.equal(next.targetItemIdentifier,'item2');
  assert.equal(next.targetMember,'two.html');
  assert.equal(seq.requestValid('adl.nav.request_valid.previous'),'true');

  const previous=seq.navigate('previous',completed());
  assert.equal(previous.targetItemIdentifier,'item1');
  assert.equal(previous.targetMember,'one.html');

  const choice=seq.navigate('choice{target=item2}',completed());
  assert.equal(choice.targetItemIdentifier,'item2');
  const jump=seq.navigate('jump{target=after}',completed());
  assert.equal(jump.targetItemIdentifier,'after');
});

test('SCORM 2004 atLeastCount rollup marks the parent completed after two completed children',()=>{
  const manifest=parseScormManifest(manifestXml());
  const seq=createScorm2004Sequencer(manifest,{launchMember:'one.html'});
  seq.navigate('continue',completed());
  let state=seq.state();
  assert.equal(state.tracking.cluster.attemptCompletionStatus,false);
  seq.updateTracking(completed(),'item2');
  state=seq.state();
  assert.equal(state.tracking.cluster.attemptProgressStatus,true);
  assert.equal(state.tracking.cluster.attemptCompletionStatus,true);
});

test('SCORM 2004 suspendAll serializes state and resumes without incrementing attempt count',()=>{
  const manifest=parseScormManifest(manifestXml());
  const first=createScorm2004Sequencer(manifest,{launchMember:'one.html'});
  assert.equal(first.state().tracking.item1.attemptCount,1);
  const suspended=first.navigate('suspendAll',completed());
  assert.equal(suspended.terminal,true);
  assert.equal(suspended.suspended,true);
  const saved=first.serialize();
  assert.equal(saved.suspendedActivityIdentifier,'item1');
  assert.equal(saved.tracking.item1.suspended,true);

  const resumed=createScorm2004Sequencer(manifest,{launchMember:'one.html',sequencingState:saved});
  const state=resumed.state();
  assert.equal(state.currentItemIdentifier,'item1');
  assert.equal(state.suspendedActivityIdentifier,null);
  assert.equal(state.tracking.item1.attemptCount,1);
  assert.equal(state.tracking.item1.active,true);
  assert.equal(state.tracking.item1.suspended,false);
});

test('SCORM 2004 post-condition retry starts a new attempt on the same SCO',()=>{
  const manifest=parseScormManifest(manifestXml({postAction:'retry'}));
  const seq=createScorm2004Sequencer(manifest,{launchMember:'one.html'});
  const result=seq.navigate('_none',completed());
  assert.equal(result.ruleAction,'retry');
  assert.equal(result.targetItemIdentifier,'item1');
  assert.equal(result.targetMember,'one.html');
  const state=seq.state().tracking.item1;
  assert.equal(state.attemptCount,2);
  assert.equal(state.previousAttempt.attemptCompletionStatus,true);
});

test('SCORM 2004 post-condition exitParent closes the cluster and continues after it',()=>{
  const manifest=parseScormManifest(manifestXml({postAction:'exitParent'}));
  const seq=createScorm2004Sequencer(manifest,{launchMember:'one.html'});
  const result=seq.navigate('_none',completed());
  assert.equal(result.ruleAction,'continue');
  assert.equal(result.targetItemIdentifier,'after');
  assert.equal(result.targetMember,'after.html');
  const state=seq.state();
  assert.equal(state.tracking.cluster.active,false);
  assert.equal(state.tracking.item1.active,false);
});

test('SCORM 2004 navigation request parser rejects malformed targets',()=>{
  assert.deepEqual(parseNavigationRequest('choice{target=item2}'),{request:'choice',target:'item2'});
  assert.deepEqual(parseNavigationRequest('jump{target=after}'),{request:'jump',target:'after'});
  assert.equal(parseNavigationRequest('choice').request,'choice');
  assert.equal(parseNavigationRequest('choice{bad=item2}').request,'invalid');
});

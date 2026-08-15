import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_VTUBER_PUBLIC_CONTEXT_CONTRACT,
  preparePublicStreamInteractionContext,
} from '../browser/partner-vtuber-public-context-core.mjs';

const event = (overrides = {}) => ({
  schema: 'gr.partner.stream-event.v1',
  dataClass: 'prototype_local',
  sourceType: 'textMessageEvent',
  sourceMessageId: 'msg-1',
  text: 'public chat',
  speakCandidate: true,
  ...overrides,
});

const memories = () => [
  {id:'pub-1',kind:'shared_episode',text:'public raw text',visibility:'public',source:'stream-008',confidence:'verified',status:'active'},
  {id:'private-1',kind:'private_reference',text:'secret nickname',nickname:'secret nickname',visibility:'private',source:'session-012',confidence:'verified',status:'active'},
  {id:'unknown-1',kind:'shared_episode',text:'unknown visibility',visibility:'friends',source:'session-013',confidence:'verified',status:'active'},
  {id:'missing-1',kind:'shared_episode',text:'missing visibility',source:'session-014',confidence:'verified',status:'active'},
  {id:'unverified-1',kind:'shared_episode',text:'tentative',visibility:'public',source:'stream-009',confidence:'tentative',status:'active'},
  {id:'nosource-1',kind:'shared_episode',text:'no source',visibility:'public',source:'',confidence:'verified',status:'active'},
  {id:'expired-1',kind:'shared_episode',text:'expired',visibility:'public',source:'stream-010',confidence:'verified',status:'expired'},
];

test('contract points at predecessor schemas without claiming a new plan schema', () => {
  assert.deepEqual(PARTNER_VTUBER_PUBLIC_CONTEXT_CONTRACT, {
    streamEventSchema:'gr.partner.stream-event.v1',
    dataClass:'prototype_local',
    targetPlanSchema:'gr.partner.interaction-plan.v1',
    audienceMode:'public_stream',
    formalPersonaAuthority:'formal_persona_required',
  });
});

test('only evidenced active public memory refs are admitted', () => {
  const out = preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:memories()});
  assert.deepEqual(out.allowedMemoryRefs,[{id:'pub-1',kind:'shared_episode',source:'stream-008',visibility:'public'}]);
  assert.deepEqual(out.forbiddenMemoryRefs,['private-1','unknown-1','missing-1','unverified-1','nosource-1','expired-1']);
});

test('private nickname and raw private memory text never appear in output', () => {
  const out = preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:memories()});
  const json = JSON.stringify(out);
  assert.ok(!json.includes('secret nickname'));
  assert.ok(!json.includes('unknown visibility'));
  assert.ok(!json.includes('missing visibility'));
});

test('memory payload is reference-only even when public', () => {
  const out = preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:memories()});
  assert.ok(!('text' in out.allowedMemoryRefs[0]));
  assert.ok(!JSON.stringify(out.allowedMemoryRefs).includes('public raw text'));
});

test('support amount cannot alter relationship, intimacy, privilege, or output priority', () => {
  const low = preparePublicStreamInteractionContext({streamEvent:event({sourceType:'superChatEvent',amountMicros:1000}),memoryRefs:[]});
  const high = preparePublicStreamInteractionContext({streamEvent:event({sourceType:'superChatEvent',amountMicros:999999999999}),memoryRefs:[]});
  assert.deepEqual(low,high);
  assert.deepEqual(low.relationshipDelta,{});
  assert.equal(low.monetizationHandling.commerceIsRelationshipScore,false);
  assert.equal(low.monetizationHandling.amountChangesIntimacy,false);
  assert.equal(low.monetizationHandling.spenderGetsPrivatePrivilege,false);
  assert.ok(!('priority' in low));
});

test('normalized source types map to interaction-plan-compatible event kinds', () => {
  assert.equal(preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:[]}).event.type,'chat');
  assert.equal(preparePublicStreamInteractionContext({streamEvent:event({sourceType:'giftEvent'}),memoryRefs:[]}).event.type,'super_chat');
  assert.equal(preparePublicStreamInteractionContext({streamEvent:event({sourceType:'memberMilestoneChatEvent'}),memoryRefs:[]}).event.type,'membership');
  assert.equal(preparePublicStreamInteractionContext({streamEvent:event({sourceType:'futureEvent'}),memoryRefs:[]}).event.type,'unknown');
  assert.equal(preparePublicStreamInteractionContext({streamEvent:event({sourceType:'textMessageEvent',speakCandidate:false}),memoryRefs:[]}).event.type,'unknown');
});

test('schema and dataClass mismatches fail closed', () => {
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event({schema:'bad'}),memoryRefs:[]}),/schema/);
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event({dataClass:'production'}),memoryRefs:[]}),/dataClass/);
});

test('missing provenance fails closed', () => {
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event({sourceMessageId:''}),memoryRefs:[]}),/sourceMessageId/);
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event({sourceType:''}),memoryRefs:[]}),/sourceType/);
});

test('invalid memory entries and duplicate ids fail closed', () => {
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:[null]}),/entries/);
  assert.throws(()=>preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:[{id:'x',visibility:'private'},{id:'x',visibility:'public'}]}),/duplicate/);
});

test('stream event is whitelisted and does not forward arbitrary private fields', () => {
  const out = preparePublicStreamInteractionContext({streamEvent:event({privateToken:'do-not-copy',authorPrivateNote:'secret'}),memoryRefs:[]});
  const json=JSON.stringify(out);
  assert.ok(!json.includes('do-not-copy'));
  assert.ok(!json.includes('authorPrivateNote'));
});

test('input objects are not mutated and output is deterministic and deeply frozen', () => {
  const e=event(); const m=memories(); const beforeE=JSON.stringify(e); const beforeM=JSON.stringify(m);
  const a=preparePublicStreamInteractionContext({streamEvent:e,memoryRefs:m});
  const b=preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:memories()});
  assert.equal(JSON.stringify(e),beforeE); assert.equal(JSON.stringify(m),beforeM);
  assert.deepEqual(a,b);
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.event)); assert.ok(Object.isFrozen(a.allowedMemoryRefs)); assert.ok(Object.isFrozen(a.allowedMemoryRefs[0]));
});

test('bridge remains planning-only and never auto-publishes or mutates game state', () => {
  const out=preparePublicStreamInteractionContext({streamEvent:event(),memoryRefs:[]});
  assert.equal(out.formalPersonaAuthority,'formal_persona_required');
  assert.equal(out.automaticPublish,false);
  assert.equal(out.automaticGameChange,false);
});

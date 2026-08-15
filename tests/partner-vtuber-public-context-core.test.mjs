import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_VTUBER_PUBLIC_CONTEXT_CONTRACT,
  PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT,
  preparePublicStreamInteractionContext,
  createPublicStreamTransportState,
  updatePublicStreamTransportConnection,
  receivePublicStreamTransportEvent,
  pollPublicStreamTransportEvent,
  flushPublicStreamTransportQueue,
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

const transport = (overrides = {}) => createPublicStreamTransportState({
  sessionId:'stream-session-1',
  connected:true,
  authenticated:true,
  cursor:'cursor-0',
  retryBaseMs:100,
  retryMaxMs:400,
  ...overrides,
});

const envelope = (overrides = {}) => ({
  sessionId:'stream-session-1',
  deliveryId:'delivery-1',
  sequence:0,
  cursor:'cursor-1',
  streamEvent:event(),
  ...overrides,
});

function acceptedState(state = transport(), overrides = {}, memoryRefs = []) {
  const result = receivePublicStreamTransportEvent({state,envelope:envelope(overrides),memoryRefs});
  assert.equal(result.status,'accepted');
  return result.state;
}

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

test('transport contract owns no OAuth, credential values, persona, publishing, or game change', () => {
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.stateSchema,'gr.partner.public-transport-state.v1');
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.authenticationAuthority,'caller_supplied');
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.ownsCredentialValues,false);
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.ownsOAuth,false);
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.ownsFormalPersona,false);
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.automaticPublish,false);
  assert.equal(PARTNER_VTUBER_NONSECRET_TRANSPORT_CONTRACT.automaticGameChange,false);
});

test('transport state reports authentication as caller-supplied, never service-verified', () => {
  const state=transport();
  assert.equal(state.authenticationAuthority,'caller_supplied');
  assert.equal(state.authenticated,true);
  assert.ok(!('serviceVerified' in state));
  assert.deepEqual(state.queue,[]);
  assert.equal(Object.isFrozen(state),true);
});

test('disconnected and unauthenticated transport fail closed without consuming events', () => {
  const disconnected=receivePublicStreamTransportEvent({state:transport({connected:false}),envelope:envelope()});
  assert.equal(disconnected.reason,'TRANSPORT_DISCONNECTED');
  assert.equal(disconnected.state.lastSequence,-1);
  const unauth=receivePublicStreamTransportEvent({state:transport({authenticated:false}),envelope:envelope()});
  assert.equal(unauth.reason,'TRANSPORT_UNAUTHENTICATED');
  assert.equal(unauth.state.lastSequence,-1);
});

test('accepted event queues only public-safe whitelisted payload and reports sensitive field redaction count', () => {
  const e=envelope({
    authorization:'Bearer secret-value',
    cookie:'session=secret-cookie',
    streamEvent:event({privateToken:'token-value',authorPrivateNote:'do-not-copy'}),
  });
  const result=receivePublicStreamTransportEvent({state:transport(),envelope:e,memoryRefs:memories()});
  assert.equal(result.status,'accepted');
  assert.ok(result.redactedSensitiveFieldCount>=3);
  const json=JSON.stringify(result);
  for (const forbidden of ['secret-value','secret-cookie','token-value','do-not-copy','secret nickname','private-1']) {
    assert.ok(!json.includes(forbidden),forbidden);
  }
  assert.equal(result.payload.event.text,'public chat');
  assert.deepEqual(result.payload.allowedMemoryRefs,[{id:'pub-1',kind:'shared_episode',source:'stream-008',visibility:'public'}]);
  assert.ok(!('forbiddenMemoryRefs' in result.payload));
  assert.equal(result.payload.automaticPublish,false);
  assert.equal(result.payload.automaticGameChange,false);
  assert.deepEqual(result.payload.relationshipDelta,{});
  assert.ok(!('characterUtterance' in result.payload));
});

test('unknown schema is rejected without leaking rejected event fields', () => {
  const result=receivePublicStreamTransportEvent({
    state:transport(),
    envelope:envelope({streamEvent:event({schema:'future-secret-schema',authorization:'Bearer should-not-echo'})}),
  });
  assert.equal(result.reason,'PUBLIC_CONTEXT_REJECTED');
  assert.ok(!JSON.stringify(result).includes('should-not-echo'));
});

test('foreign session is rejected', () => {
  const result=receivePublicStreamTransportEvent({state:transport(),envelope:envelope({sessionId:'other-session'})});
  assert.equal(result.reason,'TRANSPORT_SESSION_MISMATCH');
  assert.equal(result.state.lastSequence,-1);
});

test('duplicate delivery id is idempotent and never grows queue twice', () => {
  const first=receivePublicStreamTransportEvent({state:transport(),envelope:envelope()});
  const second=receivePublicStreamTransportEvent({state:first.state,envelope:envelope({sequence:1,cursor:'cursor-2'})});
  assert.equal(second.status,'duplicate');
  assert.equal(second.state.queue.length,1);
  assert.equal(second.state.lastSequence,0);
  assert.equal(second.state.cursor,'cursor-1');
});

test('late or out-of-order sequence is rejected even after seen-id window moves', () => {
  const state=acceptedState(transport({maxSeen:1}));
  const next=receivePublicStreamTransportEvent({state,envelope:envelope({deliveryId:'delivery-2',sequence:2,cursor:'cursor-2'})});
  assert.equal(next.status,'accepted');
  const late=receivePublicStreamTransportEvent({state:next.state,envelope:envelope({deliveryId:'delivery-old',sequence:1,cursor:'cursor-old'})});
  assert.equal(late.reason,'TRANSPORT_LATE_OR_OUT_OF_ORDER');
  assert.equal(late.state.cursor,'cursor-2');
});

test('same sequence with a different delivery id is rejected as non-advancing', () => {
  const state=acceptedState();
  const same=receivePublicStreamTransportEvent({state,envelope:envelope({deliveryId:'delivery-other',sequence:0,cursor:'cursor-other'})});
  assert.equal(same.reason,'TRANSPORT_LATE_OR_OUT_OF_ORDER');
  assert.equal(same.state.queue.length,1);
  assert.equal(same.state.cursor,'cursor-1');
});

test('queue is bounded and fails closed rather than dropping an accepted event', () => {
  const first=receivePublicStreamTransportEvent({state:transport({maxQueue:1}),envelope:envelope()});
  const full=receivePublicStreamTransportEvent({state:first.state,envelope:envelope({deliveryId:'delivery-2',sequence:1,cursor:'cursor-2'})});
  assert.equal(full.reason,'TRANSPORT_QUEUE_FULL');
  assert.equal(full.state.queue.length,1);
  assert.equal(full.state.lastSequence,0);
});

test('disconnect and reconnect preserve queued event and cursor without fabricating delivery', () => {
  const queued=acceptedState();
  const disconnected=updatePublicStreamTransportConnection(queued,{connected:false,authenticated:false});
  assert.equal(disconnected.cursor,'cursor-1');
  assert.equal(disconnected.queue.length,1);
  const reconnected=updatePublicStreamTransportConnection(disconnected,{connected:true,authenticated:true});
  assert.equal(reconnected.cursor,'cursor-1');
  assert.equal(reconnected.queue.length,1);
  assert.equal(reconnected.lastSequence,0);
});

test('poll passes only session and cursor to caller receive and accepts returned public event', async () => {
  let request=null;
  const result=await pollPublicStreamTransportEvent({
    state:transport(),
    receive:async (input)=>{request=input; return envelope();},
  });
  assert.deepEqual(request,{sessionId:'stream-session-1',cursor:'cursor-0'});
  assert.equal(result.status,'accepted');
  assert.equal(result.state.queue.length,1);
});

test('poll receive failure is sanitized and uses bounded exponential backoff', async () => {
  const fail1=await pollPublicStreamTransportEvent({state:transport(),receive:async()=>{throw new Error('Bearer ultra-secret');}});
  assert.equal(fail1.reason,'TRANSPORT_RECEIVE_FAILED');
  assert.equal(fail1.retryDelayMs,100);
  assert.ok(!JSON.stringify(fail1).includes('ultra-secret'));
  const fail2=await pollPublicStreamTransportEvent({state:fail1.state,receive:async()=>{throw new Error('cookie secret');}});
  assert.equal(fail2.retryDelayMs,200);
  const fail3=await pollPublicStreamTransportEvent({state:fail2.state,receive:async()=>{throw new Error('secret');}});
  assert.equal(fail3.retryDelayMs,400);
  const fail4=await pollPublicStreamTransportEvent({state:fail3.state,receive:async()=>{throw new Error('secret');}});
  assert.equal(fail4.retryDelayMs,400);
});

test('poll no-event is healthy idle and resets retry attempt without inventing cursor', async () => {
  const failed=await pollPublicStreamTransportEvent({state:transport(),receive:async()=>{throw new Error('network');}});
  const idle=await pollPublicStreamTransportEvent({state:failed.state,receive:async()=>null});
  assert.equal(idle.status,'idle');
  assert.equal(idle.reason,'TRANSPORT_NO_EVENT');
  assert.equal(idle.state.retryAttempt,0);
  assert.equal(idle.state.cursor,'cursor-0');
});

test('send success removes exactly one queued event and never echoes caller result', async () => {
  const state=acceptedState();
  let sentPayload=null; let sentMeta=null;
  const result=await flushPublicStreamTransportQueue({
    state,
    send:async (payload,meta)=>{sentPayload=payload;sentMeta=meta;return {ok:true,token:'must-not-echo'};},
  });
  assert.equal(result.status,'sent');
  assert.equal(result.state.queue.length,0);
  assert.equal(result.deliveryId,'delivery-1');
  assert.equal(sentPayload.event.text,'public chat');
  assert.deepEqual(sentMeta,{sessionId:'stream-session-1',deliveryId:'delivery-1',sequence:0,cursor:'cursor-1'});
  assert.ok(!JSON.stringify(result).includes('must-not-echo'));
});

test('send failure retains queue, is sanitized, and schedules retry', async () => {
  const state=acceptedState();
  const result=await flushPublicStreamTransportQueue({
    state,
    send:async()=>{throw new Error('Authorization: Bearer top-secret');},
  });
  assert.equal(result.reason,'TRANSPORT_SEND_FAILED');
  assert.equal(result.state.queue.length,1);
  assert.equal(result.retryDelayMs,100);
  assert.ok(!JSON.stringify(result).includes('top-secret'));
});

test('caller-declared send failure is not treated as success', async () => {
  const state=acceptedState();
  const result=await flushPublicStreamTransportQueue({state,send:async()=>({ok:false,authorization:'secret'})});
  assert.equal(result.status,'failed');
  assert.equal(result.state.queue.length,1);
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('transport outputs are deterministic, deeply frozen, and do not mutate inputs', () => {
  const state=transport(); const e=envelope(); const m=memories();
  const beforeState=JSON.stringify(state); const beforeE=JSON.stringify(e); const beforeM=JSON.stringify(m);
  const a=receivePublicStreamTransportEvent({state,envelope:e,memoryRefs:m});
  const b=receivePublicStreamTransportEvent({state:transport(),envelope:envelope(),memoryRefs:memories()});
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(state),beforeState);
  assert.equal(JSON.stringify(e),beforeE);
  assert.equal(JSON.stringify(m),beforeM);
  assert.equal(Object.isFrozen(a),true);
  assert.equal(Object.isFrozen(a.state),true);
  assert.equal(Object.isFrozen(a.state.queue),true);
  assert.equal(Object.isFrozen(a.state.queue[0].payload),true);
});

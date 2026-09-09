import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartridgeMessageBridge } from '../browser/cartridge-message-bridge.mjs';

const manifest={schemaVersion:'gameroad.cartridge-manifest.v1',id:'demo.cart',version:'1.0.0',hostApi:'gameroad.cartridge-host.v1',entry:{kind:'module',ref:'entry.mjs'},capabilities:[],payloadDigest:'f'.repeat(64)};
const sessionId='session_123456789';
const source={};
const envelope=(id='message_123456789',extra={})=>({schemaVersion:'gameroad.cartridge-message.v1',sessionId,cartridgeId:manifest.id,version:manifest.version,payloadDigest:manifest.payloadDigest,direction:'cartridge->host',type:'activity.report',messageId:id,sentAtMs:1000,payload:{ok:true},...extra});

test('inbound validates source origin identity shape and replay',()=>{
  const b=createCartridgeMessageBridge({manifest,sessionId,expectedSource:source,expectedOrigin:'null',inboundTypes:['activity.report'],outboundTypes:['host.ready'],now:()=>1000,maxSeenMessageIds:4});
  assert.equal(b.acceptInboundEvent({source,origin:'null',data:envelope()}).type,'activity.report');
  assert.throws(()=>b.acceptInboundEvent({source,origin:'null',data:envelope()}),/REPLAY_DETECTED/);
  assert.throws(()=>b.acceptInboundEvent({source:{},origin:'null',data:envelope('message_223456789')}),/SOURCE_MISMATCH/);
  assert.throws(()=>b.acceptInboundEvent({source,origin:'https://evil.example',data:envelope('message_323456789')}),/ORIGIN_MISMATCH/);
  assert.throws(()=>b.acceptInboundEvent({source,origin:'null',data:envelope('message_423456789',{extra:true})}),/UNEXPECTED_FIELD/);
});

test('replay window saturation fails closed instead of evicting prior IDs',()=>{
  const b=createCartridgeMessageBridge({manifest,sessionId,expectedSource:source,expectedOrigin:'null',inboundTypes:['activity.report'],outboundTypes:['host.ready'],now:()=>1000,maxSeenMessageIds:2,maxAgeMs:30000});
  b.acceptInboundEvent({source,origin:'null',data:envelope('message_111111111')});
  b.acceptInboundEvent({source,origin:'null',data:envelope('message_222222222')});
  assert.throws(()=>b.acceptInboundEvent({source,origin:'null',data:envelope('message_333333333')}),/REPLAY_WINDOW_EXHAUSTED/);
  assert.throws(()=>b.acceptInboundEvent({source,origin:'null',data:envelope('message_111111111')}),/REPLAY_DETECTED/);
});

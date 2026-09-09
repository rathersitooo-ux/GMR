import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartridgeSandboxDescriptor, bindCartridgeSandboxRuntime } from '../browser/cartridge-sandbox-adapter.mjs';

const manifest={schemaVersion:'gameroad.cartridge-manifest.v1',id:'demo.cart',version:'1.0.0',hostApi:'gameroad.cartridge-host.v1',entry:{kind:'module',ref:'entry.mjs'},capabilities:[],payloadDigest:'e'.repeat(64)};

test('descriptor keeps opaque-origin iframe restrictions and rejects forged descriptors',()=>{
  const d=createCartridgeSandboxDescriptor({manifest,sessionId:'session_123456789'});
  assert.deepEqual(d.iframePolicy.sandboxTokens,['allow-scripts']);
  assert.equal(d.iframePolicy.allowSameOrigin,false);
  assert.equal(d.iframePolicy.allowTopNavigation,false);
  assert.equal(d.hostExposurePolicy.inProcessEval,false);
  assert.throws(()=>bindCartridgeSandboxRuntime({descriptor:{...d},runtimeAdapter:{}}),/DESCRIPTOR_NOT_ISSUED/);
});

test('binding requires opaque origin and exact runtime boundary',()=>{
  const d=createCartridgeSandboxDescriptor({manifest,sessionId:'session_123456789'});
  const source={};
  assert.throws(()=>bindCartridgeSandboxRuntime({descriptor:d,runtimeAdapter:{runtimeKind:'sandboxed-iframe',isolationBoundary:'opaque-origin-sandboxed-iframe',source,origin:'https://example.com',postMessage(){},terminate(){}}}),/ORIGIN_NOT_OPAQUE/);
  const calls=[];
  const bound=bindCartridgeSandboxRuntime({descriptor:d,runtimeAdapter:{runtimeKind:'sandboxed-iframe',isolationBoundary:'opaque-origin-sandboxed-iframe',source,origin:'null',postMessage:(m,o)=>calls.push([m,o]),terminate:()=>calls.push(['terminated'])}});
  bound.send({hello:true});
  assert.equal(calls[0][1],'*');
  assert.equal(bound.terminate(),true);
  assert.equal(bound.terminate(),false);
});

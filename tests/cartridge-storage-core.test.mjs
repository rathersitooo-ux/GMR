import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryCartridgeStorageBackend, createCartridgeStorage } from '../browser/cartridge-storage-core.mjs';

const makeManifest=(id,d='b')=>({schemaVersion:'gameroad.cartridge-manifest.v1',id,version:'1.0.0',hostApi:'gameroad.cartridge-host.v1',entry:{kind:'module',ref:'entry.mjs'},capabilities:['storage.local'],payloadDigest:d.repeat(64)});
const broker={decide:()=>({allowed:true,reason:'test'})};

test('storage is isolated by cartridge identity and rejects traversal keys',()=>{
  const backend=createMemoryCartridgeStorageBackend();
  const a=createCartridgeStorage({manifest:makeManifest('cart.one','b'),capabilityBroker:broker,backend});
  const b=createCartridgeStorage({manifest:makeManifest('cart.two','c'),capabilityBroker:broker,backend});
  a.set('progress/day1',{score:7});
  assert.deepEqual(a.get('progress/day1'),{score:7});
  assert.equal(b.get('progress/day1'),null);
  assert.throws(()=>a.set('../escape',{x:1}),/KEY_INVALID/);
});

test('quota and clear are namespace-local',()=>{
  const backend=createMemoryCartridgeStorageBackend();
  const a=createCartridgeStorage({manifest:makeManifest('cart.one','b'),capabilityBroker:broker,backend,quotaBytes:40});
  a.set('x','ok');
  assert.throws(()=>a.set('big','z'.repeat(100)),/QUOTA_EXCEEDED/);
  assert.equal(a.clear(),1);
  assert.deepEqual(a.list(),[]);
});

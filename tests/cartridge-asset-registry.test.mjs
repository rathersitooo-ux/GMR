import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartridgeAssetRegistry } from '../browser/cartridge-asset-registry.mjs';

const makeManifest=(id,d)=>({schemaVersion:'gameroad.cartridge-manifest.v1',id,version:'1.0.0',hostApi:'gameroad.cartridge-host.v1',entry:{kind:'module',ref:'entry.mjs'},capabilities:[],payloadDigest:d.repeat(64)});
const assetDigest='d'.repeat(64);

test('digest assets dedupe by owner and garbage collect only at refcount zero',async()=>{
  const deleted=[];
  const r=createCartridgeAssetRegistry({deleteAsset:async d=>deleted.push(d)});
  const a=makeManifest('cart.one','1'), b=makeManifest('cart.two','2');
  assert.equal(r.retain(a,{digest:assetDigest,sizeBytes:12,locator:'assets/a.png'}).referenceCount,1);
  assert.equal(r.retain(b,{digest:assetDigest,sizeBytes:12,locator:'assets/a.png'}).referenceCount,2);
  r.release(a,assetDigest);
  assert.deepEqual((await r.collectGarbage()).deleted,[]);
  r.release(b,assetDigest);
  assert.deepEqual((await r.collectGarbage()).deleted,[assetDigest]);
  assert.deepEqual(deleted,[assetDigest]);
});

test('unknown metadata and conflicting metadata fail closed',()=>{
  const r=createCartridgeAssetRegistry();
  const a=makeManifest('cart.one','1'), b=makeManifest('cart.two','2');
  assert.throws(()=>r.retain(a,{digest:assetDigest,sizeBytes:1,locator:'x',extra:true}),/UNEXPECTED_FIELD/);
  r.retain(a,{digest:assetDigest,sizeBytes:1,locator:'x'});
  assert.throws(()=>r.retain(b,{digest:assetDigest,sizeBytes:2,locator:'x'}),/METADATA_CONFLICT/);
});

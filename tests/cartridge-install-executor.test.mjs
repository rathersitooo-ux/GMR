import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCartridgeInstallPlan, createCartridgeInstallExecutor } from '../browser/cartridge-install-executor.mjs';
import { cartridgeStorageNamespace } from '../browser/cartridge-storage-core.mjs';

const digest='a'.repeat(64);
const manifest={schemaVersion:'gameroad.cartridge-manifest.v1',id:'demo.cart',version:'1.0.0',hostApi:'gameroad.cartridge-host.v1',entry:{kind:'module',ref:'entry.mjs'},capabilities:['storage.local'],payloadDigest:digest};
const broker={decide:(_m,c)=>({allowed:c==='storage.local',reason:'test'})};

test('install records undo and uninstall executes exact reverse order', async()=>{
  const log=[];
  const ns=cartridgeStorageNamespace(manifest);
  const plan=buildCartridgeInstallPlan({manifest,capabilityBroker:broker,operations:[{kind:'storage.createNamespace',namespace:ns},{kind:'subscription.add',key:'tick'}]});
  const adapters={
    'storage.createNamespace':async()=>log.push('install:storage'),
    'storage.deleteNamespace':async()=>log.push('undo:storage'),
    'subscription.add':async()=>log.push('install:subscription'),
    'subscription.remove':async()=>log.push('undo:subscription'),
  };
  const executor=createCartridgeInstallExecutor({capabilityBroker:broker,adapters,now:()=> '2026-09-10T00:00:00.000Z'});
  const installed=await executor.install({manifest,plan});
  assert.equal(installed.status,'installed');
  const removed=await executor.uninstall({cartridgeId:manifest.id,manifest,receipt:installed.receipt});
  assert.equal(removed.status,'uninstalled');
  assert.deepEqual(log,['install:storage','install:subscription','undo:subscription','undo:storage']);
});

test('partial failing operation is included in rollback and mount is disabled', async()=>{
  const log=[];
  const ns=cartridgeStorageNamespace(manifest);
  const plan=buildCartridgeInstallPlan({manifest,capabilityBroker:broker,operations:[{kind:'storage.createNamespace',namespace:ns},{kind:'subscription.add',key:'tick'}]});
  const executor=createCartridgeInstallExecutor({capabilityBroker:broker,adapters:{
    'storage.createNamespace':async()=>log.push('install:storage'),
    'storage.deleteNamespace':async()=>log.push('undo:storage'),
    'subscription.add':async()=>{log.push('install:subscription-side-effect'); throw new Error('boom');},
    'subscription.remove':async()=>log.push('undo:subscription'),
  },now:()=> '2026-09-10T00:00:00.000Z'});
  await assert.rejects(executor.install({manifest,plan}),/CARTRIDGE_INSTALL_FAILED/);
  assert.deepEqual(log,['install:storage','install:subscription-side-effect','undo:subscription','undo:storage']);
  assert.throws(()=>buildCartridgeInstallPlan({manifest,capabilityBroker:broker,operations:[{kind:'mount.attach',mountId:'x'}]}),/MOUNT_DISABLED/);
});

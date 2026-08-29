import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeCartridgeManifest } from '../browser/cartridge-manifest-core.mjs';
import { createInstallReceipt, appendInstallUndo, sealInstallReceipt, buildUninstallPlan, installReceiptOperationKinds } from '../browser/cartridge-install-receipt.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['brain-number-match', 'card-memory'];
const ownAsset = '1'.repeat(64);
const sharedAsset = '2'.repeat(64);

test('generated golden catalog is current and both payload digests bind exact recipe bytes', async () => {
  const check = spawnSync(process.execPath, [path.join(root, 'tools', 'build-cartridge-catalog.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  assert.match(check.stdout, /cartridge_catalog_current/);

  const seen = [];
  for (const name of names) {
    const dir = path.join(root, 'data', 'cartridges', 'golden', name);
    const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const payload = await fs.readFile(path.join(dir, 'recipe.json'));
    const normalized = normalizeCartridgeManifest(manifest);
    assert.equal(normalized.ok, true, normalized.reasons.join(','));
    assert.equal(normalized.manifest.entry.kind, 'recipe');
    assert.equal(normalized.manifest.entry.ref, 'recipe.json');
    assert.equal(createHash('sha256').update(payload).digest('hex'), normalized.manifest.payloadDigest);
    seen.push(normalized.manifest.id);
  }
  assert.deepEqual(seen, ['golden.brain-number-match', 'golden.card-memory']);
});

test('golden fixtures cover educational and ordinary Daily-eligible content without ranked/economy fields', async () => {
  const learning = JSON.parse(await fs.readFile(path.join(root, 'data', 'cartridges', 'golden', 'brain-number-match', 'recipe.json'), 'utf8'));
  const ordinary = JSON.parse(await fs.readFile(path.join(root, 'data', 'cartridges', 'golden', 'card-memory', 'recipe.json'), 'utf8'));
  assert.equal(learning.domain, 'learning.math');
  assert.equal(ordinary.domain, 'play.memory');
  assert.equal(learning.dailyEligible, true);
  assert.equal(ordinary.dailyEligible, true);
  assert.equal('ranked' in learning, false);
  assert.equal('economy' in ordinary, false);
});

function installedState() {
  return {
    caches: new Set(['cart:golden.brain-number-match', 'host:core']),
    databases: new Set(['cart.golden.brain-number-match', 'host.profile']),
    registries: new Map([['catalog', new Set(['golden.brain-number-match', 'host.core'])]]),
    assets: new Map([[ownAsset, 1], [sharedAsset, 2], ['3'.repeat(64), 1]]),
    subscriptions: new Set(['sub:golden.brain-number-match', 'sub:host']),
    mounts: new Set(['mount:golden.brain-number-match', 'mount:host']),
    storageNamespaces: new Set(['storage:golden.brain-number-match', 'storage:host']),
    executedPlans: new Set(),
  };
}

function planKey(plan) {
  return `${plan.cartridgeId}@${plan.version}:${plan.payloadDigest}`;
}

function applyUninstallPlan(state, plan) {
  const key = planKey(plan);
  if (state.executedPlans.has(key)) return { applied: false, reason: 'already_applied' };
  for (const op of plan.operations) {
    switch (op.kind) {
      case 'cache.delete': state.caches.delete(op.cacheName); break;
      case 'idb.delete': state.databases.delete(op.databaseName); break;
      case 'registry.remove': state.registries.get(op.registry)?.delete(op.key); break;
      case 'asset.release': {
        const count = state.assets.get(op.digest) ?? 0;
        if (count <= 1) state.assets.delete(op.digest);
        else state.assets.set(op.digest, count - 1);
        break;
      }
      case 'subscription.remove': state.subscriptions.delete(op.key); break;
      case 'mount.detach': state.mounts.delete(op.mountId); break;
      case 'storage.deleteNamespace': state.storageNamespaces.delete(op.namespace); break;
      default: throw new Error(`unsupported:${op.kind}`);
    }
  }
  state.executedPlans.add(key);
  return { applied: true, reason: 'applied' };
}

function makeReceipt() {
  let receipt = createInstallReceipt({
    cartridgeId: 'golden.brain-number-match',
    version: '1.0.0',
    payloadDigest: 'a'.repeat(64),
    installedAt: '2026-08-29T13:16:00.000Z',
  });
  const operations = [
    { kind: 'cache.delete', cacheName: 'cart:golden.brain-number-match' },
    { kind: 'idb.delete', databaseName: 'cart.golden.brain-number-match' },
    { kind: 'registry.remove', registry: 'catalog', key: 'golden.brain-number-match' },
    { kind: 'asset.release', digest: ownAsset },
    { kind: 'asset.release', digest: sharedAsset },
    { kind: 'subscription.remove', key: 'sub:golden.brain-number-match' },
    { kind: 'mount.detach', mountId: 'mount:golden.brain-number-match' },
    { kind: 'storage.deleteNamespace', namespace: 'storage:golden.brain-number-match' },
  ];
  for (const operation of operations) receipt = appendInstallUndo(receipt, operation);
  return { sealed: sealInstallReceipt(receipt), operations };
}

test('uninstall acceptance reverses all recorded effects, preserves host/shared state, and is idempotent', () => {
  const { sealed, operations } = makeReceipt();
  const plan = buildUninstallPlan(sealed);
  assert.deepEqual(plan.operations, [...operations].reverse());
  assert.deepEqual(new Set(installReceiptOperationKinds()), new Set([
    'cache.delete',
    'idb.delete',
    'registry.remove',
    'asset.release',
    'subscription.remove',
    'mount.detach',
    'storage.deleteNamespace',
  ]));

  const state = installedState();
  assert.deepEqual(applyUninstallPlan(state, plan), { applied: true, reason: 'applied' });
  assert.equal(state.caches.has('cart:golden.brain-number-match'), false);
  assert.equal(state.databases.has('cart.golden.brain-number-match'), false);
  assert.equal(state.registries.get('catalog').has('golden.brain-number-match'), false);
  assert.equal(state.assets.has(ownAsset), false);
  assert.equal(state.assets.get(sharedAsset), 1);
  assert.equal(state.subscriptions.has('sub:golden.brain-number-match'), false);
  assert.equal(state.mounts.has('mount:golden.brain-number-match'), false);
  assert.equal(state.storageNamespaces.has('storage:golden.brain-number-match'), false);

  assert.equal(state.caches.has('host:core'), true);
  assert.equal(state.databases.has('host.profile'), true);
  assert.equal(state.registries.get('catalog').has('host.core'), true);
  assert.equal(state.assets.get('3'.repeat(64)), 1);
  assert.equal(state.subscriptions.has('sub:host'), true);
  assert.equal(state.mounts.has('mount:host'), true);
  assert.equal(state.storageNamespaces.has('storage:host'), true);

  assert.deepEqual(applyUninstallPlan(state, plan), { applied: false, reason: 'already_applied' });
  assert.equal(state.assets.get(sharedAsset), 1, 'retry must not release a shared asset twice');
});

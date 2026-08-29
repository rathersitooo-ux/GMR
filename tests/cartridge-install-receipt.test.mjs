import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendInstallUndo,
  buildUninstallPlan,
  createInstallReceipt,
  sealInstallReceipt,
} from '../browser/cartridge-install-receipt.mjs';

function receipt() {
  return createInstallReceipt({
    cartridgeId: 'study.flashcards',
    version: '1.0.0',
    payloadDigest: 'd'.repeat(64),
    installedAt: '2026-08-29T12:00:00Z',
  });
}

test('receipt is persistent/immutable and uninstall order is exact reverse install order', () => {
  const r0 = receipt();
  const r1 = appendInstallUndo(r0, { kind: 'cache.delete', cacheName: 'cart:study.flashcards' });
  const r2 = appendInstallUndo(r1, { kind: 'storage.deleteNamespace', namespace: 'cart:study.flashcards' });
  const sealed = sealInstallReceipt(r2);
  const plan = buildUninstallPlan(sealed);
  assert.equal(r0.undoOperations.length, 0);
  assert.deepEqual(plan.operations.map((op) => op.kind), ['storage.deleteNamespace', 'cache.delete']);
  assert.equal(plan.cartridgeId, 'study.flashcards');
  assert.equal(plan.payloadDigest, 'd'.repeat(64));
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.operations), true);
});

test('unknown uninstall effects fail closed', () => {
  assert.throws(() => appendInstallUndo(receipt(), { kind: 'javascript.execute', code: 'danger()' }), /unsupported/);
});

test('receipt rejects executable/non-data payloads and unexpected fields', () => {
  assert.throws(() => appendInstallUndo(receipt(), { kind: 'cache.delete', cacheName: 'x', run: () => {} }), /non_data_value/);
  assert.throws(() => appendInstallUndo(receipt(), { kind: 'cache.delete', cacheName: 'x', code: 'danger()' }), /unexpected_field/);
});

test('sealed receipts cannot be appended and open receipts cannot produce uninstall plans', () => {
  const open = receipt();
  assert.throws(() => buildUninstallPlan(open), /SEALED/);
  const sealed = sealInstallReceipt(open);
  assert.throws(() => appendInstallUndo(sealed, { kind: 'cache.delete', cacheName: 'x' }), /OPEN/);
});

test('asset release digest must be sha256-shaped', () => {
  assert.throws(() => appendInstallUndo(receipt(), { kind: 'asset.release', digest: 'bad' }), /digest_invalid/);
  const next = appendInstallUndo(receipt(), { kind: 'asset.release', digest: 'e'.repeat(64) });
  assert.equal(next.undoOperations[0].digest, 'e'.repeat(64));
});

test('forged sealed receipts are fully revalidated before uninstall planning', () => {
  const forgedUnknown = {
    ...sealInstallReceipt(receipt()),
    undoOperations: [{ kind: 'javascript.execute', code: 'danger()' }],
  };
  assert.throws(() => buildUninstallPlan(forgedUnknown), /unsupported/);

  const forgedExecutable = {
    ...sealInstallReceipt(receipt()),
    undoOperations: [{ kind: 'cache.delete', cacheName: 'x', run: () => {} }],
  };
  assert.throws(() => buildUninstallPlan(forgedExecutable), /non_data_value/);
});

test('receipt identity uses manifest-compatible cartridge ids', () => {
  assert.throws(() => createInstallReceipt({
    cartridgeId: '../escape',
    version: '1.0.0',
    payloadDigest: 'd'.repeat(64),
    installedAt: '2026-08-29T12:00:00Z',
  }), /cartridgeId_invalid/);
});

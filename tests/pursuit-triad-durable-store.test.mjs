import test from 'node:test';
import assert from 'node:assert/strict';
import { createPursuitDurableSnapshotStore } from '../browser/pursuit-triad-durable-store.mjs';

function memoryStore(initial = new Map()) {
  const values = new Map(initial);
  return {
    calls: [],
    getItem(key) {
      this.calls.push(['get', key]);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      this.calls.push(['set', key, value]);
      values.set(key, value);
    },
  };
}

test('writes canonical JSON to the caller key and verifies exact readback', async () => {
  const store = memoryStore();
  const adapter = createPursuitDurableSnapshotStore({ store, storageKey: 'session:pursuit:r42' });
  const snapshot = { persistenceSchema: 'gameroad.pursuit-secret-round-authority-snapshot.v1', roundId: 'r42', revision: 7 };

  assert.strictEqual(await adapter.saveSnapshot(snapshot), snapshot);
  assert.deepEqual(store.calls, [
    ['set', 'session:pursuit:r42', JSON.stringify(snapshot)],
    ['get', 'session:pursuit:r42'],
  ]);
  assert.deepEqual(await adapter.loadSnapshot(), snapshot);
  assert.equal(Object.isFrozen(adapter), true);
});

test('supports async durable stores without inventing retry, TTL, auth, or alternate keys', async () => {
  const values = new Map();
  const calls = [];
  const store = {
    async getItem(key) { calls.push(['get', key]); return values.has(key) ? values.get(key) : null; },
    async setItem(key, value) { calls.push(['set', key]); values.set(key, value); },
  };
  const adapter = createPursuitDurableSnapshotStore({ store, storageKey: 'authority-owned-key' });
  await adapter.saveSnapshot({ roundId: 'r' });
  await adapter.loadSnapshot();
  assert.deepEqual(calls.map((entry) => entry[1]), ['authority-owned-key', 'authority-owned-key', 'authority-owned-key']);
});

test('fails closed on missing key or malformed storage contract', () => {
  for (const storageKey of [undefined, null, '', 7]) {
    assert.throws(() => createPursuitDurableSnapshotStore({ store: memoryStore(), storageKey }), /storageKey/);
  }
  assert.throws(() => createPursuitDurableSnapshotStore({ store: null, storageKey: 'k' }), /store/);
  assert.throws(() => createPursuitDurableSnapshotStore({ store: {}, storageKey: 'k' }), /getItem/);
  assert.throws(() => createPursuitDurableSnapshotStore({ store: { getItem() {} }, storageKey: 'k' }), /setItem/);
});

test('fails closed on missing, non-string, malformed, or mismatched readback bytes', async () => {
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: memoryStore(), storageKey: 'k' }).loadSnapshot(),
    /missing/,
  );

  const nonString = { getItem() { return { bad: true }; }, setItem() {} };
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: nonString, storageKey: 'k' }).loadSnapshot(),
    /must return snapshot bytes as a string/,
  );

  const malformed = memoryStore(new Map([['k', '{bad json']]));
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: malformed, storageKey: 'k' }).loadSnapshot(),
    /not valid JSON/,
  );

  const mismatch = {
    setItem() {},
    getItem() { return '{"different":true}'; },
  };
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: mismatch, storageKey: 'k' }).saveSnapshot({ expected: true }),
    /readback does not match/,
  );
});

test('propagates storage failures and rejects non-serializable snapshots without false success', async () => {
  const setFailure = {
    getItem() { return null; },
    setItem() { throw new Error('STORE_DOWN'); },
  };
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: setFailure, storageKey: 'k' }).saveSnapshot({ ok: true }),
    /STORE_DOWN/,
  );

  const readFailure = {
    getItem() { throw new Error('READ_DOWN'); },
    setItem() {},
  };
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: readFailure, storageKey: 'k' }).loadSnapshot(),
    /READ_DOWN/,
  );

  const cyclic = {};
  cyclic.self = cyclic;
  await assert.rejects(
    () => createPursuitDurableSnapshotStore({ store: memoryStore(), storageKey: 'k' }).saveSnapshot(cyclic),
    /not JSON-serializable/,
  );
});

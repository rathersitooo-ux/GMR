import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerCostumeDurableStore } from '../browser/partner-costume-durable-store.mjs';

function memoryStore() {
  const data = new Map();
  return {
    async getItem(key) { return data.has(key) ? data.get(key) : null; },
    async setItem(key, value) { data.set(key, value); },
  };
}

test('caller supplies the durable key and round-trips a snapshot', async () => {
  const adapter = createPartnerCostumeDurableStore({ store: memoryStore(), storageKey: 'caller-owned-key' });
  const snapshot = { schema: 'partner-costume-state-v1', partners: { naki: { savedSelection: { accessory: 'a' } } } };
  await adapter.saveSnapshot(snapshot);
  assert.deepEqual(await adapter.loadSnapshot(), snapshot);
});

test('missing persisted snapshot fails closed', async () => {
  const adapter = createPartnerCostumeDurableStore({ store: memoryStore(), storageKey: 'k' });
  await assert.rejects(() => adapter.loadSnapshot(), /missing from durable store/);
});

test('invalid JSON fails closed', async () => {
  const store = memoryStore();
  await store.setItem('k', '{broken');
  const adapter = createPartnerCostumeDurableStore({ store, storageKey: 'k' });
  await assert.rejects(() => adapter.loadSnapshot(), /not valid JSON/);
});

test('save rejects a readback mismatch', async () => {
  const store = {
    async setItem() {},
    async getItem() { return '{"different":true}'; },
  };
  const adapter = createPartnerCostumeDurableStore({ store, storageKey: 'k' });
  await assert.rejects(() => adapter.saveSnapshot({ ok: true }), /readback does not match/);
});

test('failed verified save restores the previous durable snapshot', async () => {
  const previous = { schema: 'partner-costume-state-v1', partners: { naki: { savedSelection: { accessory: 'old' } } } };
  const previousRaw = JSON.stringify(previous);
  let raw = previousRaw;
  let writes = 0;
  const store = {
    async getItem() { return raw; },
    async setItem(key, value) {
      writes += 1;
      raw = writes === 1 ? '{"different":true}' : value;
    },
  };
  const adapter = createPartnerCostumeDurableStore({ store, storageKey: 'k' });

  await assert.rejects(
    () => adapter.saveSnapshot({ schema: 'partner-costume-state-v1', partners: { naki: { savedSelection: { accessory: 'new' } } } }),
    /readback does not match/,
  );
  assert.equal(raw, previousRaw);
  assert.deepEqual(await adapter.loadSnapshot(), previous);
});

test('rollback failure is surfaced instead of claiming the previous snapshot was preserved', async () => {
  const previousRaw = JSON.stringify({ schema: 'partner-costume-state-v1', partners: { naki: { savedSelection: { accessory: 'old' } } } });
  let raw = previousRaw;
  const store = {
    async getItem() { return raw; },
    async setItem() { raw = '{"different":true}'; },
  };
  const adapter = createPartnerCostumeDurableStore({ store, storageKey: 'k' });

  await assert.rejects(
    () => adapter.saveSnapshot({ schema: 'partner-costume-state-v1', partners: { naki: { savedSelection: { accessory: 'new' } } } }),
    /rollback failed/,
  );
});

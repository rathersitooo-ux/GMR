import test from 'node:test';
import assert from 'node:assert/strict';

await import('../browser/deck-save-recovery-core.mjs');
const { writePreparedSaveTransaction } = globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE;

const SCHEMA = 'gameroad.deck-save-recovery.v1';

function prepared(serialized = '{"deck":"next"}') {
  return { schema: SCHEMA, status: 'prepared', reason: 'TEST_READY', serialized };
}

function mapStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values,
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push([key, value]); values.set(key, value); },
    removeItem(key) { writes.push([key, null]); values.delete(key); },
  };
}

test('dual save reports success only after exact companion and primary readback', () => {
  const storage = mapStorage({ primary: '{"deck":"old"}', library: '{"slots":"old"}' });
  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('{"deck":"next"}'),
    [{ key: 'library', serialized: '{"slots":"next"}', previousRawValue: '{"slots":"old"}' }],
    { previousRawValue: '{"deck":"old"}' },
  );

  assert.equal(result.status, 'saved');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_READBACK_OK');
  assert.deepEqual(result.keys, ['primary', 'library']);
  assert.equal(storage.getItem('primary'), '{"deck":"next"}');
  assert.equal(storage.getItem('library'), '{"slots":"next"}');
});

test('primary write failure restores already-written companion exact raw', () => {
  const values = new Map([
    ['primary', '{"deck":"old"}'],
    ['library', '{"slots":"old"}'],
  ]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === 'primary' && value === '{"deck":"next"}') throw new Error('quota');
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };

  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('{"deck":"next"}'),
    [{ key: 'library', serialized: '{"slots":"next"}' }],
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_PRIMARY_FAILED');
  assert.equal(result.writeFailureReason, 'STORAGE_WRITE_FAILED');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, true);
  assert.equal(storage.getItem('primary'), '{"deck":"old"}');
  assert.equal(storage.getItem('library'), '{"slots":"old"}');
});

test('companion readback mismatch rolls itself back and never writes primary', () => {
  const values = new Map([
    ['primary', '{"deck":"old"}'],
    ['library', '{"slots":"old"}'],
  ]);
  let corruptCompanionWrite = true;
  let primaryWrites = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === 'primary') primaryWrites += 1;
      if (key === 'library' && corruptCompanionWrite && value === '{"slots":"next"}') {
        corruptCompanionWrite = false;
        values.set(key, `${value}x`);
        return;
      }
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };

  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('{"deck":"next"}'),
    [{ key: 'library', serialized: '{"slots":"next"}' }],
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_COMPANION_FAILED');
  assert.equal(result.writeFailureReason, 'STORAGE_READBACK_MISMATCH');
  assert.equal(result.originalPreserved, true);
  assert.equal(primaryWrites, 0);
  assert.equal(storage.getItem('primary'), '{"deck":"old"}');
  assert.equal(storage.getItem('library'), '{"slots":"old"}');
});

test('stale companion expectation fails closed before any write', () => {
  const storage = mapStorage({ primary: 'P0', library: 'L-current' });
  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('P1'),
    [{ key: 'library', serialized: 'L1', previousRawValue: 'L-stale' }],
    { previousRawValue: 'P0' },
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'COMPANION_PREVIOUS_RAW_STALE');
  assert.equal(result.originalPreserved, true);
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.getItem('primary'), 'P0');
  assert.equal(storage.getItem('library'), 'L-current');
});

test('duplicate primary/companion key is rejected before writes', () => {
  const storage = mapStorage({ primary: 'P0' });
  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('P1'),
    [{ key: 'primary', serialized: 'shadow' }],
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_DUPLICATE_KEY');
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.getItem('primary'), 'P0');
});

test('final transaction readback drift rolls both keys back to captured originals', () => {
  const values = new Map([
    ['primary', 'P0'],
    ['library', 'L0'],
  ]);
  let companionReads = 0;
  const storage = {
    getItem(key) {
      if (key === 'library') {
        companionReads += 1;
        if (companionReads === 4) return `${values.get(key)}-drift`;
      }
      return values.get(key) ?? null;
    },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };

  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('P1'),
    [{ key: 'library', serialized: 'L1' }],
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_FINAL_READBACK_FAILED');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, true);
  assert.equal(values.get('primary'), 'P0');
  assert.equal(values.get('library'), 'L0');
});

test('rollback failure is surfaced as non-preserved transaction failure', () => {
  const values = new Map([
    ['primary', 'P0'],
    ['library', 'L0'],
  ]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === 'primary' && value === 'P1') throw new Error('primary write blocked');
      if (key === 'library' && value === 'L0') throw new Error('library rollback blocked');
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };

  const result = writePreparedSaveTransaction(
    storage,
    'primary',
    prepared('P1'),
    [{ key: 'library', serialized: 'L1' }],
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_TRANSACTION_ROLLBACK_FAILED');
  assert.equal(result.originalPreserved, false);
  assert.equal(result.rollbackFailures.length, 1);
  assert.equal(result.rollbackFailures[0].key, 'library');
});

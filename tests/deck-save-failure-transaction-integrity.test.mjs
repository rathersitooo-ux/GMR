import test from 'node:test';
import assert from 'node:assert/strict';

await import('../browser/deck-save-recovery-core.mjs');
const { writeStorageBatchVerified } = globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE;

function makeStorage(initial = {}) {
  const raw = new Map(Object.entries(initial));
  return {
    raw,
    getItem(key) {
      return raw.has(key) ? raw.get(key) : null;
    },
    setItem(key, value) {
      raw.set(key, value);
    },
    removeItem(key) {
      raw.delete(key);
    },
  };
}

const entries = () => [
  { key: 'deck-library', serialized: '{"deck":2}' },
  { key: 'root-save', serialized: '{"root":2}' },
];

test('two-key save is successful only after exact readback of both values', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":1}',
  });

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'saved');
  assert.equal(result.reason, 'STORAGE_BATCH_WRITE_READBACK_OK');
  assert.deepEqual(result.savedKeys, ['deck-library', 'root-save']);
  assert.equal(storage.getItem('deck-library'), '{"deck":2}');
  assert.equal(storage.getItem('root-save'), '{"root":2}');
});

test('second write failure rolls the first key back and never reports saved', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":1}',
  });
  const baseSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'root-save' && value === '{"root":2}') throw new Error('quota');
    baseSet(key, value);
  };

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_BATCH_WRITE_FAILED');
  assert.equal(result.failureKey, 'root-save');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, true);
  assert.equal(storage.getItem('deck-library'), '{"deck":1}');
  assert.equal(storage.getItem('root-save'), '{"root":1}');
});

test('second readback mismatch restores both exact previous raw values', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":1}',
  });
  const baseSet = storage.setItem.bind(storage);
  let corruptRootOnce = true;
  storage.setItem = (key, value) => {
    if (key === 'root-save' && value === '{"root":2}' && corruptRootOnce) {
      corruptRootOnce = false;
      baseSet(key, `${value}x`);
      return;
    }
    baseSet(key, value);
  };

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_BATCH_READBACK_MISMATCH');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, true);
  assert.equal(storage.getItem('deck-library'), '{"deck":1}');
  assert.equal(storage.getItem('root-save'), '{"root":1}');
});

test('rollback removes a newly materialized key that was missing before the batch', () => {
  const storage = makeStorage({ 'root-save': '{"root":1}' });
  const baseSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'root-save' && value === '{"root":2}') throw new Error('blocked');
    baseSet(key, value);
  };

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'failed');
  assert.equal(result.originalPreserved, true);
  assert.equal(storage.getItem('deck-library'), null);
  assert.equal(storage.getItem('root-save'), '{"root":1}');
});

test('failure while reading originals happens before any mutation', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":1}',
  });
  let writes = 0;
  const baseGet = storage.getItem.bind(storage);
  storage.getItem = (key) => {
    if (key === 'root-save') throw new Error('read blocked');
    return baseGet(key);
  };
  storage.setItem = () => {
    writes += 1;
  };

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_BATCH_READ_FAILED');
  assert.equal(result.failureKey, 'root-save');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, false);
  assert.equal(writes, 0);
});

test('rollback failure is surfaced and never claims the original batch was preserved', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":1}',
  });
  const baseSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === 'root-save' && value === '{"root":2}') throw new Error('root write blocked');
    if (key === 'deck-library' && value === '{"deck":1}' && storage.raw.get(key) === '{"deck":2}') {
      throw new Error('library rollback blocked');
    }
    baseSet(key, value);
  };

  const result = writeStorageBatchVerified(storage, entries());

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_BATCH_ROLLBACK_FAILED');
  assert.equal(result.writeFailureReason, 'STORAGE_BATCH_WRITE_FAILED');
  assert.equal(result.originalPreserved, false);
  assert.equal(result.rolledBack, false);
  assert.equal(storage.getItem('deck-library'), '{"deck":2}');
  assert.equal(storage.getItem('root-save'), '{"root":1}');
});

test('expected previous raw mismatch fails closed before any writes', () => {
  const storage = makeStorage({
    'deck-library': '{"deck":1}',
    'root-save': '{"root":changed-elsewhere}',
  });
  let writes = 0;
  const baseSet = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    writes += 1;
    baseSet(key, value);
  };

  const result = writeStorageBatchVerified(storage, [
    { key: 'deck-library', serialized: '{"deck":2}', previousRawValue: '{"deck":1}' },
    { key: 'root-save', serialized: '{"root":2}', previousRawValue: '{"root":1}' },
  ]);

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_BATCH_PREVIOUS_RAW_STALE');
  assert.equal(result.failureKey, 'root-save');
  assert.equal(result.originalPreserved, true);
  assert.equal(result.rolledBack, false);
  assert.equal(writes, 0);
});

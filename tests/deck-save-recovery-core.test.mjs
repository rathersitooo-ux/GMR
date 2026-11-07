import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
await import('../browser/deck-save-recovery-core.mjs');
const {
  inspectRawSave,
  classifyDeckProjection,
  prepareExplicitDeckCommit,
  readStorage,
  writePreparedSave,
  writePreparedSaveVerified,
  resetExplicitSaveKeys,
  deriveLiveDeckSaveKeys,
  expectedDeckLibraryRaw,
  captureDeckSaveAtomicitySnapshot,
  settleDeckSaveAtomicitySnapshot,
  DECK_SAVE_RECOVERY_CORE,
} = globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE;

const authority = Object.freeze({
  currentSaveRevision: 3,
  currentRuleId: 'FIRST_REGULATION',
  currentRuleRevision: 3,
  recognizedLegacyRules: [
    { ruleId: 'FIRST_REGULATION', ruleRevision: 1, deckSizes: [24, 26, 39] },
    { ruleId: 'FIRST_REGULATION', ruleRevision: 2, deckSizes: [24, 26, 39] },
  ],
});

const currentProjection = Object.freeze({
  saveRevision: 3,
  ruleId: 'FIRST_REGULATION',
  ruleRevision: 3,
  deckSize: 40,
  deckLegal: true,
});

function parsed(root = { profile: { name: 'A' }, deck: { old: true }, unrelated: { keep: 7 } }) {
  return inspectRawSave(JSON.stringify(root));
}

function classify(inspection, projection = currentProjection) {
  return classifyDeckProjection({ inspection, projection, authority });
}

function nextDeckRecord() {
  return { ruleId: 'FIRST_REGULATION', ruleRevision: 3, cards: Array.from({ length: 40 }, (_, i) => `c${i}`) };
}

function prepare(inspection, currentClassification = classify(inspection), projection = currentProjection) {
  return prepareExplicitDeckCommit({
    inspection,
    currentClassification,
    path: ['deck'],
    nextDeckRecord: nextDeckRecord(),
    nextProjection: projection,
    authority,
  });
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    snapshot() { return Object.fromEntries(map); },
  };
}

function atomicFixture() {
  const rootKey = 'gameroad.browser.v10.core.1';
  const libraryKey = `${rootKey}.deckSlots.v1`;
  const draftSessionKey = `${rootKey}.deckDraft.session.v1`;
  const oldDeck = { main: ['old'], ex: [] };
  const nextDeck = { main: Array.from({ length: 40 }, (_, i) => `c${i}`), ex: [] };
  const oldSlots = Array.from({ length: 12 }, (_, i) => i === 0 ? oldDeck : { main: [], ex: [] });
  const state = {
    selectedDeckIndex: 0,
    deckSlots: JSON.parse(JSON.stringify(oldSlots)),
    savedDeck: JSON.parse(JSON.stringify(oldDeck)),
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    deckDraft: JSON.parse(JSON.stringify(nextDeck)),
    saveAuthorityDeck: JSON.parse(JSON.stringify(oldDeck)),
    saveAuthorityDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    storage: 'localStorage',
  };
  const rootRaw = JSON.stringify({
    v: 3,
    deck: { ...oldDeck, ruleId: 'FIRST_REGULATION', ruleRevision: 3 },
    keep: true,
  });
  const libraryRaw = JSON.stringify({ schema: 'gameroad.deck-slots.v1', slots: oldSlots });
  const draftSessionRaw = JSON.stringify({ v: 1, deck: nextDeck });
  const storage = memoryStorage({ [rootKey]: rootRaw, [libraryKey]: libraryRaw });
  const sessionStorage = memoryStorage({ [draftSessionKey]: draftSessionRaw });
  let draftSessionSaveCalls = 0;
  const api = {
    state,
    deckDraftSessionKey: () => draftSessionKey,
    deckRule: () => ({ id: 'FIRST_REGULATION', revision: 3 }),
    deckDraftSessionSave: () => { draftSessionSaveCalls += 1; return true; },
  };
  return { rootKey, libraryKey, draftSessionKey, rootRaw, libraryRaw, draftSessionRaw, oldDeck, nextDeck, oldSlots, state, storage, sessionStorage, api, draftSessionSaveCalls: () => draftSessionSaveCalls };
}

test('schema is stable', () => {
  assert.equal(DECK_SAVE_RECOVERY_CORE.schema, 'gameroad.deck-save-recovery.v1');
  assert.equal(DECK_SAVE_RECOVERY_CORE.atomicitySchema, 'gameroad.deck-save-atomicity-guard.v1');
});

test('missing save is classified without implicit materialization', () => {
  const inspection = inspectRawSave(null);
  assert.equal(inspection.status, 'missing');
  assert.equal(inspection.parsed, null);
  assert.equal(classify(inspection).status, 'missing');
});

test('malformed JSON blocks and preserves raw ownership outside core', () => {
  const inspection = inspectRawSave('{bad');
  assert.equal(inspection.status, 'corrupt');
  assert.equal(classify(inspection).reason, 'SAVE_CORRUPT');
});

test('non-object JSON blocks', () => {
  for (const raw of ['[]', 'null', '3', '"x"']) {
    assert.equal(inspectRawSave(raw).status, 'corrupt');
  }
});

test('newer save revision blocks before rule identity downgrade', () => {
  const result = classify(parsed(), { ...currentProjection, saveRevision: 4, ruleId: null, ruleRevision: null });
  assert.equal(result.reason, 'SAVE_REVISION_NEWER');
});

test('unknown rule revision is not silently treated as legacy', () => {
  const result = classify(parsed(), { ...currentProjection, ruleRevision: 99, deckSize: 26, deckLegal: false });
  assert.equal(result.reason, 'RULE_UNKNOWN_OR_UNSUPPORTED');
});

test('recognized legacy 24/26/39 remain repairable but inactive', () => {
  for (const deckSize of [24, 26, 39]) {
    const result = classify(parsed(), {
      saveRevision: 2,
      ruleId: 'FIRST_REGULATION',
      ruleRevision: 2,
      deckSize,
      deckLegal: false,
    });
    assert.equal(result.status, 'recognized_legacy');
  }
});

test('unversioned legacy with both rule fields absent stays recoverable without fabricated identity', () => {
  for (const deckLegal of [false, true]) {
    const result = classify(parsed(), {
      saveRevision: 2,
      ruleId: null,
      ruleRevision: null,
      deckSize: deckLegal ? 40 : 26,
      deckLegal,
    });
    assert.equal(result.status, 'recognized_legacy');
    assert.equal(result.unversioned, true);
    assert.equal(
      result.reason,
      deckLegal ? 'LEGACY_UNVERSIONED_CURRENT_COMPATIBLE' : 'LEGACY_UNVERSIONED_REPAIRABLE',
    );
  }
});

test('partial or malformed rule identity blocks instead of downgrading to unversioned legacy', () => {
  const projections = [
    { ...currentProjection, ruleId: null, ruleRevision: 3 },
    { ...currentProjection, ruleId: 'FIRST_REGULATION', ruleRevision: null },
    { ...currentProjection, ruleId: '', ruleRevision: 3 },
    { ...currentProjection, ruleId: 'FIRST_REGULATION', ruleRevision: '3' },
  ];
  assert.deepEqual(
    projections.map((projection) => classify(parsed(), projection).reason),
    ['RULE_IDENTITY_PARTIAL', 'RULE_IDENTITY_PARTIAL', 'RULE_IDENTITY_INVALID', 'RULE_IDENTITY_INVALID'],
  );
});

test('current legal40 is current', () => {
  const result = classify(parsed());
  assert.equal(result.status, 'current');
});

test('current illegal/partial blocks', () => {
  const result = classify(parsed(), { ...currentProjection, deckSize: 39, deckLegal: false });
  assert.equal(result.reason, 'CURRENT_DECK_ILLEGAL');
});

test('malformed projection fails closed', () => {
  const result = classify(parsed(), { saveRevision: 3, ruleId: 'FIRST_REGULATION' });
  assert.equal(result.reason, 'DECK_PROJECTION_INVALID');
});

test('explicit commit can start from missing only with a legal current next projection', () => {
  const inspection = inspectRawSave(null);
  const result = prepare(inspection, classify(inspection));
  assert.equal(result.status, 'prepared');
  assert.equal(JSON.parse(result.serialized).deck.cards.length, 40);
});

test('explicit commit from unversioned legacy is allowed only through a legal current next deck', () => {
  const inspection = parsed({ deck: { main: Array.from({ length: 26 }, (_, i) => `old${i}`) }, keep: 9 });
  const legacy = classify(inspection, {
    saveRevision: 2,
    ruleId: null,
    ruleRevision: null,
    deckSize: 26,
    deckLegal: false,
  });
  const result = prepare(inspection, legacy);
  assert.equal(result.status, 'prepared');
  assert.equal(JSON.parse(result.serialized).keep, 9);
  assert.equal(JSON.parse(result.serialized).deck.cards.length, 40);
});

test('explicit commit from recognized legacy preserves unrelated top-level and nested fields', () => {
  const inspection = parsed({
    profile: { name: 'A', nested: { keep: true } },
    deck: { legacy: true },
    ownedCards: ['x'],
    unknownFutureField: { keep: 9 },
  });
  const legacy = classify(inspection, {
    saveRevision: 2,
    ruleId: 'FIRST_REGULATION',
    ruleRevision: 2,
    deckSize: 26,
    deckLegal: false,
  });
  const result = prepare(inspection, legacy);
  const next = JSON.parse(result.serialized);
  assert.equal(result.status, 'prepared');
  assert.deepEqual(next.profile, { name: 'A', nested: { keep: true } });
  assert.deepEqual(next.ownedCards, ['x']);
  assert.deepEqual(next.unknownFutureField, { keep: 9 });
  assert.equal(next.deck.cards.length, 40);
});

test('explicit commit from current preserves unrelated fields and does not mutate input', () => {
  const root = { deck: { old: true }, unrelated: { keep: 1 } };
  const inspection = parsed(root);
  const before = JSON.stringify(inspection.parsed);
  const result = prepare(inspection);
  assert.equal(result.status, 'prepared');
  assert.equal(JSON.stringify(inspection.parsed), before);
  assert.deepEqual(JSON.parse(result.serialized).unrelated, { keep: 1 });
});

test('commit rejects corrupt source', () => {
  const inspection = inspectRawSave('{bad');
  const result = prepareExplicitDeckCommit({
    inspection,
    currentClassification: classify(inspection),
    path: ['deck'],
    nextDeckRecord: nextDeckRecord(),
    nextProjection: currentProjection,
    authority,
  });
  assert.equal(result.reason, 'SOURCE_NOT_COMMITTABLE');
});

test('commit rejects unknown/newer source', () => {
  const inspection = parsed();
  for (const projection of [
    { ...currentProjection, ruleRevision: 4 },
    { ...currentProjection, saveRevision: 4 },
  ]) {
    const result = prepare(inspection, classify(inspection, projection));
    assert.equal(result.reason, 'SOURCE_NOT_COMMITTABLE');
  }
});

test('commit rejects illegal next deck instead of filling or inventing cards', () => {
  const inspection = parsed();
  const result = prepare(inspection, classify(inspection), { ...currentProjection, deckSize: 39, deckLegal: false });
  assert.equal(result.reason, 'NEXT_DECK_NOT_CURRENT_LEGAL');
});

test('path collision fails closed rather than overwriting unrelated scalar', () => {
  const inspection = parsed({ profile: 'opaque' });
  const result = prepareExplicitDeckCommit({
    inspection,
    currentClassification: classify(inspection),
    path: ['profile', 'deck'],
    nextDeckRecord: nextDeckRecord(),
    nextProjection: currentProjection,
    authority,
  });
  assert.equal(result.reason, 'PATH_CONTAINER_MISMATCH');
});

test('read failure is reported and never converted into missing', () => {
  const storage = { getItem() { throw new Error('no'); } };
  assert.equal(readStorage(storage, 'save').reason, 'STORAGE_READ_FAILED');
});

test('successful storage read can return null without writing', () => {
  let writes = 0;
  const storage = { getItem() { return null; }, setItem() { writes += 1; } };
  const result = readStorage(storage, 'save');
  assert.equal(result.status, 'read');
  assert.equal(result.rawValue, null);
  assert.equal(writes, 0);
});

test('legacy write helper success is reported after setItem returns', () => {
  let stored = null;
  const inspection = parsed();
  const prepared = prepare(inspection);
  const storage = { setItem(key, value) { stored = [key, value]; } };
  const result = writePreparedSave(storage, 'save', prepared);
  assert.equal(result.status, 'saved');
  assert.equal(stored[0], 'save');
  assert.equal(stored[1], prepared.serialized);
});

test('legacy write helper failure never reports saved success', () => {
  const inspection = parsed();
  const prepared = prepare(inspection);
  const storage = { setItem() { throw new Error('quota'); } };
  const result = writePreparedSave(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_WRITE_FAILED');
});

test('verified write reports saved only after exact readback', () => {
  const inspection = parsed();
  const prepared = prepare(inspection);
  let raw = JSON.stringify({ old: true });
  const storage = {
    getItem() { return raw; },
    setItem(_key, value) { raw = value; },
    removeItem() { raw = null; },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'saved');
  assert.equal(result.reason, 'STORAGE_WRITE_READBACK_OK');
  assert.equal(raw, prepared.serialized);
});

test('verified write mismatch preserves unknown bytes without overwriting a possible concurrent writer', () => {
  const prepared = prepare(parsed());
  const previous = '{"opaque":"keep-exact"}';
  let raw = previous;
  let corruptNext = true;
  const storage = {
    getItem() { return raw; },
    setItem(_key, value) {
      raw = corruptNext ? `${value}x` : value;
      corruptNext = false;
    },
    removeItem() { raw = null; },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_FOREIGN_OR_UNKNOWN_RAW_PRESERVED');
  assert.equal(result.rolledBack, false);
  assert.equal(result.originalPreserved, false);
  assert.equal(result.unknownCurrentRawPreserved, true);
  assert.equal(raw, `${prepared.serialized}x`);
});

test('verified write readback failure rolls back exact previous durable raw', () => {
  const prepared = prepare(parsed());
  const previous = '{"opaque":"keep-exact"}';
  let raw = previous;
  let reads = 0;
  const storage = {
    getItem() {
      reads += 1;
      if (reads === 2) throw new Error('transient readback failure');
      return raw;
    },
    setItem(_key, value) { raw = value; },
    removeItem() { raw = null; },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_READBACK_FAILED');
  assert.equal(result.rolledBack, true);
  assert.equal(result.originalPreserved, true);
  assert.equal(raw, previous);
});

test('verified write from missing storage does not overwrite unrecognized bytes', () => {
  const inspection = inspectRawSave(null);
  const prepared = prepare(inspection, classify(inspection));
  let raw = null;
  let first = true;
  const storage = {
    getItem() { return raw; },
    setItem(_key, value) { raw = first ? `${value}x` : value; first = false; },
    removeItem() { raw = null; },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_FOREIGN_OR_UNKNOWN_RAW_PRESERVED');
  assert.equal(result.originalPreserved, false);
  assert.equal(raw, `${prepared.serialized}x`);
});

test('verified write rollback failure is never reported as saved or preserved', () => {
  const prepared = prepare(parsed());
  const previous = '{"keep":1}';
  let raw = previous;
  let writes = 0;
  let reads = 0;
  const storage = {
    getItem() {
      reads += 1;
      if (reads === 2) throw new Error('readback failed');
      return raw;
    },
    setItem(_key, value) {
      writes += 1;
      if (writes === 1) raw = value;
      else throw new Error('rollback write failure');
    },
    removeItem() { throw new Error('rollback remove failure'); },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_ROLLBACK_FAILED');
  assert.equal(result.originalPreserved, false);
  assert.notEqual(raw, previous);
});

test('verified write does not roll back a concurrent tab update', () => {
  const prepared = prepare(parsed());
  const externalRaw = '{"external":"newer"}';
  let raw = '{"old":"save"}';
  let reads = 0;
  const storage = {
    getItem() {
      reads += 1;
      if (reads === 2) raw = externalRaw;
      return raw;
    },
    setItem(_key, value) { raw = value; },
  };
  const result = writePreparedSaveVerified(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.unknownCurrentRawPreserved, true);
  assert.equal(raw, externalRaw);
});

test('reset requires explicit confirmation and removes only requested unique keys', () => {
  const removed = [];
  const storage = { removeItem(key) { removed.push(key); } };
  assert.equal(resetExplicitSaveKeys(storage, ['save']).reason, 'RESET_CONFIRMATION_REQUIRED');
  assert.deepEqual(removed, []);
  const result = resetExplicitSaveKeys(storage, ['save', 'save', 'backup'], { confirmed: true });
  assert.equal(result.status, 'reset');
  assert.deepEqual(removed, ['save', 'backup']);
});

test('reset failure never reports reset success', () => {
  const storage = { removeItem() { throw new Error('locked'); } };
  const result = resetExplicitSaveKeys(storage, ['save'], { confirmed: true });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_REMOVE_FAILED');
});

test('classification and preparation are deterministic and frozen', () => {
  const inspection = parsed();
  const a = classify(inspection);
  const b = classify(inspection);
  assert.deepEqual(a, b);
  assert.equal(Object.isFrozen(a), true);
  const prepared = prepare(inspection);
  assert.equal(Object.isFrozen(prepared), true);
  assert.equal(Object.isFrozen(prepared.nextRoot), true);
});

test('live save keys derive from the existing draft-session authority key without hardcoded save revision', () => {
  const { api, rootKey, libraryKey, draftSessionKey } = atomicFixture();
  assert.deepEqual(deriveLiveDeckSaveKeys(api), { rootKey, libraryKey, draftSessionKey });
});

test('library-only path explicitly bypasses root atomicity guard', () => {
  const { api, state, storage, sessionStorage } = atomicFixture();
  const result = captureDeckSaveAtomicitySnapshot({ storage, sessionStorage, api, state, requiresRootSave: false });
  assert.equal(result.status, 'bypass');
  assert.equal(result.reason, 'LIBRARY_ONLY_PATH_UNCHANGED');
});

test('atomic capture computes the exact library bytes existing commitDeck is expected to persist', () => {
  const { api, state, storage, sessionStorage, oldSlots, nextDeck } = atomicFixture();
  const result = captureDeckSaveAtomicitySnapshot({ storage, sessionStorage, api, state });
  const expected = JSON.parse(JSON.stringify(oldSlots));
  expected[0] = nextDeck;
  assert.equal(result.status, 'captured');
  assert.equal(result.expectedLibraryRaw, JSON.stringify({ schema: 'gameroad.deck-slots.v1', slots: expected }));
  assert.equal(expectedDeckLibraryRaw(oldSlots, 0, nextDeck), result.expectedLibraryRaw);
});

test('atomic settle accepts success only after root deck and library exact readback both match', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  f.state.deckSlots[0] = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.savedDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.saveAuthorityDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  f.storage.setItem(f.rootKey, JSON.stringify({
    v: 3,
    deck: { ...f.nextDeck, ruleId: 'FIRST_REGULATION', ruleRevision: 3 },
    keep: true,
  }));
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot,
    storage: f.storage,
    sessionStorage: f.sessionStorage,
    api: f.api,
    state: f.state,
    saveReceipt: { status: 'saved' },
  });
  assert.equal(result.status, 'saved');
  assert.equal(result.rootExact, true);
  assert.equal(result.libraryExact, true);
  assert.deepEqual(f.state.savedDeck, f.nextDeck);
});

test('authoritative root failure rolls back library and in-memory saved baseline while preserving dirty draft session', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  f.state.deckSlots[0] = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.savedDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.saveAuthorityDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.storage = 'memory';
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  f.sessionStorage.removeItem(f.draftSessionKey);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot,
    storage: f.storage,
    sessionStorage: f.sessionStorage,
    api: f.api,
    state: f.state,
    saveReceipt: { status: 'failed', reason: 'STORAGE_WRITE_FAILED' },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'AUTHORITATIVE_ROOT_SAVE_NOT_CONFIRMED');
  assert.equal(result.originalPreserved, true);
  assert.equal(f.storage.getItem(f.rootKey), f.rootRaw);
  assert.equal(f.storage.getItem(f.libraryKey), f.libraryRaw);
  assert.deepEqual(f.state.savedDeck, f.oldDeck);
  assert.deepEqual(f.state.saveAuthorityDeck, f.oldDeck);
  assert.deepEqual(f.state.deckDraft, f.nextDeck);
  assert.equal(f.sessionStorage.getItem(f.draftSessionKey), f.draftSessionRaw);
});

test('library readback mismatch leaves unverifiable durable bytes untouched', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  f.state.deckSlots[0] = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.savedDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.saveAuthorityDeck = JSON.parse(JSON.stringify(f.nextDeck));
  const attemptedRoot = JSON.stringify({ v: 3, deck: { ...f.nextDeck, ruleId: 'FIRST_REGULATION', ruleRevision: 3 } });
  const foreignLibrary = `${snapshot.expectedLibraryRaw}x`;
  f.storage.setItem(f.rootKey, attemptedRoot);
  f.storage.setItem(f.libraryKey, foreignLibrary);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot,
    storage: f.storage,
    sessionStorage: f.sessionStorage,
    api: f.api,
    state: f.state,
    saveReceipt: { status: 'saved' },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'ATOMIC_UNVERIFIED_BYTES_PRESERVED');
  assert.equal(result.failureReason, 'DECK_LIBRARY_READBACK_MISMATCH');
  assert.equal(result.originalPreserved, false);
  assert.equal(f.storage.getItem(f.rootKey), attemptedRoot);
  assert.equal(f.storage.getItem(f.libraryKey), foreignLibrary);
  assert.deepEqual(f.state.savedDeck, f.oldDeck);
  assert.deepEqual(f.state.deckDraft, f.nextDeck);
});

test('atomic settle preserves an external root while restoring only our exact library bytes', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  const foreignRoot = '{"external":"second-tab"}';
  f.storage.setItem(f.rootKey, foreignRoot);
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot, storage: f.storage, sessionStorage: f.sessionStorage,
    api: f.api, state: f.state, saveReceipt: { status: 'saved' },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'ATOMIC_UNVERIFIED_BYTES_PRESERVED');
  assert.equal(f.storage.getItem(f.rootKey), foreignRoot);
  assert.equal(f.storage.getItem(f.libraryKey), f.libraryRaw);
});

test('failed save leaves a newer draft session intact instead of restoring stale bytes', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  const newerDraft = JSON.stringify({ v: 1, deck: { main: ['newer-user-edit'], ex: [] } });
  f.sessionStorage.setItem(f.draftSessionKey, newerDraft);
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot, storage: f.storage, sessionStorage: f.sessionStorage,
    api: f.api, state: f.state, saveReceipt: { status: 'failed' },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'ATOMIC_UNVERIFIED_BYTES_PRESERVED');
  assert.equal(result.concurrentBytesPreserved, true);
  assert.equal(f.sessionStorage.getItem(f.draftSessionKey), newerDraft);
  assert.equal(f.storage.getItem(f.libraryKey), f.libraryRaw);
});

test('failed save does not overwrite a new draft when the captured session was absent', () => {
  const f = atomicFixture();
  f.sessionStorage.removeItem(f.draftSessionKey);
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  assert.equal(snapshot.draftSessionRaw, null);
  const newerDraft = '{"userNewDraft":"preserve"}';
  f.sessionStorage.setItem(f.draftSessionKey, newerDraft);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot, storage: f.storage, sessionStorage: f.sessionStorage,
    api: f.api, state: f.state, saveReceipt: { status: 'failed' },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.concurrentBytesPreserved, true);
  assert.equal(f.sessionStorage.getItem(f.draftSessionKey), newerDraft);
  assert.equal(f.draftSessionSaveCalls(), 0);
});

test('failed save preserves a newer in-memory deck draft made after snapshot', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  const newerDraft = { main: ['newer-in-flight-edit'], ex: [] };
  f.state.deckSlots[0] = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.savedDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.saveAuthorityDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.deckDraft = JSON.parse(JSON.stringify(newerDraft));
  f.sessionStorage.setItem(f.draftSessionKey, JSON.stringify({ v: 1, deck: newerDraft }));
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot, storage: f.storage, sessionStorage: f.sessionStorage,
    api: f.api, state: f.state, saveReceipt: { status: 'failed', reason: 'STORAGE_WRITE_FAILED' },
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(f.state.deckDraft, newerDraft);
  assert.equal(f.sessionStorage.getItem(f.draftSessionKey), JSON.stringify({ v: 1, deck: newerDraft }));
  assert.deepEqual(f.state.savedDeck, f.oldDeck);
  assert.equal(f.state.storage, 'memory');
});

test('failed save does not erase a concurrent edit to another deck slot', () => {
  const f = atomicFixture();
  const snapshot = captureDeckSaveAtomicitySnapshot({ storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  const newerSecondSlot = { main: ['separate-slot-edit'], ex: [] };
  f.state.deckSlots[0] = JSON.parse(JSON.stringify(f.nextDeck));
  f.state.deckSlots[1] = JSON.parse(JSON.stringify(newerSecondSlot));
  f.state.savedDeck = JSON.parse(JSON.stringify(f.nextDeck));
  f.storage.setItem(f.libraryKey, snapshot.expectedLibraryRaw);
  const result = settleDeckSaveAtomicitySnapshot({
    snapshot, storage: f.storage, sessionStorage: f.sessionStorage,
    api: f.api, state: f.state, saveReceipt: { status: 'failed' },
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(f.state.deckSlots[0], f.oldDeck);
  assert.deepEqual(f.state.deckSlots[1], newerSecondSlot);
});

test('atomic snapshot is blocked before mutation when baseline storage cannot be read', () => {
  const f = atomicFixture();
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() {},
    removeItem() {},
  };
  const result = captureDeckSaveAtomicitySnapshot({ storage, sessionStorage: f.sessionStorage, api: f.api, state: f.state });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'ATOMIC_BASELINE_READ_FAILED');
});


// Integration regressions: startup library loading and raw-byte preservation.
{

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'browser/GAMEROAD.html'), 'utf8');
const start = html.indexOf('const DECK_SLOT_COUNT=12,DECK_LIBRARY_KEY=');
const end = html.indexOf('function deckEligibility(', start);
const commitStart = html.indexOf('function commitDeck(){', end);
const commitEnd = html.indexOf('function restoreDeck(){', commitStart);
assert.ok(start > 0 && end > start && commitStart > end && commitEnd > commitStart);
const addStart = html.indexOf('function addDeckCard(', end);
const restoreStart = html.indexOf('function restoreDeck(){', commitEnd);
const restoreEnd = html.indexOf('function defaultDeckDraft(){', restoreStart);
assert.ok(addStart > end && addStart < commitStart && restoreEnd > restoreStart);
const code = html.slice(start, end) + '\n' + html.slice(addStart, commitStart) + '\n' + html.slice(commitStart, commitEnd) + '\n' + html.slice(restoreStart, restoreEnd);
const KEY = 'gmr.deckSlots.v1';
const slots = () => Array.from({length:12}, (_,i) => ({main: i === 0 ? ['A'] : i === 8 ? ['B'] : [],ex:[]}));
const raw = (items=slots()) => JSON.stringify({schema:'gameroad.deck-slots.v1',slots:items});

function harness(initial, opts={}) {
  const map = new Map();
  if (initial !== undefined) map.set(KEY, initial);
  const messages = [];
  let sessionClears = 0, written = 0;
  const store = {
    getItem(key) {
      if (opts.readThrows && key === KEY) throw Error('denied');
      if (opts.concurrentRaw && key === KEY && written > 0 && !opts.concurrentInjected) {
        opts.concurrentInjected = true;
        map.set(KEY, opts.concurrentRaw);
      }
      if (opts.readbackMismatch && key === KEY && written > 0 && !opts.mismatchedOnce) {
        opts.mismatchedOnce = true; return 'MISMATCH';
      }
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key,value) {
      if (opts.writeThrows && key === KEY) throw Error('quota');
      map.set(key,String(value));
      if (key === KEY) written++;
    },
    removeItem(key) { map.delete(key); }
  };
  const state = {savedDeck:{main:['A'],ex:[]},savedDeckRule:null,deckDraft:{main:['A'],ex:[]},selectedDeckIndex:0,deckSlots:null};
  const context = createContext({
    SAVE_KEY:'gmr', DECK_RULE:{id:'RULE',revision:3,maxMain:40,maxEx:7}, DEFAULT_DECK:['A'],
    CARDS:{A:{},B:{}}, localStorage:store, state,
    publicDeckCard:()=>true, deckSlot:()=> 'main', canonicalDeckName: x=>x,
    clearDeckDraftSession:()=>sessionClears++, toast: x=>messages.push(x),
    renderCards:()=>{}, renderSetupDeckStatus:()=>{}, deckDirty:()=>false
  });
  runInContext(code,context);
  const call = fn => runInContext(fn.endsWith(')') ? fn : fn + '()',context);
  return {call, store, map, state, messages, get sessionClears(){return sessionClears;},get written(){return written;}};
}

test('absent library creates first deck once', () => {
  const x=harness(undefined);
  x.call('initDeckLibrary');
  assert.equal(x.written,1);
  assert.equal(JSON.parse(x.map.get(KEY)).slots.length,12);
  assert.deepEqual(Array.from(x.state.deckSlots[0].main),['A']);
});

test('healthy existing 12-slot library is not rewritten on boot', () => {
  const existing=JSON.stringify(JSON.parse(raw()),null,2);
  const x=harness(existing);
  x.call('initDeckLibrary');
  assert.equal(x.map.get(KEY),existing);
  assert.equal(x.written,0);
  assert.deepEqual(Array.from(x.state.deckSlots[8].main),['B']);
});

test('invalid JSON survives startup and blocks later saves without erasing draft', () => {
  const original='{malformed';
  const x=harness(original);
  x.call('initDeckLibrary');
  assert.equal(x.map.get(KEY),original);
  assert.equal(x.sessionClears,0);
  x.state.deckDraft={main:['B'],ex:[]};
  assert.equal(x.call('commitDeck'),false);
  assert.equal(x.map.get(KEY),original);
  assert.deepEqual(Array.from(x.state.deckDraft.main),['B']);
  assert.ok(x.messages.some(m=>m.includes('保護')));
});

test('unsupported schema survives without auto-repair overwrite', () => {
  const original=JSON.stringify({schema:'future.v2',slots});
  const x=harness(original);
  x.call('initDeckLibrary');
  assert.equal(x.map.get(KEY),original);
  assert.equal(x.written,0);
  assert.equal(x.call('writeDeckLibrary'),false);
});

test('one unknown card protects original bytes while keeping other valid slots visible', () => {
  const items=slots();
  items[5]={main:['CARD_NO_LONGER_KNOWN'],ex:[]};
  const original=raw(items);
  const x=harness(original);
  x.call('initDeckLibrary');
  assert.equal(x.map.get(KEY),original);
  assert.deepEqual(Array.from(x.state.deckSlots[8].main),['B']);
  assert.deepEqual(Array.from(x.state.deckSlots[5].main),[]);
  assert.equal(x.call('writeDeckLibrary'),false);
});

test('external second-tab change makes a subsequent save fail closed', () => {
  const x=harness(raw());
  x.call('initDeckLibrary');
  x.map.set(KEY,'EXTERNAL_CHANGE');
  x.state.deckDraft={main:['B'],ex:[]};
  assert.equal(x.call('commitDeck'),false);
  assert.equal(x.map.get(KEY),'EXTERNAL_CHANGE');
  assert.deepEqual(Array.from(x.state.deckSlots[0].main),['A']);
});

test('storage read error never initializes over unseen data', () => {
  const x=harness(raw(),{readThrows:true});
  x.call('initDeckLibrary');
  assert.equal(x.map.get(KEY),raw());
  assert.equal(x.written,0);
  assert.equal(x.call('writeDeckLibrary'),false);
});

test('storage write refusal leaves raw bytes unchanged', () => {
  const original=raw();
  const x=harness(original,{writeThrows:true});
  x.call('initDeckLibrary');
  assert.equal(x.call('writeDeckLibrary'),false);
  assert.equal(x.map.get(KEY),original);
});

test('readback mismatch rolls back the exact previous raw value', () => {
  const original=raw();
  const x=harness(original,{readbackMismatch:true});
  x.call('initDeckLibrary');
  x.state.deckSlots[2]={main:['B'],ex:[]};
  assert.equal(x.call('writeDeckLibrary'),false);
  assert.equal(x.map.get(KEY),original);
});

test('valid explicit save writes and verifies exactly one current slot', () => {
  const x=harness(raw());
  x.call('initDeckLibrary');
  x.state.deckSlots[3]={main:['B'],ex:[]};
  assert.equal(x.call('writeDeckLibrary'),true);
  assert.deepEqual(JSON.parse(x.map.get(KEY)).slots[3].main,['B']);
  assert.deepEqual(JSON.parse(x.map.get(KEY)).slots[8].main,['B']);
});


test('protected switch keeps the previous draft session and original selected index', () => {
  const items=slots();
  items[5]={main:['UNKNOWN_CARD'],ex:[]};
  const x=harness(raw(items));
  x.map.set('gameroad:selectedDeckIndex','0');
  x.call('initDeckLibrary');
  const priorClears=x.sessionClears;
  assert.equal(x.call('selectDeckIndex(8)'),true);
  assert.equal(x.sessionClears,priorClears);
  assert.equal(x.map.get('gameroad:selectedDeckIndex'),'0');
  assert.equal(x.state.selectedDeckIndex,8);
  assert.equal(x.call('writeDeckLibrary'),false);
});

test('readback mismatch does not roll back another tab current save', () => {
  const other=slots();
  other[1]={main:['B'],ex:[]};
  const external=raw(other),x=harness(raw(),{concurrentRaw:external});
  x.call('initDeckLibrary');
  x.state.deckSlots[2]={main:['B'],ex:[]};
  assert.equal(x.call('writeDeckLibrary'),false);
  assert.equal(x.map.get(KEY),external);
  assert.equal(x.call('writeDeckLibrary'),false);
});


test('protected library rejects card add, card remove and restore without mutating the draft', () => {
  const items=slots();
  items[5]={main:['UNKNOWN_CARD'],ex:[]};
  const x=harness(raw(items));
  x.call('initDeckLibrary');
  const before=JSON.stringify(x.state.deckDraft);
  assert.equal(x.call("addDeckCard('B')").ok,false);
  assert.equal(x.call("removeDeckCard('main',0)"),false);
  assert.equal(x.call('restoreDeck'),false);
  assert.equal(JSON.stringify(x.state.deckDraft),before);
  assert.equal(x.sessionClears,0);
});


}

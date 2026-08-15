import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectRawSave,
  classifyDeckProjection,
  prepareExplicitDeckCommit,
  readStorage,
  writePreparedSave,
  resetExplicitSaveKeys,
  DECK_SAVE_RECOVERY_CORE,
} from '../browser/deck-save-recovery-core.mjs';

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

test('schema is stable', () => {
  assert.equal(DECK_SAVE_RECOVERY_CORE.schema, 'gameroad.deck-save-recovery.v1');
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

test('newer save revision blocks', () => {
  const result = classify(parsed(), { ...currentProjection, saveRevision: 4 });
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

test('write success is reported only after setItem returns', () => {
  let stored = null;
  const inspection = parsed();
  const prepared = prepare(inspection);
  const storage = { setItem(key, value) { stored = [key, value]; } };
  const result = writePreparedSave(storage, 'save', prepared);
  assert.equal(result.status, 'saved');
  assert.equal(stored[0], 'save');
  assert.equal(stored[1], prepared.serialized);
});

test('write failure never reports saved success', () => {
  const inspection = parsed();
  const prepared = prepare(inspection);
  const storage = { setItem() { throw new Error('quota'); } };
  const result = writePreparedSave(storage, 'save', prepared);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'STORAGE_WRITE_FAILED');
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

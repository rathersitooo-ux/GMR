import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DECK_SAVE_ACK_CORE,
  DECK_SLOT_COUNT,
  DECK_SLOT_STORAGE_CORE,
  GAMEROAD_STARTER_DECK_40,
  activeDeckSlot,
  applyDeckEdit,
  beginDeckSave,
  createDeckMatchStartSnapshot,
  createDeckSaveAckState,
  createDeckSlotStorage,
  projectLegacyDeckToSlots,
  receiveDeckSaveAck,
  replaceDeckSlot,
  restoreDeckSlotStorage,
  selectDeckSlot,
  timeoutDeckSave,
} from '../browser/deck-save-ack-core.mjs';

function dirtyState(signature = 'deck-v2') {
  return applyDeckEdit(createDeckSaveAckState({
    deckId: 'main',
    baselineSignature: 'deck-v1',
  }), { signature });
}

function pendingState({ requestId = 'req-1', revision = 7, signature = 'deck-v2' } = {}) {
  return beginDeckSave(dirtyState(signature), {
    requestId,
    expectedRevision: revision,
  });
}

function matchingAck({ requestId = 'req-1', revision = 7, signature = 'deck-v2', success = true } = {}) {
  return { requestId, deckId: 'main', signature, revision, success };
}

test('starts clean and becomes dirty only when the deck signature changes', () => {
  const initial = createDeckSaveAckState({ deckId: 'main', baselineSignature: 'deck-v1' });
  assert.equal(DECK_SAVE_ACK_CORE.schema, 'gameroad.deck-save-ack.v1');
  assert.equal(initial.dirty, false);
  assert.equal(Object.isFrozen(initial), true);

  const same = applyDeckEdit(initial, { signature: 'deck-v1' });
  assert.equal(same, initial);

  const edited = applyDeckEdit(initial, { signature: 'deck-v2' });
  assert.equal(edited.dirty, true);
  assert.equal(edited.editGeneration, 1);
  assert.equal(edited.currentSignature, 'deck-v2');
});

test('a save request snapshots exact request, deck, signature, generation, and caller-provided revision', () => {
  const pending = pendingState();
  assert.deepEqual(pending.pending, {
    requestId: 'req-1',
    deckId: 'main',
    signature: 'deck-v2',
    editGeneration: 1,
    expectedRevision: 7,
  });
  assert.deepEqual(pending.seenRequestIds, ['req-1']);
  assert.equal(pending.dirty, true);
  assert.throws(() => beginDeckSave(pending, { requestId: 'req-2', expectedRevision: 8 }), /SAVE_ALREADY_PENDING/);
});

test('only an exact successful ACK clears a still-unchanged pending edit', () => {
  const pending = pendingState();
  const result = receiveDeckSaveAck(pending, matchingAck());
  assert.equal(result.status, 'accepted');
  assert.equal(result.reason, 'SAVE_CONFIRMED');
  assert.equal(result.state.pending, null);
  assert.equal(result.state.dirty, false);
  assert.equal(result.state.baselineSignature, 'deck-v2');
  assert.deepEqual(result.state.lastAccepted, {
    requestId: 'req-1',
    deckId: 'main',
    signature: 'deck-v2',
    revision: 7,
  });
});

test('a user edit after send is never erased by the older matching ACK', () => {
  const pending = pendingState();
  const editedAgain = applyDeckEdit(pending, { signature: 'deck-v3' });
  const result = receiveDeckSaveAck(editedAgain, matchingAck());
  assert.equal(result.status, 'accepted');
  assert.equal(result.state.baselineSignature, 'deck-v2');
  assert.equal(result.state.currentSignature, 'deck-v3');
  assert.equal(result.state.dirty, true);
});

test('even edit-away-then-back after send stays conservatively dirty until another save', () => {
  let state = pendingState();
  state = applyDeckEdit(state, { signature: 'deck-v3' });
  state = applyDeckEdit(state, { signature: 'deck-v2' });
  const result = receiveDeckSaveAck(state, matchingAck());
  assert.equal(result.status, 'accepted');
  assert.equal(result.state.currentSignature, result.state.baselineSignature);
  assert.equal(result.state.dirty, true);
});

test('wrong request, deck, signature, or revision cannot consume the pending save', () => {
  const cases = [
    [matchingAck({ requestId: 'req-other' }), 'REQUEST_ID_MISMATCH'],
    [{ ...matchingAck(), deckId: 'side' }, 'DECK_ID_MISMATCH'],
    [matchingAck({ signature: 'deck-other' }), 'SIGNATURE_MISMATCH'],
    [matchingAck({ revision: 8 }), 'REVISION_MISMATCH'],
  ];

  for (const [ack, reason] of cases) {
    const pending = pendingState();
    const result = receiveDeckSaveAck(pending, ack);
    assert.equal(result.status, 'ignored');
    assert.equal(result.reason, reason);
    assert.equal(result.state, pending);
    assert.equal(result.state.pending.requestId, 'req-1');
    assert.equal(result.state.dirty, true);
  }
});

test('generic LoadDeck-like payloads without requestId and revision cannot masquerade as save ACKs', () => {
  const pending = pendingState();
  const genericLoadDeckPayload = {
    success: true,
    deckId: 'main',
    signature: 'deck-v2',
    decks: [{ deckId: 'main', cardIds: ['A', 'B'] }],
  };
  const result = receiveDeckSaveAck(pending, genericLoadDeckPayload);
  assert.equal(result.status, 'ignored');
  assert.equal(result.reason, 'ACK_IDENTITY_INCOMPLETE');
  assert.equal(result.state, pending);
  assert.notEqual(result.state.pending, null);
});

test('a matching negative ACK ends that request but preserves dirty state', () => {
  const pending = pendingState();
  const result = receiveDeckSaveAck(pending, matchingAck({ success: false }));
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'SAVE_REJECTED');
  assert.equal(result.state.pending, null);
  assert.equal(result.state.dirty, true);
  assert.equal(result.state.baselineSignature, 'deck-v1');
});

test('timeout ends only the matching request and a late ACK cannot clean the deck', () => {
  const pending = pendingState();
  const wrongTimeout = timeoutDeckSave(pending, { requestId: 'req-other' });
  assert.equal(wrongTimeout.status, 'ignored');
  assert.equal(wrongTimeout.state, pending);

  const timedOut = timeoutDeckSave(pending, { requestId: 'req-1' });
  assert.equal(timedOut.status, 'timed_out');
  assert.equal(timedOut.state.pending, null);
  assert.equal(timedOut.state.dirty, true);

  const late = receiveDeckSaveAck(timedOut.state, matchingAck());
  assert.equal(late.status, 'ignored');
  assert.equal(late.reason, 'NO_PENDING_SAVE');
  assert.equal(late.state.dirty, true);
});

test('an old ACK cannot consume a newer request', () => {
  const first = pendingState();
  const timedOut = timeoutDeckSave(first, { requestId: 'req-1' }).state;
  const second = beginDeckSave(timedOut, { requestId: 'req-2', expectedRevision: 8 });

  const old = receiveDeckSaveAck(second, matchingAck());
  assert.equal(old.status, 'ignored');
  assert.equal(old.reason, 'REQUEST_ID_MISMATCH');
  assert.equal(old.state.pending.requestId, 'req-2');

  const current = receiveDeckSaveAck(old.state, matchingAck({ requestId: 'req-2', revision: 8 }));
  assert.equal(current.status, 'accepted');
  assert.equal(current.state.dirty, false);
});

test('an already accepted exact success ACK is idempotent', () => {
  const accepted = receiveDeckSaveAck(pendingState(), matchingAck());
  const duplicate = receiveDeckSaveAck(accepted.state, matchingAck());
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.reason, 'ACK_ALREADY_ACCEPTED');
  assert.equal(duplicate.state, accepted.state);
});

test('request IDs cannot be reused after timeout, failure, or success', () => {
  const timedOut = timeoutDeckSave(pendingState(), { requestId: 'req-1' }).state;
  assert.throws(() => beginDeckSave(timedOut, { requestId: 'req-1', expectedRevision: 8 }), /REQUEST_ID_REUSED/);

  const failed = receiveDeckSaveAck(pendingState(), matchingAck({ success: false })).state;
  assert.throws(() => beginDeckSave(failed, { requestId: 'req-1', expectedRevision: 8 }), /REQUEST_ID_REUSED/);

  const accepted = receiveDeckSaveAck(pendingState(), matchingAck()).state;
  assert.throws(() => beginDeckSave(accepted, { requestId: 'req-1', expectedRevision: 8 }), /REQUEST_ID_REUSED/);
});

test('revision matching is exact and never inferred by the core', () => {
  assert.throws(() => beginDeckSave(dirtyState(), { requestId: 'req-1' }), /EXPECTEDREVISION_REQUIRED/);

  const stringRevision = beginDeckSave(dirtyState(), {
    requestId: 'req-string',
    expectedRevision: 'rev-0007',
  });
  const numericMismatch = receiveDeckSaveAck(stringRevision, matchingAck({
    requestId: 'req-string',
    revision: 7,
  }));
  assert.equal(numericMismatch.status, 'ignored');
  assert.equal(numericMismatch.reason, 'REVISION_MISMATCH');

  const exact = receiveDeckSaveAck(stringRevision, matchingAck({
    requestId: 'req-string',
    revision: 'rev-0007',
  }));
  assert.equal(exact.status, 'accepted');
});

function validMatchSelection() {
  return {
    savedDeck: { main: ['SP_A', 'HT_2'], ex: ['EX_1'] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: '2p',
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.naki',
  };
}

test('match-start snapshot captures current deck/setup/selection and is mutation-isolated', () => {
  const state = validMatchSelection();
  const seen = [];
  const snapshot = createDeckMatchStartSnapshot(state, {
    validateDeck: (deck, options) => {
      seen.push({ deck, options });
      return { ok: true };
    },
  });

  assert.deepEqual(seen, [{
    deck: { main: ['SP_A', 'HT_2'], ex: ['EX_1'] },
    options: { forBattle: true },
  }]);
  state.savedDeck.main[0] = 'MUTATED';
  state.savedDeck.ex.push('EX_2');
  state.setupMode = '4p';
  state.selectedPartnerId = 'partner.other';

  assert.deepEqual(snapshot, {
    schema: 'gameroad.browser.match-start-snapshot.v1',
    deck: {
      main: ['SP_A', 'HT_2'],
      ex: ['EX_1'],
      ruleId: 'FIRST_REGULATION',
      ruleRevision: 3,
    },
    setup: { mode: '2p', content: 'road_shield' },
    selection: {
      playerCharacterId: 'partner.naki',
      selectedPartnerId: 'partner.naki',
    },
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.deck.main), true);
  assert.throws(() => snapshot.deck.main.push('SP_K'), TypeError);
});

test('same current match selection produces deterministic snapshot without time/random fields', () => {
  const validateDeck = () => ({ ok: true });
  assert.deepEqual(
    createDeckMatchStartSnapshot(validMatchSelection(), { validateDeck }),
    createDeckMatchStartSnapshot(validMatchSelection(), { validateDeck }),
  );
});

test('invalid current deck fails closed before a match-start snapshot exists', () => {
  assert.throws(
    () => createDeckMatchStartSnapshot(validMatchSelection(), {
      validateDeck: () => ({ ok: false, errors: ['ROYAL_COUNT_INVALID'] }),
    }),
    /MATCH_START_DECK_INVALID:ROYAL_COUNT_INVALID/,
  );
});

test('missing setup selection fails closed', () => {
  const state = validMatchSelection();
  state.setupContent = '';
  assert.throws(
    () => createDeckMatchStartSnapshot(state, { validateDeck: () => ({ ok: true }) }),
    /MATCH_START_SETUP_CONTENT_REQUIRED/,
  );
});

test('Browser startMatch consumes the immutable snapshot authority instead of mutable savedDeck/setup state', () => {
  const html = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.match(html, /GAMEROAD_LOBBYDECK_R4_MATCHSTART_SNAPSHOT/);
  assert.match(html, /import \{ createDeckMatchStartSnapshot \} from "\.\/deck-save-ack-core\.mjs"/);
  const hit = html.match(/function startMatch\(\)\{.*?return state\.match\}/s);
  assert.ok(hit, 'startMatch function must be uniquely discoverable');
  const body = hit[0];
  assert.match(body, /GAMEROAD_CREATE_DECK_MATCH_START_SNAPSHOT/);
  assert.match(body, /deckStartSnapshot:snapshot/);
  assert.match(body, /snapshot\.setup\.mode/);
  assert.match(body, /snapshot\.setup\.content/);
  assert.match(body, /snapshot\.deck\.main/);
  assert.match(body, /snapshot\.deck\.ruleId/);
  assert.doesNotMatch(body, /validateDeck\(state\.savedDeck/);
  assert.doesNotMatch(body, /makePlayer\([^)]*state\.savedDeck\.main/);
});

test('fresh 12-slot storage has exactly one 40-card starter deck and eleven empty decks', () => {
  const storage = createDeckSlotStorage();
  assert.equal(DECK_SLOT_STORAGE_CORE.schema, 'gameroad.deck-slot-storage.v1');
  assert.equal(DECK_SLOT_STORAGE_CORE.slotCount, 12);
  assert.equal(DECK_SLOT_COUNT, 12);
  assert.equal(storage.decks.length, 12);
  assert.equal(storage.activeDeckIndex, 0);
  assert.equal(storage.source, 'fresh_starter');
  assert.deepEqual(storage.decks[0].main, [...GAMEROAD_STARTER_DECK_40]);
  assert.equal(storage.decks[0].main.length, 40);
  assert.deepEqual(storage.decks[0].ex, []);
  assert.equal(storage.decks[0].ruleId, 'FIRST_REGULATION');
  assert.equal(storage.decks[0].ruleRevision, 3);
  for (const slot of storage.decks.slice(1)) {
    assert.deepEqual(slot, { main: [], ex: [], ruleId: null, ruleRevision: null });
  }
});

test('starter 40 is the explicit 13+10+10+7 set and contains no generated fifth-suit cards', () => {
  const expected = [
    'SP_A','SP_2','SP_3','SP_4','SP_5','SP_6','SP_7','SP_8','SP_9','SP_10','SP_J','SP_Q','SP_K',
    'CL_A','CL_2','CL_3','CL_4','CL_5','CL_6','CL_7','CL_8','CL_9','CL_10',
    'DI_A','DI_2','DI_3','DI_4','DI_5','DI_6','DI_7','DI_8','DI_9','DI_10',
    'HT_A','HT_2','HT_3','HT_4','HT_5','HT_6','HT_7',
  ];
  assert.deepEqual([...GAMEROAD_STARTER_DECK_40], expected);
  assert.equal(new Set(GAMEROAD_STARTER_DECK_40).size, 40);
  assert.equal(GAMEROAD_STARTER_DECK_40.filter(id => id.startsWith('SP_')).length, 13);
  assert.equal(GAMEROAD_STARTER_DECK_40.filter(id => id.startsWith('CL_')).length, 10);
  assert.equal(GAMEROAD_STARTER_DECK_40.filter(id => id.startsWith('DI_')).length, 10);
  assert.equal(GAMEROAD_STARTER_DECK_40.filter(id => id.startsWith('HT_')).length, 7);
  assert.equal(GAMEROAD_STARTER_DECK_40.some(id => id.startsWith('DK_') || id.startsWith('LUNA_')), false);
});

test('legacy single deck is projected byte-for-value into deck 1 without filling any other slot', () => {
  const legacyDeck = { main: ['SP_A', 'HT_2', 'CL_3'], ex: ['EX_KEEP'] };
  const storage = projectLegacyDeckToSlots({
    legacyDeck,
    legacyRule: { id: 'FIRST_REGULATION', revision: 2 },
  });
  assert.equal(storage.source, 'legacy_single');
  assert.equal(storage.activeDeckIndex, 0);
  assert.deepEqual(storage.decks[0], {
    main: ['SP_A', 'HT_2', 'CL_3'],
    ex: ['EX_KEEP'],
    ruleId: 'FIRST_REGULATION',
    ruleRevision: 2,
  });
  for (const slot of storage.decks.slice(1)) assert.equal(slot.main.length + slot.ex.length, 0);
  legacyDeck.main[0] = 'MUTATED';
  assert.equal(storage.decks[0].main[0], 'SP_A');
});

test('persisted 12-slot storage restores the selected index without substituting another deck', () => {
  let storage = createDeckSlotStorage();
  storage = replaceDeckSlot(storage, 7, {
    deck: { main: ['DI_A', 'DI_2'], ex: [] },
    rule: { id: 'OTHER_REG', revision: 9 },
  });
  storage = selectDeckSlot(storage, 7);
  const restored = restoreDeckSlotStorage({
    deckList: storage.decks,
    activeDeckIndex: storage.activeDeckIndex,
  });
  assert.equal(restored.activeDeckIndex, 7);
  assert.deepEqual(activeDeckSlot(restored), {
    main: ['DI_A', 'DI_2'],
    ex: [],
    ruleId: 'OTHER_REG',
    ruleRevision: 9,
  });
  assert.notDeepEqual(activeDeckSlot(restored), restored.decks[0]);
});

test('selecting or replacing a slot never mutates the previous frozen storage object', () => {
  const first = createDeckSlotStorage();
  const selected = selectDeckSlot(first, 11);
  const replaced = replaceDeckSlot(selected, 11, {
    deck: { main: ['CL_A'], ex: [] },
    rule: { id: 'FIRST_REGULATION', revision: 3 },
  });
  assert.equal(first.activeDeckIndex, 0);
  assert.equal(first.decks[11].main.length, 0);
  assert.equal(selected.activeDeckIndex, 11);
  assert.equal(selected.decks[11].main.length, 0);
  assert.deepEqual(replaced.decks[11].main, ['CL_A']);
  assert.equal(Object.isFrozen(replaced), true);
  assert.equal(Object.isFrozen(replaced.decks), true);
});

test('malformed saved slot count or active index fails closed instead of silently repairing', () => {
  assert.throws(
    () => restoreDeckSlotStorage({ deckList: Array.from({ length: 11 }, () => ({ main: [], ex: [] })), activeDeckIndex: 0 }),
    /DECK_LIST_INVALID/,
  );
  assert.throws(
    () => restoreDeckSlotStorage({ deckList: createDeckSlotStorage().decks, activeDeckIndex: 12 }),
    /ACTIVE_DECK_INDEX_INVALID/,
  );
  assert.throws(() => selectDeckSlot(createDeckSlotStorage(), -1), /ACTIVE_DECK_INDEX_INVALID/);
});

test('fresh initialization is explicit and never treats an arbitrary runtime legacy deck as the starter', () => {
  const arbitraryLegacy = { main: ['SP_A'], ex: [] };
  const fresh = restoreDeckSlotStorage({
    fresh: true,
    legacyDeck: arbitraryLegacy,
  });
  assert.equal(fresh.source, 'fresh_starter');
  assert.equal(fresh.decks[0].main.length, 40);
  assert.notDeepEqual(fresh.decks[0].main, arbitraryLegacy.main);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DECK_SAVE_ACK_CORE,
  applyDeckEdit,
  beginDeckSave,
  createDeckMatchStartSnapshot,
  createDeckSaveAckState,
  receiveDeckSaveAck,
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

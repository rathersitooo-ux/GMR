import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_HIDDEN_HAND_RUNTIME,
  consumeNewBaseHiddenHandPrivilege,
  createNewBaseHiddenHandRuntime,
  projectNewBaseHiddenHandAddContext,
} from '../browser/new-base-hidden-hand-runtime-core.mjs';
import { createDeckMatchStartSnapshot } from '../browser/deck-save-ack-core.mjs';

function selection(savedDeck = {
  main: ['SP_A', 'HT_2', 'DI_3'],
  ex: [],
  hiddenHandCardIds: ['HT_2'],
}) {
  return {
    savedDeck,
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: '2p',
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.naki',
  };
}

const validateDeck = () => ({ ok: true });

function hiddenSnapshot(savedDeck) {
  return createDeckMatchStartSnapshot(selection(savedDeck), { validateDeck });
}

test('match-start snapshot carries exactly the already-registered hidden Road identity and isolates later mutation', () => {
  const savedDeck = {
    main: ['SP_A', 'HT_2', 'DI_3'],
    ex: [],
    hiddenHandCardIds: ['HT_2'],
  };
  const snapshot = hiddenSnapshot(savedDeck);
  savedDeck.hiddenHandCardIds[0] = 'DI_3';
  savedDeck.main[1] = 'MUTATED';

  assert.deepEqual(snapshot.deck.hiddenHandCardIds, ['HT_2']);
  assert.deepEqual(snapshot.deck.main, ['SP_A', 'HT_2', 'DI_3']);
  assert.ok(Object.isFrozen(snapshot.deck.hiddenHandCardIds));
});

test('legacy match-start snapshot remains shape-compatible when no hidden registration was supplied', () => {
  const snapshot = hiddenSnapshot({ main: ['SP_A', 'HT_2'], ex: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.deck, 'hiddenHandCardIds'), false);
  assert.deepEqual(snapshot.deck.main, ['SP_A', 'HT_2']);
});

test('hidden registration fails closed unless it is exactly one non-empty main-deck card identity', () => {
  assert.throws(
    () => hiddenSnapshot({ main: ['SP_A'], ex: [], hiddenHandCardIds: [] }),
    /MATCH_START_HIDDEN_HAND_REGISTRATION_INVALID/,
  );
  assert.throws(
    () => hiddenSnapshot({ main: ['SP_A'], ex: [], hiddenHandCardIds: ['SP_A', 'HT_2'] }),
    /MATCH_START_HIDDEN_HAND_REGISTRATION_INVALID/,
  );
  assert.throws(
    () => hiddenSnapshot({ main: ['SP_A'], ex: [], hiddenHandCardIds: ['   '] }),
    /MATCH_START_HIDDEN_HAND_REGISTRATION_INVALID/,
  );
  assert.throws(
    () => hiddenSnapshot({ main: ['SP_A'], ex: [], hiddenHandCardIds: ['HT_2'] }),
    /MATCH_START_HIDDEN_HAND_CARD_NOT_IN_MAIN_DECK/,
  );
});

test('runtime exposes only exact hidden identity and available privilege for the existing gold-button context', () => {
  const runtime = createNewBaseHiddenHandRuntime(hiddenSnapshot());
  assert.equal(runtime.schema, NEW_BASE_HIDDEN_HAND_RUNTIME.schema);
  assert.deepEqual(projectNewBaseHiddenHandAddContext(runtime), {
    reservedCardId: 'HT_2',
    hiddenPrivilegeAvailable: true,
  });
  assert.deepEqual(Object.keys(runtime).sort(), [
    'hiddenPrivilegeAvailable',
    'reservedCardId',
    'schema',
    'source',
  ]);
});

test('staging or button press is not consumption evidence', () => {
  const runtime = createNewBaseHiddenHandRuntime(hiddenSnapshot());
  const result = consumeNewBaseHiddenHandPrivilege(runtime, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: false,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'authoritative-road-commit-required');
  assert.strictEqual(result.runtime, runtime);
  assert.equal(result.runtime.hiddenPrivilegeAvailable, true);
});

test('only the exact reserved physical card on an authoritative legal Road commit consumes privilege once', () => {
  const runtime = createNewBaseHiddenHandRuntime(hiddenSnapshot());
  const mismatch = consumeNewBaseHiddenHandPrivilege(runtime, {
    cardId: 'DI_3',
    authoritativeLegalRoadCommit: true,
  });
  assert.equal(mismatch.accepted, false);
  assert.equal(mismatch.reason, 'reserved-card-mismatch');
  assert.strictEqual(mismatch.runtime, runtime);

  const committed = consumeNewBaseHiddenHandPrivilege(runtime, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: true,
  });
  assert.equal(committed.accepted, true);
  assert.equal(committed.reason, 'authoritative-hidden-road-commit');
  assert.equal(committed.runtime.reservedCardId, 'HT_2');
  assert.equal(committed.runtime.hiddenPrivilegeAvailable, false);

  const duplicate = consumeNewBaseHiddenHandPrivilege(committed.runtime, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: true,
  });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, 'already-consumed');
  assert.strictEqual(duplicate.runtime, committed.runtime);
});

test('runtime rejects missing/mismatched registration and owns no fourth-hand gameplay semantics', () => {
  assert.throws(
    () => createNewBaseHiddenHandRuntime(hiddenSnapshot({ main: ['SP_A'], ex: [] })),
    /HIDDEN_HAND_MATCH_START_REGISTRATION_REQUIRED/,
  );
  assert.throws(
    () => createNewBaseHiddenHandRuntime({ deck: { main: ['SP_A'], hiddenHandCardIds: ['HT_2'] } }),
    /HIDDEN_HAND_RESERVED_CARD_NOT_IN_MAIN_DECK/,
  );

  const runtime = createNewBaseHiddenHandRuntime(hiddenSnapshot());
  for (const forbidden of [
    'jankenHand', 'fourthHand', 'winsAgainst', 'effect', 'battleAddend',
    'manaCost', 'extraRoad', 'replacement', 'copyPrivilege',
  ]) {
    assert.equal(forbidden in runtime, false, forbidden);
  }
});

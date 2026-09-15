import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_HIDDEN_HAND_REGISTRATION_SCHEMA,
  HIDDEN_HAND_REGISTRATION_FIELD,
  createDeckHiddenHandRegistrationSnapshot,
  readDeckHiddenHandRegistration,
  withDeckHiddenHandRegistration,
} from '../browser/deck-hidden-hand-registration-core.mjs';

function baseDeck() {
  return {
    ruleId: 'FIRST_REGULATION',
    ruleRevision: 3,
    main: ['SP_A', 'HT_2', 'DI_3'],
    ex: ['EX_1'],
    metadata: { note: 'preserve-me' },
  };
}

test('registration absence remains explicit and does not invent a hidden card', () => {
  assert.deepEqual(readDeckHiddenHandRegistration(baseDeck()), {
    present: false,
    cardId: null,
  });
});

test('writer registers exactly the explicitly selected existing main-deck card without mutating source', () => {
  const source = baseDeck();
  const before = structuredClone(source);
  const next = withDeckHiddenHandRegistration(source, 'HT_2');

  assert.deepEqual(source, before);
  assert.deepEqual(next[HIDDEN_HAND_REGISTRATION_FIELD], ['HT_2']);
  assert.deepEqual(next.main, source.main);
  assert.notStrictEqual(next.main, source.main);
  assert.deepEqual(next.ex, source.ex);
  assert.notStrictEqual(next.ex, source.ex);
  assert.equal(next.ruleId, source.ruleId);
  assert.deepEqual(next.metadata, source.metadata);
});

test('registration reader requires exact one non-empty card that still belongs to main deck', () => {
  for (const ids of [[], ['HT_2', 'DI_3'], [''], ['   '], null, 'HT_2']) {
    assert.throws(
      () => readDeckHiddenHandRegistration({ ...baseDeck(), [HIDDEN_HAND_REGISTRATION_FIELD]: ids }),
      /HIDDEN_HAND_REGISTRATION_EXACT_ONE_REQUIRED/,
    );
  }
  assert.throws(
    () => readDeckHiddenHandRegistration({ ...baseDeck(), [HIDDEN_HAND_REGISTRATION_FIELD]: ['MISSING'] }),
    /HIDDEN_HAND_REGISTERED_CARD_NOT_IN_MAIN_DECK/,
  );
});

test('writer refuses blank or non-main selection instead of auto-selecting or substituting another card', () => {
  assert.throws(
    () => withDeckHiddenHandRegistration(baseDeck(), '   '),
    /HIDDEN_HAND_SELECTED_CARD_ID_REQUIRED/,
  );
  assert.throws(
    () => withDeckHiddenHandRegistration(baseDeck(), 'MISSING'),
    /HIDDEN_HAND_SELECTED_CARD_NOT_IN_MAIN_DECK/,
  );
});

test('snapshot freezes the exact registered identity and source main-deck membership against later mutation', () => {
  const deck = withDeckHiddenHandRegistration(baseDeck(), 'HT_2');
  const snapshot = createDeckHiddenHandRegistrationSnapshot(deck);
  deck[HIDDEN_HAND_REGISTRATION_FIELD][0] = 'DI_3';
  deck.main[1] = 'MUTATED';

  assert.equal(snapshot.schema, DECK_HIDDEN_HAND_REGISTRATION_SCHEMA);
  assert.equal(snapshot.cardId, 'HT_2');
  assert.deepEqual(snapshot.sourceMainCardIds, ['SP_A', 'HT_2', 'DI_3']);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.sourceMainCardIds), true);
});

test('snapshot requires an explicit registration and owns no deck construction semantics', () => {
  assert.throws(
    () => createDeckHiddenHandRegistrationSnapshot(baseDeck()),
    /HIDDEN_HAND_REGISTRATION_REQUIRED/,
  );
  const snapshot = createDeckHiddenHandRegistrationSnapshot(
    withDeckHiddenHandRegistration(baseDeck(), 'HT_2'),
  );
  for (const forbidden of ['draw', 'shuffle', 'replacement', 'mana', 'jankenHand', 'effect']) {
    assert.equal(forbidden in snapshot, false, forbidden);
  }
});

test('deck record and main-deck identifiers fail closed when malformed', () => {
  for (const value of [null, undefined, [], 'deck']) {
    assert.throws(() => readDeckHiddenHandRegistration(value), TypeError);
  }
  assert.throws(
    () => readDeckHiddenHandRegistration({ main: ['SP_A', ''] }),
    /HIDDEN_HAND_MAIN_DECK_CARD_ID_INVALID/,
  );
});

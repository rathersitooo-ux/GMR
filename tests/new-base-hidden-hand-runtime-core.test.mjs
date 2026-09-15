import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeckHiddenHandRegistrationSnapshot,
  withDeckHiddenHandRegistration,
} from '../browser/deck-hidden-hand-registration-core.mjs';
import {
  NEW_BASE_HIDDEN_HAND_RUNTIME,
  consumeNewBaseHiddenHandPrivilege,
  createNewBaseHiddenHandRuntime,
  projectNewBaseHiddenHandAddContext,
} from '../browser/new-base-hidden-hand-runtime-core.mjs';

function registrationSnapshot() {
  const deck = withDeckHiddenHandRegistration({
    main: ['SP_A', 'HT_2', 'DI_3'],
    ex: [],
  }, 'HT_2');
  return createDeckHiddenHandRegistrationSnapshot(deck);
}

test('runtime projects the exact registered physical-card identity and one available hidden privilege', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
  assert.equal(runtime.schema, NEW_BASE_HIDDEN_HAND_RUNTIME.schema);
  assert.deepEqual(runtime, {
    schema: NEW_BASE_HIDDEN_HAND_RUNTIME.schema,
    source: 'deck-hidden-hand-registration-snapshot',
    reservedCardId: 'HT_2',
    hiddenPrivilegeAvailable: true,
  });
  assert.equal(Object.isFrozen(runtime), true);
});

test('gold-button context exposes only reserved identity plus availability', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
  assert.deepEqual(projectNewBaseHiddenHandAddContext(runtime), {
    reservedCardId: 'HT_2',
    hiddenPrivilegeAvailable: true,
  });
});

test('button press or staging alone cannot consume hidden privilege', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
  const result = consumeNewBaseHiddenHandPrivilege(runtime, {
    cardId: 'HT_2',
    authoritativeLegalRoadCommit: false,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'authoritative-road-commit-required');
  assert.strictEqual(result.runtime, runtime);
  assert.equal(result.runtime.hiddenPrivilegeAvailable, true);
});

test('wrong physical card cannot consume the registered card privilege', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
  const result = consumeNewBaseHiddenHandPrivilege(runtime, {
    cardId: 'DI_3',
    authoritativeLegalRoadCommit: true,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'reserved-card-mismatch');
  assert.strictEqual(result.runtime, runtime);
});

test('exact reserved card consumes privilege once only after authoritative legal Road commit', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
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

test('runtime rejects forged or mismatched registration snapshots', () => {
  assert.throws(
    () => createNewBaseHiddenHandRuntime(null),
    /HIDDEN_HAND_REGISTRATION_SNAPSHOT_REQUIRED/,
  );
  assert.throws(
    () => createNewBaseHiddenHandRuntime({
      schema: 'wrong',
      cardId: 'HT_2',
      sourceMainCardIds: ['HT_2'],
    }),
    /HIDDEN_HAND_REGISTRATION_SNAPSHOT_SCHEMA_UNSUPPORTED/,
  );
  assert.throws(
    () => createNewBaseHiddenHandRuntime({
      schema: 'gameroad.deck-hidden-hand-registration.v1',
      cardId: 'HT_2',
      sourceMainCardIds: ['SP_A'],
    }),
    /HIDDEN_HAND_REGISTRATION_CARD_NOT_IN_SOURCE_MAIN/,
  );
});

test('runtime owns no fourth-hand, combat, copy, mana, or extra-Road semantics', () => {
  const runtime = createNewBaseHiddenHandRuntime(registrationSnapshot());
  for (const forbidden of [
    'jankenHand', 'fourthHand', 'winsAgainst', 'effect', 'battleAddend',
    'manaCost', 'extraRoad', 'replacement', 'copyPrivilege', 'cardClone',
  ]) {
    assert.equal(forbidden in runtime, false, forbidden);
  }
});

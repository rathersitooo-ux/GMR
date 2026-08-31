import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIDDEN_HAND_REGISTRATION_FIELD,
  readHiddenHandRegistration,
  withHiddenHandRegistration,
} from '../browser/deck-hidden-hand-registration-core.mjs';

test('absent registration is distinct from an explicitly present registration list', () => {
  assert.deepEqual(readHiddenHandRegistration({ cards: ['card-a'] }), {
    present: false,
    cardIds: [],
  });

  assert.deepEqual(readHiddenHandRegistration({
    cards: ['card-a'],
    [HIDDEN_HAND_REGISTRATION_FIELD]: [],
  }), {
    present: true,
    cardIds: [],
  });
});

test('schema preserves registration order and duplicates without deciding legal cardinality', () => {
  const source = {
    [HIDDEN_HAND_REGISTRATION_FIELD]: ['secret-a', 'secret-a', 'secret-b'],
  };
  const result = readHiddenHandRegistration(source);

  assert.deepEqual(result, {
    present: true,
    cardIds: ['secret-a', 'secret-a', 'secret-b'],
  });
  assert.notEqual(result.cardIds, source[HIDDEN_HAND_REGISTRATION_FIELD]);
});

test('writer adds only the dedicated hidden-hand registration field and preserves deck semantics', () => {
  const source = {
    ruleId: 'FIRST_REGULATION',
    ruleRevision: 3,
    cards: ['card-a'],
    main: ['card-a'],
    ex: ['legacy-ex'],
    cardMetadata: {
      'card-a': { suit: 'HEART' },
    },
  };
  const before = structuredClone(source);

  const next = withHiddenHandRegistration(source, ['secret-a', 'secret-b']);

  assert.deepEqual(source, before);
  assert.deepEqual(next, {
    ...before,
    [HIDDEN_HAND_REGISTRATION_FIELD]: ['secret-a', 'secret-b'],
  });
  assert.deepEqual(next.ex, ['legacy-ex']);
  assert.equal(next.cardMetadata['card-a'].suit, 'HEART');
  assert.deepEqual(
    Object.keys(next).sort(),
    [...Object.keys(before), HIDDEN_HAND_REGISTRATION_FIELD].sort(),
  );
});

test('writer copies registration IDs instead of retaining caller mutable array', () => {
  const ids = ['secret-a'];
  const next = withHiddenHandRegistration({ cards: [] }, ids);
  ids.push('secret-b');

  assert.deepEqual(next[HIDDEN_HAND_REGISTRATION_FIELD], ['secret-a']);
});

test('schema rejects malformed registration containers and identifiers', () => {
  for (const value of [null, {}, 'secret-a', 1]) {
    assert.throws(
      () => readHiddenHandRegistration({ [HIDDEN_HAND_REGISTRATION_FIELD]: value }),
      TypeError,
    );
  }

  for (const ids of [[null], [1], [''], ['   ']]) {
    assert.throws(() => withHiddenHandRegistration({}, ids), TypeError);
  }
});

test('deck record itself must be an object', () => {
  for (const value of [null, undefined, [], 'deck']) {
    assert.throws(() => readHiddenHandRegistration(value), TypeError);
    assert.throws(() => withHiddenHandRegistration(value, []), TypeError);
  }
});

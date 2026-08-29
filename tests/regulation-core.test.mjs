import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_REGULATION_BLOCKED_CARD_IDS,
  GED_CARD_ID,
  isCardBlockedByCurrentRegulation,
} from '../browser/regulation-core.mjs';

test('current regulation blocks GED and nothing else by default', () => {
  assert.deepEqual(CURRENT_REGULATION_BLOCKED_CARD_IDS, [GED_CARD_ID]);
  assert.equal(isCardBlockedByCurrentRegulation(GED_CARD_ID), true);
  assert.equal(isCardBlockedByCurrentRegulation('S_A'), false);
});

test('blocked card registry is immutable at runtime', () => {
  assert.equal(Object.isFrozen(CURRENT_REGULATION_BLOCKED_CARD_IDS), true);
  assert.throws(
    () => CURRENT_REGULATION_BLOCKED_CARD_IDS.push('OTHER'),
    TypeError,
  );
});

test('regulation query rejects missing or blank card ids', () => {
  assert.throws(() => isCardBlockedByCurrentRegulation(), TypeError);
  assert.throws(() => isCardBlockedByCurrentRegulation('   '), TypeError);
});

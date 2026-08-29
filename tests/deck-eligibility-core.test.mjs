import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DECK_ELIGIBILITY_STATUS as S,
  classifyDeckEligibility,
} from '../browser/deck-eligibility-core.mjs';

const ids = (count, prefix = 'C') => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);

test('39 main cards are reported as one card short, not as a generic invalid deck', () => {
  const result = classifyDeckEligibility({ deck: { main: ids(39), ex: [] } });
  assert.equal(result.usable, false);
  assert.equal(result.status, S.CARD_COUNT_SHORT);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.reasons, [{ code: S.CARD_COUNT_SHORT, missingCount: 1, mainCount: 39, requiredMain: 40 }]);
});

test('exactly 40 main cards with no blocked cards are usable', () => {
  const result = classifyDeckEligibility({ deck: { main: ids(40), ex: [] } });
  assert.equal(result.usable, true);
  assert.equal(result.status, S.USABLE);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.mainCount, 40);
});

test('a caller-blocked card in an exact 40-card deck is regulation blocked', () => {
  const main = ids(39);
  main.push('future-ged-id');
  const result = classifyDeckEligibility({
    deck: { main, ex: [] },
    blockedCardIds: ['future-ged-id'],
  });
  assert.equal(result.usable, false);
  assert.equal(result.status, S.REGULATION_CARD_BLOCKED);
  assert.deepEqual(result.blockedCardIds, ['future-ged-id']);
  assert.deepEqual(result.reasons, [{ code: S.REGULATION_CARD_BLOCKED, cardIds: ['future-ged-id'] }]);
});

test('41 main cards are reported as one card over', () => {
  const result = classifyDeckEligibility({ deck: { main: ids(41), ex: [] } });
  assert.equal(result.usable, false);
  assert.equal(result.status, S.CARD_COUNT_OVER);
  assert.equal(result.excessCount, 1);
});

test('count shortage and regulation block remain separate reasons', () => {
  const main = ids(38);
  main.push('blocked-a');
  const result = classifyDeckEligibility({
    deck: { main, ex: [] },
    blockedCardIds: ['blocked-a'],
  });
  assert.equal(result.status, S.CARD_COUNT_SHORT);
  assert.deepEqual(result.reasons.map((reason) => reason.code), [
    S.CARD_COUNT_SHORT,
    S.REGULATION_CARD_BLOCKED,
  ]);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.blockedCardIds, ['blocked-a']);
});

test('regulation block detection covers EX cards without taking ownership of EX count rules', () => {
  const result = classifyDeckEligibility({
    deck: { main: ids(40), ex: ['blocked-ex', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'] },
    blockedCardIds: ['blocked-ex'],
  });
  assert.equal(result.status, S.REGULATION_CARD_BLOCKED);
  assert.deepEqual(result.blockedCardIds, ['blocked-ex']);
  assert.equal(result.reasons.some((reason) => 'excessExCount' in reason), false);
});

test('blocked output is deterministic and deduplicated', () => {
  const main = [...ids(37), 'B', 'A', 'B'];
  const result = classifyDeckEligibility({
    deck: { main, ex: ['A'] },
    blockedCardIds: ['B', 'A', 'B'],
  });
  assert.equal(result.status, S.REGULATION_CARD_BLOCKED);
  assert.deepEqual(result.blockedCardIds, ['B', 'A']);
});

test('highlander and other card-construction rules stay outside this module', () => {
  const result = classifyDeckEligibility({
    deck: { main: Array(40).fill('same-card'), ex: [] },
    blockedCardIds: [],
  });
  assert.equal(result.usable, true);
  assert.equal(result.status, S.USABLE);
});

test('unreadable deck shape is reported without a generic invalid status', () => {
  const result = classifyDeckEligibility({ deck: { main: null, ex: [] } });
  assert.equal(result.usable, false);
  assert.equal(result.status, S.DECK_INPUT_UNREADABLE);
  assert.deepEqual(result.reasons, [{ code: S.DECK_INPUT_UNREADABLE }]);
});

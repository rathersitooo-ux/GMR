import test from 'node:test';
import assert from 'node:assert/strict';

import { GED_CARD_DEFINITION } from '../browser/ged-card-definition.mjs';

test('G・E・D identity is exactly the user-fixed minimal definition', () => {
  assert.deepEqual(GED_CARD_DEFINITION, {
    name: 'G・E・D',
    suitId: 'DK',
    suitName: 'ルナ',
    suitSymbol: '白い三日月',
    rank: 'OVER',
    value: 97,
  });
});

test('G・E・D definition is immutable', () => {
  assert.equal(Object.isFrozen(GED_CARD_DEFINITION), true);
});

test('OVER is not represented as a standard 1-13 rank', () => {
  assert.equal(GED_CARD_DEFINITION.rank, 'OVER');
  assert.equal(Number.isInteger(GED_CARD_DEFINITION.value), true);
  assert.equal(GED_CARD_DEFINITION.value, 97);
  assert.equal(GED_CARD_DEFINITION.value >= 1 && GED_CARD_DEFINITION.value <= 13, false);
});

test('definition contains no regulation, ability, art, audio, story, or generated Luna rank system', () => {
  const forbidden = [
    'banned', 'ban', 'regulation', 'legal', 'ability', 'abilities', 'effect', 'effects',
    'art', 'asset', 'audio', 'sound', 'story', 'lore', 'rarity', 'generatedRanks', 'ranks',
  ];
  for (const key of forbidden) assert.equal(Object.hasOwn(GED_CARD_DEFINITION, key), false, key);
  assert.deepEqual(Object.keys(GED_CARD_DEFINITION).sort(), ['name', 'rank', 'suitId', 'suitName', 'suitSymbol', 'value'].sort());
});

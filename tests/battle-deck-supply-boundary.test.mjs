import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_DECK_SUPPLY_BOUNDARY,
  consumeNextBattleSupply,
  createFinalResortPartnerPolicy,
} from '../browser/battle-deck-supply-boundary.mjs';

test('main deck supplies first without touching sub deck or shuffle authority', () => {
  const mainDeck = ['m1', 'm2'];
  const subDeck = ['s1', 's2'];
  let shuffleCalls = 0;

  const result = consumeNextBattleSupply({
    mainDeck,
    subDeck,
    shuffleSubDeck() {
      shuffleCalls += 1;
      return [];
    },
  });

  assert.equal(result.status, 'CARD_SUPPLIED');
  assert.equal(result.source, 'MAIN_DECK');
  assert.equal(result.card, 'm1');
  assert.deepEqual(result.mainDeck, ['m2']);
  assert.deepEqual(result.subDeck, ['s1', 's2']);
  assert.equal(result.transition, null);
  assert.equal(result.finalResortPolicy, null);
  assert.equal(shuffleCalls, 0);
  assert.deepEqual(mainDeck, ['m1', 'm2']);
  assert.deepEqual(subDeck, ['s1', 's2']);
});

test('empty main deck shuffles every remaining sub-deck card into main before supplying', () => {
  const subDeck = ['s1', 's2', 's3'];
  const seen = [];

  const result = consumeNextBattleSupply({
    mainDeck: [],
    subDeck,
    shuffleSubDeck(cards) {
      seen.push([...cards]);
      return [...cards].reverse();
    },
  });

  assert.deepEqual(seen, [['s1', 's2', 's3']]);
  assert.equal(result.status, 'CARD_SUPPLIED');
  assert.equal(result.source, 'SUB_DECK_SHUFFLED_TO_MAIN');
  assert.equal(result.transition, 'SUB_DECK_SHUFFLED_TO_MAIN');
  assert.equal(result.card, 's3');
  assert.deepEqual(result.mainDeck, ['s2', 's1']);
  assert.deepEqual(result.subDeck, []);
  assert.equal(result.finalResortPolicy, null);
  assert.deepEqual(subDeck, ['s1', 's2', 's3']);
});

test('moving sub deck to main does not enter final resort while replenished main still supplies', () => {
  const shuffleSubDeck = cards => [...cards];

  const first = consumeNextBattleSupply({
    mainDeck: [],
    subDeck: ['s1', 's2'],
    shuffleSubDeck,
  });
  assert.equal(first.status, 'CARD_SUPPLIED');
  assert.equal(first.card, 's1');
  assert.deepEqual(first.mainDeck, ['s2']);
  assert.deepEqual(first.subDeck, []);

  const second = consumeNextBattleSupply({
    mainDeck: first.mainDeck,
    subDeck: first.subDeck,
    shuffleSubDeck,
  });
  assert.equal(second.status, 'CARD_SUPPLIED');
  assert.equal(second.source, 'MAIN_DECK');
  assert.equal(second.card, 's2');

  const third = consumeNextBattleSupply({
    mainDeck: second.mainDeck,
    subDeck: second.subDeck,
    shuffleSubDeck,
  });
  assert.equal(third.status, 'FINAL_RESORT_REQUIRED');
  assert.equal(third.transition, 'ENTER_FINAL_RESORT');
});

test('both sources empty enters final resort without inventing a generated playing-card draw', () => {
  const result = consumeNextBattleSupply({
    mainDeck: [],
    subDeck: [],
  });

  assert.equal(result.status, 'FINAL_RESORT_REQUIRED');
  assert.equal(result.card, null);
  assert.deepEqual(result.mainDeck, []);
  assert.deepEqual(result.subDeck, []);
  assert.equal(result.finalResortPolicy.mode, 'FINAL_RESORT');
  assert.equal(result.finalResortPolicy.scope, 'PARTNER');
  assert.equal(result.finalResortPolicy.source.isInfinite, true);
  assert.equal(result.finalResortPolicy.source.cardIdentityCount, 52);
  assert.equal(result.finalResortPolicy.source.jokersIncluded, false);
  assert.equal(result.finalResortPolicy.abilityPolicy, 'NONE');
  assert.equal(result.finalResortPolicy.drawGenerationStatus, 'UNRESOLVED');
  assert.equal(result.finalResortPolicy.rankGameplaySemanticsStatus, 'UNRESOLVED');
});

test('final-resort identity set is exactly four suits by thirteen ranks, with no joker or ability', () => {
  const policy = createFinalResortPartnerPolicy();
  const identities = policy.source.identities;
  const keys = new Set(identities.map(card => card.identityKey));

  assert.equal(identities.length, 52);
  assert.equal(keys.size, 52);
  assert.equal(identities.some(card => card.joker), false);
  assert.equal(identities.every(card => card.abilityStatus === 'NONE'), true);
  assert.equal(identities.every(card => card.gameplaySemanticsStatus === 'UNRESOLVED'), true);

  for (const suit of BATTLE_DECK_SUPPLY_BOUNDARY.standardSuits) {
    for (const rank of BATTLE_DECK_SUPPLY_BOUNDARY.standardRanks) {
      assert.equal(keys.has(`${suit}:${rank}`), true, `${suit}:${rank}`);
    }
  }
});

test('sub-deck refill fails closed without caller shuffle authority', () => {
  assert.throws(
    () => consumeNextBattleSupply({ mainDeck: [], subDeck: ['s1'] }),
    /SUB_DECK_SHUFFLE_AUTHORITY_REQUIRED/,
  );
});

test('sub-deck shuffle must preserve the exact multiset and cannot inject gameplay cards', () => {
  assert.throws(
    () => consumeNextBattleSupply({
      mainDeck: [],
      subDeck: ['s1', 's2'],
      shuffleSubDeck: () => ['s1', 'invented'],
    }),
    /SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED/,
  );

  assert.throws(
    () => consumeNextBattleSupply({
      mainDeck: [],
      subDeck: ['s1', 's1', 's2'],
      shuffleSubDeck: () => ['s1', 's2', 's2'],
    }),
    /SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED/,
  );
});

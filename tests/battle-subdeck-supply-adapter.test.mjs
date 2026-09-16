import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT,
  projectBattleSubDeckSupply,
} from '../browser/battle-subdeck-supply-adapter.mjs';

test('projects a main-deck supply without invoking shuffle authority or mutating caller arrays', () => {
  const first = { id: 'm1' };
  const second = { id: 'm2' };
  const sub = { id: 's1' };
  const mainDeck = [first, second];
  const subDeck = [sub];
  let shuffleCalls = 0;

  const result = projectBattleSubDeckSupply({
    mainDeck,
    subDeck,
    shuffleSubDeck() {
      shuffleCalls += 1;
      return [];
    },
  });

  assert.equal(result.status, 'CARD_SUPPLIED');
  assert.equal(result.source, 'MAIN_DECK');
  assert.strictEqual(result.suppliedCard, first);
  assert.strictEqual(result.deckUpdate.mainDeck[0], second);
  assert.strictEqual(result.deckUpdate.subDeck[0], sub);
  assert.equal(result.transition, null);
  assert.equal(result.callerMustCommitDeckUpdate, true);
  assert.equal(result.gameplayStateWrite, false);
  assert.equal(shuffleCalls, 0);
  assert.deepEqual(mainDeck, [first, second]);
  assert.deepEqual(subDeck, [sub]);
});

test('empty main projects caller-shuffled whole subDeck into main while preserving exact card identities', () => {
  const s1 = { id: 's1' };
  const s2 = { id: 's2' };
  const s3 = { id: 's3' };
  const subDeck = [s1, s2, s3];
  const seen = [];

  const result = projectBattleSubDeckSupply({
    mainDeck: [],
    subDeck,
    shuffleSubDeck(cards) {
      seen.push([...cards]);
      return [cards[2], cards[0], cards[1]];
    },
  });

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], [s1, s2, s3]);
  assert.equal(result.status, 'CARD_SUPPLIED');
  assert.equal(result.source, 'SUB_DECK_SHUFFLED_TO_MAIN');
  assert.equal(result.transition, 'SUB_DECK_SHUFFLED_TO_MAIN');
  assert.strictEqual(result.suppliedCard, s3);
  assert.strictEqual(result.deckUpdate.mainDeck[0], s1);
  assert.strictEqual(result.deckUpdate.mainDeck[1], s2);
  assert.deepEqual(result.deckUpdate.subDeck, []);
  assert.deepEqual(subDeck, [s1, s2, s3]);
});

test('both sources empty exposes final-resort-required without inventing a supplied card', () => {
  const result = projectBattleSubDeckSupply({
    mainDeck: [],
    subDeck: [],
  });

  assert.equal(result.status, 'FINAL_RESORT_REQUIRED');
  assert.equal(result.source, null);
  assert.equal(result.suppliedCard, null);
  assert.equal(result.transition, 'ENTER_FINAL_RESORT');
  assert.equal(result.callerMustCommitDeckUpdate, false);
  assert.deepEqual(result.deckUpdate.mainDeck, []);
  assert.deepEqual(result.deckUpdate.subDeck, []);
  assert.equal(result.finalResortPolicy.drawGenerationStatus, 'UNRESOLVED');
  assert.equal(result.finalResortPolicy.rankGameplaySemanticsStatus, 'UNRESOLVED');
});

test('delegates fail-closed shuffle validation to the existing supply authority', () => {
  const s1 = { id: 's1' };
  const s2 = { id: 's2' };

  assert.throws(
    () => projectBattleSubDeckSupply({
      mainDeck: [],
      subDeck: [s1, s2],
    }),
    /SUB_DECK_SHUFFLE_AUTHORITY_REQUIRED/,
  );

  assert.throws(
    () => projectBattleSubDeckSupply({
      mainDeck: [],
      subDeck: [s1, s2],
      shuffleSubDeck: () => [s1, { id: 'invented' }],
    }),
    /SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED/,
  );
});

test('adapter contract keeps supply authority, RNG, state writes, and live binding outside this WorkUnit', () => {
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.authority, 'BATTLE_DECK_SUPPLY_BOUNDARY');
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.mainDeckExhaustion, 'SHUFFLE_ALL_REMAINING_SUB_DECK_TO_MAIN');
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.finalResortEntry, 'ONLY_WHEN_MAIN_AND_SUB_DECK_CANNOT_SUPPLY');
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.cardIdentity, 'OPAQUE_EXACT_REFERENCE');
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.shuffleAuthority, 'CALLER');
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.gameplayStateWrite, false);
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.generatedCardSemantics, false);
  assert.equal(BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT.liveConsumerBinding, false);
});

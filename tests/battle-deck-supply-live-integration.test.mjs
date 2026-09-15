import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { consumeNextBattleSupply } from '../browser/battle-deck-supply-boundary.mjs';

const source = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('live HTML mounts the existing deck-supply boundary without a second deck engine', () => {
  assert.match(source, /GAMEROAD_BATTLE_DECK_SUPPLY_LIVE_R2/);
  assert.match(source, /import \{ consumeNextBattleSupply \} from "\.\/battle-deck-supply-boundary\.mjs"/);
  assert.match(source, /GAMEROAD_CONSUME_NEXT_BATTLE_SUPPLY/);
  assert.match(source, /deck,subDeck:\[\],hand,shields:/);
  assert.match(source, /finalResortMode:false,finalResortPolicy:null/);
});

test('ordinary refill keeps target three and draw uses the same supply transition while deckTopToChip stays unchanged', () => {
  assert.match(source, /function consumeOrdinaryBattleSupply\(p\)/);
  assert.match(source, /mainDeck:p\.deck,subDeck:Array\.isArray\(p\.subDeck\)\?p\.subDeck:\[\],shuffleSubDeck:shuffle/);
  assert.match(source, /function refill\(p\)\{while\(p\.hand\.length<3\)\{const card=consumeOrdinaryBattleSupply\(p\);if\(card==null\)break;p\.hand\.push\(card\)\}\}/);
  assert.match(source, /case'drawAndReduceCost':\{const drawn=consumeOrdinaryBattleSupply\(p\)/);
  assert.match(source, /case'deckTopToChip':\{const moved=p\.deck\.shift\(\);p\.chip\.push\(moved\)/);
});

test('subdeck shuffle clears public-lower zone and supplies from shuffled main', () => {
  const result = consumeNextBattleSupply({ mainDeck: [], subDeck: ['a','b','c'], shuffleSubDeck: (cards) => [...cards].reverse() });
  assert.equal(result.status, 'CARD_SUPPLIED');
  assert.equal(result.source, 'SUB_DECK_SHUFFLED_TO_MAIN');
  assert.equal(result.card, 'c');
  assert.deepEqual(result.mainDeck, ['b','a']);
  assert.deepEqual(result.subDeck, []);
});

test('both empty enters final resort without inventing rank gameplay semantics', () => {
  const result = consumeNextBattleSupply({ mainDeck: [], subDeck: [], shuffleSubDeck: (cards) => cards });
  assert.equal(result.status, 'FINAL_RESORT_REQUIRED');
  assert.equal(result.finalResortPolicy.source.cardIdentityCount, 52);
  assert.equal(result.finalResortPolicy.source.jokersIncluded, false);
  assert.equal(result.finalResortPolicy.abilityPolicy, 'NONE');
  assert.equal(result.finalResortPolicy.rankGameplaySemanticsStatus, 'UNRESOLVED');
  assert.match(source, /finalResortMode=true;p\.finalResortPolicy=result\.finalResortPolicy/);
});

import assert from 'node:assert/strict';
import {
  ROULETTE_KEYWORD,
  isRouletteCard,
  findRouletteCardIds,
  hasRouletteTheme,
  rouletteCandidates,
  spinRoulette,
} from '../browser/roulette-slot-core.mjs';

const CARDS = {
  T1: { id: 'T1', keywords: [ROULETTE_KEYWORD] },
  T2: { id: 'T2', keywords: [ROULETTE_KEYWORD] },
  A: { id: 'A', keywords: [] },
  B: { id: 'B' },
};

// テーマの判定と登録対象
assert.equal(isRouletteCard(CARDS.T1), true);
assert.equal(isRouletteCard(CARDS.A), false);
assert.deepEqual(findRouletteCardIds(['A', 'T1', 'B', 'T2', 'T1'], CARDS), ['T1', 'T2']);
assert.deepEqual(findRouletteCardIds(['A', 'B'], CARDS), []);
assert.equal(hasRouletteTheme(['A', 'T2'], CARDS), true);
assert.equal(hasRouletteTheme(['A', 'B'], CARDS), false);
assert.equal(hasRouletteTheme(null, CARDS), false);

// スロット候補：ロードカードを除いた残りの手札全部
assert.deepEqual(rouletteCandidates(['R', 'A', 'B', 'T1'], 'R'), ['A', 'B', 'T1']);
assert.deepEqual(rouletteCandidates(['A', 'A', 'B'], null), ['A', 'B']);
assert.deepEqual(rouletteCandidates([], 'R'), []);
assert.deepEqual(rouletteCandidates(null, null), []);

// 回して止める
const spin = spinRoulette(['A', 'B', 'T1'], () => 2);
assert.equal(spin.chosen, 'T1');
assert.equal(spin.index, 2);
assert.equal(spinRoulette(['A'], () => 99).chosen, 'A');
assert.equal(spinRoulette([], () => 0), null);

console.log('roulette-slot-core: all assertions passed');

// --- 補充（ロケット鉛筆式） ---
{
  const { refillCandidates } = await import('../browser/roulette-slot-core.mjs');
  const r1 = refillCandidates(['A','B'], ['D1','D2','D3'], 3);
  console.assert(JSON.stringify(r1.pool) === JSON.stringify(['A','B','D1']) && JSON.stringify(r1.drawn) === JSON.stringify(['D1']), 'refill: 抜けた1枚分だけ山札から入る');
  const r2 = refillCandidates(['A'], ['D1'], 3);
  console.assert(r2.pool.length === 2 && r2.drawn.length === 1, 'refill: 山札が尽きたらある分で止まる');
  const r3 = refillCandidates(['A','B','C'], ['D1'], 3);
  console.assert(r3.drawn.length === 0 && r3.pool.length === 3, 'refill: 満杯なら何も入らない');
  const r4 = refillCandidates([], [], 3);
  console.assert(r4.pool.length === 0 && r4.drawn.length === 0, 'refill: 空同士でも壊れない');
  console.log('refill tests done');
}

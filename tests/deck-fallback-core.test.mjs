import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOKER_CARD,
  JOKER_CARD_ID,
  drawFallbackCard,
  jokerBattleValue,
  jokerRoadValue,
  refillHandWithFallback,
  trumpFallbackPool,
} from '../browser/deck-fallback-core.mjs';

// 決められた順番で 0..1 を返す決定的な乱数（検査用）
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('最終手段の山は普通のトランプ52枚＋ジョーカー1枚の53枚', () => {
  const pool = trumpFallbackPool();
  assert.equal(pool.length, 53);
  assert.equal(new Set(pool).size, 53);
  assert.ok(pool.includes('SP_A'));
  assert.ok(pool.includes('HT_K'));
  assert.ok(pool.includes('DI_10'));
  assert.ok(pool.includes('CL_Q'));
  assert.equal(pool.filter((id) => id === JOKER_CARD_ID).length, 1);
});

test('確率は普通のトランプと同じ（53枚がほぼ等しく出る）', () => {
  const rng = lcg(20261110);
  const counts = new Map();
  const n = 53000;
  for (let i = 0; i < n; i++) {
    const id = drawFallbackCard(rng);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  assert.equal(counts.size, 53);
  for (const [id, c] of counts) {
    assert.ok(c > 700 && c < 1300, `${id} の回数 ${c} が想定から外れている`);
  }
});

test('補充は山札から先に引き、尽きた分だけ最終手段が出る', () => {
  const player = { deck: ['SP_A'], hand: ['HT_2'] };
  const drawn = refillHandWithFallback(player, 3, lcg(7));
  assert.equal(player.hand.length, 3);
  assert.equal(drawn.length, 2);
  assert.deepEqual(drawn[0], { id: 'SP_A', source: 'deck' });
  assert.equal(drawn[1].source, 'fallback');
  assert.ok(trumpFallbackPool().includes(drawn[1].id));
});

test('山札が残っている間は最終手段は出ない', () => {
  const player = { deck: ['SP_A', 'SP_2', 'SP_3'], hand: [] };
  const drawn = refillHandWithFallback(player, 3, lcg(7));
  assert.ok(drawn.every((d) => d.source === 'deck'));
  assert.equal(player.deck.length, 0);
});

test('手札が目標以上なら何も引かない', () => {
  const player = { deck: [], hand: ['SP_A', 'SP_2', 'SP_3', 'SP_4'] };
  const drawn = refillHandWithFallback(player, 3, lcg(7));
  assert.equal(drawn.length, 0);
  assert.equal(player.hand.length, 4);
});

test('ジョーカーの仮の効果：バトルは相手の一番強い数字より1大きい、ロードは13', () => {
  assert.equal(jokerBattleValue([5, 13, 9]), 14);
  assert.equal(jokerBattleValue([14]), 15);
  assert.equal(jokerBattleValue([]), JOKER_CARD.power);
  assert.equal(jokerRoadValue(), 13);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_FALLBACK_LIVE_BRIDGE_CONTRACT,
  HAND_REFILL_TARGET,
  projectHandRefillWithFallback,
} from '../browser/deck-fallback-live-bridge.mjs';
import {
  JOKER_CARD,
  JOKER_CARD_ID,
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

test('山札が足りる時は山札だけで補充し、最終手段は出ない', () => {
  const deck = ['SP_A', 'SP_2', 'SP_3'];
  const hand = [];
  const out = projectHandRefillWithFallback({ deck, hand, rng: lcg(7) });
  assert.equal(out.status, 'REFILLED');
  assert.deepEqual(out.hand, ['SP_A', 'SP_2', 'SP_3']);
  assert.deepEqual(out.deck, []);
  assert.equal(out.fallbackCount, 0);
  assert.equal(out.jokerDrawn, false);
  assert.equal(out.joker, null);
  assert.equal(out.callerMustCommitDeckUpdate, true);
  assert.equal(out.gameplayStateWrite, false);
  assert.ok(out.drawn.every((d) => d.source === 'deck'));
  assert.equal(out.logLines.length, 3);
  // 入力は変えない
  assert.deepEqual(deck, ['SP_A', 'SP_2', 'SP_3']);
  assert.deepEqual(hand, []);
});

test('山札が足りない分だけ最終手段が出る（山札から先に引く）', () => {
  const out = projectHandRefillWithFallback({
    deck: ['SP_A'],
    hand: ['HT_2'],
    rng: lcg(7),
  });
  assert.equal(out.status, 'REFILLED_WITH_FALLBACK');
  assert.equal(out.hand.length, 3);
  assert.equal(out.hand[1], 'SP_A');
  assert.deepEqual(out.drawn[0], { id: 'SP_A', source: 'deck' });
  assert.equal(out.drawn[1].source, 'fallback');
  assert.ok(trumpFallbackPool().includes(out.drawn[1].id));
  assert.equal(out.fallbackCount, 1);
  assert.deepEqual(out.deck, []);
});

test('C4の止まりの形：手札1枚・山札0枚で2枚要る時、最終手段で2枚補う', () => {
  const out = projectHandRefillWithFallback({
    deck: [],
    hand: ['HT_2'],
    rng: lcg(11),
  });
  assert.equal(out.status, 'REFILLED_WITH_FALLBACK');
  assert.equal(out.hand.length, 3);
  assert.equal(out.hand[0], 'HT_2');
  assert.equal(out.fallbackCount, 2);
  assert.ok(out.drawn.every((d) => d.source === 'fallback'));
  assert.deepEqual(out.deck, []);
  assert.ok(out.logLines.every((line) => line.includes('最終手段')));
});

test('手札が目標以上なら何も引かない', () => {
  const out = projectHandRefillWithFallback({
    deck: [],
    hand: ['SP_A', 'SP_2', 'SP_3', 'SP_4'],
    rng: lcg(7),
  });
  assert.equal(out.status, 'NO_DRAW_NEEDED');
  assert.deepEqual(out.drawn, []);
  assert.deepEqual(out.hand, ['SP_A', 'SP_2', 'SP_3', 'SP_4']);
  assert.equal(out.callerMustCommitDeckUpdate, false);
  assert.deepEqual(out.logLines, []);
});

test('ジョーカーが出た時は仮の数字つきで返す', () => {
  // 0.999 は53枚の山の最後（ジョーカー）を指す
  const out = projectHandRefillWithFallback({
    deck: [],
    hand: ['SP_A', 'SP_2'],
    rng: () => 0.999,
  });
  assert.equal(out.status, 'REFILLED_WITH_FALLBACK');
  assert.equal(out.drawn[0].id, JOKER_CARD_ID);
  assert.equal(out.jokerDrawn, true);
  assert.equal(out.joker.card, JOKER_CARD);
  assert.equal(out.joker.roadValue, 13);
  assert.equal(out.joker.battleBaseValue, JOKER_CARD.power);
  assert.ok(out.logLines[0].includes('ジョーカー'));
});

test('乱数 0 は山の先頭（SP_A）を出す', () => {
  const out = projectHandRefillWithFallback({
    deck: [],
    hand: ['SP_A', 'SP_2'],
    rng: () => 0,
  });
  assert.equal(out.drawn[0].id, 'SP_A');
  assert.equal(out.jokerDrawn, false);
});

test('凍らせた入力でも動く（入力を変えない）', () => {
  const deck = Object.freeze([]);
  const hand = Object.freeze(['HT_2']);
  const out = projectHandRefillWithFallback({ deck, hand, rng: lcg(3) });
  assert.equal(out.hand.length, 3);
  assert.equal(out.status, 'REFILLED_WITH_FALLBACK');
});

test('目標枚数を変えられる', () => {
  const out = projectHandRefillWithFallback({
    deck: ['SP_A'],
    hand: [],
    target: 1,
    rng: lcg(7),
  });
  assert.equal(out.hand.length, 1);
  assert.equal(out.status, 'REFILLED');
  assert.equal(HAND_REFILL_TARGET, 3);
});

test('入力がおかしい時は型の誤りで止まる', () => {
  assert.throws(() => projectHandRefillWithFallback({ deck: 'SP_A', hand: [] }), TypeError);
  assert.throws(() => projectHandRefillWithFallback({ deck: [], hand: null }), TypeError);
  assert.throws(() => projectHandRefillWithFallback({ deck: [], hand: [], target: -1 }), TypeError);
  assert.throws(() => projectHandRefillWithFallback({ deck: [], hand: [], rng: 0.5 }), TypeError);
});

test('契約：決めとつなぎ先が書いてある', () => {
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.authority, 'DECK_FALLBACK_CORE');
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.handRefillTarget, 3);
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.drawOrder, 'DECK_FIRST_THEN_FALLBACK');
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.fallbackPool, 'STANDARD_52_PLUS_JOKER_53');
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.gameplayStateWrite, false);
  assert.equal(DECK_FALLBACK_LIVE_BRIDGE_CONTRACT.rngAuthority, 'CALLER');
});

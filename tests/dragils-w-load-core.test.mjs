import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAGILS_CARD_ID,
  W_LOAD_DISPLAY_TEXT,
  hasWLoad,
  resolveDragilsSecondHand,
  registerJankenHands,
  resolveJankenChain,
  jankenHandOf,
} from '../browser/dragils-w-load-core.mjs';

const card = (id, suit, power, extra = {}) => ({ id, suit, power, ...extra });
const dragils = () => card(DRAGILS_CARD_ID, 'DCG', 8, { effect_type: 'W_LOAD' });

test('カード本文の表示は「W・ロード」だけ', () => {
  assert.equal(W_LOAD_DISPLAY_TEXT, 'W・ロード');
  assert.equal(hasWLoad(dragils()), true);
  assert.equal(hasWLoad(card('x', 'SP', 3)), false);
});

test('ドラギルスを出したら、もう一度じゃんけんの手を出せる', () => {
  const extra = card('r1', 'CL', 4);
  const r = resolveDragilsSecondHand({ ownerId: 'P1', hand: [extra] });
  assert.equal(r.canPlayAgain, true);
  assert.equal(r.secondCard.id, 'r1');
});

test('手札に手を持つ札が無ければ、2回目は出せない（それだけ）', () => {
  const r = resolveDragilsSecondHand({ ownerId: 'P1', hand: [card('h', 'HT', 5)] });
  assert.equal(r.canPlayAgain, false);
  assert.equal(r.secondCard, null);
});

test('2回目の候補は、手を持つ札だけ', () => {
  const r = resolveDragilsSecondHand({
    ownerId: 'P1',
    hand: [card('h', 'HT', 5), card('a', 'SP', 2), card('b', 'DI', 7)],
  });
  assert.deepEqual(r.candidates.map((c) => c.id), ['a', 'b']);
});

test('手の割り当てはスートから、ハートは手を持たない', () => {
  assert.equal(jankenHandOf(card('x', 'CL', 3)), 'グー');
  assert.equal(jankenHandOf(card('x', 'DI', 3)), 'チョキ');
  assert.equal(jankenHandOf(card('x', 'SP', 3)), 'パー');
  assert.equal(jankenHandOf(card('x', 'HT', 3)), null);
});

test('登録はロードごとに最初の有効な手だけ', () => {
  const hands = registerJankenHands([
    { playerId: 'P1', roadIndex: 0, cards: [card('h1', 'HT', 2), card('a', 'CL', 5)] },
    { playerId: 'P1', roadIndex: 1, cards: [card('b', 'SP', 3)] },
    { playerId: 'P2', roadIndex: 0, cards: [card('c', 'DI', 4)] },
  ]);
  assert.equal(hands.length, 3);
  assert.equal(hands.find((h) => h.roadIndex === 0 && h.playerId === 'P1').cardId, 'a');
});

test('W・ロードの実戦ケース：2回目の手まで出して、両ロードが登録され、自分の手同士は当たらない', () => {
  const second = card('b', 'DI', 3);
  const w = resolveDragilsSecondHand({ ownerId: 'P1', hand: [second] });
  assert.equal(w.canPlayAgain, true);
  const hands = registerJankenHands([
    { playerId: 'P1', roadIndex: 0, cards: [card('a', 'CL', 2)] },
    { playerId: 'P1', roadIndex: 1, cards: [w.secondCard] },
    { playerId: 'P2', roadIndex: 0, cards: [card('c', 'SP', 8)] },
  ]);
  assert.equal(hands.length, 3);
  const r = resolveJankenChain(hands);
  assert.ok(r.steps.some((s) => s.result === 'skip-ally'));
  assert.equal(r.returned.filter((x) => x.playerId === 'P1').length, 1);
  assert.equal(r.returned[0].cardId, 'a');
  assert.ok(r.returned.every((x) => x.staysPublicInHand));
});

test('小さい順・勝ち抜け・あいこ（あいこは何も起きない）', () => {
  const hands = registerJankenHands([
    { playerId: 'P1', roadIndex: 0, cards: [card('a', 'CL', 2)] },
    { playerId: 'P2', roadIndex: 0, cards: [card('b', 'CL', 6)] },
  ]);
  const r = resolveJankenChain(hands);
  assert.equal(r.returned.length, 0);
  assert.equal(r.steps[0].result, 'aiko');
});

test('無作為な場で、身内・味方の殺し合いが0件', () => {
  let seed = 999;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const suits = ['CL', 'DI', 'SP'];
  for (let trial = 0; trial < 1000; trial++) {
    const subs = [];
    for (let p = 1; p <= 4; p++) {
      const roads = p === 1 ? 2 : 1;
      for (let road = 0; road < roads; road++) {
        subs.push({
          playerId: `P${p}`,
          roadIndex: road,
          cards: [card(`t${trial}-${p}-${road}`, suits[Math.floor(rnd() * 3)], 1 + Math.floor(rnd() * 10))],
        });
      }
    }
    const hands = registerJankenHands(subs);
    const sideOf = (p) => (p === 'P1' || p === 'P2' ? 'left' : 'right');
    const r = resolveJankenChain(hands, { sideOf });
    for (const step of r.steps) {
      if (step.result === 'a' || step.result === 'b') {
        assert.notEqual(sideOf(step.a.playerId), sideOf(step.b.playerId));
        assert.notEqual(step.a.playerId, step.b.playerId);
      }
    }
  }
});

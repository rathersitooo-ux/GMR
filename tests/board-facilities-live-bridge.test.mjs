// board-facilities-live-bridge の接続テスト（2026-11-10）。
// 本体（GAMEROAD.html）の代わりに hooks で材料を渡し、着地の解決と巡の開始が
// 核（board-facilities-core）の計算どおりに状態を変えることを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';

const POWER = { A: 1, B: 2, C: 3, BIG: 9, W1: 1, W2: 1, D1: 4, D2: 5 };
let currentMatch = null;
const logs = [];
globalThis.GAMEROAD_FACILITIES_HOOKS = {
  log: (t) => logs.push(t),
  getMatch: () => currentMatch,
  cardPower: (id) => POWER[id] ?? 0,
  cardLabel: (id) => id,
  drawTrump: () => 'SP_A',
  isLocalHuman: (p) => !!p.human,
};

const {
  createFacilityWorld, ensureWorld, onLanding, onRoundStart, AREA_BY_TILE,
} = await import('../browser/board-facilities-live-bridge.mjs');

function player(id, over = {}) {
  return {
    id, name: id, human: false, hand: [], deck: [], discard: [], items: [],
    honey: 0, manaCurrent: 7, manaMax: 10, position: 'C:0:0', rank: 1, ...over,
  };
}
function match(players, round = 1) {
  // 置き場の決めで、動くのはルームマッチ（フレンド部屋）だけ。テストの対戦は部屋の対戦として作る。
  const m = { id: 'M-test', round, players, friendRoom: { localPid: 'P1', host: true } };
  currentMatch = m;
  logs.length = 0;
  return m;
}

test('割り当て：中央3×3の全部のマスがどれかのエリアに入る', () => {
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) {
    assert.ok(AREA_BY_TILE[`C:${r}:${c}`], `C:${r}:${c} にエリアがある`);
  }
  assert.equal(AREA_BY_TILE['C:0:0'], 'area-middle');
  assert.equal(AREA_BY_TILE['R:P1:L:4'], undefined);
});

test('着地：回復マスでマナが全快し、無主のエリアは一番弱いカードを置いて取れる', async () => {
  const p1 = player('P1', { hand: ['C', 'A', 'B'], manaCurrent: 2, position: 'C:0:1' });
  const m = match([p1]);
  await onLanding(m, p1);
  assert.equal(p1.manaCurrent, 10);
  const area = m.facilityWorld.areas['area-middle'];
  assert.equal(area.ownerId, 'P1');
  assert.deepEqual(area.cards, ['A']);
  assert.deepEqual(p1.hand, ['C', 'B']);
});

test('着地：ショップマスは立ち寄りまで（状態を変えない）。エリアの取得は起きる', async () => {
  const p1 = player('P1', { hand: ['B'], honey: 4, position: 'C:1:0' });
  const m = match([p1]);
  await onLanding(m, p1);
  assert.equal(p1.honey, 4);
  assert.equal(m.facilityWorld.areas['area-south'].ownerId, 'P1');
  assert.ok(logs.some((t) => t.includes('ショップマスに立ち寄った')));
});

test('着地：相手のエリアで、払える時は払う（C:0:-1はハニーマスなので先に+2が入る）', async () => {
  const p1 = player('P1', { honey: 0 });
  const p2 = player('P2', { honey: 5, manaCurrent: 7, position: 'C:0:-1' });
  const m = match([p1, p2]);
  const w = ensureWorld(m);
  w.areas['area-middle'] = { ownerId: 'P1', cards: ['W1', 'W2'], placedRound: { W1: 1, W2: 1 } };
  await onLanding(m, p2);
  assert.equal(p2.honey, 5); // 5 + ハニーマス2 - 支払い2
  assert.equal(p1.honey, 2);
  assert.equal(p2.position, 'C:0:-1');
});

test('着地：相手のエリアで、払えず勝てない時はスタート地点へ戻る', async () => {
  const p1 = player('P1');
  const p2 = player('P2', { honey: 0, manaCurrent: 0, hand: ['A'], position: 'C:0:-1' });
  const m = match([p1, p2]);
  const w = ensureWorld(m);
  // 置き札5枚：支払い5はハニーマスの+2を足しても届かず、防御の合計5にも最強1では勝てない
  w.areas['area-middle'] = { ownerId: 'P1', cards: ['W1', 'W2', 'W1', 'W2', 'W1'], placedRound: { W1: 1, W2: 1 } };
  await onLanding(m, p2);
  assert.equal(p2.position, 'C:0:0');
  assert.equal(w.areas['area-middle'].ownerId, 'P1');
});

test('着地：相手のエリアで、最強のカードが防御を超える時は奪える', async () => {
  const p1 = player('P1');
  const p2 = player('P2', { honey: 0, manaCurrent: 0, hand: ['BIG'], position: 'C:0:-1' });
  const m = match([p1, p2]);
  const w = ensureWorld(m);
  // 置き札5枚：支払い5には届かないが、防御の合計5なら最強9で超えられる
  w.areas['area-middle'] = { ownerId: 'P1', cards: ['W1', 'W2', 'W1', 'W2', 'W1'], placedRound: { W1: 1, W2: 1 } };
  await onLanding(m, p2);
  assert.equal(w.areas['area-middle'].ownerId, 'P2');
  assert.deepEqual(p2.hand, []);
});

test('着地：相手のエリア内の施設マスでは、先に持ち主へマナを払ってから効果を受ける', async () => {
  const p1 = player('P1', { manaCurrent: 7 });
  const p2 = player('P2', { manaCurrent: 7, deck: ['D1', 'D2'], position: 'C:-1:-1' });
  const m = match([p1, p2]);
  const w = ensureWorld(m);
  w.areas['area-north'] = { ownerId: 'P1', cards: [], placedRound: {} };
  await onLanding(m, p2);
  assert.equal(p2.manaCurrent, 6);
  assert.equal(p1.manaCurrent, 8);
  assert.deepEqual(p2.hand, ['D1']);
});

test('巡の開始：闘技場の預け札が戻り、エリアの育ちの分だけハニーが入る', () => {
  const p1 = player('P1', { hand: [], pendingReturns: ['B'] });
  const m = match([p1], 3);
  const w = ensureWorld(m);
  w.areas['area-middle'] = { ownerId: 'P1', cards: ['A'], placedRound: { A: 1 } };
  onRoundStart(m);
  assert.deepEqual(p1.hand, ['B']);
  assert.equal(p1.honey, 2); // 置いた巡1→今の巡3でレベル2
});

test('割り当て：2マス割り（5エリア、1マスのエリアもあり）でも取得が動く', async () => {
  const { createFacilityWorld: cw } = await import('../browser/board-facilities-live-bridge.mjs');
  const w2 = cw('two');
  assert.equal(w2.areaDefs.length, 5);
  assert.equal(w2.nodeArea['C:1:-1'], 'area-sw');
  assert.equal(w2.nodeArea['C:0:1'], 'area-ne');
  const p1 = player('P1', { hand: ['B'], manaCurrent: 2, position: 'C:0:1' });
  const m = match([p1]);
  m.facilityWorld = w2;
  await onLanding(m, p1);
  assert.equal(p1.manaCurrent, 10); // 回復マスの効果は割り当てと独立に動く
  assert.equal(m.facilityWorld.areas['area-ne'].ownerId, 'P1');
});

test('置き場：部屋でない対戦（ランク側）では何も起きない。テストの合図がある時だけ手元でも動く', async () => {
  const p1 = player('P1', { hand: ['A'], manaCurrent: 2, position: 'C:0:1' });
  const plain = { id: 'M-plain', round: 1, players: [p1] };
  currentMatch = plain;
  logs.length = 0;
  await onLanding(plain, p1);
  assert.equal(p1.manaCurrent, 2); // 回復マスもエリアも動かない
  assert.equal(plain.facilityWorld, undefined);
  globalThis.GAMEROAD_FACILITIES_LOCAL_TEST = true;
  try {
    await onLanding(plain, p1);
    assert.equal(p1.manaCurrent, 10);
    assert.equal(plain.facilityWorld.areas['area-middle'].ownerId, 'P1');
  } finally {
    delete globalThis.GAMEROAD_FACILITIES_LOCAL_TEST;
  }
});

test('世界は対戦の状態に作られ、形が保たれる', () => {
  const m = match([player('P1')]);
  const w = ensureWorld(m);
  assert.equal(w, m.facilityWorld);
  assert.deepEqual(createFacilityWorld().shopStock, []);
});

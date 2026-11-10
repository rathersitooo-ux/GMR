import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_POOL,
  PROVISIONAL_TILE_ASSIGNMENT,
  TILE_TYPES,
  applyBinbougamiMischief,
  applyRideLike,
  applyTurnStartReturns,
  areaCardLevel,
  binbougamiTarget,
  claimOrGrowArea,
  effectiveTileId,
  resolveOpponentAreaStop,
  resolveTileLanding,
} from '../browser/board-facilities-core.mjs';

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mkPlayer(over = {}) {
  return {
    id: 'P1', name: 'あなた', hand: [], deck: [], discard: [], items: [], itemSlots: [],
    honey: 0, manaCurrent: 5, manaMax: 10, position: 'C:0:0', pendingReturns: [],
    ...over,
  };
}

function mkCtx(over = {}) {
  return {
    round: 3, ranks: { P1: 2, P2: 1 }, rng: lcg(42), players: [],
    cardPower: (id) => ({ SP_K: 13, SP_2: 2, HT_5: 5 }[id] ?? 7),
    drawTrump: () => 'DI_7',
    startPosition: 'C:0:0',
    ...over,
  };
}

test('仕様その2のマスが全部そろっている', () => {
  const ids = TILE_TYPES.map((t) => t.id);
  for (const id of ['item', 'jackpot', 'arena', 'ride', 'card', 'handicap', 'switch', 'draw', 'shop', 'honey', 'heal', 'event', 'area']) {
    assert.ok(ids.includes(id), `${id} が無い`);
  }
  assert.ok(Object.keys(PROVISIONAL_TILE_ASSIGNMENT).length >= 8);
});

test('アイテムマス：ランダムなアイテムが貰える', () => {
  const p = mkPlayer();
  const r = resolveTileLanding('item', p, {}, mkCtx());
  assert.equal(p.items.length, 1);
  assert.ok(ITEM_POOL.includes(p.items[0]));
  assert.ok(r.events.length >= 1);
});

test('闘技場：勝つと報酬とカードの返還予約、負けるとカードは墓地', () => {
  const win = mkPlayer({ hand: ['SP_K'], honey: 3 });
  resolveTileLanding('arena', win, {}, mkCtx());
  assert.equal(win.honey, 3 - 1 + 3);
  assert.deepEqual(win.pendingReturns, ['SP_K']);
  const back = applyTurnStartReturns(win);
  assert.deepEqual(back, ['SP_K']);
  assert.ok(win.hand.includes('SP_K'));

  const lose = mkPlayer({ hand: ['SP_2'], honey: 3 });
  resolveTileLanding('arena', lose, {}, mkCtx());
  assert.deepEqual(lose.discard, ['SP_2']);
  assert.equal(lose.honey, 2);
});

test('ライド：重ねがけ不可で一番新しい物に書き換わる（使い魔も同じ枠）', () => {
  const p = mkPlayer();
  applyRideLike(p, 'ride', 'RIDE_GRIFFON', { moveBonus: 2 });
  const r = applyRideLike(p, 'familiar', 'FAMILIAR_BAT', { debuff: true });
  assert.equal(r.replaced.cardId, 'RIDE_GRIFFON');
  assert.equal(p.rideLike.cardId, 'FAMILIAR_BAT');
});

test('カードマス：順位の数だけトランプが枠へ、埋まっていたら手札へ', () => {
  const p = mkPlayer({ itemSlots: ['A', 'B'] });
  resolveTileLanding('card', p, {}, mkCtx()); // 順位2 → 2枚。枠は残り1つ
  assert.equal(p.itemSlots.length, 3);
  assert.equal(p.hand.length, 1);
});

test('ハンデスマス：ハズレの分だけ手札を捨てる（手札以上は捨てない）', () => {
  const p = mkPlayer({ hand: ['SP_A'] });
  resolveTileLanding('handicap', p, {}, mkCtx({ rng: () => 0.99 }));
  assert.equal(p.hand.length, 0);
  assert.equal(p.discard.length, 1);
});

test('スイッチマス：カードマスとハンデスマスが入れ替わる', () => {
  const world = {};
  resolveTileLanding('switch', mkPlayer(), world, mkCtx());
  assert.equal(effectiveTileId('card', world), 'handicap');
  assert.equal(effectiveTileId('handicap', world), 'card');
  assert.equal(effectiveTileId('shop', world), 'shop');
});

test('ドローマス：順位の数だけ引く', () => {
  const p = mkPlayer({ deck: ['SP_A', 'SP_2', 'SP_3'] });
  resolveTileLanding('draw', p, {}, mkCtx());
  assert.equal(p.hand.length, 2);
  assert.equal(p.deck.length, 1);
});

test('ショップ：1個1ハニーで売れて、売られた物が並んで買える。何もしなければふっとばされる', () => {
  const world = {};
  const seller = mkPlayer({ hand: ['HT_5'], honey: 0 });
  resolveTileLanding('shop', seller, world, mkCtx({ shopSellIds: ['HT_5'] }));
  assert.equal(seller.honey, 1);
  assert.deepEqual(world.shopStock, ['HT_5']);

  const buyer = mkPlayer({ id: 'P2', name: '相手', honey: 2 });
  resolveTileLanding('shop', buyer, world, mkCtx({ shopBuyIds: ['HT_5'] }));
  assert.equal(buyer.honey, 1);
  assert.deepEqual(buyer.items, ['HT_5']);
  assert.equal(world.shopStock.length, 0);

  const idle = mkPlayer({ position: 'C:1:0' });
  resolveTileLanding('shop', idle, world, mkCtx());
  assert.equal(idle.position, 'C:0:0');
});

test('ハニーマス：先着1名だけ、ターン数＋順位の分もらえる', () => {
  const world = {};
  const first = mkPlayer();
  resolveTileLanding('honey', first, world, mkCtx());
  assert.equal(first.honey, 3 + 2);
  const second = mkPlayer({ id: 'P2', name: '相手' });
  resolveTileLanding('honey', second, world, mkCtx());
  assert.equal(second.honey, 0);
});

test('回復マス：マナが全快する', () => {
  const p = mkPlayer({ manaCurrent: 1 });
  resolveTileLanding('heal', p, {}, mkCtx());
  assert.equal(p.manaCurrent, 10);
});

test('イベントマス：スロットで何かが起きる（範囲内）', () => {
  for (const v of [0.0, 0.3, 0.55, 0.8]) {
    const p = mkPlayer({ deck: ['SP_A'] });
    const r = resolveTileLanding('event', p, {}, mkCtx({ rng: () => v }));
    assert.ok(r.events.length >= 1);
  }
});

test('エリア：最初に置いた人がエリアごと取り、置いたカードはラウンドで成長する', () => {
  const world = {};
  const p = mkPlayer({ hand: ['SP_K'] });
  const r1 = claimOrGrowArea(p, world, '商店街', 'SP_K', mkCtx());
  assert.equal(world.areas['商店街'].ownerId, 'P1');
  assert.equal(world.areas['商店街'].cards.length, 1);
  assert.equal(areaCardLevel(world.areas['商店街'], 'SP_K', 3), 0);
  assert.equal(areaCardLevel(world.areas['商店街'], 'SP_K', 6), 3);
  assert.ok(r1.events.length >= 2);
});

test('相手のエリア：支払う（ハニー不足はマナで払い、相手に足される）／攻撃で奪う／失敗でスタートへ', () => {
  const owner = mkPlayer({ id: 'P2', name: '相手', honey: 0 });
  const area = { ownerId: 'P2', cards: ['SP_K', 'HT_5'], placedRound: {} };

  const payer = mkPlayer({ honey: 1, manaCurrent: 5 });
  resolveOpponentAreaStop(payer, owner, area, 'pay', mkCtx());
  assert.equal(owner.honey, 2);
  assert.equal(payer.honey, 0);
  assert.equal(payer.manaCurrent, 4);

  const attacker = mkPlayer({ hand: ['SP_K'], position: 'C:1:1' });
  const weakArea = { ownerId: 'P2', cards: ['SP_2'], placedRound: {} };
  resolveOpponentAreaStop(attacker, owner, weakArea, 'attack', mkCtx());
  assert.equal(weakArea.ownerId, 'P1');

  const loser = mkPlayer({ hand: ['SP_2'], position: 'C:1:1' });
  const strongArea = { ownerId: 'P2', cards: ['SP_K'], placedRound: {} };
  resolveOpponentAreaStop(loser, owner, strongArea, 'attack', mkCtx());
  assert.equal(loser.position, 'C:0:0');
});

test('貧乏神：目的地に一番遠い人に付き、迷惑でハニーが減る（仮）', () => {
  const near = mkPlayer({ id: 'P1', distanceToGoal: 2 });
  const far = mkPlayer({ id: 'P2', distanceToGoal: 9, honey: 3 });
  assert.equal(binbougamiTarget([near, far]).id, 'P2');
  applyBinbougamiMischief(far);
  assert.equal(far.honey, 2);
});

test('他のゲームのマス：チャンス／マイナス／給料', () => {
  const lucky = mkPlayer({ honey: 0 });
  resolveTileLanding('chance', lucky, {}, mkCtx({ rng: () => 0.0 }));
  assert.equal(lucky.honey, 4);

  const taxed = mkPlayer({ honey: 5 });
  resolveTileLanding('tax', taxed, {}, mkCtx());
  assert.equal(taxed.honey, 3);

  const poor = mkPlayer({ honey: 1 });
  resolveTileLanding('tax', poor, {}, mkCtx());
  assert.equal(poor.honey, 0);

  const paid = mkPlayer({ honey: 0 });
  resolveTileLanding('salary', paid, {}, mkCtx());
  assert.equal(paid.honey, 4);
});

test('他のゲームのマス：銀行は預けて増えて戻る（仮）', () => {
  const world = {};
  const p = mkPlayer({ honey: 5 });
  resolveTileLanding('bank', p, world, mkCtx({ bankDeposit: 5 }));
  assert.equal(p.honey, 0);
  assert.equal(world.bank.P1, 5);
  resolveTileLanding('bank', p, world, mkCtx());
  assert.equal(p.honey, 6); // 5 + 2割(端数切り上げで1) = 6
  assert.equal(world.bank.P1, 0);
});

test('他のゲームのマス：武器屋で買える／祠で墓地から戻る', () => {
  const buyer = mkPlayer({ honey: 3 });
  resolveTileLanding('weaponshop', buyer, {}, mkCtx());
  assert.deepEqual(buyer.items, ['WEAPON_SWORD']);
  assert.equal(buyer.honey, 0);

  const broke = mkPlayer({ honey: 1 });
  resolveTileLanding('weaponshop', broke, {}, mkCtx());
  assert.equal(broke.items.length, 0);

  const revived = mkPlayer({ discard: ['HT_5'] });
  resolveTileLanding('shrine', revived, {}, mkCtx());
  assert.deepEqual(revived.hand, ['HT_5']);
  assert.equal(revived.discard.length, 0);
});

test('他のゲームのマス：領地は取れて、他人は通行料を払う（仮）', () => {
  const world = {};
  const ownerP = mkPlayer({ honey: 5 });
  const ctx = mkCtx({ nodeId: 'R:P1:C:4', players: [ownerP] });
  resolveTileLanding('territory', ownerP, world, ctx);
  assert.equal(world.tileOwners['R:P1:C:4'], 'P1');
  assert.equal(ownerP.honey, 3);

  const guest = mkPlayer({ id: 'P2', name: '相手', honey: 4 });
  ctx.players = [ownerP, guest];
  resolveTileLanding('territory', guest, world, ctx);
  assert.equal(guest.honey, 2);
  assert.equal(ownerP.honey, 5);
});

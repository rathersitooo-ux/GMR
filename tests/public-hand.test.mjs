// 公開手札の記録と入口のテスト（2026-11-10）。
// 原則：公開領域から非公開領域へカードは行かない。手札に戻る時は表向きで
// 戻り、他のプレイヤーから実際に見れる。非公開の分は枚数だけ。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPublicHandState,
  markPublicInHand,
  unmarkInHand,
  syncWithHand,
  viewForViewer,
} from '../browser/public-hand-core.mjs';
import { createPublicHandBridge } from '../browser/public-hand-live-bridge.mjs';
import { resolveTileLanding } from '../browser/board-facilities-core.mjs';

function players() {
  return [
    { id: 'p1', name: '自分', human: true, hand: ['A', 'B', 'C'] },
    { id: 'p2', name: '相手1', hand: ['D', 'E'] },
    { id: 'p3', name: '相手2', hand: ['F'] },
  ];
}

test('公開の印を付けると、そのカードだけが見える分に入る', () => {
  const st = createPublicHandState();
  assert.equal(markPublicInHand(st, 'p2', 'D'), true);
  assert.equal(markPublicInHand(st, 'p2', 'D'), false); // 二重には入らない
  const view = viewForViewer(st, players(), 'p1');
  const p2 = view.find((v) => v.playerId === 'p2');
  assert.deepEqual(p2.publicCards, ['D']);
  assert.equal(p2.hiddenCount, 1); // E は枚数だけ
  assert.equal(p2.totalInHand, 2);
});

test('手札を離れたカードの印は同期で落ちる', () => {
  const st = createPublicHandState();
  markPublicInHand(st, 'p2', 'D');
  const ps = players();
  ps[1].hand = ['E']; // D を場に出した
  assert.equal(syncWithHand(st, ps[1]), 1);
  const view = viewForViewer(st, ps, 'p1');
  assert.deepEqual(view.find((v) => v.playerId === 'p2').publicCards, []);
});

test('unmarkInHand は対象のカードだけを外す', () => {
  const st = createPublicHandState();
  markPublicInHand(st, 'p3', 'F');
  assert.equal(unmarkInHand(st, 'p3', 'F'), true);
  assert.equal(unmarkInHand(st, 'p3', 'F'), false);
});

test('観戦（viewerId=null）では全員分が見れる形になる', () => {
  const st = createPublicHandState();
  markPublicInHand(st, 'p1', 'A');
  const view = viewForViewer(st, players(), null);
  assert.equal(view.every((v) => v.isViewer === false), true);
  assert.deepEqual(view.find((v) => v.playerId === 'p1').publicCards, ['A']);
});

// --- 最小の画面の代わり ---
class FakeEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = {};
    this.hidden = false; this.textContent = ''; this.attrs = {};
    this.listeners = {};
  }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.children.push(c)); }
  replaceChildren(...cs) { this.children = [...cs]; }
  addEventListener(ev, fn) { this.listeners[ev] = fn; }
  setAttribute(k, v) { this.attrs[k] = v; }
  click() { this.listeners.click?.(); }
}

test('入口：相手を選ぶと公開手札が開き、裏向きは枚数だけ出る', () => {
  const byId = {};
  const battle = new FakeEl('section');
  globalThis.document = {
    querySelector: () => battle,
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new FakeEl(tag),
    body: battle,
  };
  const origCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = origCreate(tag);
    const setter = Object.getOwnPropertyDescriptor(FakeEl.prototype, 'id');
    Object.defineProperty(el, 'id', {
      get() { return this._id; },
      set(v) { this._id = v; byId[v] = el; },
    });
    return el;
  };
  const ps = players();
  const match = { players: ps, round: 1 };
  const bridge = createPublicHandBridge({
    getMatch: () => match,
    cardLabel: (id) => `カード${id}`,
    cardPower: () => 5,
    log: () => {},
  });
  // 相手1の D が公開のまま手札へ戻った
  ps[1].hand.push('X'); // 状態を崩さないための余分な1枚ではない（下で戻す）
  ps[1].hand.pop();
  assert.equal(bridge.markReturn('p2', 'D'), true);
  assert.equal(bridge.markReturn('p2', 'ZZ'), false); // 手札に無い物は記録しない
  bridge.openPanel('p2');
  const panel = byId['gameroadPublicHandPanel'];
  assert.equal(panel.hidden, false);
  const texts = [];
  const walk = (el) => { if (el.textContent) texts.push(el.textContent); (el.children || []).forEach(walk); };
  walk(panel);
  const joined = texts.join('|');
  // 公開カードは札の面として出る（面の材料が無いこのテストでは名前と強さ）
  assert.match(joined, /カードD/);
  assert.match(joined, /5/);
  // 裏向きは文章ではなく、裏面の札と枚数の印（×1）だけ
  assert.match(joined, /×1/);
  assert.doesNotMatch(joined, /裏向き（中身は見えない）/);
  assert.doesNotMatch(joined, /カードE/); // 非公開の中身は出ない
  delete globalThis.document;
});

test('祠マス：墓地から戻ったカードは公開の戻りとして積まれる', () => {
  const world = {};
  const player = { id: 'p9', name: '試し', hand: [], discard: ['HT_7'], deck: [], honey: 0, manaCurrent: 0 };
  const r = resolveTileLanding('shrine', player, world, { round: 1, rng: () => 0 });
  assert.deepEqual(player.hand, ['HT_7']);
  assert.deepEqual(world.publicReturns, [{ playerId: 'p9', cardId: 'HT_7' }]);
  assert.ok(r.events.some((e) => e.includes('祠マス')));
});

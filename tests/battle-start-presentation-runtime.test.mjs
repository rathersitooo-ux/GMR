import assert from 'node:assert/strict';
import test from 'node:test';

import { createBattleStartFlagsStore } from '../browser/battle-start-presentation-core.mjs';
import { createBattleStartPresentationMount } from '../browser/battle-start-presentation-runtime.mjs';

class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      add: (...names) => { for (const name of names) classes.add(name); this.className = [...classes].join(' '); },
      remove: (...names) => { for (const name of names) classes.delete(name); this.className = [...classes].join(' '); },
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const next = force !== undefined ? !!force : !classes.has(name);
        if (next) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
        return next;
      },
    };
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== listener));
  }
  dispatch(type, event = {}) {
    const full = { type, target: this, ...event };
    let node = this;
    while (node) {
      for (const listener of node.listeners.get(type) ?? []) listener(full);
      node = node.parentNode;
    }
    return full;
  }
  querySelector(selector) {
    return walk(this, (node) => node !== this && matches(node, selector));
  }
  querySelectorAll(selector) {
    const out = [];
    collect(this, (node) => node !== this && matches(node, selector), out);
    return out;
  }
}

function walk(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = walk(child, predicate);
    if (found) return found;
  }
  return null;
}

function collect(node, predicate, out) {
  if (predicate(node)) out.push(node);
  for (const child of node.children ?? []) collect(child, predicate, out);
}

function matches(node, selector) {
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  if (selector.startsWith('.')) return String(node.className || '').split(/\s+/).includes(selector.slice(1));
  const attr = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    const value = node.getAttribute(attr[1]);
    return attr[2] === undefined ? value !== null : value === attr[2];
  }
  return node.tagName === selector.toUpperCase();
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) { return walk(this.body, (node) => node.id === id); }
}

function fakeTimers() {
  let clock = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { fn, at: clock + ms });
      return id;
    },
    clearTimeout: (id) => { pending.delete(id); },
    runDue: (uptoMs) => {
      clock = uptoMs;
      const due = [...pending.entries()]
        .filter(([, item]) => item.at <= uptoMs)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, item] of due) {
        if (!pending.has(id)) continue;
        pending.delete(id);
        item.fn();
      }
    },
    pendingCount: () => pending.size,
  };
}

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
  };
}

function fakeAssignment(cardIds) {
  const hands = ['ROCK', 'SCISSORS', 'PAPER'];
  return {
    slots: hands.map((hand, index) => ({
      slotId: `slot-${hand}`,
      jankenHand: hand,
      status: 'OCCUPIED',
      selectable: true,
      cardId: cardIds[index],
      candidateCardIds: [cardIds[index]],
    })),
  };
}

function fakeMatch() {
  return {
    id: 'M1',
    mode: '4p',
    round: 1,
    phase: 'plan',
    players: Array.from({ length: 4 }, (_, index) => ({
      id: `P${index + 1}`,
      name: index === 0 ? 'あなた' : `PLAYER ${index + 1}`,
      team: null,
      openingJankenAssignment: fakeAssignment([`CARD_A${index + 1}`, `CARD_B${index + 1}`, `CARD_C${index + 1}`]),
    })),
  };
}

const describeCard = (cardId) => ({ label: `カード${cardId}`, rank: '7', suitGlyph: '♠' });

function setup({ match = fakeMatch(), settings = { movie: 'first_only', reducedMotion: false, lowPerf: false } } = {}) {
  const document = new FakeDocument();
  const host = document.createElement('section');
  host.setAttribute('data-screen', 'battle');
  document.body.appendChild(host);
  const storage = fakeStorage();
  const flagsStore = createBattleStartFlagsStore({ storage });
  const timers = fakeTimers();
  const mount = createBattleStartPresentationMount({
    getMatch: () => match,
    getHost: () => host,
    getSettings: () => settings,
    describeCard,
    flagsStore,
    timers,
  });
  return { document, host, storage, flagsStore, timers, mount };
}

test('movie: 題と4人の顔・名前・席が出て、じゃんけんの数字は出ない（02:55の決め）', () => {
  const { host, mount } = setup();
  const result = mount.present();
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'movie');
  assert.equal(result.outcome, 'presenting');
  assert.equal(result.totalMs, 1400);
  const overlay = host.querySelector('.battleStartSurface');
  assert.ok(overlay);
  assert.equal(overlay.getAttribute('data-mode'), 'movie');
  assert.equal(overlay.getAttribute('data-phase'), 'TITLE');
  assert.equal(overlay.querySelector('.battleStartTitle').textContent, 'BATTLE START');
  const players = overlay.querySelectorAll('.battleStartPlayer');
  assert.equal(players.length, 4);
  assert.equal(players[0].querySelector('.battleStartName').textContent, 'あなた');
  assert.equal(players[0].querySelector('.battleStartAvatar').textContent, 'あ');
  assert.equal(players[0].querySelector('.battleStartSeat').textContent, 'P1');
  assert.equal(players[0].querySelectorAll('.battleStartSlot').length, 0);
  assert.equal(overlay.querySelector('.battleStartSlots'), null);
  assert.equal(overlay.querySelector('.battleStartOrderNote').textContent, '手番の順番は、計画を出したあとに決まる');
  assert.ok(overlay.querySelector('[data-battle-cinematic-skip-button]'));
});

test('movie: 題0.6秒で入りへ、1.4秒で消えて「見た」の旗が残る', () => {
  const { host, timers, flagsStore, mount } = setup();
  mount.present();
  const overlay = host.querySelector('.battleStartSurface');
  timers.runDue(600);
  assert.equal(overlay.getAttribute('data-phase'), 'ENTRY');
  assert.equal(mount.snapshot().phase, 'ENTRY');
  timers.runDue(1400);
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().seen, true);
  assert.equal(flagsStore.read().skipped, false);
  assert.equal(timers.pendingCount(), 0);
});

test('movie: タップで飛ばせて「飛ばした」の旗が残る', () => {
  const { host, flagsStore, mount } = setup();
  mount.present();
  const overlay = host.querySelector('.battleStartSurface');
  overlay.dispatch('click');
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().skipped, true);
  assert.equal(flagsStore.read().seen, false);
});

test('movie: 「スキップ」ボタンでも飛ばせる', () => {
  const { host, flagsStore, mount } = setup();
  mount.present();
  const button = host.querySelector('[data-battle-cinematic-skip-button]');
  assert.ok(button);
  assert.equal(button.textContent, 'スキップ');
  button.dispatch('click');
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().skipped, true);
});

test('title_only: 動きを減らす設定では題だけ出て、カードは出ない', () => {
  const { host, timers, flagsStore, mount } = setup({ settings: { movie: 'always', reducedMotion: true, lowPerf: false } });
  const result = mount.present();
  assert.equal(result.mode, 'title_only');
  assert.equal(result.reason, 'REDUCED_MOTION');
  const overlay = host.querySelector('.battleStartSurface');
  assert.equal(overlay.getAttribute('data-mode'), 'title_only');
  assert.equal(overlay.querySelector('.battleStartTitle').textContent, 'BATTLE START');
  assert.equal(overlay.querySelector('[data-role="janken"]'), null);
  assert.equal(overlay.querySelector('.battleStartOrderNote'), null);
  timers.runDue(600);
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().seen, false);
});

test('title_only: 「見ない」（パージ）は題を止め絵で出す', () => {
  const { host, timers, mount } = setup({ settings: { movie: 'never', reducedMotion: false, lowPerf: false } });
  const result = mount.present();
  assert.equal(result.mode, 'title_only');
  assert.equal(result.reason, 'SETTING_NEVER_PURGED');
  assert.equal(result.outcome, 'presenting');
  assert.ok(host.querySelector('.battleStartSurface'));
  timers.runDue(600);
  assert.equal(host.querySelector('.battleStartSurface'), null);
});

test('title_only: 前に見られなかったときは題だけ出て、次の回はまたムービーを出す', () => {
  const { host, timers, flagsStore, mount } = setup();
  flagsStore.markNotWatched();
  const result = mount.present();
  assert.equal(result.mode, 'title_only');
  assert.equal(result.reason, 'PREVIOUS_NOT_WATCHED');
  timers.runDue(600);
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().notWatched, false);
});

test('movie: じゃんけんの割り当てがなくてもムービーが出る（02:55の決め）', () => {
  const match = fakeMatch();
  for (const player of match.players) delete player.openingJankenAssignment;
  const { host, mount } = setup({ match });
  const result = mount.present();
  assert.equal(result.mode, 'movie');
  assert.equal(result.outcome, 'presenting');
  const players = host.querySelector('.battleStartSurface').querySelectorAll('.battleStartPlayer');
  assert.equal(players.length, 4);
  assert.equal(players[0].querySelector('.battleStartName').textContent, 'あなた');
  assert.equal(host.querySelector('.battleStartSurface').querySelector('.battleStartSlots'), null);
});

test('present: 対戦がないとき・1巡目でないときは出さない', () => {
  const noMatch = setup({ match: null });
  assert.equal(noMatch.mount.present().reason, 'NO_MATCH');
  const round2 = setup({ match: { ...fakeMatch(), round: 2 } });
  assert.equal(round2.mount.present().reason, 'NOT_FIRST_ROUND');
  assert.equal(round2.host.querySelector('.battleStartSurface'), null);
});

test('present: 2回目は断る（同じ対戦開始で重ねて出さない）', () => {
  const { mount } = setup();
  assert.equal(mount.present().ok, true);
  assert.equal(mount.present().reason, 'ALREADY_PRESENTING');
});

test('present: 対戦画面がないときは出さず、対戦は止めない', () => {
  const document = new FakeDocument();
  const flagsStore = createBattleStartFlagsStore({ storage: fakeStorage() });
  const mount = createBattleStartPresentationMount({
    getMatch: () => fakeMatch(),
    getHost: () => null,
    getSettings: () => ({ movie: 'first_only', reducedMotion: false, lowPerf: false }),
    describeCard,
    flagsStore,
    timers: fakeTimers(),
  });
  assert.equal(mount.present().reason, 'HOST_UNAVAILABLE');
  assert.equal(document.body.children.length, 0);
});

test('movie: じゃんけんの枠に青い炎がつく（33番）', () => {
  const { host, mount } = setup();
  const result = mount.present();
  assert.equal(result.mode, 'movie');
  const janken = host.querySelector('.battleStartJanken');
  assert.ok(janken, 'janken frame exists');
  assert.equal(janken.getAttribute('data-effect'), 'janken-blue-flame');
  assert.equal(janken.getAttribute('data-role'), 'janken');
});

test('title_only: 「見られなかった」旗があるときは次は題だけ出て、旗は消える（35番）', () => {
  const { host, timers, flagsStore, mount } = setup();
  flagsStore.markUnseen('no-screen');
  const result = mount.present();
  assert.equal(result.mode, 'title_only');
  assert.equal(result.reason, 'PREVIOUS_UNSEEN');
  assert.equal(result.totalMs, 600);
  assert.equal(host.querySelector('[data-role="janken"]'), null);
  timers.runDue(600);
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().unseen, null);
});

test('title_only: 「見られなかった」旗があっても、次はまたムービーを出す', () => {
  const { host, timers, flagsStore, mount } = setup();
  flagsStore.markUnseen('participant-entry');
  const first = mount.present();
  assert.equal(first.mode, 'title_only');
  assert.equal(first.reason, 'PREVIOUS_UNSEEN');
  timers.runDue(600);
  assert.equal(host.querySelector('.battleStartSurface'), null);
  assert.equal(flagsStore.read().unseen, null);
  assert.equal(flagsStore.read().skipped, false);
  const again = mount.present();
  assert.equal(again.mode, 'movie');
  assert.equal(again.reason, 'FIRST_VIEW');
});

test('unseen: 対戦画面がないときは「見られなかった」（no-battle-screen）が残る（35番）', () => {
  const flagsStore = createBattleStartFlagsStore({ storage: fakeStorage() });
  const mount = createBattleStartPresentationMount({
    getMatch: () => fakeMatch(),
    getHost: () => null,
    getSettings: () => ({ movie: 'first_only', reducedMotion: false, lowPerf: false }),
    describeCard,
    flagsStore,
    timers: fakeTimers(),
  });
  assert.equal(mount.present().reason, 'HOST_UNAVAILABLE');
  assert.equal(flagsStore.read().unseen, 'no-battle-screen');
});

test('unseen: 画面が作れないときは「見られなかった」（no-screen）が残る（35番）', () => {
  const document = new FakeDocument();
  const host = {
    appendChild: () => { throw new Error('mount failed'); },
    setAttribute: () => {},
    ownerDocument: document,
  };
  const flagsStore = createBattleStartFlagsStore({ storage: fakeStorage() });
  const mount = createBattleStartPresentationMount({
    getMatch: () => fakeMatch(),
    getHost: () => host,
    getSettings: () => ({ movie: 'first_only', reducedMotion: false, lowPerf: false }),
    describeCard,
    flagsStore,
    timers: fakeTimers(),
  });
  assert.equal(mount.present().reason, 'OVERLAY_MOUNT_FAILED');
  assert.equal(flagsStore.read().unseen, 'no-screen');
});

test('unseen: 対戦がないときは旗は残らない（35番）', () => {
  const { flagsStore, mount } = setup({ match: null });
  assert.equal(mount.present().reason, 'NO_MATCH');
  assert.equal(flagsStore.read().unseen, null);
});

test('recordUnseen: 参加者の入口から旗を残せる・変な理由は残さない（35番）', () => {
  const { flagsStore, mount } = setup();
  mount.recordUnseen('participant-entry');
  assert.equal(flagsStore.read().unseen, 'participant-entry');
  mount.recordUnseen('bogus');
  assert.equal(flagsStore.read().unseen, 'participant-entry');
  mount.recordUnseen('no-battle-screen');
  assert.equal(flagsStore.read().unseen, 'no-battle-screen');
});

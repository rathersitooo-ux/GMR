import assert from 'node:assert/strict';
import test from 'node:test';

import { createBattleTurnTimerMount } from '../browser/battle-turn-timer-runtime.mjs';

class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    const classes = new Set();
    this.classList = {
      add: (...names) => { for (const name of names) classes.add(name); },
      remove: (...names) => { for (const name of names) classes.delete(name); },
      contains: (name) => classes.has(name),
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
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body', this);
    this.head = new FakeElement('head', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) {
    const walk = (node) => {
      if (node.id === id) return node;
      for (const child of node.children ?? []) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this.body) ?? walk(this.head);
  }
}

function fakeTimers() {
  let nextId = 1;
  const intervals = new Map();
  return {
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    tickIntervals: () => { for (const item of intervals.values()) item.fn(); },
    intervalCount: () => intervals.size,
  };
}

function setup() {
  const document = new FakeDocument();
  const host = new FakeElement('section', document);
  document.body.appendChild(host);
  let match = null;
  let nowMs = 0;
  const timers = fakeTimers();
  const mount = createBattleTurnTimerMount({
    getMatch: () => match,
    getHost: () => host,
    getSettings: () => ({}),
    timers,
    now: () => nowMs,
  });
  return {
    document,
    host,
    mount,
    timers,
    setMatch: (m) => { match = m; },
    setNow: (ms) => { nowMs = ms; },
    root: () => host.children.find((c) => c.getAttribute('data-battle-turn-timer') === '1') ?? null,
  };
}

function numberText(root) {
  // root > dial > inner > b
  return root.children[0].children[0].children[0].textContent;
}

test('対戦が無い時は出ない', () => {
  const s = setup();
  assert.equal(s.mount.sync(), null);
  assert.equal(s.root(), null);
});

test('巡の開始で75が出て、数え下げる', () => {
  const s = setup();
  s.setMatch({ id: 'M1', round: 1, players: [{ id: 'P1' }, { id: 'P2' }] });
  const first = s.mount.sync();
  assert.equal(first.remainingSeconds, 75);
  assert.equal(first.state, 'running');
  assert.equal(numberText(s.root()), '75');
  assert.equal(s.root().getAttribute('data-state'), 'running');

  s.setNow(30000);
  const mid = s.mount.sync();
  assert.equal(mid.remainingSeconds, 45);
  assert.equal(numberText(s.root()), '45');
});

test('残り15秒で警告、0秒で時間切れの表示になる（対戦は進めない）', () => {
  const s = setup();
  const match = { id: 'M1', round: 1, players: [{ id: 'P1' }, { id: 'P2' }] };
  s.setMatch(match);
  s.mount.sync();

  s.setNow(61000);
  const warn = s.mount.sync();
  assert.equal(warn.state, 'warning');
  assert.equal(s.root().getAttribute('data-state'), 'warning');

  s.setNow(76000);
  const expired = s.mount.sync();
  assert.equal(expired.state, 'expired');
  assert.equal(expired.remainingSeconds, 0);
  assert.equal(numberText(s.root()), '0');
  // 表示専用: 試合の状態には何も書いていない
  assert.deepEqual(Object.keys(match).sort(), ['id', 'players', 'round']);
});

test('時間切れした次の巡は20秒、時間内に終われば75秒に戻る', () => {
  const s = setup();
  s.setMatch({ id: 'M1', round: 1, players: [{ id: 'P1' }, { id: 'P2' }] });
  s.mount.sync();
  s.setNow(90000); // 1巡目は時間切れ
  s.setMatch({ id: 'M1', round: 2, players: [{ id: 'P1' }, { id: 'P2' }] });
  const second = s.mount.sync();
  assert.equal(second.durationMs, 20000);
  assert.equal(second.remainingSeconds, 20);

  s.setNow(95000); // 2巡目は5秒で終わる
  s.setMatch({ id: 'M1', round: 3, players: [{ id: 'P1' }, { id: 'P2' }] });
  const third = s.mount.sync();
  assert.equal(third.durationMs, 75000);
  assert.equal(third.remainingSeconds, 75);
});

test('試合が終わったら隠れる。別の試合は75秒から始まる', () => {
  const s = setup();
  s.setMatch({ id: 'M1', round: 4, players: [{ id: 'P1' }, { id: 'P2' }] });
  s.mount.sync();
  assert.equal(s.root().hidden, false);

  s.setMatch({ id: 'M1', round: 4, players: [{ id: 'P1' }, { id: 'P2' }], lastResult: { ranking: [] } });
  assert.equal(s.mount.sync(), null);
  assert.equal(s.root().hidden, true);

  s.setNow(5000);
  s.setMatch({ id: 'M2', round: 1, players: [{ id: 'P1' }, { id: 'P2' }] });
  const fresh = s.mount.sync();
  assert.equal(fresh.remainingSeconds, 75);
  assert.equal(s.root().hidden, false);
});

test('start で定期的に数え下げ、destroy で止まる', () => {
  const s = setup();
  s.setMatch({ id: 'M1', round: 1, players: [{ id: 'P1' }, { id: 'P2' }] });
  assert.equal(s.mount.start(), true);
  assert.equal(s.timers.intervalCount(), 1);
  s.setNow(10000);
  s.timers.tickIntervals();
  assert.equal(s.mount.snapshot().remainingSeconds, 65);
  assert.equal(s.mount.destroy(), true);
  assert.equal(s.timers.intervalCount(), 0);
});

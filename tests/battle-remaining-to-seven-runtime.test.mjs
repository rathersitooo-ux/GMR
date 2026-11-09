import assert from 'node:assert/strict';
import test from 'node:test';

import { createBattleRemainingToSevenMount } from '../browser/battle-remaining-to-seven-runtime.mjs';

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
  querySelector(selector) { return walk(this, (node) => node !== this && matches(node, selector)); }
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
    this.head = new FakeElement('head', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) { return walk(this.body, (node) => node.id === id) ?? walk(this.head, (node) => node.id === id); }
}

function fakeTimers() {
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId++; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timeouts.delete(id); },
    setInterval: (fn, ms) => { const id = nextId++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    runTimeouts: () => { for (const [id, item] of [...timeouts.entries()]) { timeouts.delete(id); item.fn(); } },
    tickIntervals: () => { for (const item of intervals.values()) item.fn(); },
    intervalCount: () => intervals.size,
  };
}

function fakeMatch() {
  return {
    id: 'M1',
    players: [
      { id: 'P1', name: 'あなた', human: true, lanes: { L: [], C: ['a', 'b', 'c'], R: [] } },
      { id: 'P2', name: 'サースナー', lanes: { L: ['a'], C: [], R: [] } },
      { id: 'P3', name: 'ナキ', lanes: { L: [], C: [], R: ['a', 'b'] } },
      { id: 'P4', name: 'パム', lanes: { L: [], C: [], R: [] } },
    ],
  };
}

function setup({ match = fakeMatch(), settings = {} } = {}) {
  const document = new FakeDocument();
  const host = document.createElement('section');
  host.setAttribute('data-screen', 'battle');
  document.body.appendChild(host);
  const timers = fakeTimers();
  const mount = createBattleRemainingToSevenMount({
    getMatch: () => match,
    getHost: () => host,
    getSettings: () => settings,
    timers,
  });
  return { document, host, timers, mount, match };
}

function badgeText(chip) {
  const badge = chip.querySelector('[data-role="badge"]');
  if (badge.textContent) return badge.textContent;
  return badge.children.map((child) => child.textContent).join('');
}

test('4人全員の顔と大きな「あと○枚」が出る', () => {
  const { host, mount } = setup();
  const model = mount.sync();
  assert.equal(model.players.length, 4);
  const root = host.querySelector('[data-battle-remaining-to-seven="1"]');
  assert.ok(root);
  const chips = root.querySelectorAll('.grRemainPlayer');
  assert.equal(chips.length, 4);
  assert.equal(chips[0].querySelector('.grRemainAvatar').textContent, 'あ');
  assert.equal(badgeText(chips[0]), 'あと4枚');
  assert.equal(badgeText(chips[1]), 'あと6枚');
  assert.equal(badgeText(chips[3]), 'あと7枚');
  assert.equal(chips[0].querySelector('[data-role="detail"]').textContent, 'まん中の道 3/7枚');
  assert.equal(chips[0].getAttribute('data-leader'), 'true');
  const dots = chips[0].querySelector('.grRemainDots').children;
  assert.equal(dots.length, 7);
  assert.equal(dots.filter((dot) => dot.className === 'on').length, 3);
});

test('残りが減ると印が膨らみ、あと1枚はリーチ、7枚で門が開いたになる', () => {
  const { host, mount, match, timers } = setup();
  mount.sync();
  match.players[0].lanes.C.push('d', 'e');
  mount.sync();
  const root = host.querySelector('[data-battle-remaining-to-seven="1"]');
  const chip = root.querySelectorAll('.grRemainPlayer')[0];
  assert.equal(badgeText(chip), 'あと2枚');
  match.players[0].lanes.C.push('f');
  mount.sync();
  assert.equal(chip.getAttribute('data-state'), 'reach');
  assert.equal(badgeText(chip), 'あと1枚');
  assert.equal(chip.querySelector('[data-role="badge"]').classList.contains('bump'), true);
  timers.runTimeouts();
  assert.equal(chip.querySelector('[data-role="badge"]').classList.contains('bump'), false);
  match.players[0].lanes.C.push('g');
  mount.sync();
  assert.equal(chip.getAttribute('data-state'), 'gate_open');
  assert.equal(badgeText(chip), '門が開いた！');
});

test('動きを減らす設定では膨らまない', () => {
  const { host, mount, match } = setup({ settings: { reducedMotion: true } });
  mount.sync();
  match.players[1].lanes.L.push('b');
  mount.sync();
  const chip = host.querySelector('[data-battle-remaining-to-seven="1"]').querySelectorAll('.grRemainPlayer')[1];
  assert.equal(badgeText(chip), 'あと5枚');
  assert.equal(chip.querySelector('[data-role="badge"]').classList.contains('bump'), false);
});

test('対戦がないときは隠れる。start で定期的に読み直し、destroy で止まる', () => {
  const { host, mount, match, timers } = setup();
  assert.equal(mount.start(), true);
  assert.equal(mount.snapshot().polling, true);
  match.players[3].lanes.R.push('a', 'b', 'c', 'd', 'e', 'f');
  timers.tickIntervals();
  const chip = host.querySelector('[data-battle-remaining-to-seven="1"]').querySelectorAll('.grRemainPlayer')[3];
  assert.equal(badgeText(chip), 'あと1枚');
  assert.equal(mount.destroy(), true);
  assert.equal(timers.intervalCount(), 0);
  assert.equal(host.querySelector('[data-battle-remaining-to-seven="1"]'), null);
});

test('対戦が無い・ホストが無いときは出さない（対戦は止めない）', () => {
  const noMatch = setup({ match: null });
  assert.equal(noMatch.mount.sync(), null);
  assert.equal(noMatch.host.children.length, 0);
  const document = new FakeDocument();
  const mount = createBattleRemainingToSevenMount({
    getMatch: () => fakeMatch(),
    getHost: () => null,
    timers: fakeTimers(),
  });
  assert.equal(mount.sync(), null);
  assert.equal(document.body.children.length, 0);
});

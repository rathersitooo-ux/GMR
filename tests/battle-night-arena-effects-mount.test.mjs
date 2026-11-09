import assert from 'node:assert/strict';
import test from 'node:test';

import { createNightArenaRemainingEffectsMount } from '../browser/battle-night-arena-effects-mount.mjs';
import { NIGHT_ARENA_REMAINING_EFFECTS } from '../browser/battle-night-arena-remaining-effects-core.mjs';

class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return index >= 0 && index + 1 < siblings.length ? siblings[index + 1] : null;
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
  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = ref ? this.children.indexOf(ref) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    child.parentNode = this;
    return child;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
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
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) {
    return walk(this.head, (node) => node.id === id)
      ?? walk(this.body, (node) => node.id === id);
  }
}

function setup({ reducedMotion = false } = {}) {
  const document = new FakeDocument();
  const battleMap = document.createElement('div');
  battleMap.id = 'battleMap';
  const canvas = document.createElement('canvas');
  canvas.id = 'fieldCanvas';
  battleMap.appendChild(canvas);
  const liveHost = document.createElement('div');
  liveHost.id = 'battleCentralWorldLiveHost';
  battleMap.appendChild(liveHost);
  document.body.appendChild(battleMap);
  const header = document.createElement('header');
  header.className = 'battlePhaseHeader';
  const round = document.createElement('b');
  round.id = 'battlePhaseRound';
  round.textContent = '第1巡';
  header.appendChild(round);
  document.body.appendChild(header);
  const mount = createNightArenaRemainingEffectsMount({
    getBattleMap: () => battleMap,
    getPhaseHeader: () => header,
    getSettings: () => ({ reducedMotion, lowPerf: false }),
  });
  return { document, battleMap, header, mount };
}

test('mount: 光る模様が盤面に入り、TURNの丸い飾りがつく', () => {
  const { document, battleMap, header, mount } = setup();
  mount.start();
  const pattern = battleMap.querySelector('.nightArenaPattern');
  assert.ok(pattern, 'pattern is inserted into the battle map');
  assert.equal(pattern.getAttribute('data-effect'), 'glowing-pattern');
  assert.equal(pattern.getAttribute('data-animate'), 'true');
  assert.equal(pattern.getAttribute('aria-hidden'), 'true');
  // 描画のすぐ後ろ（生きた盤面の表示より手前）に入る。
  assert.equal(battleMap.children.indexOf(pattern), 1);
  assert.equal(header.getAttribute('data-effect'), 'turn-round-decoration');
  assert.equal(header.getAttribute('data-animate'), 'true');
  // 取り付けの見た目（CSS）が1枚だけ入る。
  assert.ok(document.getElementById('gameroad-battle-night-arena-effects-style'));
  const snapshot = mount.snapshot();
  assert.equal(snapshot.mounted, true);
  assert.equal(snapshot.audit, true);
  assert.deepEqual(snapshot.effectIds, NIGHT_ARENA_REMAINING_EFFECTS.map((effect) => effect.id));
  assert.deepEqual(snapshot.effects.map((effect) => effect.id), ['janken-blue-flame', 'gold-edged-tile', 'glowing-pattern', 'turn-round-decoration']);
  mount.stop();
});

test('mount: 動きを減らす設定では光らせず回さない', () => {
  const { battleMap, header, mount } = setup({ reducedMotion: true });
  mount.start();
  assert.equal(battleMap.querySelector('.nightArenaPattern').getAttribute('data-animate'), 'false');
  assert.equal(header.getAttribute('data-animate'), 'false');
  mount.stop();
});

test('mount: 2回呼んでも模様は1枚だけ', () => {
  const { battleMap, mount } = setup();
  mount.start();
  mount.start();
  assert.equal(battleMap.querySelectorAll('.nightArenaPattern').length, 1);
  mount.stop();
});

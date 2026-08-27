import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleSelfDeckInspectRuntimeMount,
  readCurrentSelfRemainingDeck,
} from '../browser/battle-self-deck-inspect-runtime-mount.mjs';

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.style = { cssText: '' };
    this.hidden = false;
    this.id = '';
    this.type = '';
    this.textContent = '';
    this.parentNode = null;
    this.isConnected = true;
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }
  appendChild(child) {
    child.parentNode = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) { child.parentNode = null; child.isConnected = false; }
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.isConnected = false;
  }
  get firstChild() { return this.children[0] ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler({ target: this, ...event });
  }
  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child.contains?.(target));
  }
  querySelector(selector) {
    const matches = (node) => {
      if (selector === '[data-self-deck-inspect-toggle]') return node.dataset?.selfDeckInspectToggle === 'true';
      if (selector === '[data-self-deck-inspect-panel]') return node.dataset?.selfDeckInspectPanel === 'true';
      return false;
    };
    const walk = (node) => {
      for (const child of node.children ?? []) {
        if (matches(child)) return child;
        const nested = walk(child);
        if (nested) return nested;
      }
      return null;
    };
    return walk(this);
  }
  remove() { this.parentNode?.removeChild(this); }
}

class FakeDocument {
  constructor() {
    this.battle = new FakeElement('section');
    this.battle.classList.add('active');
    this.listeners = new Map();
  }
  createElement(tag) { return new FakeElement(tag); }
  querySelector(selector) {
    if (selector === 'section[data-screen="battle"]') return this.battle;
    return null;
  }
  getElementById(id) {
    const walk = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this.battle);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  dispatch(type, event = {}) { for (const handler of this.listeners.get(type) ?? []) handler(event); }
}

function fixtureRuntime() {
  return {
    state: {
      match: {
        id: 'match-1',
        players: [
          {
            id: 'P1',
            human: true,
            deck: ['SP_2', 'HT_3', 'SP_2'],
            sourceDeckIds: ['SOURCE_ONLY_SHOULD_NEVER_APPEAR'],
          },
          {
            id: 'P2',
            human: false,
            deck: ['SECRET_OPPONENT_CARD'],
          },
        ],
      },
    },
  };
}

function makeMount(runtime) {
  const documentRef = new FakeDocument();
  let scheduled = null;
  let cancelled = null;
  const mount = createBattleSelfDeckInspectRuntimeMount({
    documentRef,
    runtimeRef: () => runtime,
    cardDataRef: () => [
      { id: 'SP_2', display_name: 'スペード2' },
      { id: 'HT_3', display_name: 'ハート3' },
    ],
    schedule: (fn) => { scheduled = fn; return 77; },
    cancelSchedule: (handle) => { cancelled = handle; },
    intervalMs: 250,
  });
  return { documentRef, mount, tick: () => scheduled?.(), cancelled: () => cancelled };
}

test('reads only the single local human live deck and ignores start snapshot/opponent deck', () => {
  const runtime = fixtureRuntime();
  const read = readCurrentSelfRemainingDeck(runtime);
  assert.equal(read.ok, true);
  assert.deepEqual([...read.remainingCardIds], ['SP_2', 'HT_3', 'SP_2']);
  assert.equal(JSON.stringify(read).includes('SOURCE_ONLY_SHOULD_NEVER_APPEAR'), false);
  assert.equal(JSON.stringify(read).includes('SECRET_OPPONENT_CARD'), false);
});

test('mount renders owner-only multiset counts without deck order', () => {
  const runtime = fixtureRuntime();
  const { documentRef, mount } = makeMount(runtime);
  const projection = mount.snapshot();
  assert.equal(projection.ok, true);
  assert.equal(projection.total, 3);
  assert.equal(projection.revision, 0);
  assert.deepEqual(projection.cardCounts, [
    { cardId: 'HT_3', count: 1 },
    { cardId: 'SP_2', count: 2 },
  ]);
  assert.equal(Object.hasOwn(projection, 'remainingCardIds'), false);
  const host = documentRef.getElementById('gameroadSelfDeckInspect');
  assert.ok(host);
  assert.equal(host.children[0].textContent, '残り札 3');
  assert.equal(host.textContent.includes?.('SECRET_OPPONENT_CARD') ?? false, false);
});

test('live deck consumption updates count and projection revision; a new match resets revision', () => {
  const runtime = fixtureRuntime();
  const { mount, tick } = makeMount(runtime);
  runtime.state.match.players[0].deck = ['HT_3', 'SP_2'];
  tick();
  assert.equal(mount.snapshot().total, 2);
  assert.equal(mount.snapshot().revision, 1);

  runtime.state.match.id = 'match-2';
  runtime.state.match.players[0].deck = ['HT_3'];
  tick();
  assert.equal(mount.snapshot().matchId, 'match-2');
  assert.equal(mount.snapshot().total, 1);
  assert.equal(mount.snapshot().revision, 0);
});

test('ambiguous local owner fails closed instead of selecting another player deck', () => {
  const runtime = fixtureRuntime();
  runtime.state.match.players[1].human = true;
  const { documentRef, mount, tick } = makeMount(runtime);
  tick();
  assert.equal(mount.snapshot(), null);
  assert.equal(documentRef.getElementById('gameroadSelfDeckInspect').hidden, true);
});

test('button toggles details; outside pointer and Escape light-dismiss; destroy removes runtime surface', () => {
  const runtime = fixtureRuntime();
  const { documentRef, mount, cancelled } = makeMount(runtime);
  const host = documentRef.getElementById('gameroadSelfDeckInspect');
  const button = host.children[0];
  const panel = host.children[1];
  assert.equal(panel.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.dispatch('click');
  assert.equal(panel.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  documentRef.dispatch('pointerdown', { target: new FakeElement('div') });
  assert.equal(panel.hidden, true);

  button.dispatch('click');
  documentRef.dispatch('keydown', { key: 'Escape' });
  assert.equal(panel.hidden, true);

  assert.equal(mount.destroy(), true);
  assert.equal(cancelled(), 77);
  assert.equal(documentRef.getElementById('gameroadSelfDeckInspect'), null);
  assert.equal(mount.destroy(), false);
});

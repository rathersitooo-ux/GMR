import assert from 'node:assert/strict';
import test from 'node:test';

import { createBattleStartFlagsStore } from '../browser/battle-start-presentation-core.mjs';
import { createBattleStartPresentationMount } from '../browser/battle-start-presentation-runtime.mjs';

// BATTLE開始の表示に候補音をつないだときの検査。表示そのものの検査は
// battle-start-presentation-runtime.test.mjs が担う。ここでは音だけを見る。

class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.className = '';
    this.textContent = '';
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
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
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== listener));
  }
}

class FakeDocument {
  constructor() { this.body = new FakeElement('body', this); }
  createElement(tag) { return new FakeElement(tag, this); }
}

function fakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => { const id = nextId; nextId += 1; pending.set(id, { fn, at: ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    runDue: (uptoMs) => {
      const due = [...pending.entries()].filter(([, item]) => item.at <= uptoMs).sort((a, b) => a[1].at - b[1].at);
      for (const [id, item] of due) { if (!pending.has(id)) continue; pending.delete(id); item.fn(); }
    },
    pendingCount: () => pending.size,
  };
}

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
}

function fakeAssignment(cardIds) {
  const hands = ['ROCK', 'SCISSORS', 'PAPER'];
  return {
    slots: hands.map((hand, index) => ({
      slotId: `slot-${hand}`, jankenHand: hand, status: 'OCCUPIED',
      selectable: true, cardId: cardIds[index], candidateCardIds: [cardIds[index]],
    })),
  };
}

function fakeMatch() {
  return {
    id: 'M1', mode: '4p', round: 1, phase: 'plan',
    players: Array.from({ length: 4 }, (_, index) => ({
      id: `P${index + 1}`,
      name: index === 0 ? 'あなた' : `PLAYER ${index + 1}`,
      team: null,
      openingJankenAssignment: fakeAssignment([`CARD_A${index + 1}`, `CARD_B${index + 1}`, `CARD_C${index + 1}`]),
    })),
  };
}

const describeCard = (cardId) => ({ label: `カード${cardId}`, rank: '7', suitGlyph: '♠' });

function setup({ match = fakeMatch(), settings = { movie: 'first_only', reducedMotion: false, lowPerf: false }, playSfx } = {}) {
  const document = new FakeDocument();
  const host = document.createElement('section');
  document.body.appendChild(host);
  const flagsStore = createBattleStartFlagsStore({ storage: fakeStorage() });
  const timers = fakeTimers();
  const mount = createBattleStartPresentationMount({
    getMatch: () => match,
    getHost: () => host,
    getSettings: () => settings,
    describeCard,
    flagsStore,
    timers,
    skipRuntimeFactory: () => null,
    playSfx,
  });
  return { document, host, timers, mount };
}

test('sfx: ムービーの表示で対戦開始の候補音が1回だけ鳴る', () => {
  const calls = [];
  const { mount } = setup({ playSfx: (key, context) => calls.push({ key, context }) });
  const result = mount.present();
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'movie');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'battleStart');
  assert.equal(calls[0].context.mode, 'movie');
  assert.equal(calls[0].context.generationId, 'battle-start:M1');
  assert.equal(calls[0].context.presentationOnly, true);
  // 重ねて出そうとしても音は増えない
  assert.equal(mount.present().reason, 'ALREADY_PRESENTING');
  assert.equal(calls.length, 1);
});

test('sfx: 題だけの表示（動きを減らす・パージ）でも音は1回鳴る', () => {
  const calls = [];
  const { mount } = setup({
    settings: { movie: 'never', reducedMotion: false, lowPerf: false },
    playSfx: (key, context) => calls.push({ key, context }),
  });
  const result = mount.present();
  assert.equal(result.mode, 'title_only');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.mode, 'title_only');
});

test('sfx: 対戦がないときは鳴らない', () => {
  const calls = [];
  const { mount } = setup({ match: null, playSfx: (key) => calls.push(key) });
  assert.equal(mount.present().reason, 'NO_MATCH');
  assert.equal(calls.length, 0);
});

test('sfx: 音の再生が失敗しても表示は最後まで進む', () => {
  const { host, timers, mount } = setup({
    playSfx: () => { throw new Error('AUDIO_BLOCKED'); },
  });
  const result = mount.present();
  assert.equal(result.ok, true);
  assert.equal(host.children.length, 1);
  timers.runDue(1400);
  assert.equal(host.children.length, 0);
  assert.equal(mount.snapshot().presenting, false);
});

test('sfx: playSfxなし（未接続）でも今まで通り表示できる', () => {
  const { host, timers, mount } = setup({});
  const result = mount.present();
  assert.equal(result.ok, true);
  timers.runDue(1400);
  assert.equal(host.children.length, 0);
});

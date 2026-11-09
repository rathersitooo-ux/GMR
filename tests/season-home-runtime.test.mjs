import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEASON_HOME_STORAGE_KEY,
  claimSeasonFreeReward,
  createSeasonHomeStore,
  mountSeasonHome,
  recordSeasonBattleResult,
  seasonHomeSnapshot,
  voteSeasonFestival,
} from '../browser/season-home-runtime.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

function fakeClassList(initial = []) {
  const names = new Set(initial);
  return {
    contains: (name) => names.has(name),
    add: (name) => { names.add(name); },
    remove: (name) => { names.delete(name); },
  };
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.classList = fakeClassList();
    this.listeners = {};
    this.title = '';
  }

  set className(value) { this._className = value; }
  get className() { return this._className ?? ''; }

  setAttribute(name, value) { this.attrs[name] = value; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] ?? []).filter((item) => item !== fn); }
  append(...nodes) { for (const node of nodes) this.children.push(node); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  remove() { this.removed = true; }
  querySelector(selector) {
    const queue = [...this.children];
    while (queue.length) {
      const node = queue.shift();
      if (selector.startsWith('.') && node.className.split(' ').includes(selector.slice(1))) return node;
      if (selector.startsWith('#') && node.id === selector.slice(1)) return node;
      queue.push(...node.children);
    }
    return null;
  }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
}

function fakeDocument() {
  const home = new FakeElement('section');
  home.setAttribute('data-screen', 'home');
  const result = new FakeElement('section');
  result.setAttribute('data-screen', 'result');
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const byId = new Map();
  const doc = {
    body,
    head,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => byId.get(id) ?? null,
    querySelector: (selector) => {
      if (selector === 'section[data-screen="home"]') return home;
      if (selector === 'section[data-screen="result"]') return result;
      return null;
    },
    _register(id, node) { byId.set(id, node); },
  };
  // mountSeasonHome sets ids on elements it creates; track them through append.
  const track = (node) => {
    if (node.id) byId.set(node.id, node);
    for (const child of node.children) track(child);
  };
  const origBodyAppend = body.append.bind(body);
  body.append = (...nodes) => { origBodyAppend(...nodes); for (const node of nodes) track(node); };
  const origHomeAppend = home.append.bind(home);
  home.append = (...nodes) => { origHomeAppend(...nodes); for (const node of nodes) track(node); };
  return { doc, home, result, body, byId };
}

test('store round-trips through storage', () => {
  const storage = memoryStorage();
  const store = createSeasonHomeStore(storage);
  assert.equal(store.key, SEASON_HOME_STORAGE_KEY);
  const first = store.load();
  assert.equal(first.catalogPoints, 0);
  const saved = store.save({ ...first, catalogPoints: 120, claimedFree: [1] });
  assert.equal(saved.catalogPoints, 120);
  assert.deepEqual(store.load().claimedFree, [1]);
});

test('snapshot for Jan 1: season S1, rank first half, festival announces', () => {
  const store = createSeasonHomeStore(memoryStorage());
  const snap = seasonHomeSnapshot(store.load(), { month: 1, day: 1, hour: 9 });
  assert.equal(snap.season.seasonId, 'S1');
  assert.equal(snap.rank.cycleId, 'R-01-first');
  assert.equal(snap.festival.phase, 'announce');
  assert.equal(snap.canVote, false);
  assert.equal(snap.catalog.level, 0);
  assert.match(snap.todayText, /はじまりの石板/);
});

test('snapshot for Feb 17: mid boost x1.5 and yobi voting open', () => {
  const store = createSeasonHomeStore(memoryStorage());
  const snap = seasonHomeSnapshot(store.load(), { month: 2, day: 17, hour: 12 });
  assert.equal(snap.season.catalogMultiplier, 1.5);
  assert.equal(snap.festival.phase, 'yobi');
  assert.equal(snap.canVote, true);
  assert.equal(snap.question.choices.length, 3);
});

test('battle result grants 10 once per key; boost day grants more', () => {
  const store = createSeasonHomeStore(memoryStorage());
  let state = store.load();
  const first = recordSeasonBattleResult(state, { resultKey: '1-5|win|1位|3|＋30', month: 1, day: 5, hour: 20 });
  assert.equal(first.granted, true);
  assert.equal(first.gained, 10);
  state = first.state;
  const again = recordSeasonBattleResult(state, { resultKey: '1-5|win|1位|3|＋30', month: 1, day: 5, hour: 20 });
  assert.equal(again.granted, false);
  assert.equal(again.gained, 0);
  const boost = recordSeasonBattleResult(state, { resultKey: '2-17|win|1位|3|＋30', month: 2, day: 17, hour: 20 });
  assert.equal(boost.gained, 15);
});

test('catalog free reward: claim once at level 1, refuse twice and too early', () => {
  const store = createSeasonHomeStore(memoryStorage());
  let state = store.load();
  for (let i = 0; i < 10; i += 1) {
    const result = recordSeasonBattleResult(state, { resultKey: `key-${i}`, month: 1, day: 5, hour: 20 });
    state = result.state;
  }
  assert.equal(seasonHomeSnapshot(state, { month: 1, day: 5, hour: 20 }).catalog.level, 1);
  const early = claimSeasonFreeReward(state, 2);
  assert.equal(early.claimed, false);
  assert.equal(early.reason, 'NOT_REACHED');
  const claimed = claimSeasonFreeReward(state, 1);
  assert.equal(claimed.claimed, true);
  state = claimed.state;
  const twice = claimSeasonFreeReward(state, 1);
  assert.equal(twice.claimed, false);
  assert.equal(twice.reason, 'ALREADY_CLAIMED');
});

test('festival vote: once per month', () => {
  const store = createSeasonHomeStore(memoryStorage());
  let state = store.load();
  const first = voteSeasonFestival(state, { month: 1, choiceIndex: 0 });
  assert.equal(first.voted, true);
  state = first.state;
  const second = voteSeasonFestival(state, { month: 1, choiceIndex: 2 });
  assert.equal(second.voted, false);
  assert.equal(second.reason, 'ALREADY_VOTED');
  const otherMonth = voteSeasonFestival(state, { month: 2, choiceIndex: 1 });
  assert.equal(otherMonth.voted, true);
});

test('mount builds the home strip and opens the catalog dialog', () => {
  const { doc, home } = fakeDocument();
  const storage = memoryStorage();
  const mounted = mountSeasonHome({ document: doc, storage, now: { month: 1, day: 1, hour: 9 } });
  assert.ok(mounted);
  assert.equal(home.children.length, 1);
  const strip = home.children[0];
  assert.equal(strip.id, 'seasonHomeStrip');
  assert.match(strip.children[0].textContent, /はじまりの石板/);
  const buttons = strip.children.find((node) => node.className === 'seasonHomeButtons');
  assert.ok(buttons);
  const [catalogButton, scheduleButton] = buttons.children;
  assert.equal(mounted.catalogDialog.hidden, true);
  catalogButton.click();
  assert.equal(mounted.catalogDialog.hidden, false);
  assert.equal(mounted.scheduleDialog.hidden, true);
  scheduleButton.click();
  assert.equal(mounted.scheduleDialog.hidden, false);
  mounted.unmount();
});

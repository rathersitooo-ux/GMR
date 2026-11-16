import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEASON_HOME_STORAGE_KEY,
  buildSeasonPassCardAccessPolicy,
  claimSeasonFreeReward,
  createDeckMatchStartSnapshotWithSeasonPassAccess,
  createSeasonHomeStore,
  mountSeasonHome,
  recordSeasonBattleResult,
  seasonHomeSnapshot,
  voteSeasonFestival,
} from '../browser/season-home-runtime.mjs';
import { evaluateDeckCardAccess } from '../browser/card-access-entitlement-core.mjs';
import {
  SEASON_STORE_KEY,
  cleanSeasonState,
  createSeasonStore,
} from '../browser/season-store.mjs';
import {
  createAutoRankSeasonRegistrationState,
  registerOpeningDeck,
} from '../browser/auto-rank-season-registration-core.mjs';

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

// --- 移し替え（3b）：tests/season-pass-card-access-policy.test.mjs から移した第22段の7件 ---
// 方針を作る関数（buildSeasonPassCardAccessPolicy）の4つの受け入れ条件と、
// 包んだスナップショット・自動ランク側の同じ錠の決め。

function seasonStorage(passOwned) {
  const storage = memoryStorage();
  storage.setItem(SEASON_STORE_KEY, JSON.stringify({ seasonId: 'S8', catalogPoints: 0, claimedFree: [], passOwned }));
  return storage;
}

function selection(cards, mode = '2p') {
  return {
    savedDeck: { main: [...cards.main], ex: [...(cards.ex ?? [])] },
    savedDeckRule: { id: 'FIRST_REGULATION', revision: 3 },
    setupMode: mode,
    setupContent: 'road_shield',
    playerCharacterId: 'partner.naki',
    selectedPartnerId: 'partner.saasuna',
  };
}

function acceptDeck(deck, options) {
  return options?.forBattle === true && deck.main.length > 0 ? { ok: true } : { ok: false };
}

// ① 弾の数字が無いカードだけのデッキは、パス無しでも通る。
test('policy: a deck of set-number-less cards passes without the pass', () => {
  const policy = buildSeasonPassCardAccessPolicy(
    selection({ main: ['CARD_A', 'CARD_B'], ex: ['EX_1'] }),
    { storage: seasonStorage(false) },
  );
  const access = evaluateDeckCardAccess({ main: ['CARD_A', 'CARD_B'], ex: ['EX_1'] }, policy);
  assert.equal(access.ok, true);
  assert.deepEqual(access.entries.map((entry) => entry.status), ['OWNED', 'OWNED', 'OWNED']);
});

// ② 前弾のデッキはパス所有ありで通り、所有なしでは止まる。
test('policy: a previous-set deck passes with the pass and stops without it', () => {
  const setNumbers = { currentSetNumber: 2, cardSetNumbers: { OLD_CARD: 1 } };
  const deck = { main: ['OLD_CARD'], ex: [] };
  const ownedPolicy = buildSeasonPassCardAccessPolicy(selection(deck), {
    storage: seasonStorage(true), setNumbers,
  });
  assert.equal(evaluateDeckCardAccess(deck, ownedPolicy).ok, true);
  const lockedPolicy = buildSeasonPassCardAccessPolicy(selection(deck), {
    storage: seasonStorage(false), setNumbers,
  });
  const locked = evaluateDeckCardAccess(deck, lockedPolicy);
  assert.equal(locked.ok, false);
  assert.deepEqual(locked.lockedCardIds, ['OLD_CARD']);
});

// ③ 今の弾のデッキはパス所有ありでも止まる。
test('policy: a current-set deck stops even with the pass', () => {
  const setNumbers = { currentSetNumber: 2, cardSetNumbers: { NEW_CARD: 2 } };
  const deck = { main: ['NEW_CARD'], ex: [] };
  const policy = buildSeasonPassCardAccessPolicy(selection(deck), {
    storage: seasonStorage(true), setNumbers,
  });
  const access = evaluateDeckCardAccess(deck, policy);
  assert.equal(access.ok, false);
  assert.deepEqual(access.lockedCardIds, ['NEW_CARD']);
});

// ④ 錠のカードの番号が失敗の文に出る。錠があるとき validateDeck は呼ばれない。
test('wrapper: a locked card throws MATCH_START_CARD_ACCESS_DENIED with its id', () => {
  const setNumbers = { currentSetNumber: 2, cardSetNumbers: { OLD_CARD: 1 } };
  let validateCalls = 0;
  assert.throws(
    () => createDeckMatchStartSnapshotWithSeasonPassAccess(
      selection({ main: ['OLD_CARD'] }),
      {
        validateDeck() { validateCalls += 1; return { ok: true }; },
        storage: seasonStorage(false),
        setNumbers,
      },
    ),
    /MATCH_START_CARD_ACCESS_DENIED:OLD_CARD/,
  );
  assert.equal(validateCalls, 0);
});

// 通るデッキは、従来のスナップショットがそのまま返る。
test('wrapper: an unlocked deck returns the existing match-start snapshot unchanged', () => {
  const snapshot = createDeckMatchStartSnapshotWithSeasonPassAccess(
    selection({ main: ['CARD_A'], ex: ['EX_1'] }),
    { validateDeck: acceptDeck, storage: seasonStorage(false) },
  );
  assert.equal(snapshot.schema, 'gameroad.browser.match-start-snapshot.v1');
  assert.deepEqual(snapshot.deck.main, ['CARD_A']);
  assert.deepEqual(snapshot.deck.ex, ['EX_1']);
});

// 自動ランク側も同じ錠の決めで動く：弾の数字が無いデッキはパス無しで登録できる。
test('auto-rank: a set-number-less deck registers without the pass', () => {
  const state = createAutoRankSeasonRegistrationState({
    seasonId: 'season-test-01', competitionId: 'competition-test-01',
    rulesVersion: 'rules-v1', cardVersion: 'cards-v1', aiVersion: 'ai-v1',
  });
  const registered = registerOpeningDeck(state, {
    selection: selection({ main: ['CARD_A', 'CARD_B'], ex: ['EX_1'] }, '4p'),
    registeredAt: '2026-11-13T09:00:00+09:00',
    validateDeck: acceptDeck,
    storage: seasonStorage(false),
  });
  assert.equal(registered.openingRegistration.snapshot.schema, 'gameroad.browser.match-start-snapshot.v1');
});

// 自動ランク側も同じ錠の決めで動く：前弾のデッキはパス所有ありで登録でき、所有なしでは止まる。
test('auto-rank: a previous-set deck registers with the pass and stops without it', () => {
  const setNumbers = { currentSetNumber: 2, cardSetNumbers: { OLD_CARD: 1 } };
  const makeSeason = () => createAutoRankSeasonRegistrationState({
    seasonId: 'season-test-01', competitionId: 'competition-test-01',
    rulesVersion: 'rules-v1', cardVersion: 'cards-v1', aiVersion: 'ai-v1',
  });
  const owned = registerOpeningDeck(makeSeason(), {
    selection: selection({ main: ['OLD_CARD', 'CARD_B'], ex: [] }, '4p'),
    registeredAt: '2026-11-13T09:00:00+09:00',
    validateDeck: acceptDeck,
    storage: seasonStorage(true),
    setNumbers,
  });
  assert.equal(owned.openingRegistration.snapshot.deck.main[0], 'OLD_CARD');
  assert.throws(
    () => registerOpeningDeck(makeSeason(), {
      selection: selection({ main: ['OLD_CARD', 'CARD_B'], ex: [] }, '4p'),
      registeredAt: '2026-11-13T09:00:00+09:00',
      validateDeck: acceptDeck,
      storage: seasonStorage(false),
      setNumbers,
    }),
    /MATCH_START_CARD_ACCESS_DENIED:OLD_CARD/,
  );
});


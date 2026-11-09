import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_START_FLAGS_KEY,
  BATTLE_START_FLAGS_SCHEMA,
  advanceBattleStartLiveState,
  buildBattleStartOpeningJanken,
  buildBattleStartOpeningPlayers,
  buildBattleStartPlan,
  createBattleStartFlagsStore,
  createBattleStartLiveState,
  decideBattleStartPresentation,
  nextBattleStartMovieSetting,
  normalizeBattleStartMovieSetting,
} from '../browser/battle-start-presentation-core.mjs';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    map,
  };
}

function throwingStorage() {
  return {
    getItem: () => { throw new Error('STORAGE_UNAVAILABLE'); },
    setItem: () => { throw new Error('STORAGE_UNAVAILABLE'); },
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

function fakePlayers(count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    id: `P${index + 1}`,
    name: index === 0 ? 'あなた' : `PLAYER ${index + 1}`,
    team: null,
    openingJankenAssignment: fakeAssignment([`CARD_A${index + 1}`, `CARD_B${index + 1}`, `CARD_C${index + 1}`]),
  }));
}

const describeCard = (cardId) => ({ label: `カード${cardId}`, rank: '7', suitGlyph: '♠' });

test('decide: 「見ない」（パージ）はムービーを出さず題を止め絵で出す', () => {
  const decision = decideBattleStartPresentation({ setting: 'never', flags: { seen: false, skipped: false, notWatched: false } });
  assert.equal(decision.mode, 'title_only');
  assert.equal(decision.reason, 'SETTING_NEVER_PURGED');
  assert.equal(decision.totalMs, 600);
});

test('decide: 前に見られなかったときは次は題だけ出す', () => {
  const decision = decideBattleStartPresentation({ setting: 'first_only', flags: { seen: false, skipped: false, notWatched: true } });
  assert.equal(decision.mode, 'title_only');
  assert.equal(decision.reason, 'PREVIOUS_NOT_WATCHED');
  assert.equal(decision.totalMs, 600);
});

test('decide: 動きを減らす設定・低性能のときは題だけ出す', () => {
  assert.equal(decideBattleStartPresentation({ setting: 'always', flags: {}, reducedMotion: true }).reason, 'REDUCED_MOTION');
  assert.equal(decideBattleStartPresentation({ setting: 'always', flags: {}, lowPerf: true }).reason, 'LOW_PERF');
  assert.equal(decideBattleStartPresentation({ setting: 'always', flags: {}, reducedMotion: true }).mode, 'title_only');
});

test('decide: 「初回だけ」で見た／飛ばしたあとは題だけ出す', () => {
  assert.equal(decideBattleStartPresentation({ setting: 'first_only', flags: { seen: true } }).reason, 'ALREADY_SEEN_TITLE_ONLY');
  assert.equal(decideBattleStartPresentation({ setting: 'first_only', flags: { skipped: true } }).reason, 'ALREADY_SHOWN_TITLE_ONLY');
});

test('decide: 初回はムービー（題0.6秒＋入り0.8秒＝1.4秒で2秒以内）', () => {
  const decision = decideBattleStartPresentation({ setting: 'first_only', flags: {} });
  assert.equal(decision.mode, 'movie');
  assert.equal(decision.reason, 'FIRST_VIEW');
  assert.equal(decision.titleDurationMs, 600);
  assert.equal(decision.entryDurationMs, 800);
  assert.equal(decision.totalMs, 1400);
  assert.ok(decision.totalMs <= 2000);
});

test('decide: 「毎回見る」はいつもムービー', () => {
  const decision = decideBattleStartPresentation({ setting: 'always', flags: { seen: true, skipped: true } });
  assert.equal(decision.mode, 'movie');
  assert.equal(decision.reason, 'SETTING_ALWAYS');
});

test('decide: 分からない設定は「初回だけ」になる', () => {
  assert.equal(normalizeBattleStartMovieSetting('bogus'), 'first_only');
  assert.equal(decideBattleStartPresentation({ setting: 'bogus', flags: {} }).mode, 'movie');
});

test('nextBattleStartMovieSetting: 毎回見る→初回だけ→見ない→毎回見る', () => {
  assert.equal(nextBattleStartMovieSetting('always'), 'first_only');
  assert.equal(nextBattleStartMovieSetting('first_only'), 'never');
  assert.equal(nextBattleStartMovieSetting('never'), 'always');
});

test('plan: ムービーと題だけ、どちらも監査が通る', () => {
  const movie = buildBattleStartPlan(decideBattleStartPresentation({ setting: 'first_only', flags: {} }));
  assert.equal(movie.audit.ok, true);
  assert.deepEqual(movie.audit.defects, []);
  assert.equal(movie.plan.handoffAt, 1400);
  assert.equal(movie.plan.bridgeWaitMs, 0);
  assert.equal(movie.plan.sequence[0].kind, 'BATTLE_START_TITLE');
  assert.equal(movie.plan.sequence[0].headlineKey, 'BATTLE_START');
  const titleOnly = buildBattleStartPlan(decideBattleStartPresentation({ setting: 'first_only', flags: { seen: true } }));
  assert.equal(titleOnly.audit.ok, true);
  assert.equal(titleOnly.plan.handoffAt, 690);
});

test('live state: 題→入り→受け渡しの順に進む', () => {
  const decision = decideBattleStartPresentation({ setting: 'first_only', flags: {} });
  const { live, audit } = createBattleStartLiveState({ decision, generationId: 'battle-start:M1' });
  assert.equal(audit.ok, true);
  assert.equal(live.phase, 'PREWARM');
  const ready = advanceBattleStartLiveState(live, { type: 'MOVIE_READY', generationId: 'battle-start:M1' });
  assert.equal(ready.live.phase, 'TITLE');
  assert.equal(ready.audit.ok, true);
  const entry = advanceBattleStartLiveState(ready.live, { type: 'ADVANCE', generationId: 'battle-start:M1', nowMs: 600 });
  assert.equal(entry.live.phase, 'ENTRY');
  const handoff = advanceBattleStartLiveState(entry.live, { type: 'ADVANCE', generationId: 'battle-start:M1', nowMs: 1400 });
  assert.equal(handoff.live.phase, 'HANDOFF');
  assert.equal(handoff.audit.ok, true);
});

test('opening players: 4人の顔・名前・席だけが並ぶ（02:55の決め）', () => {
  const model = buildBattleStartOpeningPlayers({ players: fakePlayers(4) });
  assert.equal(model.hasData, true);
  assert.equal(model.playerCount, 4);
  assert.equal(model.players[0].name, 'あなた');
  assert.equal(model.players[0].seat, 'P1');
  assert.equal('slots' in model.players[0], false);
});

test('opening players: 割り当てがなくても並ぶ', () => {
  const players = fakePlayers(4).map((player) => ({ id: player.id, name: player.name, team: player.team }));
  const model = buildBattleStartOpeningPlayers({ players });
  assert.equal(model.hasData, true);
  assert.equal(model.playerCount, 4);
});

test('opening players: 1人では材料なし・名前がなければ席の文字になる', () => {
  assert.equal(buildBattleStartOpeningPlayers({ players: fakePlayers(1) }).hasData, false);
  assert.equal(buildBattleStartOpeningPlayers({ players: [{ id: 'P1' }, { id: 'P2' }] }).players[0].name, 'P1');
  assert.throws(() => buildBattleStartOpeningPlayers({}), /BATTLE_START_PLAYERS_REQUIRED/);
});

test('opening janken: 4人の3枠のカードが並ぶ', () => {
  const model = buildBattleStartOpeningJanken({ players: fakePlayers(4), describeCard });
  assert.equal(model.hasData, true);
  assert.equal(model.playerCount, 4);
  assert.equal(model.players[0].name, 'あなた');
  assert.equal(model.players[0].seat, 'P1');
  assert.deepEqual(model.players[0].slots.map((slot) => slot.handLabel), ['グー', 'チョキ', 'パー']);
  assert.equal(model.players[1].slots[0].label, 'カードCARD_A2');
  assert.equal(model.players[1].slots[0].rank, '7');
  assert.equal(model.players[1].slots[0].suitGlyph, '♠');
});

test('opening janken: 2人でも並ぶ（4人でなくても題とカードは出せる）', () => {
  const model = buildBattleStartOpeningJanken({ players: fakePlayers(2), describeCard });
  assert.equal(model.hasData, true);
  assert.equal(model.playerCount, 2);
});

test('opening janken: 割り当てがない人がいれば、ムービーの材料なしになる', () => {
  const players = fakePlayers(4);
  players[3].openingJankenAssignment = null;
  const model = buildBattleStartOpeningJanken({ players, describeCard });
  assert.equal(model.hasData, false);
  assert.equal(model.players[3].hasSlots, false);
  assert.equal(model.players[0].hasSlots, true);
});

test('opening janken: 処理順は作らない（カードと席だけ）', () => {
  const model = buildBattleStartOpeningJanken({ players: fakePlayers(4), describeCard });
  assert.equal('processingOrder' in model, false);
  assert.equal('resolution' in model, false);
  assert.equal(model.players[0].slots.length, 3);
});

test('flags: 見た・飛ばした・見られなかった、が端末の保存に残る', () => {
  const storage = fakeStorage();
  const store = createBattleStartFlagsStore({ storage, now: () => 1000 });
  assert.deepEqual(store.read(), { schema: BATTLE_START_FLAGS_SCHEMA, seen: false, skipped: false, notWatched: false, unseen: null, updatedAt: null });
  store.markSeen();
  assert.equal(store.read().seen, true);
  assert.equal(store.read().updatedAt, 1000);
  assert.equal(storage.map.get(BATTLE_START_FLAGS_KEY).includes('"seen":true'), true);
  store.markSkipped();
  assert.equal(store.read().skipped, true);
  store.markNotWatched();
  assert.equal(store.read().notWatched, true);
  store.clearNotWatched();
  assert.equal(store.read().notWatched, false);
  assert.equal(store.read().seen, true);
});

test('flags: 「見られなかった」の理由が残り、消せる', () => {
  const storage = fakeStorage();
  const store = createBattleStartFlagsStore({ storage, now: () => 1000 });
  assert.equal(store.read().unseen, null);
  store.markUnseen('participant-entry');
  assert.equal(store.read().unseen, 'participant-entry');
  assert.equal(storage.map.get(BATTLE_START_FLAGS_KEY).includes('"unseen":"participant-entry"'), true);
  // ほかの旗はそのまま残る。
  store.markSeen();
  assert.equal(store.read().unseen, 'participant-entry');
  assert.equal(store.read().seen, true);
  store.clearUnseen();
  assert.equal(store.read().unseen, null);
  assert.equal(store.read().seen, true);
  // 古い保存（unseen がないもの）は、unseen なしとして読める。
  storage.setItem(BATTLE_START_FLAGS_KEY, JSON.stringify({ schema: BATTLE_START_FLAGS_SCHEMA, seen: true, skipped: false, notWatched: false, updatedAt: 1000 }));
  assert.equal(store.read().unseen, null);
  assert.equal(store.read().seen, true);
});

test('flags: 保存の中身が壊れていれば空の旗になる', () => {
  const storage = fakeStorage();
  storage.setItem(BATTLE_START_FLAGS_KEY, 'not-json{');
  const store = createBattleStartFlagsStore({ storage });
  assert.equal(store.read().seen, false);
  assert.equal(store.read().notWatched, false);
});

test('flags: 端末の保存が使えなくても、端末の中だけには残る', () => {
  const store = createBattleStartFlagsStore({ storage: throwingStorage() });
  store.markSeen();
  assert.equal(store.read().seen, true);
  store.markNotWatched();
  assert.equal(store.read().notWatched, true);
  store.clearNotWatched();
  assert.equal(store.read().notWatched, false);
});

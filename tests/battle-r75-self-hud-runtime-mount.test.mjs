import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
  emptyBattleR75SelfHudState,
  projectBattleR75SelfResolution,
  readBattleR75SelfHudDom,
  reduceBattleR75SelfHudState,
} from '../browser/battle-r75-self-hud-runtime-mount.mjs';

function accepted(overrides = {}) {
  return projectBattleR75SelfResolution({
    round: 3,
    localPlayerId: 'P2',
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    resolutionRows: [
      { score: 8, cards: [{ origin: 'バトル', label: 'A', value: 4 }] },
      { score: 13, cards: [
        { origin: 'ロード', label: 'Road', value: 3 },
        { origin: 'バトル', label: 'Current Battle', value: 7 },
        { origin: '能力追加', label: 'Added', value: 3 },
      ] },
      { score: 9, cards: [{ origin: 'シールド', label: 'Shield', value: 5 }] },
      { score: 6, cards: [] },
    ],
    stage: 'settle',
    ...overrides,
  });
}

test('projects only the local player actual score and active Battle-card entries', () => {
  assert.deepEqual(accepted(), {
    schema: BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
    turn: 3,
    playerId: 'P2',
    score: 13,
    cards: [{ label: 'Current Battle', value: 7 }],
    fingerprint: '3|13|Current Battle:7',
  });
});

test('fails closed before accepted settle/result and for ambiguous viewer identity', () => {
  assert.equal(accepted({ stage: 'compare' }), null);
  assert.equal(accepted({ localPlayerId: '' }), null);
  assert.equal(accepted({ playerIds: ['P2', 'P2', 'P3', 'P4'] }), null);
  assert.equal(accepted({ resolutionRows: [{ score: 13, cards: [] }] }), null);
});

test('cumulative chain preserves accepted order without duplicating repeated renders', () => {
  let state = emptyBattleR75SelfHudState();
  const r3 = accepted();
  state = reduceBattleR75SelfHudState(state, { turn: 3, resolution: r3 });
  state = reduceBattleR75SelfHudState(state, { turn: 3, resolution: r3 });
  const r4 = accepted({
    round: 4,
    resolutionRows: [
      { score: 8, cards: [] },
      { score: 10, cards: [{ origin: 'バトル', label: 'Next Battle', value: 6 }] },
      { score: 9, cards: [] },
      { score: 6, cards: [] },
    ],
  });
  state = reduceBattleR75SelfHudState(state, { turn: 4, resolution: r4 });
  assert.equal(state.turn, 4);
  assert.equal(state.score, 10);
  assert.deepEqual(state.cards, [
    { label: 'Current Battle', value: 7, turn: 3 },
    { label: 'Next Battle', value: 6, turn: 4 },
  ]);
  assert.equal(state.fingerprints.length, 2);
});

test('turn rewind or explicit new-match reset clears stale score and chain', () => {
  let state = reduceBattleR75SelfHudState(emptyBattleR75SelfHudState(), { turn: 3, resolution: accepted() });
  state = reduceBattleR75SelfHudState(state, { turn: 1 });
  assert.equal(state.turn, 1);
  assert.equal(state.score, null);
  assert.deepEqual(state.cards, []);
  state = reduceBattleR75SelfHudState(state, { turn: 2, resolution: accepted({ round: 2 }) });
  state = reduceBattleR75SelfHudState(state, { turn: 2, reset: true });
  assert.equal(state.score, null);
  assert.deepEqual(state.cards, []);
});

test('friend-room DOM fails closed instead of guessing reordered viewer identity', () => {
  const document = {
    body: { classList: { contains: name => name === 'friend-room-match' } },
    getElementById: id => id === 'roundNo' ? { textContent: '5' } : null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  assert.deepEqual(readBattleR75SelfHudDom(document), {
    turn: 5,
    resolution: null,
    reason: 'FRIEND_ROOM_IDENTITY_UNRESOLVED',
  });
});

test('live replay import graph consumes the HUD runtime module', () => {
  const source = readFileSync(new URL('../browser/partner-battle-event-log-projection.mjs', import.meta.url), 'utf8');
  assert.match(source, /import '\.\/battle-r75-self-hud-runtime-mount\.mjs';/);
});

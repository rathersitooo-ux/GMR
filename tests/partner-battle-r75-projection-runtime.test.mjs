import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_R75_SELF_HUD_RUNTIME,
  PARTNER_BATTLE_EVENT_PROJECTION,
  emptyBattleR75SelfHudState,
  projectBattleR75SelfResolution,
  readBattleR75SelfHudDom,
  reduceBattleR75SelfHudState
} from '../browser/partner-battle-event-log-projection.mjs';

test('R75 projects actual local Turn, SCORE, and only played Battle cards', () => {
  const result = projectBattleR75SelfResolution({
    round: 'TURN 4',
    localPlayerId: 'P2',
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    resolutionRows: [
      { score: '8', cards: [{ origin: 'バトル', label: 'A', value: '4' }] },
      { score: '13', cards: [
        { origin: 'ロード', label: 'Load', value: '9' },
        { origin: 'バトル', label: 'Slash', value: '6' },
        { origin: 'バトル', label: 'Guard', value: '3' }
      ] },
      { score: '7', cards: [] },
      { score: '5', cards: [] }
    ],
    stage: 'settle'
  });

  assert.equal(result.turn, 4);
  assert.equal(result.playerId, 'P2');
  assert.equal(result.score, 13);
  assert.deepEqual(result.cards, [
    { label: 'Slash', value: 6 },
    { label: 'Guard', value: 3 }
  ]);
  assert.equal(Object.isFrozen(result), true);
});

test('R75 chain persists accepted cards, ignores duplicate resolution, and resets on rematch turn rewind', () => {
  const r1 = projectBattleR75SelfResolution({
    round: 1,
    localPlayerId: 'P1',
    playerIds: ['P1', 'P2'],
    resolutionRows: [
      { score: 5, cards: [{ origin: 'バトル', label: 'One', value: 5 }] },
      { score: 4, cards: [] }
    ],
    stage: 'settle'
  });
  const r2 = projectBattleR75SelfResolution({
    round: 2,
    localPlayerId: 'P1',
    playerIds: ['P1', 'P2'],
    resolutionRows: [
      { score: 9, cards: [{ origin: 'バトル', label: 'Two', value: 4 }] },
      { score: 7, cards: [] }
    ],
    stage: 'result'
  });

  let state = reduceBattleR75SelfHudState(emptyBattleR75SelfHudState(), { turn: 1, resolution: r1 });
  state = reduceBattleR75SelfHudState(state, { turn: 1, resolution: r1 });
  state = reduceBattleR75SelfHudState(state, { turn: 2, resolution: r2 });
  assert.equal(state.turn, 2);
  assert.equal(state.score, 9);
  assert.deepEqual(state.cards, [
    { label: 'One', value: 5, turn: 1 },
    { label: 'Two', value: 4, turn: 2 }
  ]);
  assert.equal(state.fingerprints.length, 2);

  state = reduceBattleR75SelfHudState(state, { turn: 1 });
  assert.deepEqual(state, emptyBattleR75SelfHudState());
});

test('R75 fails closed when local identity is ambiguous or stage is not accepted', () => {
  const input = {
    round: 3,
    localPlayerId: 'P1',
    playerIds: ['P1', 'P1'],
    resolutionRows: [{ score: 1, cards: [] }, { score: 2, cards: [] }],
    stage: 'settle'
  };
  assert.equal(projectBattleR75SelfResolution(input), null);
  assert.equal(projectBattleR75SelfResolution({ ...input, playerIds: ['P1', 'P2'], stage: 'reveal' }), null);
});

test('R75 friend-room DOM path refuses to infer local identity', () => {
  const documentRef = {
    body: { classList: { contains: (name) => name === 'friend-room-match' } },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById(id) { return id === 'roundNo' ? { textContent: '7' } : null; }
  };
  assert.deepEqual(readBattleR75SelfHudDom(documentRef), {
    turn: 7,
    resolution: null,
    reason: 'FRIEND_ROOM_IDENTITY_UNRESOLVED'
  });
});

test('R75 remains presentation-only and does not fabricate unresolved HATE or Load-janken authority', () => {
  assert.equal(BATTLE_R75_SELF_HUD_RUNTIME.presentationOnly, true);
  assert.equal(BATTLE_R75_SELF_HUD_RUNTIME.gameplayAuthority, false);
  assert.equal(BATTLE_R75_SELF_HUD_RUNTIME.gameStateWrite, false);
  assert.equal(BATTLE_R75_SELF_HUD_RUNTIME.opponentHateAuthority, 'NONE');
  assert.equal(BATTLE_R75_SELF_HUD_RUNTIME.loadJankenAuthority, 'NONE');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.identityPolicy, 'DROP_PLAYER_IDS_AND_NAMES');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.privateDataPolicy, 'NEVER_PROJECT_PRIVATE_DATA');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.r75HudOpponentHateAuthority, 'NONE_FAIL_CLOSED');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.r75HudLoadJankenAuthority, 'NONE_FAIL_CLOSED');
});

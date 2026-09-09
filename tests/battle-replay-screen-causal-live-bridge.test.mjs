import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE,
  appendAcceptedBattleResolutionToScreen
} from '../browser/battle-replay-screen-causal-live-bridge.mjs';
import {
  createLiveReplaySession,
  readLiveReplay
} from '../browser/battle-replay-live-adapter.mjs';
import { createBattleScreenModel } from '../browser/battle-screen-presentation-core.mjs';

const versions = Object.freeze({
  rules: 'TEST_RULES',
  content: 'TEST_CONTENT',
  state: 'TEST_STATE'
});

const participants = [
  { id: 'P1', label: 'PLAYER 1', team: 'A' },
  { id: 'P2', label: 'PLAYER 2', team: 'A' },
  { id: 'P3', label: 'PLAYER 3', team: 'B' },
  { id: 'P4', label: 'PLAYER 4', team: 'B' }
];

function resolution(serial = 1) {
  return {
    serial,
    round: serial,
    mode: '2v2',
    attackerId: 'P1',
    defenderId: 'P3',
    lane: 'R',
    shield: 'R',
    winnerIds: ['P1'],
    winningTeam: 'A',
    teamTotals: { A: 10, B: 8 },
    players: [
      { id: 'P1', name: 'You', team: 'A', score: 10, winner: true,
        cards: [{ cardId: 'C1', label: '公開札', value: 6, origin: 'active_submission' }] },
      { id: 'P3', name: 'CPU', team: 'B', score: 8, winner: false,
        cards: [{ cardId: 'C3', label: '公開札', value: 4, origin: 'active_submission' }] }
    ],
    laneGains: [{ id: 'P1', lane: 'R', before: 1, after: 2, added: 1 }],
    maxLaneProgress: [{ id: 'P1', before: 1, after: 2 }],
    compoundAttackPackage: { secretShouldNotEnterReplay: true }
  };
}

function screenModel() {
  return createBattleScreenModel({
    participants,
    plan: {
      presentationOnly: true,
      authorityBoundary: 'accepted_public_event_only',
      eventId: 'settle-screen-1',
      kind: 'settle',
      transition: 'CONTINUE',
      groupTargets: [],
      importance: 'ambient',
      publicData: {
        compoundAttackPackage: {
          schema: 'gameroad.battle-janken-compound-attack-package.v1',
          jankenHand: 'ROCK',
          cardId: 'C1',
          path: [{ nodeId: 'ROAD-A' }, { nodeId: 'ROAD-B' }],
          direction: 'LEFT',
          roadId: 'ROAD-01',
          battleId: 'BATTLE-01',
          opponentId: 'P3',
          shieldLane: 'R',
          shieldRef: 'shield:P3:R'
        }
      }
    }
  });
}

test('drop-in wrapper preserves existing replay append and does nothing without exact screen input', () => {
  const initial = createLiveReplaySession({ matchId: 'M1', versions });
  const next = appendAcceptedBattleResolutionToScreen(initial, resolution(1));
  assert.equal(next.lastResolutionSerial, 1);
  const replay = readLiveReplay(next);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
  assert.equal('compoundAttackPackage' in replay.events[0].publicData, false);
});

test('audited caller screen model is forwarded once after accepted replay append', () => {
  const renders = [];
  const model = screenModel();
  const next = appendAcceptedBattleResolutionToScreen(
    createLiveReplaySession({ matchId: 'M2', versions }),
    resolution(1),
    {
      screenModel: model,
      renderScreenModel: (received, context) => renders.push({ received, context })
    }
  );
  assert.equal(next.lastResolutionSerial, 1);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].received, model);
  assert.deepEqual(renders[0].context, {
    schema: 'gameroad.battle-replay-screen-causal-live-bridge.v1',
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    matchId: 'M2',
    resolutionSerial: 1
  });
  assert.equal(model.boardReturn.destinationKey, 'P3:R');
  assert.equal(model.causalReturn.destination.destinationKey, 'P3:R');
});

test('invalid screen presentation is ignored after replay acceptance instead of being repaired', () => {
  let renders = 0;
  const next = appendAcceptedBattleResolutionToScreen(
    createLiveReplaySession({ matchId: 'M3', versions }),
    resolution(1),
    { screenModel: { presentationOnly: true }, renderScreenModel: () => { renders += 1; } }
  );
  assert.equal(next.lastResolutionSerial, 1);
  assert.equal(renders, 0);
  assert.equal(readLiveReplay(next).events.length, 1);
});

test('screen renderer failure is fail-soft and cannot roll back accepted replay', () => {
  const next = appendAcceptedBattleResolutionToScreen(
    createLiveReplaySession({ matchId: 'M4', versions }),
    resolution(1),
    { screenModel: screenModel(), renderScreenModel: () => { throw new Error('screen unavailable'); } }
  );
  assert.equal(next.lastResolutionSerial, 1);
  assert.equal(readLiveReplay(next).events[0].kind, 'battle_resolution');
});

test('replay serial failure happens before any screen render', () => {
  const first = appendAcceptedBattleResolutionToScreen(
    createLiveReplaySession({ matchId: 'M5', versions }),
    resolution(1)
  );
  let renders = 0;
  assert.throws(
    () => appendAcceptedBattleResolutionToScreen(first, resolution(3), {
      screenModel: screenModel(),
      renderScreenModel: () => { renders += 1; }
    }),
    /RESOLUTION_SERIAL_GAP_OR_REORDER/
  );
  assert.equal(renders, 0);
});

test('bridge contract owns no gameplay decisions or runtime mount', () => {
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.replayLogWidening, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.modelConstruction, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.compoundInference, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.orderCalculation, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.targetCalculation, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.winnerCalculation, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.routeCalculation, false);
  assert.equal(BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE.runtimeMountOwnedHere, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FANART_OPPONENT_BATTLE_CONTRACT,
  buildFanartOpponentBattleProjection,
  resolveFanartBattleViewerId,
} from '../browser/fanart-local-skin-opponent-runtime.mjs';
import {
  appendAcceptedBattleResolution,
  createLiveReplaySession,
} from '../browser/battle-replay-live-adapter.mjs';

function publicResolution() {
  return {
    serial: 1,
    round: 1,
    mode: '4p',
    attackerId: 'P1',
    defenderId: 'P3',
    lane: 'C',
    shield: null,
    winnerIds: [],
    winningTeam: null,
    teamTotals: { A: 10, B: 8 },
    players: [
      { id: 'P1', name: 'あなた', team: 'A', score: 5, winner: false, cards: [{ cardId: 'C1', label: 'Self', value: 3, origin: 'hand' }] },
      { id: 'P2', name: 'Partner', team: 'A', score: 5, winner: false, cards: [{ cardId: 'C2', label: 'Partner', value: 2, origin: 'hand' }] },
      { id: 'P3', name: 'Enemy A', team: 'B', score: 4, winner: false, cards: [{ cardId: 'C3', label: 'Enemy Three', value: 4, origin: 'hand' }] },
      { id: 'P4', name: 'Enemy B', team: 'B', score: 4, winner: false, cards: [{ cardId: 'C4', label: 'Enemy Four', value: 1, origin: 'hand' }] },
    ],
    laneGains: [],
    maxLaneProgress: [],
  };
}

function preferenceFor(cardId) {
  if (cardId !== 'C3') return null;
  return Object.freeze({
    source: 'viewer_local',
    cardId,
    assetHash: 'enemy3-hash',
    blob: { local: 'enemy3' },
    mime: 'image/png',
    width: 256,
    height: 356,
  });
}

test('contract stays presentation-only and never mutates network/opponent authority', () => {
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.acceptedPublicResolutionOnly, true);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.canonicalIdentityPreserved, true);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.localOnly, true);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.networkSync, false);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.gameplayStateMutation, false);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.opponentOwnershipMutation, false);
  assert.equal(FANART_OPPONENT_BATTLE_CONTRACT.opponentEquipMutation, false);
});

test('viewer identity comes from the accepted public resolution', () => {
  assert.equal(resolveFanartBattleViewerId(publicResolution()), 'P1');
});

test('only opposing-team public canonical card ids consume the existing viewer-local preference', async () => {
  const source = publicResolution();
  const before = structuredClone(source);
  const requested = [];
  const plan = await buildFanartOpponentBattleProjection({
    resolution: source,
    viewerId: 'P1',
    indexedDB: {},
    readOpponentPreference: async ({ cardId }) => {
      requested.push(cardId);
      return preferenceFor(cardId);
    },
  });
  assert.deepEqual(requested, ['C3', 'C4']);
  assert.deepEqual(plan.entries.map(entry => [entry.participantId, entry.cardId, entry.assetHash, entry.source]), [
    ['P3', 'C3', 'enemy3-hash', 'viewer_preference'],
  ]);
  assert.equal(plan.entries[0].blob.local, 'enemy3');
  assert.deepEqual(source, before);
});

test('missing viewer-local preference fails closed to canonical/default presentation', async () => {
  const plan = await buildFanartOpponentBattleProjection({
    resolution: publicResolution(),
    viewerId: 'P1',
    indexedDB: {},
    readOpponentPreference: async () => null,
  });
  assert.deepEqual(plan.entries, []);
});

test('accepted replay adapter forwards only its validated public resolution to the local projection bridge', () => {
  const accepted = [];
  const fanartOpponentBattleBridge = {
    begin(matchId) { accepted.push({ begin: matchId }); },
    acceptAcceptedResolution(input) { accepted.push(input); },
  };
  const noOpPresentation = { begin() {}, acceptAcceptedResolution() {} };
  const noOpPartner = { begin() {}, acceptSession() {} };
  let session = createLiveReplaySession(
    { matchId: 'M-LOCAL', versions: { rules: 'rules@1', content: 'content@1', state: 'state@1' } },
    { presentationBridge: noOpPresentation, partnerBattleEventLogBridge: noOpPartner, fanartOpponentBattleBridge },
  );
  session = appendAcceptedBattleResolution(session, publicResolution(), {
    presentationBridge: noOpPresentation,
    partnerBattleEventLogBridge: noOpPartner,
    fanartOpponentBattleBridge,
  });
  assert.equal(session.lastResolutionSerial, 1);
  assert.deepEqual(accepted[0], { begin: 'M-LOCAL' });
  assert.equal(accepted.length, 2);
  assert.equal(accepted[1].matchId, 'M-LOCAL');
  assert.equal(accepted[1].resolution.serial, 1);
  assert.equal(accepted[1].resolution.players[2].cards[0].cardId, 'C3');
  assert.equal('privateData' in accepted[1].resolution, false);
});

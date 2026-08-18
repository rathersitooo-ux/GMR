import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_BATTLE_EVENT_PROJECTION,
  projectPartnerBattleEventLog
} from '../browser/partner-battle-event-log-projection.mjs';

function replay(events) {
  return {
    ok: true,
    status: 'ready',
    schema: 'GAMEROAD_BATTLE_REPLAY_V1',
    matchId: 'match-evidence-1',
    versions: { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' },
    events
  };
}

test('projects canonical battle resolution without player identity or privateData', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'battle_resolution',
    privateData: { secret: 'must-not-project' },
    publicData: {
      serial: 1,
      round: 3,
      mode: '2v2',
      attackerId: 'raw-user-a',
      defenderId: 'raw-user-b',
      lane: 'left',
      shield: 'shield-card-id',
      winnerIds: ['raw-user-a'],
      winningTeam: 'A',
      teamTotals: { A: 12, B: 9 },
      players: [
        { id: 'raw-user-a', name: 'Private Display Name', team: 'A', score: 12, winner: true, cards: [{ cardId: 'c1', label: 'ignored label', value: 5, origin: 'hand' }] },
        { id: 'raw-user-b', name: 'Other Name', team: 'B', score: 9, winner: false, cards: [{ cardId: 'c2', value: 4, origin: 'shield' }] }
      ],
      laneGains: [{ id: 'raw-user-a', lane: 'left', before: 2, after: 4, added: 2 }],
      maxLaneProgress: [{ id: 'raw-user-a', before: 2, after: 4 }]
    }
  }]));

  assert.equal(result.ok, true);
  assert.deepEqual(result.versions, { rules: 'rule@7', content: 'cards:v4', state: 'runtime:v2' });
  assert.equal(result.events[0].data.winnerCount, 1);
  assert.deepEqual(result.events[0].data.players[0], {
    team: 'A', score: 12, winner: true, cards: [{ cardId: 'c1', value: 5, origin: 'hand' }]
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('raw-user-a'), false);
  assert.equal(serialized.includes('raw-user-b'), false);
  assert.equal(serialized.includes('Private Display Name'), false);
  assert.equal(serialized.includes('must-not-project'), false);
});

test('projects match end without winner identity', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'match_ended',
    publicData: { winnerIds: ['u1', 'u2'], round: 6, mode: '2v2' }
  }]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.events[0], {
    sequence: 1,
    kind: 'match_ended',
    data: { round: 6, mode: '2v2', winnerCount: 2 }
  });
  assert.equal(JSON.stringify(result).includes('u1'), false);
});

test('unknown canonical event kinds retain only sequence and kind', () => {
  const result = projectPartnerBattleEventLog(replay([{
    sequence: 1,
    kind: 'future_event',
    publicData: { userId: 'raw-user', arbitrary: 'do-not-copy' },
    privateData: { token: 'secret' }
  }]));
  assert.deepEqual(result.events[0], { sequence: 1, kind: 'future_event' });
});

test('fails closed for non-authoritative, malformed, or reordered inputs', () => {
  assert.deepEqual(projectPartnerBattleEventLog(null), { ok: false, reason: 'REPLAY_READ_INVALID' });
  assert.deepEqual(projectPartnerBattleEventLog({ ok: false, status: 'unavailable' }), { ok: false, reason: 'REPLAY_NOT_READY' });
  assert.deepEqual(projectPartnerBattleEventLog({ ...replay([]), schema: 'OTHER' }), { ok: false, reason: 'REPLAY_AUTHORITY_INVALID' });
  assert.deepEqual(projectPartnerBattleEventLog(replay([{ sequence: 2, kind: 'future_event' }])), { ok: false, reason: 'REPLAY_SEQUENCE_INVALID' });
});

test('projection contract declares no storage authority and preserves replay version authority', () => {
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.storageAuthority, 'NONE');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.identityPolicy, 'DROP_PLAYER_IDS_AND_NAMES');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.privateDataPolicy, 'NEVER_PROJECT_PRIVATE_DATA');
  assert.equal(PARTNER_BATTLE_EVENT_PROJECTION.provenancePolicy, 'PRESERVE_EXACT_REPLAY_VERSIONS');
});

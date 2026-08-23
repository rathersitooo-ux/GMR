import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAcceptedBattleResolution,
  appendAcceptedMatchEnd,
  createLiveReplaySession,
  readLiveReplay
} from '../browser/battle-replay-live-adapter.mjs';

const versions = Object.freeze({
  rules: 'R18_RULES',
  content: 'R18_CONTENT',
  state: 'R18_STATE'
});

function terminalCandidate() {
  return {
    serial: 1,
    round: 1,
    mode: '4p',
    attackerId: 'P1',
    defenderId: 'P2',
    lane: 'C',
    shield: null,
    winnerIds: ['P1'],
    winningTeam: null,
    teamTotals: null,
    players: [],
    laneGains: [],
    maxLaneProgress: [
      { id: 'P1', before: 6, after: 7 },
      { id: 'P2', before: 5, after: 5 },
      { id: 'P3', before: 4, after: 4 },
      { id: 'P4', before: 2, after: 2 }
    ]
  };
}

test('Free4P omitted formalRanking cannot derive from accepted progress in a different terminal round', () => {
  let session = createLiveReplaySession({ matchId: 'M-4P-R18-ROUND-MISMATCH', versions });
  session = appendAcceptedBattleResolution(session, terminalCandidate());
  session = appendAcceptedMatchEnd(session, {
    winnerIds: ['P1'],
    round: 2,
    mode: '4p'
  });

  const publicData = readLiveReplay(session).events[1].publicData;
  assert.equal(publicData.round, 2);
  assert.equal('formalRanking' in publicData, false);
});

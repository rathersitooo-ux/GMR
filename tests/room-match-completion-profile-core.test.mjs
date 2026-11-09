import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ROOM_COMPLETION_COUNT_CHOICES,
  ROOM_SERIES_CHOICES,
  STANDARD_ROOM_COMPLETION_RULE,
  describeRoomCompletionRule,
  describeRoomSpectatorPolicy,
  evaluateMatchCompletion,
  resolveMatchCompletionRule,
  resolveRoomCompletionRule,
  resolveRoomSpectatorPolicy
} from '../browser/room-match-completion-profile-core.mjs';

function matchWithLanes(lengths, mode = '4p') {
  return {
    mode,
    players: Object.entries(lengths).map(([id, lanes]) => ({
      id,
      lanes: { L: Array(lanes[0] || 0).fill('c'), C: Array(lanes[1] || 0).fill('c'), R: Array(lanes[2] || 0).fill('c') }
    }))
  };
}

test('standard rule is seven cards opening the gate, not a direct win', () => {
  assert.equal(STANDARD_ROOM_COMPLETION_RULE.completionTargetCount, 7);
  assert.equal(STANDARD_ROOM_COMPLETION_RULE.completionConsequence, 'CONNECT_GOAL_PATH');
  assert.equal(STANDARD_ROOM_COMPLETION_RULE.seriesBestOf, 1);
  const described = describeRoomCompletionRule(STANDARD_ROOM_COMPLETION_RULE);
  assert.equal(described.title, '7枚で門が開いてゴール');
  assert.equal(described.shortText, '一列7枚で門が開き、ゴール到達で勝利');
  assert.equal(described.seriesLabel, 'BO1');
});

test('room can choose count 5/7/10 and series BO1/BO3, always through the gate', () => {
  assert.deepEqual(ROOM_SERIES_CHOICES, [1, 3]);
  for (const count of ROOM_COMPLETION_COUNT_CHOICES) {
    for (const seriesBestOf of ROOM_SERIES_CHOICES) {
      const rule = resolveRoomCompletionRule({ completionTargetCount: count, seriesBestOf });
      assert.equal(rule.completionTargetCount, count);
      assert.equal(rule.completionConsequence, 'CONNECT_GOAL_PATH');
      assert.equal(rule.seriesBestOf, seriesBestOf);
      const described = describeRoomCompletionRule(rule);
      assert.equal(described.title, `${count}枚で門が開いてゴール`);
      assert.equal(described.seriesLabel, `BO${seriesBestOf}`);
    }
  }
  assert.equal(resolveRoomCompletionRule({ completionTargetCount: 7 }).seriesBestOf, 1);
});

test('a stored direct-win consequence is normalized to the gate path', () => {
  const rule = resolveRoomCompletionRule({ completionTargetCount: 7, completionConsequence: 'DIRECT_COMPLETION_WIN' });
  assert.equal(rule.completionConsequence, 'CONNECT_GOAL_PATH');
  assert.equal(describeRoomCompletionRule(rule).title, '7枚で門が開いてゴール');
});

test('room choices outside 5/7/10 and BO1/BO3 fail closed instead of inventing a rule', () => {
  assert.throws(() => resolveRoomCompletionRule({ completionTargetCount: 3, seriesBestOf: 1 }), /CHOICE/);
  assert.throws(() => resolveRoomCompletionRule({ completionTargetCount: 7, seriesBestOf: 5 }), /SERIES/);
  assert.equal(resolveRoomCompletionRule(null), STANDARD_ROOM_COMPLETION_RULE);
  assert.equal(resolveRoomCompletionRule(undefined), STANDARD_ROOM_COMPLETION_RULE);
});

test('gate rule opens the gate at the threshold without ending the match', () => {
  const match = matchWithLanes({ P1: [7, 0, 0], P2: [3, 0, 0], P3: [0, 0, 0], P4: [0, 0, 0] });
  const evaluation = evaluateMatchCompletion(match);
  assert.deepEqual(evaluation.winners, []);
  assert.equal(evaluation.gateOpened, true);
  assert.deepEqual(evaluation.gateOpenedBy, ['P1']);
  assert.equal(evaluation.gateUnlockPresentationText, 'ゲート解放！');
  assert.equal(evaluation.goalReachStillRequired, true);
});

test('gate rule with BO3 still only opens the gate and carries the series', () => {
  const match = matchWithLanes({ P1: [7, 0, 0], P2: [3, 0, 0], P3: [0, 0, 0], P4: [0, 0, 0] });
  match.completionRule = resolveRoomCompletionRule({ completionTargetCount: 7, seriesBestOf: 3 });
  const evaluation = evaluateMatchCompletion(match);
  assert.deepEqual(evaluation.winners, []);
  assert.equal(evaluation.gateOpened, true);
  assert.equal(evaluation.rule.seriesBestOf, 3);
});

test('gate rule does nothing below the threshold', () => {
  const match = matchWithLanes({ P1: [6, 0, 0], P2: [3, 0, 0], P3: [0, 0, 0], P4: [0, 0, 0] });
  const evaluation = evaluateMatchCompletion(match);
  assert.deepEqual(evaluation.winners, []);
  assert.equal(evaluation.gateOpened, false);
  assert.equal(evaluation.gateUnlockPresentationText, null);
});

test('room target 10 needs ten cards, seven only opens nothing yet', () => {
  const match = matchWithLanes({ P1: [7, 0, 0], P2: [0, 0, 0] }, '2p');
  match.completionRule = resolveRoomCompletionRule({ completionTargetCount: 10, seriesBestOf: 1 });
  assert.equal(evaluateMatchCompletion(match).gateOpened, false);
  assert.deepEqual(evaluateMatchCompletion(match).winners, []);
  match.players[0].lanes.L = Array(10).fill('c');
  assert.equal(evaluateMatchCompletion(match).gateOpened, true);
  assert.deepEqual(evaluateMatchCompletion(match).gateOpenedBy, ['P1']);
  assert.deepEqual(evaluateMatchCompletion(match).winners, []);
});

test('2v2 gate rule opens the gate for the reaching side without winners', () => {
  const match = {
    mode: '2v2',
    players: [
      { id: 'P1', team: 'A', lanes: { L: Array(7).fill('c'), C: [], R: [] } },
      { id: 'P2', team: 'A', lanes: { L: [], C: [], R: [] } },
      { id: 'P3', team: 'B', lanes: { L: [], C: [], R: [] } },
      { id: 'P4', team: 'B', lanes: { L: [], C: [], R: [] } }
    ],
    completionRule: resolveRoomCompletionRule({ completionTargetCount: 7, seriesBestOf: 3 })
  };
  const evaluation = evaluateMatchCompletion(match);
  assert.equal(evaluation.gateOpened, true);
  assert.deepEqual(evaluation.gateOpenedBy, ['P1']);
  assert.deepEqual(evaluation.winners, []);
});

test('match rule comes from the match, then the friend room, then the standard', () => {
  const match = matchWithLanes({ P1: [5, 0, 0], P2: [0, 0, 0] }, '2p');
  assert.equal(resolveMatchCompletionRule(match), STANDARD_ROOM_COMPLETION_RULE);
  match.friendRoom = { completionRule: { completionTargetCount: 5, seriesBestOf: 1 } };
  assert.equal(evaluateMatchCompletion(match).gateOpened, true);
  assert.deepEqual(evaluateMatchCompletion(match).winners, []);
  match.completionRule = { completionTargetCount: 10, seriesBestOf: 3 };
  assert.equal(evaluateMatchCompletion(match).gateOpened, false);
  match.completionRule = { completionTargetCount: 99, seriesBestOf: 1 };
  assert.equal(resolveMatchCompletionRule(match).completionTargetCount, 5);
});

test('spectator policy defaults to allowed and the host can close it', () => {
  assert.equal(resolveRoomSpectatorPolicy(null).spectatorAllowed, true);
  assert.equal(resolveRoomSpectatorPolicy(true).spectatorAllowed, true);
  assert.equal(resolveRoomSpectatorPolicy({ spectatorAllowed: false }).spectatorAllowed, false);
  assert.equal(describeRoomSpectatorPolicy(null).label, '観戦できる');
  assert.equal(describeRoomSpectatorPolicy({ spectatorAllowed: false }).label, '観戦できない');
  assert.throws(() => resolveRoomSpectatorPolicy({ spectatorAllowed: 'yes' }), /SPECTATOR_ALLOWED/);
});

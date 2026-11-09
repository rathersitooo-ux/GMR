import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addYobiTokens,
  advanceFestivalTitle,
  computeDepartmentPoints,
  createFestivalState,
  drawFestivalMultiplier,
  festivalShells,
  festivalTitleLabel,
  festivalWinner,
  recordFestivalBattle,
  voteFestival,
} from '../browser/season-festival-core.mjs';

test('vote once: second vote is refused, vote grants the festival look', () => {
  const state = createFestivalState({ month: 1 });
  assert.equal(state.question, '初夢なら？');
  const first = voteFestival(state, 0);
  assert.equal(first.voted, true);
  assert.equal(first.reward.kind, 'festival-look');
  assert.equal(voteFestival(first.state, 1).reason, 'ALREADY_VOTED');
  assert.throws(() => voteFestival(state, 3), /CHOICE_INVALID/);
});

test('department points total 57 and popularity alone cannot win', () => {
  // Team 0 wins votes (8) and yobi (7) = 15. Team 1 wins the three battle
  // departments (12+12+18) = 42. Popular team loses, as in the plan.
  let state = createFestivalState({ month: 1 });
  state = recordFestivalBattle(state, { department: 'votes', teamIndex: 0, amount: 100 }).state;
  state = recordFestivalBattle(state, { department: 'yobiTokens', teamIndex: 0, amount: 50 }).state;
  for (const dept of ['openBattles', 'soloBattles', 'specialBattles']) {
    state = recordFestivalBattle(state, { department: dept, teamIndex: 1, amount: 10 }).state;
  }
  const computed = computeDepartmentPoints(state);
  assert.equal(computed.total, 57);
  assert.deepEqual(computed.points, [15, 42, 0]);
  assert.deepEqual(festivalWinner(state).winners, [1]);
});

test('same-team battles never count', () => {
  let state = createFestivalState({ month: 1 });
  const ignored = recordFestivalBattle(state, { department: 'openBattles', teamIndex: 0, amount: 5, isSameTeam: true });
  assert.equal(ignored.recorded, false);
  assert.equal(computeDepartmentPoints(ignored.state).total, 0);
});

test('titles and shells: top title pays 24 on win, 21 on loss', () => {
  let state = createFestivalState({ month: 1 });
  assert.equal(festivalTitleLabel(state), '参加者');
  assert.equal(festivalShells(state, true), 12);
  state = advanceFestivalTitle(state, 4);
  assert.equal(festivalTitleLabel(state), 'えいえんの〇〇');
  assert.equal(festivalShells(state, true), 24);
  assert.equal(festivalShells(state, false), 21);
  // Capped at the top step.
  assert.equal(advanceFestivalTitle(state, 10).titleStep, 4);
});

test('yobi tokens accumulate; multiplier draw is deterministic', () => {
  let state = createFestivalState({ month: 2 });
  state = addYobiTokens(state, 5);
  assert.equal(state.yobiTokens, 5);
  assert.equal(drawFestivalMultiplier({ randomValue: 0.05 }), 10);
  assert.equal(drawFestivalMultiplier({ randomValue: 0.5 }), 1);
  assert.equal(drawFestivalMultiplier({ randomValue: 0.01, hasMark: true }), 100);
  assert.equal(drawFestivalMultiplier({ randomValue: 0.01, hasMark: false }), 10);
});

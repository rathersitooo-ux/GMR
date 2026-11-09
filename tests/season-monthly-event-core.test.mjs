import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WEEKLY_MISSION_IDS,
  claimWeeklyAllDoneBonus,
  completeWeeklyMission,
  convertLeftoverTokens,
  createDropState,
  createExchangeState,
  createWeeklyMissions,
  exchangeItem,
  recordDropBattle,
} from '../browser/season-monthly-event-core.mjs';

test('drop event: first 3 wins of the day pay big, later wins pay small', () => {
  let state = createDropState({ seasonId: 'S1', month: 1 });
  for (let i = 0; i < 3; i += 1) {
    const result = recordDropBattle(state, { dayKey: '01-05', won: true });
    assert.equal(result.reason, 'BIG');
    assert.equal(result.reward.tokens, 3);
    state = result.state;
  }
  const fourth = recordDropBattle(state, { dayKey: '01-05', won: true });
  assert.equal(fourth.reason, 'SMALL');
  assert.equal(fourth.reward.tokens, 1);
  // Next day resets the count.
  const nextDay = recordDropBattle(fourth.state, { dayKey: '01-06', won: true });
  assert.equal(nextDay.reason, 'BIG');
  assert.equal(recordDropBattle(state, { dayKey: '01-05', won: false }).reason, 'LOST');
});

test('weekly missions: each once, all-done bonus once', () => {
  let state = createWeeklyMissions({ seasonId: 'S1', month: 1 });
  assert.equal(WEEKLY_MISSION_IDS.length, 7);
  for (const id of WEEKLY_MISSION_IDS) {
    const result = completeWeeklyMission(state, id);
    assert.equal(result.completed, true);
    assert.equal(result.reward.catalogPoints, 15);
    state = result.state;
  }
  assert.equal(completeWeeklyMission(state, 'battle-3').reason, 'ALREADY_DONE');
  const bonus = claimWeeklyAllDoneBonus(state);
  assert.equal(bonus.claimed, true);
  assert.equal(bonus.reward.catalogPoints, 20);
  assert.equal(claimWeeklyAllDoneBonus(bonus.state).reason, 'ALREADY_CLAIMED');
  assert.equal(claimWeeklyAllDoneBonus(createWeeklyMissions({ seasonId: 'S1', month: 1 })).reason, 'NOT_ALL_DONE');
});

test('exchange: spend tokens once per item, leftover converts 1 token = 5 manny', () => {
  let state = createExchangeState({
    seasonId: 'S1', month: 1, tokens: 10,
    items: [{ id: 'icon-1', costTokens: 6, reward: { kind: 'icon', id: 'icon-1' } }],
  });
  const bought = exchangeItem(state, 'icon-1');
  assert.equal(bought.exchanged, true);
  assert.equal(bought.state.tokens, 4);
  state = bought.state;
  assert.equal(exchangeItem(state, 'icon-1').reason, 'ALREADY_BOUGHT');
  assert.equal(exchangeItem(state, 'missing').reason, 'NOT_FOUND');
  assert.deepEqual(convertLeftoverTokens(state), { manny: 20, tokensConverted: 4 });
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANNUAL_FESTIVAL_QUESTIONS,
  CATALOG_MILESTONES,
  FESTIVAL_DEPARTMENT_POINTS,
  SEASON_1_CONFIG,
  catalogRewardForLevel,
  festivalQuestionForMonth,
} from '../browser/season-s1-config.mjs';

test('annual table is complete: 12 festival questions, 3 choices each', () => {
  assert.equal(ANNUAL_FESTIVAL_QUESTIONS.length, 12);
  for (const entry of ANNUAL_FESTIVAL_QUESTIONS) {
    assert.equal(entry.choices.length, 3);
    assert.equal(new Set(entry.choices).size, 3);
  }
  assert.equal(festivalQuestionForMonth(1).question, '初夢なら？');
  assert.equal(festivalQuestionForMonth(12).grand, true);
});

test('festival department points total 57', () => {
  const { yobiTokens, votes, openBattles, soloBattles, specialBattles, total } = FESTIVAL_DEPARTMENT_POINTS;
  assert.equal(yobiTokens + votes + openBattles + soloBattles + specialBattles, 57);
  assert.equal(total, 57);
});

test('Season 1 config: 3 months, 6 rank cycles, 3 festivals', () => {
  assert.equal(SEASON_1_CONFIG.seasonId, 'S1');
  assert.equal(SEASON_1_CONFIG.days, 90);
  assert.equal(SEASON_1_CONFIG.months.length, 3);
  assert.equal(SEASON_1_CONFIG.rankCycles.length, 6);
  assert.deepEqual(SEASON_1_CONFIG.festivalMonths, [1, 2, 3]);
});

test('catalog rewards cover all 100 levels without gaps', () => {
  for (let level = 1; level <= 100; level += 1) {
    const free = catalogRewardForLevel(level, 'free');
    const pass = catalogRewardForLevel(level, 'pass');
    assert.equal(typeof free.kind, 'string');
    assert.equal(typeof pass.kind, 'string');
  }
  assert.equal(Object.keys(CATALOG_MILESTONES).length, 12);
  assert.equal(catalogRewardForLevel(100, 'free').kind, 'title');
  assert.throws(() => catalogRewardForLevel(0), /CATALOG_LEVEL_INVALID/);
  assert.throws(() => catalogRewardForLevel(101), /CATALOG_LEVEL_INVALID/);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkYearCoverage,
  describeToday,
  getFestivalPhaseForDate,
  getMonthlyEventsForDate,
  getRankCycleForDate,
  getSeasonForDate,
  getSeasonForMonth,
  isFestivalMainTime,
} from '../browser/season-calendar-core.mjs';

test('S1 is Jan 1 - Mar 31, 90 days; seasons start Jan/Apr/Jul/Oct', () => {
  assert.equal(getSeasonForMonth(1).seasonId, 'S1');
  assert.equal(getSeasonForMonth(1).daysInSeason, 90);
  assert.equal(getSeasonForMonth(4).seasonId, 'S2');
  assert.equal(getSeasonForMonth(4).daysInSeason, 91);
  assert.equal(getSeasonForMonth(7).seasonId, 'S3');
  assert.equal(getSeasonForMonth(10).seasonId, 'S4');
  assert.equal(getSeasonForMonth(12).seasonId, 'S4');
  assert.equal(getSeasonForDate({ month: 3, day: 31 }).dayInSeason, 90);
  assert.equal(getSeasonForDate({ month: 3, day: 31 }).isSeasonEndDay, true);
  assert.equal(getSeasonForDate({ month: 4, day: 1 }).seasonId, 'S2');
});

test('season boundaries: Feb 28 -> Mar 1, Dec 31 -> Jan, mid boost and final rush', () => {
  assert.equal(getSeasonForDate({ month: 2, day: 28 }).seasonId, 'S1');
  assert.equal(getSeasonForDate({ month: 3, day: 1 }).monthInSeason, 3);
  assert.equal(getSeasonForDate({ month: 2, day: 15 }).catalogMultiplier, 1.5);
  assert.equal(getSeasonForDate({ month: 2, day: 21 }).catalogMultiplier, 1.5);
  assert.equal(getSeasonForDate({ month: 2, day: 22 }).catalogMultiplier, 1);
  assert.equal(getSeasonForDate({ month: 3, day: 22 }).catalogMultiplier, 2);
  assert.equal(getSeasonForDate({ month: 1, day: 1 }).isOpeningWeek, true);
  assert.equal(getSeasonForDate({ month: 3, day: 26 }).nextSeasonPreview, true);
  assert.throws(() => getSeasonForDate({ month: 2, day: 29 }), /DAY_INVALID/);
  assert.throws(() => getSeasonForDate({ month: 13, day: 1 }), /MONTH_INVALID/);
});

test('rank cycles are 1-14 and 15-end, 6 cycles in S1, phases map to the plan', () => {
  const first = getRankCycleForDate({ month: 1, day: 1 });
  assert.equal(first.cycleId, 'R-01-first');
  assert.equal(first.phase, 'OPENING');
  assert.equal(getRankCycleForDate({ month: 1, day: 14 }).phase, 'FINAL');
  assert.equal(getRankCycleForDate({ month: 1, day: 15 }).cycleId, 'R-01-second');
  assert.equal(getRankCycleForDate({ month: 2, day: 28 }).endDay, 28);
  assert.equal(getRankCycleForDate({ month: 3, day: 31 }).endDay, 31);
  const cycles = new Set();
  for (let month = 1; month <= 3; month += 1) {
    cycles.add(getRankCycleForDate({ month, day: 1 }).cycleId);
    cycles.add(getRankCycleForDate({ month, day: 15 }).cycleId);
  }
  assert.equal(cycles.size, 6);
});

test('festival phases: announce, yobi, main halves, results +2h; rank pauses in main', () => {
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 1, hour: 9 }).phase, 'announce');
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 11, hour: 9 }).phase, 'yobi');
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 19, hour: 9 }).phase, 'main-first');
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 20, hour: 9 }).phase, 'main-second');
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 21, hour: 9 }).phase, 'main-ended');
  assert.equal(getFestivalPhaseForDate({ month: 1, day: 21, hour: 11 }).phase, 'results');
  assert.equal(isFestivalMainTime({ month: 1, day: 20, hour: 12 }), true);
  assert.equal(isFestivalMainTime({ month: 1, day: 21, hour: 9 }), false);
  assert.equal(getRankCycleForDate({ month: 1, day: 20, hour: 12 }).pausedForFestival, true);
  assert.equal(getFestivalPhaseForDate({ month: 12, day: 22, hour: 11 }).phase, 'results');
});

test('every day of the year has at least one open event (no void days)', () => {
  assert.deepEqual(checkYearCoverage(), []);
  assert.equal(getMonthlyEventsForDate({ month: 1, day: 5 }).events.length >= 2, true);
  assert.equal(getMonthlyEventsForDate({ month: 1, day: 25 }).events.some((e) => e.id === 'D'), true);
  assert.match(describeToday({ month: 1, day: 1 }), /第1シーズン/);
});

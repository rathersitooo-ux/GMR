import test from 'node:test';
import assert from 'node:assert/strict';

import { runSeasonClosing, seasonNotice, summarizeSeasonStats } from '../browser/season-closing-core.mjs';
import { addCatalogPoints, createCatalogState } from '../browser/season-catalog-core.mjs';
import { createExchangeState } from '../browser/season-monthly-event-core.mjs';

test('closing is idempotent by runId: second run applies nothing', () => {
  const catalog = addCatalogPoints(createCatalogState({ seasonId: 'S1' }), 550);
  const exchange = createExchangeState({ seasonId: 'S1', month: 3, tokens: 4, items: [] });
  const first = runSeasonClosing({ runId: 'S1-close-1', seasonId: 'S1', daysAfterEnd: 8, catalogState: catalog, exchangeState: exchange });
  assert.equal(first.applied, true);
  // 550 points -> 55 manny after grace; 4 tokens -> 20 manny.
  assert.equal(first.record.catalogConvertedManny, 55);
  assert.equal(first.record.exchangeConvertedManny, 20);
  assert.equal(first.record.totalConvertedManny, 75);
  const again = runSeasonClosing({ runId: 'S1-close-1', seasonId: 'S1', daysAfterEnd: 8, catalogState: catalog, exchangeState: exchange, appliedRunIds: first.appliedRunIds, previousRecord: first.record });
  assert.equal(again.applied, false);
  assert.equal(again.reason, 'ALREADY_APPLIED');
  assert.deepEqual(again.record, first.record);
});

test('closing inside the grace period converts nothing yet', () => {
  const catalog = addCatalogPoints(createCatalogState({ seasonId: 'S1' }), 550);
  const result = runSeasonClosing({ runId: 'S1-close-grace', seasonId: 'S1', daysAfterEnd: 3, catalogState: catalog });
  assert.equal(result.record.catalogGraceDaysLeft, 4);
  assert.equal(result.record.catalogConvertedManny, 0);
});

test('season stats bucket catalog levels and report the claim rate', () => {
  const stats = summarizeSeasonStats({
    catalogLevels: [0, 10, 30, 60, 100, 100],
    festivalVotes: [10, 20, 5],
    claimed: 3,
    granted: 4,
  });
  assert.deepEqual(stats.catalogLevelBuckets, [2, 1, 1, 0, 2]);
  assert.equal(stats.festivalVoteTotal, 35);
  assert.equal(stats.claimRate, 0.75);
});

test('notice templates fill in month, question and winner', () => {
  assert.match(seasonNotice('monthStart', { month: 1, question: '初夢なら？' }), /1月のはじまり/);
  assert.match(seasonNotice('results', { winner: '二鷹' }), /二鷹/);
  assert.match(seasonNotice('seasonEnd', { nextMonth: 4 }), /4月1日9時/);
  assert.throws(() => seasonNotice('no-such-kind'), /NOTICE_KIND_INVALID/);
});

test('full Season 1 walk-through: 90 days, 6 rank cycles, 3 festivals, catalog to 100', () => {
  // Simulate the plan's completion line in fast-forward: every S1 day has an
  // open event (calendar core), rank cycles switch 6 times, festivals run 3
  // times, and catalog points reach the cap.
  let catalog = createCatalogState({ seasonId: 'S1' });
  for (let day = 1; day <= 90; day += 1) catalog = addCatalogPoints(catalog, 120, 1);
  assert.equal(catalog.level, 100);
  assert.equal(catalog.points, 10000);
});

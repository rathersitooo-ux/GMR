// season-closing-core.mjs -- S1-15 + S1-16 + S1-18
// Season/month closing in one place, idempotent by runId: running the same
// closing twice returns the same record and applies nothing the second time.
// - Catalog: grace 7 days, then leftover points -> manny (100 pts = 10 manny).
// - Exchange tokens: leftover -> manny (1 token = 5 manny).
// - Festival: claim deadline is month end; the result record stays.
// - Stats (S1-16): aggregate counts only, no player-visible screen here.
// - Notices (S1-18): fill the plan's templates with month/question/winner.

import { NOTICE_TEMPLATES } from './season-s1-config.mjs';
import { CATALOG_POINT_SOURCES } from './season-s1-config.mjs';
import { convertLeftoverPoints, seasonGraceInfo } from './season-catalog-core.mjs';
import { convertLeftoverTokens } from './season-monthly-event-core.mjs';

const SCHEMA = 'gameroad.season-closing.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export function fillNotice(template, values = {}) {
  let text = template;
  for (const [key, value] of Object.entries(values)) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  return text;
}

export function seasonNotice(kind, values = {}) {
  const template = NOTICE_TEMPLATES[kind];
  if (!template) throw new TypeError('NOTICE_KIND_INVALID');
  return fillNotice(template, values);
}

// Run one closing. `runId` (e.g. 'S1-close-1') makes it idempotent:
// the caller keeps `appliedRunIds`; a repeat runId is a no-op returning the
// stored record. Inputs are the plain states of the other cores.
export function runSeasonClosing({
  runId, seasonId, daysAfterEnd = 0, catalogState = null, exchangeState = null,
  appliedRunIds = [], previousRecord = null,
} = {}) {
  if (typeof runId !== 'string' || !runId) throw new TypeError('RUN_ID_REQUIRED');
  if (typeof seasonId !== 'string' || !seasonId) throw new TypeError('SEASON_ID_REQUIRED');
  if (!Number.isInteger(daysAfterEnd) || daysAfterEnd < 0) throw new TypeError('DAYS_INVALID');
  if (appliedRunIds.includes(runId)) {
    return freeze({ applied: false, reason: 'ALREADY_APPLIED', record: previousRecord, appliedRunIds: Object.freeze([...appliedRunIds]) });
  }
  const grace = seasonGraceInfo({ daysAfterEnd });
  const converted = grace.inGrace ? 0 : (catalogState ? convertLeftoverPoints(catalogState).manny : 0);
  const exchangeManny = exchangeState ? convertLeftoverTokens(exchangeState).manny : 0;
  const record = freeze({
    schema: SCHEMA,
    runId,
    seasonId,
    daysAfterEnd,
    catalogGraceDaysLeft: grace.daysLeft,
    catalogConvertedManny: converted,
    exchangeConvertedManny: exchangeManny,
    totalConvertedManny: converted + exchangeManny,
    festivalClaimDeadline: '月末23時59分まで',
  });
  return freeze({ applied: true, reason: 'OK', record, appliedRunIds: Object.freeze([...appliedRunIds, runId]) });
}

// S1-16: season stats from plain event counts. Buckets are coarse on purpose
// (level 0-24 / 25-49 / 50-74 / 75-99 / 100) so no per-player detail is kept.
export function summarizeSeasonStats({ catalogLevels = [], festivalVotes = [0, 0, 0], claimed = 0, granted = 0 } = {}) {
  const buckets = [0, 0, 0, 0, 0];
  for (const level of catalogLevels) {
    if (!Number.isInteger(level) || level < 0 || level > CATALOG_POINT_SOURCES.maxLevel) throw new TypeError('LEVEL_INVALID');
    buckets[level >= 100 ? 4 : Math.floor(level / 25)] += 1;
  }
  const totalVotes = festivalVotes[0] + festivalVotes[1] + festivalVotes[2];
  return freeze({
    players: catalogLevels.length,
    catalogLevelBuckets: Object.freeze(buckets),
    festivalVotes: Object.freeze([...festivalVotes]),
    festivalVoteTotal: totalVotes,
    claimRate: granted > 0 ? claimed / granted : 0,
  });
}

const MATCH_START_SCHEMA = 'gameroad.browser.match-start-snapshot.v1';
const AGGREGATE_SCHEMA = 'gameroad.card-usage-aggregate.v1';
const VIEW_SCHEMA = 'gameroad.card-usage-view.v1';
const TIERS = Object.freeze(['S', 'A', 'B', 'C', 'D']);
const ZONES = new Set(['main', 'ex', 'any']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function token(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function finiteRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function isoInstant(value) {
  const text = token(value, 64);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? { text, ms } : null;
}

function normalizeVersions(value) {
  const rulesVersion = token(value?.rulesVersion, 192);
  const cardVersion = token(value?.cardVersion, 192);
  return rulesVersion && cardVersion ? { rulesVersion, cardVersion } : null;
}

function normalizePeriod(value) {
  const start = isoInstant(value?.startInclusive);
  const end = isoInstant(value?.endExclusive);
  if (!start || !end || start.ms >= end.ms) return null;
  return {
    startInclusive: start.text,
    endExclusive: end.text,
    startMs: start.ms,
    endMs: end.ms,
  };
}

function normalizeQuery(value) {
  const versions = normalizeVersions(value?.versions);
  const mode = token(value?.mode, 96);
  const role = token(value?.role, 96);
  const cohort = token(value?.cohort, 96);
  const zone = token(value?.zone, 16);
  const period = normalizePeriod(value?.period);
  if (!versions || !mode || !role || !cohort || !zone || !ZONES.has(zone) || !period) return null;
  return { versions, mode, role, cohort, zone, period };
}

function normalizeCardList(value) {
  if (!Array.isArray(value)) return null;
  const cards = value.map((item) => token(item, 96));
  if (cards.some((item) => !item)) return null;
  return cards;
}

function zoneCards(snapshot, zone) {
  const main = normalizeCardList(snapshot?.deck?.main);
  const ex = normalizeCardList(snapshot?.deck?.ex);
  if (!main || !ex) return null;
  if (zone === 'main') return main;
  if (zone === 'ex') return ex;
  return [...main, ...ex];
}

function sameVersions(left, right) {
  return left?.rulesVersion === right?.rulesVersion && left?.cardVersion === right?.cardVersion;
}

function rejectCounter(map, reason) {
  map.set(reason, (map.get(reason) ?? 0) + 1);
}

function eligibleSample(record, query) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { ok: false, reason: 'invalid-record' };
  const sampleKey = token(record.sampleKey, 192);
  if (!sampleKey) return { ok: false, reason: 'invalid-sample-key' };
  if (record.matchStartAccepted !== true) return { ok: false, reason: 'match-start-not-accepted' };
  const versions = normalizeVersions(record.versions);
  if (!versions || !sameVersions(versions, query.versions)) return { ok: false, reason: 'version-mismatch' };
  if (token(record.role, 96) !== query.role) return { ok: false, reason: 'role-mismatch' };
  if (token(record.cohort, 96) !== query.cohort) return { ok: false, reason: 'cohort-mismatch' };

  const capturedAt = isoInstant(record.capturedAt);
  if (!capturedAt || capturedAt.ms < query.period.startMs || capturedAt.ms >= query.period.endMs) {
    return { ok: false, reason: 'period-mismatch' };
  }

  const snapshot = record.snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.schema !== MATCH_START_SCHEMA) {
    return { ok: false, reason: 'snapshot-schema-mismatch' };
  }
  if (token(snapshot?.setup?.mode, 96) !== query.mode) return { ok: false, reason: 'mode-mismatch' };
  const cards = zoneCards(snapshot, query.zone);
  if (!cards) return { ok: false, reason: 'invalid-deck-cards' };

  return { ok: true, sampleKey, cards: [...new Set(cards)] };
}

function normalizeTierPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const minimumDecks = positiveInteger(value.minimumDecks);
  if (!minimumDecks || !value.minimumRate || typeof value.minimumRate !== 'object' || Array.isArray(value.minimumRate)) return null;

  const minimumRate = {};
  for (const tier of TIERS) {
    const rate = finiteRate(value.minimumRate[tier]);
    if (rate === null) return null;
    minimumRate[tier] = rate;
  }
  if (!(minimumRate.S > minimumRate.A
    && minimumRate.A > minimumRate.B
    && minimumRate.B > minimumRate.C
    && minimumRate.C >= minimumRate.D)) return null;
  if (minimumRate.D !== 0) return null;
  return { minimumDecks, minimumRate };
}

function tierForRate(rate, policy) {
  for (const tier of TIERS) {
    if (rate >= policy.minimumRate[tier]) return tier;
  }
  return null;
}

function publicQuery(query) {
  return {
    versions: { ...query.versions },
    mode: query.mode,
    role: query.role,
    cohort: query.cohort,
    zone: query.zone,
    period: {
      startInclusive: query.period.startInclusive,
      endExclusive: query.period.endExclusive,
    },
  };
}

export function aggregateCardUsage(records, queryInput) {
  const query = normalizeQuery(queryInput);
  if (!query) throw new TypeError('CARD_USAGE_QUERY_INVALID');

  const seenSamples = new Set();
  const cardDeckCounts = new Map();
  const rejected = new Map();
  let eligibleDecks = 0;

  for (const record of records ?? []) {
    const sample = eligibleSample(record, query);
    if (!sample.ok) {
      rejectCounter(rejected, sample.reason);
      continue;
    }
    if (seenSamples.has(sample.sampleKey)) {
      rejectCounter(rejected, 'duplicate-sample-key');
      continue;
    }
    seenSamples.add(sample.sampleKey);
    eligibleDecks += 1;
    for (const cardId of sample.cards) {
      cardDeckCounts.set(cardId, (cardDeckCounts.get(cardId) ?? 0) + 1);
    }
  }

  const cards = Object.fromEntries(
    [...cardDeckCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cardId, decksWithCard]) => [cardId, deepFreeze({
        decksWithCard,
        adoptionRate: eligibleDecks > 0 ? decksWithCard / eligibleDecks : 0,
      })]),
  );

  return deepFreeze({
    schema: AGGREGATE_SCHEMA,
    query: publicQuery(query),
    eligibleDecks,
    cards,
    rejected: Object.fromEntries([...rejected.entries()].sort()),
    sampleIdentityRetained: false,
    rawDecksRetained: false,
    containsRawDecks: false,
    popularitySignalOnly: true,
    strengthSignal: false,
    optimalActionSignal: false,
    gameplayAuthoritative: false,
    callerMustEstablishMatchStartAuthority: true,
  });
}

export function projectCardUsageForCard(aggregate, cardIdInput, tierPolicyInput) {
  if (!aggregate || aggregate.schema !== AGGREGATE_SCHEMA) throw new TypeError('CARD_USAGE_AGGREGATE_INVALID');
  const cardId = token(cardIdInput, 96);
  if (!cardId) throw new TypeError('CARD_ID_INVALID');

  const policy = normalizeTierPolicy(tierPolicyInput);
  const stats = aggregate.cards?.[cardId] ?? { decksWithCard: 0, adoptionRate: 0 };
  const eligibleDecks = Number.isSafeInteger(aggregate.eligibleDecks) && aggregate.eligibleDecks >= 0
    ? aggregate.eligibleDecks
    : 0;

  let tier = null;
  let status = 'POLICY_UNAVAILABLE';
  if (policy && eligibleDecks < policy.minimumDecks) {
    status = 'INSUFFICIENT_SAMPLE';
  } else if (policy) {
    tier = tierForRate(stats.adoptionRate, policy);
    status = tier ? 'RATED' : 'POLICY_INVALID';
  }

  const glanceLabel = status === 'RATED'
    ? `採用 ${tier}`
    : status === 'INSUFFICIENT_SAMPLE'
      ? '採用 集計不足'
      : '採用 未確定';

  return deepFreeze({
    schema: VIEW_SCHEMA,
    cardId,
    glance: {
      label: glanceLabel,
      tier,
      status,
      colorOnly: false,
      rawPercentPrimary: false,
    },
    detail: {
      adoption: {
        label: '採用',
        tier,
        status,
        adoptionRate: stats.adoptionRate,
        decksWithCard: stats.decksWithCard,
        eligibleDecks,
      },
      performance: {
        label: '成果',
        tier: null,
        status: 'SEPARATE_PIPELINE',
      },
    },
    evidence: {
      versions: { ...aggregate.query.versions },
      mode: aggregate.query.mode,
      role: aggregate.query.role,
      cohort: aggregate.query.cohort,
      zone: aggregate.query.zone,
      period: { ...aggregate.query.period },
      eligibleDecks,
    },
    containsRawDecks: false,
    containsSampleIdentity: false,
    popularitySignalOnly: true,
    strengthSignal: false,
    optimalActionSignal: false,
  });
}

export const CARD_USAGE_TIER_CORE = Object.freeze({
  aggregateSchema: AGGREGATE_SCHEMA,
  viewSchema: VIEW_SCHEMA,
  matchStartSchema: MATCH_START_SCHEMA,
  tiers: TIERS,
});

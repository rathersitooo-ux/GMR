import {
  AUTO_RANK_SEASON_PHASE,
  getActiveAutoRankRegistration,
} from './auto-rank-season-registration-core.mjs';

const SCHEMA = 'gameroad.auto-rank-result-receipt-ledger.v1';
const ACCEPTING_PHASES = new Set([
  AUTO_RANK_SEASON_PHASE.OPENING,
  AUTO_RANK_SEASON_PHASE.REGULAR,
  AUTO_RANK_SEASON_PHASE.FINAL,
]);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNonEmptyString(value, label) {
  if (!nonEmptyString(value)) throw new TypeError(`${label.toUpperCase()}_REQUIRED`);
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeJsonValue(value, active = new WeakSet(), path = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`AUTO_RANK_RESULT_JSON_NONFINITE:${path}`);
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`AUTO_RANK_RESULT_JSON_UNSUPPORTED:${path}`);
  }
  if (active.has(value)) throw new TypeError(`AUTO_RANK_RESULT_JSON_CYCLE:${path}`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((child, index) => normalizeJsonValue(child, active, `${path}[${index}]`));
    }
    if (!isPlainObject(value)) throw new TypeError(`AUTO_RANK_RESULT_JSON_OBJECT_REQUIRED:${path}`);
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJsonValue(value[key], active, `${path}.${key}`);
    }
    return normalized;
  } finally {
    active.delete(value);
  }
}

function normalizePayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('AUTO_RANK_RESULT_PAYLOAD_OBJECT_REQUIRED');
  return normalizeJsonValue(payload, new WeakSet(), 'payload');
}

function normalizeVersions(versions) {
  if (!isPlainObject(versions)) throw new TypeError('AUTO_RANK_RESULT_VERSIONS_REQUIRED');
  return {
    rulesVersion: requireNonEmptyString(versions.rulesVersion, 'rulesVersion'),
    cardVersion: requireNonEmptyString(versions.cardVersion, 'cardVersion'),
    aiVersion: requireNonEmptyString(versions.aiVersion, 'aiVersion'),
  };
}

function normalizeInheritedFrom(value) {
  if (value === null) return null;
  if (!isPlainObject(value)) throw new TypeError('AUTO_RANK_RESULT_INHERITED_FROM_INVALID');
  if (value.lane !== 'OPENING') throw new TypeError('AUTO_RANK_RESULT_INHERITED_FROM_LANE_INVALID');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    throw new TypeError('AUTO_RANK_RESULT_INHERITED_FROM_REVISION_INVALID');
  }
  return { lane: 'OPENING', revision: value.revision };
}

function normalizeRegistration(registration) {
  if (!isPlainObject(registration)) throw new TypeError('AUTO_RANK_RESULT_REGISTRATION_REQUIRED');
  if (registration.lane !== 'OPENING' && registration.lane !== 'REGULAR') {
    throw new TypeError('AUTO_RANK_RESULT_REGISTRATION_LANE_INVALID');
  }
  if (!Number.isSafeInteger(registration.revision) || registration.revision < 1) {
    throw new TypeError('AUTO_RANK_RESULT_REGISTRATION_REVISION_INVALID');
  }
  requireNonEmptyString(registration.registeredAt, 'registeredAt');
  return {
    lane: registration.lane,
    revision: registration.revision,
    registeredAt: registration.registeredAt,
    inheritedFrom: normalizeInheritedFrom(registration.inheritedFrom),
    snapshot: normalizeJsonValue(registration.snapshot, new WeakSet(), 'registration.snapshot'),
  };
}

function normalizeReceipt(receipt) {
  if (!isPlainObject(receipt)) throw new TypeError('AUTO_RANK_RESULT_RECEIPT_INVALID');
  requireNonEmptyString(receipt.resultId, 'resultId');
  requireNonEmptyString(receipt.receivedAt, 'receivedAt');
  if (!ACCEPTING_PHASES.has(receipt.phaseAtReceipt)) {
    throw new TypeError('AUTO_RANK_RESULT_RECEIPT_PHASE_INVALID');
  }
  return {
    resultId: receipt.resultId,
    receivedAt: receipt.receivedAt,
    phaseAtReceipt: receipt.phaseAtReceipt,
    registration: normalizeRegistration(receipt.registration),
    payload: normalizePayload(receipt.payload),
  };
}

function normalizeLedger(value) {
  if (!isPlainObject(value)) throw new TypeError('AUTO_RANK_RESULT_LEDGER_REQUIRED');
  if (value.schema !== SCHEMA) throw new TypeError('AUTO_RANK_RESULT_LEDGER_SCHEMA_UNSUPPORTED');
  requireNonEmptyString(value.seasonId, 'seasonId');
  requireNonEmptyString(value.competitionId, 'competitionId');
  if (!Array.isArray(value.receipts)) throw new TypeError('AUTO_RANK_RESULT_RECEIPTS_REQUIRED');

  const seenResultIds = new Set();
  const receipts = value.receipts.map((receipt) => {
    const normalized = normalizeReceipt(receipt);
    if (seenResultIds.has(normalized.resultId)) {
      throw new TypeError(`AUTO_RANK_RESULT_LEDGER_DUPLICATE_ID:${normalized.resultId}`);
    }
    seenResultIds.add(normalized.resultId);
    return normalized;
  });

  return {
    schema: SCHEMA,
    seasonId: value.seasonId,
    competitionId: value.competitionId,
    versions: normalizeVersions(value.versions),
    receipts,
  };
}

function assertValidSeasonState(seasonState) {
  getActiveAutoRankRegistration(seasonState);
  return seasonState;
}

function assertSeasonIdentity(ledger, seasonState) {
  assertValidSeasonState(seasonState);
  if (ledger.seasonId !== seasonState.seasonId) throw new Error('AUTO_RANK_RESULT_LEDGER_SEASON_MISMATCH');
  if (ledger.competitionId !== seasonState.competitionId) {
    throw new Error('AUTO_RANK_RESULT_LEDGER_COMPETITION_MISMATCH');
  }
  const versions = normalizeVersions(seasonState.versions);
  if (ledger.versions.rulesVersion !== versions.rulesVersion ||
      ledger.versions.cardVersion !== versions.cardVersion ||
      ledger.versions.aiVersion !== versions.aiVersion) {
    throw new Error('AUTO_RANK_RESULT_LEDGER_VERSION_MISMATCH');
  }
}

function sameNormalizedJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createAutoRankResultReceiptLedger({ seasonState } = {}) {
  assertValidSeasonState(seasonState);
  return deepFreeze({
    schema: SCHEMA,
    seasonId: seasonState.seasonId,
    competitionId: seasonState.competitionId,
    versions: normalizeVersions(seasonState.versions),
    receipts: [],
  });
}

export function restoreAutoRankResultReceiptLedger(value) {
  return deepFreeze(normalizeLedger(value));
}

export function findAutoRankResultReceipt(ledger, resultId) {
  const restored = restoreAutoRankResultReceiptLedger(ledger);
  requireNonEmptyString(resultId, 'resultId');
  return restored.receipts.find((receipt) => receipt.resultId === resultId) ?? null;
}

export function acceptAutoRankResultReceipt(ledger, {
  seasonState,
  resultId,
  receivedAt,
  payload,
} = {}) {
  const current = restoreAutoRankResultReceiptLedger(ledger);
  assertSeasonIdentity(current, seasonState);
  requireNonEmptyString(resultId, 'resultId');
  requireNonEmptyString(receivedAt, 'receivedAt');
  const normalizedPayload = normalizePayload(payload);

  const existing = current.receipts.find((receipt) => receipt.resultId === resultId);
  if (existing) {
    if (!sameNormalizedJson(existing.payload, normalizedPayload)) {
      throw new Error(`AUTO_RANK_RESULT_ID_CONFLICT:${resultId}`);
    }
    return current;
  }

  if (!ACCEPTING_PHASES.has(seasonState.phase)) {
    throw new Error(`AUTO_RANK_RESULT_PHASE_NOT_ACCEPTING:${seasonState.phase}`);
  }
  const registration = getActiveAutoRankRegistration(seasonState);
  if (registration === null) throw new Error('AUTO_RANK_RESULT_REGISTRATION_REQUIRED');

  return deepFreeze({
    ...current,
    receipts: [
      ...current.receipts,
      {
        resultId,
        receivedAt,
        phaseAtReceipt: seasonState.phase,
        registration: normalizeRegistration(registration),
        payload: normalizedPayload,
      },
    ],
  });
}

export const AUTO_RANK_RESULT_RECEIPT_LEDGER_CORE = Object.freeze({
  schema: SCHEMA,
});

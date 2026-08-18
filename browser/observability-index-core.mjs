import {
  createObservabilityIncidentCollector,
  OBSERVABILITY_CORE
} from './observability-core.mjs';

const INDEX_SCHEMA = 'GAMEROAD_OBSERVABILITY_SEARCH_PROJECTION_V1';
const QUERY_KEYS = Object.freeze([
  'releaseId',
  'media',
  'surface',
  'matchId',
  'eventType',
  'reasonCode',
  'fingerprint'
]);
const RECORD_KEYS = Object.freeze([
  'schema',
  'sourceSchema',
  'releaseId',
  'media',
  'surface',
  'matchId',
  'eventType',
  'reasonCode',
  'fingerprint',
  'count',
  'firstSeenAtMs',
  'lastSeenAtMs'
]);

function safeRead(source, key) {
  try {
    return source?.[key];
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeQuery(input) {
  try {
    if (!isRecord(input)) return null;
    const keys = Object.keys(input);
    if (keys.some((key) => !QUERY_KEYS.includes(key))) return null;

    const normalized = {};
    for (const key of keys) {
      const value = safeRead(input, key);
      if (typeof value !== 'string' || value.length === 0) return null;
      normalized[key] = value;
    }
    return Object.freeze(normalized);
  } catch {
    return null;
  }
}

function projectIncident(incident) {
  try {
    const envelope = safeRead(incident, 'envelope');
    const context = safeRead(envelope, 'context');
    const diagnostic = safeRead(envelope, 'diagnostic');
    const record = {
      schema: INDEX_SCHEMA,
      sourceSchema: safeRead(envelope, 'schema'),
      releaseId: safeRead(context, 'releaseId'),
      media: safeRead(context, 'media'),
      surface: safeRead(context, 'surface'),
      matchId: safeRead(context, 'matchId'),
      eventType: safeRead(envelope, 'kind'),
      reasonCode: safeRead(diagnostic, 'faultCode'),
      fingerprint: safeRead(envelope, 'fingerprint'),
      count: safeRead(incident, 'count'),
      firstSeenAtMs: safeRead(incident, 'firstSeenAtMs'),
      lastSeenAtMs: safeRead(incident, 'lastSeenAtMs')
    };

    if (Object.keys(record).length !== RECORD_KEYS.length) return null;
    if (record.sourceSchema !== OBSERVABILITY_CORE.schema) return null;
    if (![record.releaseId, record.media, record.surface, record.matchId, record.eventType, record.reasonCode, record.fingerprint]
      .every((value) => typeof value === 'string' && value.length > 0)) return null;
    if (!Number.isSafeInteger(record.count) || record.count <= 0) return null;
    if (![record.firstSeenAtMs, record.lastSeenAtMs]
      .every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null;
    if (record.firstSeenAtMs > record.lastSeenAtMs) return null;

    return deepFreeze(record);
  } catch {
    return null;
  }
}

function compareRecords(left, right) {
  return left.releaseId.localeCompare(right.releaseId)
    || left.media.localeCompare(right.media)
    || left.matchId.localeCompare(right.matchId)
    || left.surface.localeCompare(right.surface)
    || left.firstSeenAtMs - right.firstSeenAtMs
    || left.fingerprint.localeCompare(right.fingerprint);
}

function matches(record, query) {
  for (const [key, value] of Object.entries(query)) {
    if (safeRead(record, key) !== value) return false;
  }
  return true;
}

export function createObservabilitySearchProjection({ maxIncidents } = {}) {
  const collector = maxIncidents === undefined
    ? createObservabilityIncidentCollector()
    : createObservabilityIncidentCollector({ maxIncidents });

  function snapshot() {
    try {
      const incidents = collector.snapshot();
      const projected = incidents.map(projectIncident);
      if (projected.some((record) => record === null)) return [];
      return projected.sort(compareRecords);
    } catch {
      return [];
    }
  }

  function ingest(batch) {
    try {
      const result = collector.ingest(batch);
      if (!result.ok) {
        return Object.freeze({
          ok: false,
          accepted: 0,
          records: snapshot().length,
          reason: result.reason
        });
      }
      return Object.freeze({
        ok: true,
        accepted: result.accepted,
        records: snapshot().length,
        reason: result.reason
      });
    } catch {
      return Object.freeze({
        ok: false,
        accepted: 0,
        records: snapshot().length,
        reason: 'PROJECTION_FAILED'
      });
    }
  }

  function query(filters = {}) {
    const normalized = normalizeQuery(filters);
    if (normalized === null) {
      return Object.freeze({ ok: false, records: Object.freeze([]), reason: 'INVALID_QUERY' });
    }
    try {
      const records = snapshot().filter((record) => matches(record, normalized));
      return Object.freeze({ ok: true, records: Object.freeze(records), reason: 'OK' });
    } catch {
      return Object.freeze({ ok: false, records: Object.freeze([]), reason: 'QUERY_FAILED' });
    }
  }

  return Object.freeze({ ingest, snapshot, query });
}

export const OBSERVABILITY_SEARCH_PROJECTION = Object.freeze({
  schema: INDEX_SCHEMA,
  sourceSchema: OBSERVABILITY_CORE.schema,
  queryKeys: QUERY_KEYS,
  identityAuthority: 'NONE_IN_THIS_PROJECTION',
  retentionAuthority: 'NOT_DEFINED_IN_THIS_PROJECTION',
  transportAuthority: 'NOT_DEFINED_IN_THIS_PROJECTION'
});

const LEGACY_SCHEMA = 'GAMEROAD_OBSERVABILITY_ENVELOPE_V1';
const SCHEMA = 'GAMEROAD_OBSERVABILITY_ENVELOPE_V2';
const SUPPORTED_SCHEMAS = Object.freeze([LEGACY_SCHEMA, SCHEMA]);
const MEDIA = Object.freeze(['browser', 'roblox', 'unity']);
const KINDS = Object.freeze(['exception', 'performance']);
const BASE_CONTEXT_KEYS = Object.freeze(['releaseId', 'media', 'surface', 'matchId']);
const LINEAGE_KEYS = Object.freeze([
  'releaseVersion',
  'rulesVersion',
  'contentVersion',
  'cardVersion',
  'stateVersion',
  'cohortId'
]);
const CONTEXT_KEYS = Object.freeze([...BASE_CONTEXT_KEYS, ...LINEAGE_KEYS]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,95}$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_.:-]{0,63}$/;

function safeRead(source, key) {
  try {
    return source?.[key];
  } catch {
    return undefined;
  }
}

function normalizeId(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return SAFE_ID.test(trimmed) ? trimmed : fallback;
}

function normalizeOptionalId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return SAFE_ID.test(trimmed) ? trimmed : null;
}

function normalizeCode(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toUpperCase();
  return SAFE_CODE.test(trimmed) ? trimmed : fallback;
}

function normalizeErrorName(error) {
  const value = safeRead(error, 'name');
  if (typeof value !== 'string') return 'Error';
  const trimmed = value.trim();
  return SAFE_ID.test(trimmed) ? trimmed.slice(0, 96) : 'Error';
}

function normalizeContext(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const media = normalizeId(safeRead(source, 'media'));
  return Object.freeze({
    releaseId: normalizeId(safeRead(source, 'releaseId')),
    media: MEDIA.includes(media) ? media : 'unknown',
    surface: normalizeId(safeRead(source, 'surface')),
    matchId: normalizeId(safeRead(source, 'matchId')),
    releaseVersion: normalizeOptionalId(safeRead(source, 'releaseVersion')),
    rulesVersion: normalizeOptionalId(safeRead(source, 'rulesVersion')),
    contentVersion: normalizeOptionalId(safeRead(source, 'contentVersion')),
    cardVersion: normalizeOptionalId(safeRead(source, 'cardVersion')),
    stateVersion: normalizeOptionalId(safeRead(source, 'stateVersion')),
    cohortId: normalizeOptionalId(safeRead(source, 'cohortId'))
  });
}

function normalizeMetric(metric) {
  const source = metric && typeof metric === 'object' && !Array.isArray(metric) ? metric : {};
  const observed = Number(safeRead(source, 'observed'));
  const threshold = Number(safeRead(source, 'threshold'));
  return Object.freeze({
    name: normalizeId(safeRead(source, 'name')),
    observed: Number.isFinite(observed) ? observed : null,
    threshold: Number.isFinite(threshold) ? threshold : null
  });
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createObservabilityEnvelope(input = {}, now = Date.now()) {
  try {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const kind = KINDS.includes(safeRead(source, 'kind')) ? safeRead(source, 'kind') : 'exception';
    const context = normalizeContext(safeRead(source, 'context'));
    const error = safeRead(source, 'error');
    const diagnostic = Object.freeze({
      errorName: normalizeErrorName(error),
      faultCode: normalizeCode(safeRead(source, 'faultCode'), 'UNCLASSIFIED')
    });
    const metric = kind === 'performance' ? normalizeMetric(safeRead(source, 'metric')) : null;
    const occurredAtMs = Number(now);
    const fingerprint = fnv1a(JSON.stringify({ kind, context, diagnostic, metric }));
    return deepFreeze({
      schema: SCHEMA,
      kind,
      occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : 0,
      context,
      diagnostic,
      metric,
      fingerprint
    });
  } catch {
    return deepFreeze({
      schema: SCHEMA,
      kind: 'exception',
      occurredAtMs: 0,
      context: {
        releaseId: 'unknown',
        media: 'unknown',
        surface: 'unknown',
        matchId: 'unknown',
        releaseVersion: null,
        rulesVersion: null,
        contentVersion: null,
        cardVersion: null,
        stateVersion: null,
        cohortId: null
      },
      diagnostic: { errorName: 'Error', faultCode: 'REPORTER_FAILURE' },
      metric: null,
      fingerprint: fnv1a('REPORTER_FAILURE')
    });
  }
}

export function createObservabilityQueue({ maxQueue = 32 } = {}) {
  const limit = Number.isSafeInteger(maxQueue) && maxQueue > 0 ? Math.min(maxQueue, 256) : 32;
  let items = [];

  function capture(input, now = Date.now()) {
    try {
      const envelope = createObservabilityEnvelope(input, now);
      const existing = items.find((entry) => entry.envelope.fingerprint === envelope.fingerprint);
      if (existing) {
        const firstSeenAtMs = Math.min(existing.firstSeenAtMs, envelope.occurredAtMs);
        existing.count += 1;
        existing.firstSeenAtMs = firstSeenAtMs;
        existing.lastSeenAtMs = Math.max(existing.lastSeenAtMs, envelope.occurredAtMs);
        if (existing.envelope.occurredAtMs !== firstSeenAtMs) {
          existing.envelope = deepFreeze({ ...existing.envelope, occurredAtMs: firstSeenAtMs });
        }
        return Object.freeze({ accepted: true, duplicate: true, fingerprint: envelope.fingerprint, size: items.length });
      }
      items.push({ envelope, count: 1, firstSeenAtMs: envelope.occurredAtMs, lastSeenAtMs: envelope.occurredAtMs });
      if (items.length > limit) items = items.slice(items.length - limit);
      return Object.freeze({ accepted: true, duplicate: false, fingerprint: envelope.fingerprint, size: items.length });
    } catch {
      return Object.freeze({ accepted: false, duplicate: false, fingerprint: 'capture-failed', size: items.length });
    }
  }

  function snapshot() {
    return items.map((entry) => Object.freeze({ ...entry, envelope: entry.envelope }));
  }

  async function flush(sender) {
    if (typeof sender !== 'function') {
      return Object.freeze({ ok: false, sent: 0, remaining: items.length, reason: 'SENDER_REQUIRED' });
    }
    const batch = snapshot();
    if (batch.length === 0) return Object.freeze({ ok: true, sent: 0, remaining: 0, reason: 'EMPTY' });
    try {
      const result = await sender(batch);
      if (result !== true) {
        return Object.freeze({ ok: false, sent: 0, remaining: items.length, reason: 'SEND_REJECTED' });
      }
      const fingerprints = new Set(batch.map((entry) => entry.envelope.fingerprint));
      items = items.filter((entry) => !fingerprints.has(entry.envelope.fingerprint));
      return Object.freeze({ ok: true, sent: batch.length, remaining: items.length, reason: 'OK' });
    } catch {
      return Object.freeze({ ok: false, sent: 0, remaining: items.length, reason: 'SEND_FAILED' });
    }
  }

  return Object.freeze({ capture, snapshot, flush, maxQueue: limit });
}

const ENTRY_KEYS = Object.freeze(['envelope', 'count', 'firstSeenAtMs', 'lastSeenAtMs']);
const ENVELOPE_KEYS = Object.freeze(['schema', 'kind', 'occurredAtMs', 'context', 'diagnostic', 'metric', 'fingerprint']);
const DIAGNOSTIC_KEYS = Object.freeze(['errorName', 'faultCode']);
const METRIC_KEYS = Object.freeze(['name', 'observed', 'threshold']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expected) {
  try {
    if (!isRecord(value)) return false;
    const keys = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return keys.length === wanted.length && keys.every((key, index) => key === wanted[index]);
  } catch {
    return false;
  }
}

function isSafeId(value) {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isOptionalSafeId(value) {
  return value === null || isSafeId(value);
}

function isSafeCode(value) {
  return typeof value === 'string' && SAFE_CODE.test(value);
}

function isNonNegativeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function cloneContext(context, schema = SCHEMA) {
  const base = {
    releaseId: safeRead(context, 'releaseId'),
    media: safeRead(context, 'media'),
    surface: safeRead(context, 'surface'),
    matchId: safeRead(context, 'matchId')
  };
  if (schema === LEGACY_SCHEMA) return Object.freeze(base);
  return Object.freeze({
    ...base,
    releaseVersion: safeRead(context, 'releaseVersion'),
    rulesVersion: safeRead(context, 'rulesVersion'),
    contentVersion: safeRead(context, 'contentVersion'),
    cardVersion: safeRead(context, 'cardVersion'),
    stateVersion: safeRead(context, 'stateVersion'),
    cohortId: safeRead(context, 'cohortId')
  });
}

function cloneDiagnostic(diagnostic) {
  return Object.freeze({
    errorName: safeRead(diagnostic, 'errorName'),
    faultCode: safeRead(diagnostic, 'faultCode')
  });
}

function cloneMetric(metric) {
  if (metric === null) return null;
  return Object.freeze({
    name: safeRead(metric, 'name'),
    observed: safeRead(metric, 'observed'),
    threshold: safeRead(metric, 'threshold')
  });
}

function validateCollectorEntry(input) {
  try {
    if (!hasExactKeys(input, ENTRY_KEYS)) return null;
    const envelope = safeRead(input, 'envelope');
    if (!hasExactKeys(envelope, ENVELOPE_KEYS)) return null;

    const schema = safeRead(envelope, 'schema');
    if (!SUPPORTED_SCHEMAS.includes(schema)) return null;

    const kind = safeRead(envelope, 'kind');
    if (!KINDS.includes(kind)) return null;

    const context = safeRead(envelope, 'context');
    const expectedContextKeys = schema === LEGACY_SCHEMA ? BASE_CONTEXT_KEYS : CONTEXT_KEYS;
    if (!hasExactKeys(context, expectedContextKeys)) return null;
    const releaseId = safeRead(context, 'releaseId');
    const media = safeRead(context, 'media');
    const surface = safeRead(context, 'surface');
    const matchId = safeRead(context, 'matchId');
    if (![releaseId, surface, matchId].every(isSafeId) || !MEDIA.includes(media)) return null;
    if (schema === SCHEMA && LINEAGE_KEYS.some((key) => !isOptionalSafeId(safeRead(context, key)))) return null;

    const diagnostic = safeRead(envelope, 'diagnostic');
    if (!hasExactKeys(diagnostic, DIAGNOSTIC_KEYS)) return null;
    if (!isSafeId(safeRead(diagnostic, 'errorName')) || !isSafeCode(safeRead(diagnostic, 'faultCode'))) return null;

    const metric = safeRead(envelope, 'metric');
    if (kind === 'exception') {
      if (metric !== null) return null;
    } else {
      if (!hasExactKeys(metric, METRIC_KEYS)) return null;
      if (!isSafeId(safeRead(metric, 'name'))) return null;
      if (!isNonNegativeFinite(safeRead(metric, 'observed')) || !isNonNegativeFinite(safeRead(metric, 'threshold'))) return null;
    }

    const occurredAtMs = safeRead(envelope, 'occurredAtMs');
    const count = safeRead(input, 'count');
    const firstSeenAtMs = safeRead(input, 'firstSeenAtMs');
    const lastSeenAtMs = safeRead(input, 'lastSeenAtMs');
    if (!isNonNegativeFinite(occurredAtMs) || !Number.isSafeInteger(count) || count <= 0) return null;
    if (!isNonNegativeFinite(firstSeenAtMs) || !isNonNegativeFinite(lastSeenAtMs)) return null;
    if (occurredAtMs !== firstSeenAtMs || firstSeenAtMs > lastSeenAtMs) return null;

    const safeContext = cloneContext(context, schema);
    const safeDiagnostic = cloneDiagnostic(diagnostic);
    const safeMetric = cloneMetric(metric);
    const fingerprint = safeRead(envelope, 'fingerprint');
    const expectedFingerprint = fnv1a(JSON.stringify({ kind, context: safeContext, diagnostic: safeDiagnostic, metric: safeMetric }));
    if (fingerprint !== expectedFingerprint) return null;

    return deepFreeze({
      envelope: {
        schema,
        kind,
        occurredAtMs,
        context: safeContext,
        diagnostic: safeDiagnostic,
        metric: safeMetric,
        fingerprint
      },
      count,
      firstSeenAtMs,
      lastSeenAtMs
    });
  } catch {
    return null;
  }
}

export function createObservabilityIncidentCollector({ maxIncidents = 256 } = {}) {
  const limit = Number.isSafeInteger(maxIncidents) && maxIncidents > 0 ? Math.min(maxIncidents, 256) : 256;
  const incidents = new Map();
  let sequence = 0;

  function ingest(batch) {
    try {
      if (!Array.isArray(batch)) {
        return Object.freeze({ ok: false, accepted: 0, incidents: incidents.size, reason: 'BATCH_REQUIRED' });
      }
      if (batch.length > OBSERVABILITY_CORE.maxQueue) {
        return Object.freeze({ ok: false, accepted: 0, incidents: incidents.size, reason: 'BATCH_TOO_LARGE' });
      }
      const validated = batch.map(validateCollectorEntry);
      if (validated.some((entry) => entry === null)) {
        return Object.freeze({ ok: false, accepted: 0, incidents: incidents.size, reason: 'INVALID_ENTRY' });
      }

      let accepted = 0;
      for (const entry of validated) {
        const fingerprint = entry.envelope.fingerprint;
        let incident = incidents.get(fingerprint);
        if (!incident) {
          incident = {
            envelope: entry.envelope,
            count: 0,
            firstSeenAtMs: entry.firstSeenAtMs,
            lastSeenAtMs: entry.lastSeenAtMs,
            windows: new Map(),
            sequence: sequence += 1
          };
          incidents.set(fingerprint, incident);
        }

        const windowKey = String(entry.firstSeenAtMs);
        const priorWindow = incident.windows.get(windowKey);
        const priorCount = priorWindow?.count ?? 0;
        const nextCount = Math.max(priorCount, entry.count);
        const delta = nextCount - priorCount;
        if (delta > 0) {
          incident.count = Math.min(Number.MAX_SAFE_INTEGER, incident.count + delta);
          accepted += delta;
        }
        incident.windows.set(windowKey, {
          count: nextCount,
          lastSeenAtMs: Math.max(priorWindow?.lastSeenAtMs ?? entry.firstSeenAtMs, entry.lastSeenAtMs)
        });
        if (entry.firstSeenAtMs < incident.firstSeenAtMs) {
          incident.envelope = deepFreeze({ ...incident.envelope, occurredAtMs: entry.firstSeenAtMs });
        }
        incident.firstSeenAtMs = Math.min(incident.firstSeenAtMs, entry.firstSeenAtMs);
        incident.lastSeenAtMs = Math.max(incident.lastSeenAtMs, entry.lastSeenAtMs);
      }

      if (incidents.size > limit) {
        const oldest = [...incidents.entries()]
          .sort((a, b) => a[1].lastSeenAtMs - b[1].lastSeenAtMs || a[1].sequence - b[1].sequence);
        while (incidents.size > limit && oldest.length > 0) {
          incidents.delete(oldest.shift()[0]);
        }
      }

      return Object.freeze({ ok: true, accepted, incidents: incidents.size, reason: batch.length === 0 ? 'EMPTY' : 'OK' });
    } catch {
      return Object.freeze({ ok: false, accepted: 0, incidents: incidents.size, reason: 'COLLECTOR_FAILED' });
    }
  }

  function snapshot() {
    try {
      return [...incidents.values()]
        .sort((a, b) => a.sequence - b.sequence)
        .map((incident) => deepFreeze({
          envelope: incident.envelope,
          count: incident.count,
          firstSeenAtMs: incident.firstSeenAtMs,
          lastSeenAtMs: incident.lastSeenAtMs
        }));
    } catch {
      return [];
    }
  }

  return Object.freeze({ ingest, snapshot, maxIncidents: limit });
}

export const OBSERVABILITY_CORE = Object.freeze({
  schema: SCHEMA,
  legacySchema: LEGACY_SCHEMA,
  supportedSchemas: SUPPORTED_SCHEMAS,
  media: MEDIA,
  kinds: KINDS,
  contextKeys: CONTEXT_KEYS,
  lineageKeys: LINEAGE_KEYS,
  maxQueue: 256,
  diagnosticPolicy: 'NO_RAW_MESSAGE_OR_STACK'
});

const SEARCH_PROJECTION_SCHEMA = 'GAMEROAD_OBSERVABILITY_SEARCH_PROJECTION_V2';
const SEARCH_QUERY_KEYS = Object.freeze([
  'releaseId',
  'media',
  'surface',
  'matchId',
  ...LINEAGE_KEYS,
  'eventType',
  'reasonCode',
  'fingerprint'
]);

function normalizeSearchQuery(input) {
  try {
    if (!isRecord(input)) return null;
    const keys = Object.keys(input);
    if (keys.some((key) => !SEARCH_QUERY_KEYS.includes(key))) return null;
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

function projectSearchIncident(incident) {
  try {
    const envelope = safeRead(incident, 'envelope');
    const context = safeRead(envelope, 'context');
    const diagnostic = safeRead(envelope, 'diagnostic');
    return deepFreeze({
      schema: SEARCH_PROJECTION_SCHEMA,
      sourceSchema: safeRead(envelope, 'schema'),
      releaseId: safeRead(context, 'releaseId'),
      media: safeRead(context, 'media'),
      surface: safeRead(context, 'surface'),
      matchId: safeRead(context, 'matchId'),
      releaseVersion: safeRead(context, 'releaseVersion') ?? null,
      rulesVersion: safeRead(context, 'rulesVersion') ?? null,
      contentVersion: safeRead(context, 'contentVersion') ?? null,
      cardVersion: safeRead(context, 'cardVersion') ?? null,
      stateVersion: safeRead(context, 'stateVersion') ?? null,
      cohortId: safeRead(context, 'cohortId') ?? null,
      eventType: safeRead(envelope, 'kind'),
      reasonCode: safeRead(diagnostic, 'faultCode'),
      fingerprint: safeRead(envelope, 'fingerprint'),
      count: safeRead(incident, 'count'),
      firstSeenAtMs: safeRead(incident, 'firstSeenAtMs'),
      lastSeenAtMs: safeRead(incident, 'lastSeenAtMs')
    });
  } catch {
    return null;
  }
}

function compareOptionalId(left, right) {
  return (left ?? '').localeCompare(right ?? '');
}

function compareSearchRecords(left, right) {
  return left.releaseId.localeCompare(right.releaseId)
    || compareOptionalId(left.releaseVersion, right.releaseVersion)
    || compareOptionalId(left.rulesVersion, right.rulesVersion)
    || compareOptionalId(left.contentVersion, right.contentVersion)
    || compareOptionalId(left.cardVersion, right.cardVersion)
    || compareOptionalId(left.stateVersion, right.stateVersion)
    || compareOptionalId(left.cohortId, right.cohortId)
    || left.media.localeCompare(right.media)
    || left.matchId.localeCompare(right.matchId)
    || left.surface.localeCompare(right.surface)
    || left.firstSeenAtMs - right.firstSeenAtMs
    || left.fingerprint.localeCompare(right.fingerprint);
}

function searchRecordMatches(record, query) {
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
      const projected = collector.snapshot().map(projectSearchIncident);
      if (projected.some((record) => record === null)) return Object.freeze([]);
      return Object.freeze(projected.sort(compareSearchRecords));
    } catch {
      return Object.freeze([]);
    }
  }

  function ingest(batch) {
    try {
      const result = collector.ingest(batch);
      if (!result.ok) {
        return Object.freeze({ ok: false, accepted: 0, records: snapshot().length, reason: result.reason });
      }
      return Object.freeze({ ok: true, accepted: result.accepted, records: snapshot().length, reason: result.reason });
    } catch {
      return Object.freeze({ ok: false, accepted: 0, records: snapshot().length, reason: 'PROJECTION_FAILED' });
    }
  }

  function query(filters = {}) {
    const normalized = normalizeSearchQuery(filters);
    if (normalized === null) {
      return Object.freeze({ ok: false, records: Object.freeze([]), reason: 'INVALID_QUERY' });
    }
    try {
      const records = snapshot().filter((record) => searchRecordMatches(record, normalized));
      return Object.freeze({ ok: true, records: Object.freeze(records), reason: 'OK' });
    } catch {
      return Object.freeze({ ok: false, records: Object.freeze([]), reason: 'QUERY_FAILED' });
    }
  }

  return Object.freeze({ ingest, snapshot, query });
}

export const OBSERVABILITY_SEARCH_PROJECTION = Object.freeze({
  schema: SEARCH_PROJECTION_SCHEMA,
  sourceSchema: SCHEMA,
  supportedSourceSchemas: SUPPORTED_SCHEMAS,
  queryKeys: SEARCH_QUERY_KEYS,
  identityAuthority: 'NONE_IN_THIS_PROJECTION',
  retentionAuthority: 'NOT_DEFINED_IN_THIS_PROJECTION',
  transportAuthority: 'NOT_DEFINED_IN_THIS_PROJECTION'
});

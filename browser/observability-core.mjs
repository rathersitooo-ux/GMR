const SCHEMA = 'GAMEROAD_OBSERVABILITY_ENVELOPE_V1';
const MEDIA = Object.freeze(['browser', 'roblox', 'unity']);
const KINDS = Object.freeze(['exception', 'performance']);
const CONTEXT_KEYS = Object.freeze(['releaseId', 'media', 'surface', 'matchId']);
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
    matchId: normalizeId(safeRead(source, 'matchId'))
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
      context: { releaseId: 'unknown', media: 'unknown', surface: 'unknown', matchId: 'unknown' },
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
        existing.count += 1;
        existing.lastSeenAtMs = envelope.occurredAtMs;
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

export const OBSERVABILITY_CORE = Object.freeze({
  schema: SCHEMA,
  media: MEDIA,
  kinds: KINDS,
  contextKeys: CONTEXT_KEYS,
  maxQueue: 256,
  diagnosticPolicy: 'NO_RAW_MESSAGE_OR_STACK'
});

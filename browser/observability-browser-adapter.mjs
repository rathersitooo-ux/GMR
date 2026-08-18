import { createObservabilityIncidentCollector, createObservabilityQueue } from './observability-core.mjs';

function safeRead(source, key) {
  try {
    return source?.[key];
  } catch {
    return undefined;
  }
}

function safeName(value, fallback) {
  const name = safeRead(value, 'name');
  return typeof name === 'string' ? name : fallback;
}

function safeNow(now) {
  try {
    return typeof now === 'function' ? now() : 0;
  } catch {
    return 0;
  }
}

function safeContext(contextProvider) {
  let source = {};
  try {
    const candidate = typeof contextProvider === 'function' ? contextProvider() : {};
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) source = candidate;
  } catch {
    source = {};
  }
  return {
    releaseId: safeRead(source, 'releaseId'),
    media: 'browser',
    surface: safeRead(source, 'surface'),
    matchId: safeRead(source, 'matchId'),
    releaseVersion: safeRead(source, 'releaseVersion'),
    rulesVersion: safeRead(source, 'rulesVersion'),
    contentVersion: safeRead(source, 'contentVersion'),
    cardVersion: safeRead(source, 'cardVersion'),
    stateVersion: safeRead(source, 'stateVersion'),
    cohortId: safeRead(source, 'cohortId')
  };
}

function normalizeHttpEndpoint(endpoint) {
  try {
    if (typeof endpoint !== 'string') return null;
    const trimmed = endpoint.trim();
    if (!trimmed) return null;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  try {
    return typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
  } catch {
    return null;
  }
}

export function createBrowserObservabilityHttpSender({ endpoint, fetchImpl } = {}) {
  const target = normalizeHttpEndpoint(endpoint);
  const sendRequest = resolveFetch(fetchImpl);

  return async function sendObservabilityBatch(batch) {
    if (!target || typeof sendRequest !== 'function' || !Array.isArray(batch) || batch.length === 0) return false;
    try {
      const validator = createObservabilityIncidentCollector();
      const validation = validator.ingest(batch);
      if (!validation.ok) return false;
      const safeBatch = validator.snapshot();
      if (safeBatch.length !== batch.length) return false;

      const response = await sendRequest(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(safeBatch),
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        cache: 'no-store'
      });
      return safeRead(response, 'ok') === true;
    } catch {
      return false;
    }
  };
}

export function createBrowserObservabilityAdapter({
  eventTarget,
  queue = createObservabilityQueue(),
  contextProvider = () => ({}),
  now = Date.now
} = {}) {
  let started = false;

  function capture(input) {
    try {
      if (!queue || typeof queue.capture !== 'function') {
        return Object.freeze({ accepted: false, reason: 'QUEUE_CAPTURE_REQUIRED' });
      }
      return queue.capture(input, safeNow(now));
    } catch {
      return Object.freeze({ accepted: false, reason: 'CAPTURE_FAILED' });
    }
  }

  function onError(event) {
    capture({
      kind: 'exception',
      context: safeContext(contextProvider),
      error: { name: safeName(safeRead(event, 'error'), 'Error') },
      faultCode: 'BROWSER_ERROR'
    });
  }

  function onUnhandledRejection(event) {
    const reason = safeRead(event, 'reason');
    capture({
      kind: 'exception',
      context: safeContext(contextProvider),
      error: { name: reason && typeof reason === 'object' ? safeName(reason, 'UnhandledRejection') : 'UnhandledRejection' },
      faultCode: 'BROWSER_UNHANDLED_REJECTION'
    });
  }

  function start() {
    if (started) return Object.freeze({ ok: true, changed: false, reason: 'ALREADY_STARTED' });
    if (!eventTarget || typeof eventTarget.addEventListener !== 'function' || typeof eventTarget.removeEventListener !== 'function') {
      return Object.freeze({ ok: false, changed: false, reason: 'EVENT_TARGET_REQUIRED' });
    }
    try {
      eventTarget.addEventListener('error', onError);
      try {
        eventTarget.addEventListener('unhandledrejection', onUnhandledRejection);
      } catch {
        try { eventTarget.removeEventListener('error', onError); } catch {}
        return Object.freeze({ ok: false, changed: false, reason: 'LISTENER_REGISTRATION_FAILED' });
      }
      started = true;
      return Object.freeze({ ok: true, changed: true, reason: 'STARTED' });
    } catch {
      return Object.freeze({ ok: false, changed: false, reason: 'LISTENER_REGISTRATION_FAILED' });
    }
  }

  function stop() {
    if (!started) return Object.freeze({ ok: true, changed: false, reason: 'ALREADY_STOPPED' });
    try { eventTarget.removeEventListener('error', onError); } catch {}
    try { eventTarget.removeEventListener('unhandledrejection', onUnhandledRejection); } catch {}
    started = false;
    return Object.freeze({ ok: true, changed: true, reason: 'STOPPED' });
  }

  function reportPerformance({ name, observed, threshold } = {}) {
    if (typeof name !== 'string' || !Number.isFinite(observed) || !Number.isFinite(threshold)) {
      return Object.freeze({ accepted: false, reason: 'INVALID_METRIC' });
    }
    if (observed <= threshold) return Object.freeze({ accepted: false, reason: 'WITHIN_THRESHOLD' });
    return capture({
      kind: 'performance',
      context: safeContext(contextProvider),
      error: { name: 'PerformanceThreshold' },
      faultCode: 'BROWSER_PERFORMANCE_THRESHOLD',
      metric: { name, observed, threshold }
    });
  }

  function snapshot() {
    try {
      return queue && typeof queue.snapshot === 'function' ? queue.snapshot() : [];
    } catch {
      return [];
    }
  }

  async function flush(sender) {
    try {
      if (!queue || typeof queue.flush !== 'function') {
        return Object.freeze({ ok: false, sent: 0, remaining: snapshot().length, reason: 'QUEUE_FLUSH_REQUIRED' });
      }
      return await queue.flush(sender);
    } catch {
      return Object.freeze({ ok: false, sent: 0, remaining: snapshot().length, reason: 'FLUSH_FAILED' });
    }
  }

  function state() {
    return Object.freeze({ started });
  }

  return Object.freeze({ start, stop, reportPerformance, snapshot, flush, state });
}

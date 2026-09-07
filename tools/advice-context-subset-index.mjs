import {
  compileRuntimeAdviceManifest,
  eventEligibility,
  normalizeState,
  recommendFromRuntimeManifest,
  trainCollectiveMemory,
} from './advice-collective-eval.mjs';

const INDEX_SCHEMA = 'gameroad.partner-advice-context-subset-index.v1';
const MANIFEST_SCHEMA = 'gameroad.partner-advice-context-subset-manifest.v1';
const STATE_KEYS = Object.freeze(['phase', 'turnBand', 'pressureBand', 'manaBand', 'handBand']);
const STATE_KEY_SET = new Set(STATE_KEYS);
const MAX_BACKOFF_LEVELS = 16;

function safeToken(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function validVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rulesVersion = safeToken(value.rulesVersion, 96);
  const cardVersion = safeToken(value.cardVersion, 96);
  const stateVersion = safeToken(value.stateVersion, 96);
  return rulesVersion && cardVersion && stateVersion
    ? { rulesVersion, cardVersion, stateVersion }
    : null;
}

function sameVersions(left, right) {
  return ['rulesVersion', 'cardVersion', 'stateVersion']
    .every((key) => safeToken(left?.[key], 96) && left[key] === right?.[key]);
}

function canonicalKeys(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > STATE_KEYS.length) return null;
  const seen = new Set();
  for (const key of value) {
    if (typeof key !== 'string' || !STATE_KEY_SET.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  return STATE_KEYS.filter((key) => seen.has(key));
}

function keySignature(keys) {
  return keys.join(',');
}

export function normalizeContextBackoffPlan(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BACKOFF_LEVELS) return null;
  const plan = [];
  const signatures = new Set();
  for (const level of value) {
    const keys = canonicalKeys(level);
    if (!keys) return null;
    const signature = keySignature(keys);
    if (signatures.has(signature)) return null;
    signatures.add(signature);
    plan.push(Object.freeze([...keys]));
  }
  return Object.freeze(plan);
}

export function contextSubsetFingerprint(state, contextKeys) {
  const normalized = normalizeState(state);
  const keys = canonicalKeys(contextKeys);
  if (!normalized || !keys) return null;
  return JSON.stringify(keys.map((key) => [key, normalized[key]]));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : fallback;
}

function buildBuckets(events, targetVersions, plan, options) {
  const levels = new Map(plan.map((keys) => [keySignature(keys), {
    keys: [...keys],
    buckets: new Map(),
  }]));

  for (const event of events) {
    const eligibility = eventEligibility(event, targetVersions, options);
    if (!eligibility.eligible) continue;
    const state = normalizeState(event.state);
    if (!state) continue;
    for (const keys of plan) {
      const signature = keySignature(keys);
      const fingerprint = contextSubsetFingerprint(state, keys);
      const level = levels.get(signature);
      const rows = level.buckets.get(fingerprint) ?? [];
      rows.push(event);
      level.buckets.set(fingerprint, rows);
    }
  }
  return levels;
}

export function buildCollectiveContextSubsetIndex(events, targetVersions, options = {}) {
  const versions = validVersions(targetVersions);
  const plan = normalizeContextBackoffPlan(options.backoffPlan);
  if (!versions) throw new TypeError('CONTEXT_INDEX_VERSIONS_INVALID');
  if (!plan) throw new TypeError('CONTEXT_INDEX_BACKOFF_PLAN_INVALID');

  const rows = Array.isArray(events) ? events : [];
  const baseMemory = trainCollectiveMemory(rows, versions, options);
  const rawLevels = buildBuckets(rows, versions, plan, options);
  const levels = new Map();

  for (const keys of plan) {
    const signature = keySignature(keys);
    const rawLevel = rawLevels.get(signature);
    const buckets = new Map();
    for (const [fingerprint, bucketEvents] of rawLevel.buckets.entries()) {
      const memory = trainCollectiveMemory(bucketEvents, versions, options);
      buckets.set(fingerprint, {
        support: memory.eligibleCount,
        memory,
      });
    }
    levels.set(signature, {
      keys: [...keys],
      buckets,
    });
  }

  return {
    schema: INDEX_SCHEMA,
    targetVersions: { ...versions },
    backoffPlan: plan.map((keys) => [...keys]),
    baseMemory,
    levels,
    eligibleCount: baseMemory.eligibleCount,
    rejected: { ...baseMemory.rejected },
    containsRawEvents: false,
    containsPrivate: false,
    secondDatabaseCreated: false,
    secondRecorderCreated: false,
    secondRankerCreated: false,
    rankingAuthority: 'tools/advice-collective-eval.mjs',
    strategyOwnedByCaller: true,
    runtimeLookupMode: 'constant-time-indexed-per-level',
    rawLogScanAtRecommendation: false,
    maxRuntimeLookups: plan.length,
    provisional: true,
  };
}

function rejectCompile(reason) {
  return { ok: false, reason, manifest: null };
}

function safeIndex(index) {
  if (!index || index.schema !== INDEX_SCHEMA || !(index.levels instanceof Map)) return null;
  const versions = validVersions(index.targetVersions);
  const plan = normalizeContextBackoffPlan(index.backoffPlan);
  if (!versions || !plan || !index.baseMemory) return null;
  for (const keys of plan) {
    const level = index.levels.get(keySignature(keys));
    if (!level || !(level.buckets instanceof Map)) return null;
  }
  return { versions, plan };
}

export function compileCollectiveContextSubsetManifest(index, decision, approval, options = {}) {
  const normalized = safeIndex(index);
  if (!normalized) return rejectCompile('context-index-invalid');
  const minContextSupport = positiveInteger(options.minContextSupport, 8);
  const base = compileRuntimeAdviceManifest(index.baseMemory, decision, approval, { minContextSupport });
  if (!base.ok) return rejectCompile(base.reason);

  const levels = {};
  for (const keys of normalized.plan) {
    const signature = keySignature(keys);
    const source = index.levels.get(signature);
    const entries = {};
    const fingerprints = [...source.buckets.keys()].sort();
    for (const fingerprint of fingerprints) {
      const bucket = source.buckets.get(fingerprint);
      if (!Number.isSafeInteger(bucket?.support) || bucket.support < minContextSupport) continue;
      const compiled = compileRuntimeAdviceManifest(bucket.memory, decision, approval, { minContextSupport: 1 });
      if (!compiled.ok) return rejectCompile(`context-bucket-${compiled.reason}`);
      const actionId = safeToken(compiled.manifest?.defaultActionId, 96);
      if (!actionId) return rejectCompile('context-bucket-action-invalid');
      entries[fingerprint] = Object.freeze({ actionId, support: bucket.support });
    }
    levels[signature] = Object.freeze({
      keys: Object.freeze([...keys]),
      entries: Object.freeze(entries),
    });
  }

  return {
    ok: true,
    reason: null,
    manifest: Object.freeze({
      schema: MANIFEST_SCHEMA,
      targetVersions: Object.freeze({ ...normalized.versions }),
      approval: Object.freeze({ ...base.manifest.approval }),
      promotionSafe: true,
      minContextSupport,
      backoffPlan: Object.freeze(normalized.plan.map((keys) => Object.freeze([...keys]))),
      levels: Object.freeze(levels),
      baseManifest: Object.freeze(structuredClone(base.manifest)),
      sourceEvidence: 'offline-approved-aggregate-only',
      containsRawEvents: false,
      containsPrivate: false,
      secondDatabaseCreated: false,
      secondRecorderCreated: false,
      secondRankerCreated: false,
      rankingAuthority: 'tools/advice-collective-eval.mjs',
      strategyOwnedByCaller: true,
      runtimeLookupMode: 'constant-time-indexed-per-level',
      rawLogScanAtRecommendation: false,
      maxRuntimeLookups: normalized.plan.length,
      optimalActionProven: false,
      livePlayerPerformanceProven: false,
    }),
  };
}

function runtimeReject(reason) {
  return {
    actionId: null,
    source: 'context-index-rejected',
    reason,
    contextKeys: [],
    contextFingerprint: null,
    support: 0,
  };
}

export function recommendFromCollectiveContextSubsetManifest(manifest, state, targetVersions) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || manifest.promotionSafe !== true) {
    return runtimeReject('manifest-not-approved');
  }
  if (manifest.containsPrivate === true || manifest.containsRawEvents === true) {
    return runtimeReject('privacy-not-runtime-safe');
  }
  if (!sameVersions(manifest.targetVersions, targetVersions)) return runtimeReject('version-mismatch');
  const normalizedState = normalizeState(state);
  const plan = normalizeContextBackoffPlan(manifest.backoffPlan);
  if (!normalizedState || !plan) return runtimeReject('invalid-state-or-plan');

  const baseGate = recommendFromRuntimeManifest(manifest.baseManifest, normalizedState, targetVersions);
  if (!baseGate?.actionId) return runtimeReject(baseGate?.reason ?? 'base-manifest-rejected');

  for (const keys of plan) {
    const signature = keySignature(keys);
    const level = manifest.levels?.[signature];
    if (!level || !Array.isArray(level.keys) || keySignature(level.keys) !== signature) {
      return runtimeReject('manifest-level-invalid');
    }
    const fingerprint = contextSubsetFingerprint(normalizedState, keys);
    const entry = level.entries?.[fingerprint];
    if (!entry) continue;
    const actionId = safeToken(entry.actionId, 96);
    const support = Number(entry.support);
    if (!actionId || !Number.isSafeInteger(support) || support < manifest.minContextSupport) {
      return runtimeReject('manifest-entry-invalid');
    }
    return {
      actionId,
      source: 'approved-context-subset',
      reason: null,
      contextKeys: [...keys],
      contextFingerprint: fingerprint,
      support,
    };
  }

  const fallback = safeToken(manifest.baseManifest?.defaultActionId, 96);
  if (!fallback) return runtimeReject('no-approved-recommendation');
  return {
    actionId: fallback,
    source: 'approved-global-fallback',
    reason: null,
    contextKeys: [],
    contextFingerprint: null,
    support: 0,
  };
}

export const COLLECTIVE_CONTEXT_SUBSET_INDEX = Object.freeze({
  indexSchema: INDEX_SCHEMA,
  manifestSchema: MANIFEST_SCHEMA,
  stateKeys: STATE_KEYS,
  maxBackoffLevels: MAX_BACKOFF_LEVELS,
  rankingAuthority: 'tools/advice-collective-eval.mjs',
});

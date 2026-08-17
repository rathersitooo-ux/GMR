const RUNTIME_MANIFEST_SCHEMA = 'gameroad.partner-advice-runtime-manifest.v1';
const REQUIRED_STATE_KEYS = ['phase', 'turnBand', 'pressureBand', 'manaBand', 'handBand'];

function safeToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) return null;
  return trimmed;
}

function validVersions(versions) {
  return ['rulesVersion', 'cardVersion', 'stateVersion'].every((key) => safeToken(versions?.[key]));
}

function sameVersions(a, b) {
  return validVersions(a) && validVersions(b)
    && ['rulesVersion', 'cardVersion', 'stateVersion'].every((key) => a[key] === b[key]);
}

function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const normalized = {};
  for (const key of REQUIRED_STATE_KEYS) {
    const token = safeToken(state[key]);
    if (!token) return null;
    normalized[key] = token;
  }
  return normalized;
}

function stateFingerprint(state, versions) {
  const normalized = normalizeState(state);
  if (!normalized || !validVersions(versions)) return null;
  return [
    `rules=${versions.rulesVersion}`,
    `cards=${versions.cardVersion}`,
    `state=${versions.stateVersion}`,
    ...REQUIRED_STATE_KEYS.map((key) => `${key}=${normalized[key]}`),
  ].join('|');
}

function manifestReject(reason) {
  return Object.freeze({ actionId: null, source: 'manifest-rejected', reason, fingerprint: null, support: 0 });
}

/**
 * Browser-safe consumer for an already compiled, Human-approved collective-advice manifest.
 * This intentionally does not train, persist raw events, inspect private state, or invent actions.
 */
export function recommendApprovedRuntimeAction(manifest, state, targetVersions) {
  if (!manifest || manifest.schema !== RUNTIME_MANIFEST_SCHEMA || manifest.promotionSafe !== true) {
    return manifestReject('manifest-not-approved');
  }
  if (manifest.approval?.gateId !== 'HUMAN-HOLDOUT-ACCEPTANCE' || manifest.approval?.humanGate !== 'approved') {
    return manifestReject('human-gate-not-approved');
  }
  if (manifest.approval?.privacyScope !== 'shared' || manifest.containsPrivate === true || manifest.containsRawEvents === true) {
    return manifestReject('privacy-not-runtime-safe');
  }
  if (!sameVersions(manifest.targetVersions, targetVersions)) return manifestReject('version-mismatch');

  const fingerprint = stateFingerprint(state, targetVersions);
  if (!fingerprint) return manifestReject('invalid-state');

  const contexts = Array.isArray(manifest.contexts) ? manifest.contexts : [];
  const exact = contexts.find((entry) => entry?.fingerprint === fingerprint && safeToken(entry?.actionId));
  const fallback = safeToken(manifest.defaultActionId);
  if (!exact && !fallback) return manifestReject('no-approved-recommendation');

  return Object.freeze({
    actionId: exact?.actionId ?? fallback,
    source: exact ? 'approved-similar-situation' : 'approved-global-fallback',
    reason: null,
    fingerprint,
    support: Number.isFinite(Number(exact?.support)) ? Math.max(0, Number(exact.support)) : 0,
  });
}

/**
 * Legal-action boundary for production integration.
 * The approved manifest may only win when its action is in the caller-provided current legal set.
 * Otherwise the caller's existing heuristic action is preserved as the fail-safe fallback.
 */
export function selectRuntimeOrHeuristicAdvice({ manifest, state, targetVersions, legalActionIds, heuristicActionId = null } = {}) {
  const legal = new Set((Array.isArray(legalActionIds) ? legalActionIds : [])
    .map(safeToken)
    .filter(Boolean));
  const recommendation = recommendApprovedRuntimeAction(manifest, state, targetVersions);

  if (recommendation.actionId && legal.has(recommendation.actionId)) {
    return Object.freeze({
      actionId: recommendation.actionId,
      source: recommendation.source,
      manifestUsed: true,
      fallbackReason: null,
      fingerprint: recommendation.fingerprint,
      support: recommendation.support,
    });
  }

  const heuristic = safeToken(heuristicActionId);
  const fallbackReason = recommendation.actionId
    ? 'manifest-action-not-currently-legal'
    : recommendation.reason;
  if (heuristic && legal.has(heuristic)) {
    return Object.freeze({
      actionId: heuristic,
      source: 'existing-heuristic-fallback',
      manifestUsed: false,
      fallbackReason,
      fingerprint: recommendation.fingerprint,
      support: 0,
    });
  }

  return Object.freeze({
    actionId: null,
    source: 'no-safe-runtime-action',
    manifestUsed: false,
    fallbackReason: fallbackReason || 'no-legal-fallback',
    fingerprint: recommendation.fingerprint,
    support: 0,
  });
}

export const PARTNER_ADVICE_RUNTIME_SCHEMA = RUNTIME_MANIFEST_SCHEMA;

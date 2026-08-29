import {
  selectPartnerLegalCandidate,
  selectPartnerManifestOrRuleCandidate,
} from './partner-legal-action-adapter.mjs';

const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const BOARD_PROJECTION_SCHEMA = 'gameroad.partner-advice-board-projection.v1';
const RESPONSE_PLAN_SCHEMA = 'gameroad.partner-response-plan.v1';
const RESPONSE_PLAN_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/|=-]*$/;
const RESPONSE_PLAN_REASON_IDS = Object.freeze({
  LEFTMOST: 'leftmost',
  RIGHTMOST: 'rightmost',
  MAXIMUM: 'maximum',
  MINIMUM: 'minimum',
  APPROVED_RUNTIME_MANIFEST: 'approved-runtime-manifest',
  NO_LEGAL_CANDIDATE: 'no-legal-candidate',
});

function exactVersionTuple(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const token = value[key];
    if (typeof token !== 'string' || !token || token.trim() !== token || token.length > 96) return null;
    out[key] = token;
  }
  return Object.freeze(out);
}

function exactPresentationToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > 160) return null;
  return token;
}

function responsePlanToken(value, max = 180) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return RESPONSE_PLAN_TOKEN_RE.test(value) ? value : null;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function inactiveBoardProjection(reason) {
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: false,
    clear: true,
    reason,
    candidateId: null,
    targetId: null,
    alternativeCandidateId: null,
    source: null,
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
}

function preservePublicPayload(result, candidates) {
  if (!result?.ok || !result.selected) return result;
  const id = String(result.selected.candidateId || '');
  const raw = (candidates || []).find((candidate) =>
    String(candidate?.candidateId || '') === id && candidate?.publicScope === true,
  );
  if (!raw) return result;
  return Object.freeze({
    ...result,
    selected: Object.freeze({ ...result.selected, payload: raw.payload }),
  });
}

function responsePlanFail(reason) {
  return freezeDeep({ ok: false, reason, planInput: null });
}

function uniqueResponsePlanTokens(values, maxItems) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (value == null) continue;
    const parsed = responsePlanToken(value, 220);
    if (!parsed || seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(parsed);
    if (out.length > maxItems) return null;
  }
  return out;
}

function responsePlanManifestLineage(manifest, versions, sourceUseSite) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, reason: 'RUNTIME_MANIFEST_INVALID' };
  }
  if (manifest.containsPrivate !== false || manifest.containsRawEvents !== false) {
    return { ok: false, reason: 'RUNTIME_MANIFEST_PRIVACY_BOUNDARY_INVALID' };
  }
  if (manifest.promotionSafe !== true) return { ok: false, reason: 'RUNTIME_MANIFEST_NOT_PROMOTION_SAFE' };

  const manifestVersions = exactVersionTuple(manifest.targetVersions);
  if (!manifestVersions || VERSION_KEYS.some((key) => manifestVersions[key] !== versions[key])) {
    return { ok: false, reason: 'RUNTIME_MANIFEST_VERSION_MISMATCH' };
  }

  const sourceIds = [];
  const approvalId = responsePlanToken(manifest.approval?.approvalId);
  if (approvalId) sourceIds.push(`approval:${approvalId}`);
  const evidenceScope = responsePlanToken(manifest.sourceEvidence);
  if (evidenceScope) sourceIds.push(`evidence-scope:${evidenceScope}`);

  const lineage = manifest.collectiveDecisionLineage ?? null;
  if (!lineage) return { ok: true, sourceIds };
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
    return { ok: false, reason: 'COLLECTIVE_LINEAGE_INVALID' };
  }
  if (
    lineage.automaticMutationAllowed !== false
    || lineage.personaMutationAllowed !== false
    || lineage.relationshipMutationAllowed !== false
    || lineage.containsPrivate !== false
    || lineage.containsRawEvents !== false
  ) {
    return { ok: false, reason: 'COLLECTIVE_LINEAGE_AUTHORITY_BOUNDARY_INVALID' };
  }

  const useSite = responsePlanToken(lineage.consumerUseSiteRef, 120);
  if (!useSite || useSite !== sourceUseSite) return { ok: false, reason: 'COLLECTIVE_LINEAGE_USE_SITE_MISMATCH' };

  for (const value of [lineage.decisionProductId, lineage.proposalId, lineage.changeRef, lineage.cohortId]) {
    const parsed = responsePlanToken(value);
    if (!parsed) return { ok: false, reason: 'COLLECTIVE_LINEAGE_SOURCE_ID_INVALID' };
    sourceIds.push(parsed);
  }
  return { ok: true, sourceIds };
}

export function projectPartnerAdviceBoardEmphasis({
  adviceResult,
  isCurrent,
  resolveTarget,
} = {}) {
  if (!adviceResult?.ok) return inactiveBoardProjection('ADVICE_UNAVAILABLE');
  if (adviceResult.containsPrivate !== false) return inactiveBoardProjection('PUBLIC_SCOPE_UNVERIFIED');

  const candidateId = exactPresentationToken(adviceResult.selected?.candidateId);
  if (!candidateId) return inactiveBoardProjection('NO_SELECTED_CANDIDATE');
  if (typeof isCurrent !== 'function' || typeof resolveTarget !== 'function') {
    return inactiveBoardProjection('PROJECTION_GATE_REQUIRED');
  }

  try {
    if (isCurrent(adviceResult) !== true) return inactiveBoardProjection('STALE_ADVICE');
  } catch {
    return inactiveBoardProjection('CURRENTNESS_CHECK_FAILED');
  }

  let resolvedTarget;
  try {
    resolvedTarget = resolveTarget(candidateId);
  } catch {
    return inactiveBoardProjection('TARGET_RESOLUTION_FAILED');
  }

  const targetId = exactPresentationToken(
    typeof resolvedTarget === 'string' ? resolvedTarget : resolvedTarget?.targetId,
  );
  if (!targetId) return inactiveBoardProjection('TARGET_UNMAPPED');

  const next = exactPresentationToken(adviceResult.next);
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: true,
    clear: false,
    reason: null,
    candidateId,
    targetId,
    alternativeCandidateId: next && next !== candidateId ? next : null,
    source: exactPresentationToken(adviceResult.source),
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
}

/**
 * Converts viewer-safe Advice semantics into the exact input shape consumed by
 * PartnerResponsePlan v1. The caller may later pass planInput to the shared plan builder.
 * This seam never writes persona, relationship, canon, or game state and never copies
 * candidate payloads or raw user text.
 */
export function buildPartnerAdviceResponsePlanInput({
  planId,
  partnerId,
  sourceUseSite,
  adviceResult,
  versions,
  runtimeManifest = null,
} = {}) {
  const parsedPlanId = responsePlanToken(planId);
  const parsedPartnerId = responsePlanToken(partnerId);
  const parsedUseSite = responsePlanToken(sourceUseSite, 120);
  const parsedVersions = exactVersionTuple(versions);
  if (!parsedPlanId) return responsePlanFail('PLAN_ID_INVALID');
  if (!parsedPartnerId) return responsePlanFail('PARTNER_ID_INVALID');
  if (!parsedUseSite) return responsePlanFail('SOURCE_USE_SITE_INVALID');
  if (!parsedVersions) return responsePlanFail('VERSIONS_INVALID');
  if (!adviceResult || typeof adviceResult !== 'object' || adviceResult.ok !== true) return responsePlanFail('ADVICE_NOT_READY');
  if (adviceResult.containsPrivate !== false) return responsePlanFail('ADVICE_PRIVACY_BOUNDARY_INVALID');

  const selectedId = adviceResult.selected == null ? null : responsePlanToken(adviceResult.selected?.candidateId);
  if (adviceResult.selected != null && !selectedId) return responsePlanFail('SELECTED_CANDIDATE_INVALID');
  const alternativeId = adviceResult.next == null ? null : responsePlanToken(adviceResult.next);
  if (adviceResult.next != null && !alternativeId) return responsePlanFail('ALTERNATIVE_CANDIDATE_INVALID');
  if (selectedId && alternativeId && selectedId === alternativeId) return responsePlanFail('ALTERNATIVE_DUPLICATES_TARGET');

  const mappedReason = RESPONSE_PLAN_REASON_IDS[adviceResult.reason] ?? null;
  if (!selectedId && mappedReason !== 'no-legal-candidate') return responsePlanFail('NO_SELECTION_WITHOUT_EXPLICIT_FALLBACK');

  const adviceSource = responsePlanToken(adviceResult.source, 120);
  if (!adviceSource) return responsePlanFail('ADVICE_SOURCE_INVALID');

  let manifestSourceIds = [];
  if (adviceResult.manifestUsed === true) {
    if (!runtimeManifest) return responsePlanFail('MANIFEST_LINEAGE_REQUIRED');
    const manifestCheck = responsePlanManifestLineage(runtimeManifest, parsedVersions, parsedUseSite);
    if (!manifestCheck.ok) return responsePlanFail(manifestCheck.reason);
    manifestSourceIds = manifestCheck.sourceIds;
  }

  const sourceIds = uniqueResponsePlanTokens([
    `advice-source:${adviceSource}`,
    ...manifestSourceIds,
  ], 16);
  if (!sourceIds || sourceIds.length === 0) return responsePlanFail('SOURCE_LINEAGE_INVALID');

  const planInput = {
    schemaVersion: RESPONSE_PLAN_SCHEMA,
    planId: parsedPlanId,
    partnerId: parsedPartnerId,
    sourceUseSite: parsedUseSite,
    purpose: selectedId ? 'ADVISE' : 'FALLBACK',
    semantic: {
      intentId: selectedId ? 'partner-advice-recommend-candidate' : 'partner-advice-no-legal-candidate',
      targetId: selectedId,
      alternativeTargetId: selectedId ? alternativeId : null,
      reasonId: mappedReason,
      confidence: null,
    },
    lineage: {
      evidenceIds: [],
      sourceIds,
      versionRefs: VERSION_KEYS.map((key) => `${key}=${parsedVersions[key]}`),
    },
    expression: {
      toneHint: null,
      emotionHint: null,
      speechPriority: null,
    },
    safety: {
      safeForCharacterExpression: true,
      containsPrivate: false,
      containsRawUserText: false,
      autoExecute: false,
      automaticCanonMutationAllowed: false,
      automaticRelationshipMutationAllowed: false,
      automaticGameMutationAllowed: false,
      rendererMayChangeSemantic: false,
    },
  };

  return freezeDeep({ ok: true, reason: null, planInput });
}

export function createPartnerAdviceReplayBridge({
  legacyReplay,
  getVersions = () => null,
  getManifest = () => null,
  getRuntimeState = () => null,
} = {}) {
  if (typeof legacyReplay !== 'function') throw new TypeError('legacyReplay must be a function');

  return function partnerAdviceReplay(candidates, rule) {
    const fallback = () => legacyReplay({ rule, candidates });
    const versions = exactVersionTuple(getVersions());
    if (!versions) return fallback();

    try {
      const manifest = getManifest();
      const result = manifest
        ? selectPartnerManifestOrRuleCandidate({
            candidates,
            rule,
            sourceVersions: versions,
            targetVersions: versions,
            manifest,
            runtimeState: getRuntimeState(),
          })
        : selectPartnerLegalCandidate({
            candidates,
            rule,
            sourceVersions: versions,
            targetVersions: versions,
          });

      if (!result?.ok) return fallback();
      return preservePublicPayload(result, candidates);
    } catch {
      return fallback();
    }
  };
}

export function createPartnerAdviceRuntimeControl({ onChange } = {}) {
  let versions = null;
  let manifest = null;
  let runtimeStateProvider = null;
  const changed = () => { if (typeof onChange === 'function') onChange(); };

  return Object.freeze({
    setVersions(next) {
      const parsed = exactVersionTuple(next);
      if (!parsed) return false;
      versions = parsed;
      changed();
      return true;
    },
    setManifest(next) {
      if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
      manifest = next;
      changed();
      return true;
    },
    setRuntimeStateProvider(next) {
      if (next !== null && typeof next !== 'function') return false;
      runtimeStateProvider = next;
      changed();
      return true;
    },
    clearManifest() {
      manifest = null;
      changed();
    },
    getVersions: () => versions,
    getManifest: () => manifest,
    getRuntimeState: () => (runtimeStateProvider ? runtimeStateProvider() : null),
    status: () => Object.freeze({
      versionReady: Boolean(versions),
      manifestReady: Boolean(manifest),
      runtimeStateReady: Boolean(runtimeStateProvider),
      mode: versions ? (manifest ? 'manifest-or-rule' : 'shared-rule') : 'legacy-fallback',
    }),
  });
}

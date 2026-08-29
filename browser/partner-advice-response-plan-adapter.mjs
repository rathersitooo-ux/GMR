const RESPONSE_PLAN_SCHEMA = 'gameroad.partner-response-plan.v1';
const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:/|=-]*$/;

const REASON_IDS = Object.freeze({
  LEFTMOST: 'leftmost',
  RIGHTMOST: 'rightmost',
  MAXIMUM: 'maximum',
  MINIMUM: 'minimum',
  APPROVED_RUNTIME_MANIFEST: 'approved-runtime-manifest',
  NO_LEGAL_CANDIDATE: 'no-legal-candidate',
});

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function token(value, max = 180) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return TOKEN_RE.test(value) ? value : null;
}

function exactVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const parsed = token(value[key], 96);
    if (!parsed) return null;
    out[key] = parsed;
  }
  return Object.freeze(out);
}

function sameVersions(a, b) {
  return VERSION_KEYS.every((key) => a?.[key] === b?.[key]);
}

function unique(values, maxItems) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (value == null) continue;
    const parsed = token(value, 220);
    if (!parsed || seen.has(parsed)) continue;
    seen.add(parsed);
    out.push(parsed);
    if (out.length > maxItems) return null;
  }
  return out;
}

function fail(reason) {
  return freezeDeep({ ok: false, reason, planInput: null });
}

function validateRuntimeManifest(manifest, versions, sourceUseSite) {
  if (manifest == null) return { ok: true, lineage: null, sourceIds: [] };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { ok: false, reason: 'RUNTIME_MANIFEST_INVALID' };
  if (manifest.containsPrivate !== false || manifest.containsRawEvents !== false) {
    return { ok: false, reason: 'RUNTIME_MANIFEST_PRIVACY_BOUNDARY_INVALID' };
  }
  if (manifest.promotionSafe !== true) return { ok: false, reason: 'RUNTIME_MANIFEST_NOT_PROMOTION_SAFE' };
  const manifestVersions = exactVersions(manifest.targetVersions);
  if (!manifestVersions || !sameVersions(manifestVersions, versions)) return { ok: false, reason: 'RUNTIME_MANIFEST_VERSION_MISMATCH' };

  const lineage = manifest.collectiveDecisionLineage ?? null;
  const sourceIds = [];
  const approvalId = token(manifest.approval?.approvalId);
  if (approvalId) sourceIds.push(`approval:${approvalId}`);
  const evidenceScope = token(manifest.sourceEvidence);
  if (evidenceScope) sourceIds.push(`evidence-scope:${evidenceScope}`);

  if (!lineage) return { ok: true, lineage: null, sourceIds };
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) return { ok: false, reason: 'COLLECTIVE_LINEAGE_INVALID' };
  if (
    lineage.automaticMutationAllowed !== false
    || lineage.personaMutationAllowed !== false
    || lineage.relationshipMutationAllowed !== false
    || lineage.containsPrivate !== false
    || lineage.containsRawEvents !== false
  ) {
    return { ok: false, reason: 'COLLECTIVE_LINEAGE_AUTHORITY_BOUNDARY_INVALID' };
  }
  const useSite = token(lineage.consumerUseSiteRef, 120);
  if (!useSite || useSite !== sourceUseSite) return { ok: false, reason: 'COLLECTIVE_LINEAGE_USE_SITE_MISMATCH' };

  for (const value of [lineage.decisionProductId, lineage.proposalId, lineage.changeRef, lineage.cohortId]) {
    const parsed = token(value);
    if (!parsed) return { ok: false, reason: 'COLLECTIVE_LINEAGE_SOURCE_ID_INVALID' };
    sourceIds.push(parsed);
  }
  return { ok: true, lineage, sourceIds };
}

/**
 * Converts a viewer-safe Partner Advice selection into the exact input shape consumed by
 * PartnerResponsePlan v1. This adapter never writes persona, relationship, canon, or game state.
 */
export function buildPartnerAdviceResponsePlanInput({
  planId,
  partnerId,
  sourceUseSite,
  adviceResult,
  versions,
  runtimeManifest = null,
} = {}) {
  const parsedPlanId = token(planId);
  const parsedPartnerId = token(partnerId);
  const parsedUseSite = token(sourceUseSite, 120);
  const parsedVersions = exactVersions(versions);
  if (!parsedPlanId) return fail('PLAN_ID_INVALID');
  if (!parsedPartnerId) return fail('PARTNER_ID_INVALID');
  if (!parsedUseSite) return fail('SOURCE_USE_SITE_INVALID');
  if (!parsedVersions) return fail('VERSIONS_INVALID');
  if (!adviceResult || typeof adviceResult !== 'object' || adviceResult.ok !== true) return fail('ADVICE_NOT_READY');
  if (adviceResult.containsPrivate !== false) return fail('ADVICE_PRIVACY_BOUNDARY_INVALID');

  const selectedId = adviceResult.selected == null ? null : token(adviceResult.selected?.candidateId);
  if (adviceResult.selected != null && !selectedId) return fail('SELECTED_CANDIDATE_INVALID');
  const alternativeId = adviceResult.next == null ? null : token(adviceResult.next);
  if (adviceResult.next != null && !alternativeId) return fail('ALTERNATIVE_CANDIDATE_INVALID');
  if (selectedId && alternativeId && selectedId === alternativeId) return fail('ALTERNATIVE_DUPLICATES_TARGET');

  const mappedReason = REASON_IDS[adviceResult.reason] ?? null;
  if (!selectedId && mappedReason !== 'no-legal-candidate') return fail('NO_SELECTION_WITHOUT_EXPLICIT_FALLBACK');

  const adviceSource = token(adviceResult.source, 120);
  if (!adviceSource) return fail('ADVICE_SOURCE_INVALID');
  const manifestUsed = adviceResult.manifestUsed === true;
  if (manifestUsed && runtimeManifest == null) return fail('MANIFEST_LINEAGE_REQUIRED');

  const manifestCheck = validateRuntimeManifest(runtimeManifest, parsedVersions, parsedUseSite);
  if (!manifestCheck.ok) return fail(manifestCheck.reason);

  const sourceIds = unique([
    `advice-source:${adviceSource}`,
    ...manifestCheck.sourceIds,
  ], 16);
  if (!sourceIds || sourceIds.length === 0) return fail('SOURCE_LINEAGE_INVALID');

  const versionRefs = VERSION_KEYS.map((key) => `${key}=${parsedVersions[key]}`);
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
      versionRefs,
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

export const PARTNER_ADVICE_RESPONSE_PLAN_SCHEMA = RESPONSE_PLAN_SCHEMA;

import { revalidateSelectedPartnerLegalCandidate } from './partner-legal-action-adapter.mjs';

const DECISION_EVIDENCE_SCHEMA = 'gameroad.partner-decision-evidence.v1';
const PARTNER_RULES = new Set(['left', 'right', 'max', 'min']);
const ALLOWED_SELECTION_SOURCES = new Set(['shared-legal-action-core', 'approved-runtime-manifest']);
const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactToken(value, max = 96) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max) return null;
  return token;
}

function exactVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const versions = {};
  for (const key of VERSION_KEYS) {
    const token = exactToken(value[key], 96);
    if (!token) return null;
    versions[key] = token;
  }
  return versions;
}

function sameVersions(left, right) {
  return VERSION_KEYS.every((key) => left?.[key] === right?.[key]);
}

function reject(reason) {
  return deepFreeze({
    ok: false,
    reason,
    evidence: null,
    containsPrivate: false,
    gameplayAuthoritative: false,
    bestMoveProven: false,
  });
}

function normalizeSelectionProvenance(decisionResult) {
  const source = exactToken(decisionResult?.source, 96);
  if (!source || !ALLOWED_SELECTION_SOURCES.has(source)) return null;
  const reason = decisionResult?.reason == null ? null : exactToken(decisionResult.reason, 96);
  if (decisionResult?.reason != null && !reason) return null;

  const manifestUsed = decisionResult?.manifestUsed === true;
  if (manifestUsed && source !== 'approved-runtime-manifest') return null;

  let manifest = null;
  if (manifestUsed) {
    const manifestSource = exactToken(decisionResult?.manifestSource, 96);
    const support = Number(decisionResult?.manifestSupport);
    if (!manifestSource || !Number.isSafeInteger(support) || support < 0) return null;
    manifest = { source: manifestSource, support };
  }

  return { source, reason, manifestUsed, manifest };
}

function publicCandidateRow(candidate) {
  return {
    candidateId: candidate.candidateId,
    kind: candidate.kind,
    positionOrder: candidate.positionOrder,
    comparisonValue: candidate.comparisonValue,
  };
}

/**
 * Creates a viewer-safe decision-time evidence packet without creating a second legality engine.
 * Every legal-candidate claim is revalidated through the existing shared Partner legality adapter.
 * This projection intentionally contains no outcome, reward, hidden payload, or best-move claim.
 */
export function projectPartnerDecisionEvidence({
  candidates,
  rule,
  decisionResult,
  sourceVersions,
  targetVersions,
} = {}) {
  if (!Array.isArray(candidates)) return reject('CANDIDATES_REQUIRED');
  if (!PARTNER_RULES.has(rule)) return reject('UNKNOWN_RULE');
  if (decisionResult?.ok !== true) return reject('DECISION_NOT_READY');
  if (decisionResult?.containsPrivate !== false) return reject('DECISION_PRIVACY_UNVERIFIED');

  const selectedCandidateId = exactToken(decisionResult?.selected?.candidateId, 96);
  if (!selectedCandidateId) return reject('SELECTED_ACTION_REQUIRED');

  const source = exactVersions(sourceVersions);
  const target = exactVersions(targetVersions);
  if (!source || !target) return reject('VERSION_REQUIRED');
  if (!sameVersions(source, target)) return reject('VERSION_MISMATCH');

  const provenance = normalizeSelectionProvenance(decisionResult);
  if (!provenance) return reject('SELECTION_PROVENANCE_INVALID');

  const selectedValidation = revalidateSelectedPartnerLegalCandidate({
    selectedCandidateId,
    rule,
    selectedVersions: source,
    candidates,
    currentVersions: target,
  });
  if (!selectedValidation?.ok) {
    return reject(`SELECTED_ACTION_${selectedValidation?.error || 'REVALIDATION_FAILED'}`);
  }

  const legalCandidates = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const candidateId = exactToken(candidate?.candidateId, 96);
    if (!candidateId || seen.has(candidateId)) return reject('CANDIDATE_ID_INVALID_OR_DUPLICATE');
    seen.add(candidateId);

    const validation = revalidateSelectedPartnerLegalCandidate({
      selectedCandidateId: candidateId,
      rule,
      selectedVersions: source,
      candidates,
      currentVersions: target,
    });
    if (validation?.ok) {
      legalCandidates.push(publicCandidateRow(validation.selected));
      continue;
    }
    if (validation?.error === 'SELECTED_ID_NOT_LEGAL') continue;
    return reject(`LEGAL_BOUNDARY_${validation?.error || 'REVALIDATION_FAILED'}`);
  }

  legalCandidates.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  if (!legalCandidates.some((candidate) => candidate.candidateId === selectedCandidateId)) {
    return reject('SELECTED_ACTION_NOT_IN_LEGAL_SET');
  }

  const selection = {
    candidateId: selectedCandidateId,
    source: provenance.source,
    reason: provenance.reason,
    manifestUsed: provenance.manifestUsed,
    ...(provenance.manifest ? { manifest: provenance.manifest } : {}),
  };

  return deepFreeze({
    ok: true,
    reason: null,
    evidence: {
      schema: DECISION_EVIDENCE_SCHEMA,
      versions: { ...selectedValidation.versions },
      rule,
      selection,
      legalCandidateIds: legalCandidates.map((candidate) => candidate.candidateId),
      legalCandidates,
      legalCandidateCount: legalCandidates.length,
      decisionTimeOnly: true,
      outcomeAttached: false,
      rewardAttached: false,
      containsPrivate: false,
      gameplayAuthoritative: false,
      bestMoveProven: false,
      authorityScope: 'derived-viewer-safe-decision-projection',
    },
    containsPrivate: false,
    gameplayAuthoritative: false,
    bestMoveProven: false,
  });
}

export const PARTNER_DECISION_EVIDENCE_CONTRACT = deepFreeze({
  schema: DECISION_EVIDENCE_SCHEMA,
  legalityAuthority: 'browser/partner-legal-action-adapter.mjs#revalidateSelectedPartnerLegalCandidate',
  storageAuthority: 'NONE',
  outcomeAuthority: 'NONE',
  rewardPolicy: 'NO_REWARD_DERIVATION_IN_DECISION_PROJECTION',
  privacyPolicy: 'VIEWER_SAFE_PUBLIC_CANDIDATE_FACTS_ONLY',
  bestMovePolicy: 'UNPROVEN_UNTIL_OUTCOME_JOIN_AND_OFFLINE_COUNTERFACTUAL_EVALUATION',
});

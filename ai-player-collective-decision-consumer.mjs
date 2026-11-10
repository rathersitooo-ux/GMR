const AI_PLAYER_COLLECTIVE_DECISION_SCHEMA = 'gameroad.ai-player-collective-decision-consumer.v1';
const DECISION_EVIDENCE_SCHEMA = 'gameroad.partner-decision-evidence.v1';
const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const ALLOWED_ACTOR_TYPE = 'AI';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactToken(value, max = 128) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max) return null;
  return token;
}

function exactVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const token = exactToken(value[key], 96);
    if (!token) return null;
    out[key] = token;
  }
  return out;
}

function sameVersions(left, right) {
  return VERSION_KEYS.every((key) => left?.[key] === right?.[key]);
}

function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowed.has(key));
}

function reject(reason) {
  return deepFreeze({
    ok: false,
    reason,
    recommendation: null,
    containsPrivate: false,
    containsRawEvents: false,
    gameplayAuthoritative: false,
    rewardAttached: false,
    trainingEligible: false,
    bestMoveProven: false,
  });
}

function normalizeIdentity(identity) {
  if (!exactKeys(identity, new Set([
    'matchId',
    'actorType',
    'actorRef',
    'teamId',
    'roleId',
    'decisionSequence',
  ]))) return null;

  const matchId = exactToken(identity.matchId, 128);
  const actorType = exactToken(identity.actorType, 32);
  const actorRef = exactToken(identity.actorRef, 128);
  const teamId = exactToken(identity.teamId, 128);
  const roleId = exactToken(identity.roleId, 128);
  const decisionSequence = Number(identity.decisionSequence);
  if (!matchId || actorType !== ALLOWED_ACTOR_TYPE || !actorRef || !teamId || !roleId) return null;
  if (!Number.isSafeInteger(decisionSequence) || decisionSequence < 0) return null;
  return { matchId, actorType, actorRef, teamId, roleId, decisionSequence };
}

function normalizeAuthority(authority) {
  if (!exactKeys(authority, new Set([
    'matchIdentityVerified',
    'matchParticipantAuthenticated',
    'actorTeamRoleVerified',
    'decisionSequenceVerified',
  ]))) return null;
  if (
    authority.matchIdentityVerified !== true
    || authority.matchParticipantAuthenticated !== true
    || authority.actorTeamRoleVerified !== true
    || authority.decisionSequenceVerified !== true
  ) return null;
  return {
    matchIdentityVerified: true,
    matchParticipantAuthenticated: true,
    actorTeamRoleVerified: true,
    decisionSequenceVerified: true,
  };
}

function normalizeDecisionEvidence(result) {
  const evidence = result?.evidence;
  if (
    result?.ok !== true
    || result?.containsPrivate !== false
    || result?.gameplayAuthoritative !== false
    || result?.bestMoveProven !== false
    || evidence?.schema !== DECISION_EVIDENCE_SCHEMA
    || evidence?.decisionTimeOnly !== true
    || evidence?.outcomeAttached !== false
    || evidence?.rewardAttached !== false
    || evidence?.containsPrivate !== false
    || evidence?.gameplayAuthoritative !== false
    || evidence?.bestMoveProven !== false
  ) return null;

  const versions = exactVersions(evidence.versions);
  if (!versions || !Array.isArray(evidence.legalCandidateIds) || evidence.legalCandidateIds.length === 0) return null;
  if (evidence.legalCandidateCount !== evidence.legalCandidateIds.length) return null;

  const legalCandidateIds = [];
  const seen = new Set();
  for (const rawId of evidence.legalCandidateIds) {
    const candidateId = exactToken(rawId, 96);
    if (!candidateId || seen.has(candidateId)) return null;
    seen.add(candidateId);
    legalCandidateIds.push(candidateId);
  }
  return { versions, legalCandidateIds };
}

function normalizeCollectiveRecommendation(value) {
  if (!exactKeys(value, new Set([
    'approved',
    'privacySafe',
    'containsPrivate',
    'containsRawEvents',
    'versions',
    'candidateId',
    'reasonRef',
    'decisionProductRef',
    'collectiveLineageRef',
  ]))) return null;
  if (
    value.approved !== true
    || value.privacySafe !== true
    || value.containsPrivate !== false
    || value.containsRawEvents !== false
  ) return null;

  const versions = exactVersions(value.versions);
  const candidateId = exactToken(value.candidateId, 96);
  const reasonRef = value.reasonRef == null ? null : exactToken(value.reasonRef, 128);
  const decisionProductRef = value.decisionProductRef == null ? null : exactToken(value.decisionProductRef, 128);
  const collectiveLineageRef = value.collectiveLineageRef == null ? null : exactToken(value.collectiveLineageRef, 128);
  if (!versions || !candidateId) return null;
  if (value.reasonRef != null && !reasonRef) return null;
  if (value.decisionProductRef != null && !decisionProductRef) return null;
  if (value.collectiveLineageRef != null && !collectiveLineageRef) return null;
  if (!decisionProductRef && !collectiveLineageRef) return null;

  return {
    versions,
    candidateId,
    reasonRef,
    decisionProductRef,
    collectiveLineageRef,
  };
}

/**
 * AI-player-only boundary between approved collective intelligence products and the
 * existing viewer-safe legal-candidate projection. It never creates legality,
 * gameplay authority, reward labels, training labels, or a best-move claim.
 */
export function consumeAiPlayerCollectiveDecision({
  identity,
  authority,
  decisionEvidenceResult,
  collectiveRecommendation,
} = {}) {
  const normalizedIdentity = normalizeIdentity(identity);
  if (!normalizedIdentity) return reject(identity?.actorType === ALLOWED_ACTOR_TYPE ? 'AI_IDENTITY_INVALID' : 'AI_ACTOR_REQUIRED');

  const normalizedAuthority = normalizeAuthority(authority);
  if (!normalizedAuthority) return reject('AUTHORITATIVE_IDENTITY_AND_SEQUENCE_REQUIRED');

  const decision = normalizeDecisionEvidence(decisionEvidenceResult);
  if (!decision) return reject('VIEWER_SAFE_DECISION_EVIDENCE_REQUIRED');

  const collective = normalizeCollectiveRecommendation(collectiveRecommendation);
  if (!collective) return reject('APPROVED_COLLECTIVE_RECOMMENDATION_REQUIRED');
  if (!sameVersions(decision.versions, collective.versions)) return reject('DECISION_FRESHNESS_MISMATCH');
  if (!decision.legalCandidateIds.includes(collective.candidateId)) return reject('COLLECTIVE_CANDIDATE_NOT_IN_LEGAL_SET');

  return deepFreeze({
    ok: true,
    reason: null,
    schema: AI_PLAYER_COLLECTIVE_DECISION_SCHEMA,
    identity: normalizedIdentity,
    versions: { ...decision.versions },
    legalCandidateIds: [...decision.legalCandidateIds],
    recommendation: {
      candidateId: collective.candidateId,
      reasonRef: collective.reasonRef,
      decisionProductRef: collective.decisionProductRef,
      collectiveLineageRef: collective.collectiveLineageRef,
    },
    freshness: {
      exactVersionMatch: true,
      decisionSequenceVerified: true,
    },
    authority: {
      ...normalizedAuthority,
      gameplayAuthoritative: false,
      rewardLabelAuthority: 'NONE',
      trainingLabelAuthority: 'NONE',
      optimalActionAuthority: 'NONE',
    },
    containsPrivate: false,
    containsRawEvents: false,
    gameplayAuthoritative: false,
    rewardAttached: false,
    trainingEligible: false,
    bestMoveProven: false,
    autoExecute: false,
  });
}

export const AI_PLAYER_COLLECTIVE_DECISION_CONTRACT = deepFreeze({
  schema: AI_PLAYER_COLLECTIVE_DECISION_SCHEMA,
  actorType: ALLOWED_ACTOR_TYPE,
  legalCandidateAuthority: 'browser/partner-decision-evidence-projection.mjs',
  collectiveSourcePolicy: 'APPROVED_PRIVACY_SAFE_DECISION_PRODUCT_OR_COLLECTIVE_LINEAGE_ONLY',
  freshnessPolicy: 'EXACT_CALLER_AUTHORITATIVE_VERSION_TUPLE_NO_HASH_NO_TRUNCATION',
  identityPolicy: 'MATCH_PARTICIPANT_ACTOR_TEAM_ROLE_SEQUENCE_MUST_BE_UPSTREAM_VERIFIED',
  gameplayAuthoritative: false,
  rewardAttached: false,
  trainingEligible: false,
  bestMoveProven: false,
  autoExecute: false,
});

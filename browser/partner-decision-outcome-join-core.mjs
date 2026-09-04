import { projectPartnerBattleEventLog } from './partner-battle-event-log-projection.mjs';

export const PARTNER_DECISION_OUTCOME_JOIN = Object.freeze({
  schema: 'GAMEROAD_PARTNER_DECISION_OUTCOME_JOIN_V1',
  decisionEvidenceSchema: 'gameroad.partner-decision-evidence.v1',
  outcomeProjectionSchema: 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1',
  versionPolicy: 'EXACT_R10_DECISION_TO_REPLAY_VERSION_MATCH',
  chosenActionPolicy: 'EXPLICIT_ACTUAL_CHOICE_MUST_BE_IN_R10_LEGAL_SET',
  labelPolicy: 'NO_REWARD_REGRET_OR_OPTIMAL_ACTION_INFERENCE',
  gameplayAuthoritative: false,
  trainingEligible: false,
});

const DECISION_SCHEMA = PARTNER_DECISION_OUTCOME_JOIN.decisionEvidenceSchema;
const DECISION_VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const REPLAY_VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function token(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function exactDecisionVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of DECISION_VERSION_KEYS) {
    const current = token(value[key], 192);
    if (!current) return null;
    out[key] = current;
  }
  return out;
}

function mappedReplayVersions(value) {
  const current = exactDecisionVersions(value);
  if (!current) return null;
  return {
    rules: current.rulesVersion,
    content: current.cardVersion,
    state: current.stateVersion,
  };
}

function sameReplayVersions(left, right) {
  return REPLAY_VERSION_KEYS.every((key) => token(left?.[key], 192) && left[key] === right?.[key]);
}

function uniqueTokenList(value, maxCount = 128) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxCount) return null;
  const rows = value.map((item) => token(item, 96));
  if (rows.some((item) => !item) || new Set(rows).size !== rows.length) return null;
  return rows;
}

function normalizeR10DecisionEvidence(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) return null;
  if (result.containsPrivate !== false || result.gameplayAuthoritative !== false || result.bestMoveProven !== false) return null;

  const evidence = result.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  if (evidence.schema !== DECISION_SCHEMA) return null;
  if (
    evidence.containsPrivate !== false
    || evidence.gameplayAuthoritative !== false
    || evidence.bestMoveProven !== false
    || evidence.decisionTimeOnly !== true
    || evidence.outcomeAttached !== false
    || evidence.rewardAttached !== false
  ) return null;

  const versions = exactDecisionVersions(evidence.versions);
  const legalCandidateIds = uniqueTokenList(evidence.legalCandidateIds);
  const recommendedCandidateId = token(evidence.selection?.candidateId, 96);
  const source = token(evidence.selection?.source, 96);
  if (!versions || !legalCandidateIds || !recommendedCandidateId || !source) return null;
  if (!legalCandidateIds.includes(recommendedCandidateId)) return null;
  if (Number(evidence.legalCandidateCount) !== legalCandidateIds.length) return null;

  const reason = evidence.selection?.reason == null ? null : token(String(evidence.selection.reason), 96);
  if (evidence.selection?.reason != null && !reason) return null;

  return {
    versions,
    legalCandidateIds,
    recommendedCandidateId,
    source,
    reason,
    manifestUsed: evidence.selection?.manifestUsed === true,
    authorityScope: token(evidence.authorityScope, 192),
  };
}

function reject(reason) {
  return deepFreeze({ ok: false, reason });
}

export function joinPartnerDecisionEvidenceToBattleOutcome({
  matchId,
  resolutionSerial,
  decisionEvidenceResult,
  chosenActionId,
  replayRead,
} = {}) {
  const safeMatchId = token(matchId);
  const serial = positiveInteger(resolutionSerial);
  const decision = normalizeR10DecisionEvidence(decisionEvidenceResult);
  const chosen = token(chosenActionId, 96);
  if (!safeMatchId || serial === null || !decision || !chosen) return reject('DECISION_EVIDENCE_INVALID');
  if (!decision.legalCandidateIds.includes(chosen)) return reject('CHOSEN_ACTION_NOT_IN_LEGAL_SET');

  const projection = projectPartnerBattleEventLog(replayRead);
  if (!projection.ok) return reject(`OUTCOME_${projection.reason}`);
  if (projection.matchId !== safeMatchId) return reject('MATCH_ID_MISMATCH');

  const expectedReplayVersions = mappedReplayVersions(decision.versions);
  if (!expectedReplayVersions || !sameReplayVersions(expectedReplayVersions, projection.versions)) {
    return reject('VERSION_MISMATCH');
  }

  const outcomes = projection.events.filter(
    (event) => event.kind === 'battle_resolution' && event.data?.serial === serial,
  );
  if (outcomes.length === 0) return reject('OUTCOME_NOT_FOUND');
  if (outcomes.length !== 1) return reject('OUTCOME_AMBIGUOUS');

  return deepFreeze({
    ok: true,
    schema: PARTNER_DECISION_OUTCOME_JOIN.schema,
    matchId: safeMatchId,
    versions: structuredClone(projection.versions),
    decision: {
      resolutionSerial: serial,
      legalCandidateIds: [...decision.legalCandidateIds],
      chosenActionId: chosen,
      recommendedCandidateId: decision.recommendedCandidateId,
      selectionSource: decision.source,
      selectionReason: decision.reason,
      manifestUsed: decision.manifestUsed,
      authorityScope: decision.authorityScope,
    },
    outcome: structuredClone(outcomes[0].data),
    provenance: {
      decisionSchema: DECISION_SCHEMA,
      outcomeSchema: projection.schema,
      replaySourceSchema: projection.sourceSchema,
      exactMatchId: true,
      exactResolutionSerial: true,
      exactVersions: true,
    },
    authority: {
      gameplayAuthoritative: false,
      rewardLabelAuthority: 'NONE',
      regretLabelAuthority: 'NONE',
      optimalActionAuthority: 'NONE',
    },
    training: {
      eligible: false,
      reason: 'APPROVED_REWARD_REGRET_LABEL_REQUIRED',
    },
    containsPrivate: false,
  });
}

import { projectPartnerBattleEventLog } from './partner-battle-event-log-projection.mjs';

export const PARTNER_DECISION_OUTCOME_JOIN = Object.freeze({
  schema: 'GAMEROAD_PARTNER_DECISION_OUTCOME_JOIN_V1',
  decisionSourcePolicy: 'EXISTING_VIEWER_SAFE_LEGAL_ACTION_RESULT_ONLY',
  outcomeSourcePolicy: 'EXISTING_PRIVACY_SAFE_BATTLE_REPLAY_PROJECTION_ONLY',
  versionPolicy: 'EXACT_DECISION_TO_REPLAY_VERSION_MATCH',
  labelPolicy: 'NO_REWARD_REGRET_OR_OPTIMAL_ACTION_INFERENCE',
  gameplayAuthoritative: false,
  trainingEligible: false,
});

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

function decisionVersions(value) {
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
  const current = decisionVersions(value);
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

function uniqueTokens(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) return null;
  const rows = value.map((item) => token(item));
  if (rows.some((item) => !item) || new Set(rows).size !== rows.length) return null;
  return rows;
}

function sanitizeDecisionResult(decision, chosenActionId) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) || decision.ok !== true) return null;
  if (decision.containsPrivate === true) return null;

  const legalCandidateIds = uniqueTokens(decision.ordered);
  const chosen = token(chosenActionId);
  if (!legalCandidateIds || !chosen || !legalCandidateIds.includes(chosen)) return null;

  const source = token(decision.source, 192);
  if (!source) return null;

  let recommendedCandidateId = null;
  if (decision.selected != null) {
    recommendedCandidateId = token(decision.selected?.candidateId);
    if (!recommendedCandidateId || !legalCandidateIds.includes(recommendedCandidateId)) return null;
  }

  const reason = decision.reason == null ? null : token(String(decision.reason), 192);
  if (decision.reason != null && !reason) return null;

  return {
    source,
    legalCandidateIds,
    chosenActionId: chosen,
    recommendedCandidateId,
    manifestUsed: decision.manifestUsed === true,
    reason,
  };
}

function reject(reason) {
  return deepFreeze({ ok: false, reason });
}

export function joinPartnerDecisionToBattleOutcome({
  matchId,
  resolutionSerial,
  decision,
  chosenActionId,
  decisionVersionTuple,
  replayRead,
} = {}) {
  const safeMatchId = token(matchId);
  const serial = positiveInteger(resolutionSerial);
  const versions = mappedReplayVersions(decisionVersionTuple);
  const safeDecision = sanitizeDecisionResult(decision, chosenActionId);
  if (!safeMatchId || serial === null || !versions || !safeDecision) return reject('DECISION_EVIDENCE_INVALID');

  const projection = projectPartnerBattleEventLog(replayRead);
  if (!projection.ok) return reject(`OUTCOME_${projection.reason}`);
  if (projection.matchId !== safeMatchId) return reject('MATCH_ID_MISMATCH');
  if (!sameReplayVersions(versions, projection.versions)) return reject('VERSION_MISMATCH');

  const matches = projection.events.filter(
    (event) => event.kind === 'battle_resolution' && event.data?.serial === serial,
  );
  if (matches.length === 0) return reject('OUTCOME_NOT_FOUND');
  if (matches.length !== 1) return reject('OUTCOME_AMBIGUOUS');

  const outcome = structuredClone(matches[0].data);
  return deepFreeze({
    ok: true,
    schema: PARTNER_DECISION_OUTCOME_JOIN.schema,
    matchId: safeMatchId,
    versions: structuredClone(projection.versions),
    decision: {
      resolutionSerial: serial,
      source: safeDecision.source,
      legalCandidateIds: [...safeDecision.legalCandidateIds],
      chosenActionId: safeDecision.chosenActionId,
      recommendedCandidateId: safeDecision.recommendedCandidateId,
      manifestUsed: safeDecision.manifestUsed,
      reason: safeDecision.reason,
    },
    outcome,
    provenance: {
      decision: 'existing-viewer-safe-legal-action-result',
      outcome: projection.schema,
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

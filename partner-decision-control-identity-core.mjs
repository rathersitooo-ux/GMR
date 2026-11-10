import {
  BATTLE_2V2_CONTROL_MODES,
  isCurrent2v2ControlEnvelope,
} from './battle-2v2-reconnect-core.mjs';
import { PARTNER_DECISION_EVIDENCE_CONTRACT } from './partner-decision-evidence-projection.mjs';

export const PARTNER_DECISION_CONTROL_IDENTITY = Object.freeze({
  schema: 'GAMEROAD_PARTNER_DECISION_CONTROL_IDENTITY_V1',
  decisionEvidenceSchema: PARTNER_DECISION_EVIDENCE_CONTRACT.schema,
  controlAuthoritySchema: 'GAMEROAD_BATTLE_2V2_RECONNECT_V1',
  controlFreshnessPolicy: 'EXACT_CURRENT_CONTROL_MODE_AND_GENERATION',
  playerIdentityPolicy: 'OMIT_PLAYER_ID_FROM_SHARED_EVIDENCE',
  matchIdentityVerified: false,
  matchParticipantAuthenticated: false,
  gameplayAuthoritative: false,
  trainingEligible: false,
});

const VALID_CONTROL_MODES = new Set([
  BATTLE_2V2_CONTROL_MODES.SELF,
  BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER,
  BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER,
]);

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

function exactVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const rulesVersion = token(value.rulesVersion, 96);
  const cardVersion = token(value.cardVersion, 96);
  const stateVersion = token(value.stateVersion, 96);
  if (!rulesVersion || !cardVersion || !stateVersion) return null;
  return { rulesVersion, cardVersion, stateVersion };
}

function uniqueTokenList(value, maxCount = 128) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxCount) return null;
  const rows = value.map((item) => token(item, 96));
  if (rows.some((item) => !item) || new Set(rows).size !== rows.length) return null;
  return rows;
}

function normalizeDecisionEvidence(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== true) return null;
  if (result.containsPrivate !== false || result.gameplayAuthoritative !== false || result.bestMoveProven !== false) return null;

  const evidence = result.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return null;
  if (evidence.schema !== PARTNER_DECISION_EVIDENCE_CONTRACT.schema) return null;
  if (
    evidence.containsPrivate !== false
    || evidence.gameplayAuthoritative !== false
    || evidence.bestMoveProven !== false
    || evidence.decisionTimeOnly !== true
    || evidence.outcomeAttached !== false
    || evidence.rewardAttached !== false
  ) return null;

  const versions = exactVersions(evidence.versions);
  const legalCandidateIds = uniqueTokenList(evidence.legalCandidateIds);
  const recommendedCandidateId = token(evidence.selection?.candidateId, 96);
  const selectionSource = token(evidence.selection?.source, 96);
  const authorityScope = token(evidence.authorityScope, 192);
  if (!versions || !legalCandidateIds || !recommendedCandidateId || !selectionSource || !authorityScope) return null;
  if (!legalCandidateIds.includes(recommendedCandidateId)) return null;
  if (Number(evidence.legalCandidateCount) !== legalCandidateIds.length) return null;

  return {
    versions,
    legalCandidateIds,
    recommendedCandidateId,
    selectionSource,
    authorityScope,
  };
}

function currentControlSeat(reconnectState, controlEnvelope) {
  if (!reconnectState || typeof reconnectState !== 'object' || Array.isArray(reconnectState)) return null;
  if (!controlEnvelope || typeof controlEnvelope !== 'object' || Array.isArray(controlEnvelope)) return null;

  let current = false;
  try {
    current = isCurrent2v2ControlEnvelope(reconnectState, controlEnvelope);
  } catch {
    return null;
  }
  if (!current) return null;

  const seatId = token(controlEnvelope.seatId, 160);
  const controlMode = token(controlEnvelope.controlMode, 64);
  const controlGeneration = Number(controlEnvelope.controlGeneration);
  if (!seatId || !VALID_CONTROL_MODES.has(controlMode) || !Number.isSafeInteger(controlGeneration) || controlGeneration < 0) {
    return null;
  }

  const seat = reconnectState.seats.find((candidate) => candidate?.seatId === seatId);
  if (!seat) return null;
  const teamId = token(seat.teamId, 160);
  if (!teamId || seat.controlMode !== controlMode || seat.controlGeneration !== controlGeneration) return null;
  if (!Number.isSafeInteger(reconnectState.revision) || reconnectState.revision < 0) return null;

  return {
    reconnectRevision: reconnectState.revision,
    seatId,
    teamId,
    connected: seat.connected === true,
    controlMode,
    controlGeneration,
  };
}

function reject(reason) {
  return deepFreeze({ ok: false, reason });
}

/**
 * Binds formal R10 viewer-safe decision evidence to the exact current 2v2 control envelope.
 * This proves current seat/team/control-mode/generation only. It intentionally does not
 * authenticate the match participant and never exposes reconnect-state playerId.
 */
export function bindPartnerDecisionEvidenceToCurrent2v2Control({
  matchId,
  decisionEvidenceResult,
  chosenActionId,
  reconnectState,
  controlEnvelope,
} = {}) {
  const safeMatchId = token(matchId, 160);
  const decision = normalizeDecisionEvidence(decisionEvidenceResult);
  const chosen = token(chosenActionId, 96);
  if (!safeMatchId || !decision || !chosen) return reject('DECISION_EVIDENCE_INVALID');
  if (!decision.legalCandidateIds.includes(chosen)) return reject('CHOSEN_ACTION_NOT_IN_LEGAL_SET');

  const control = currentControlSeat(reconnectState, controlEnvelope);
  if (!control) return reject('CONTROL_ENVELOPE_STALE_OR_INVALID');

  return deepFreeze({
    ok: true,
    schema: PARTNER_DECISION_CONTROL_IDENTITY.schema,
    matchId: safeMatchId,
    versions: { ...decision.versions },
    decision: {
      legalCandidateIds: [...decision.legalCandidateIds],
      chosenActionId: chosen,
      recommendedCandidateId: decision.recommendedCandidateId,
      selectionSource: decision.selectionSource,
      authorityScope: decision.authorityScope,
    },
    actorControl: {
      reconnectRevision: control.reconnectRevision,
      seatId: control.seatId,
      teamId: control.teamId,
      connected: control.connected,
      controlMode: control.controlMode,
      controlGeneration: control.controlGeneration,
      controlRole: control.controlMode,
      controlRoleAuthority: PARTNER_DECISION_CONTROL_IDENTITY.controlAuthoritySchema,
      playerIdIncluded: false,
    },
    freshness: {
      controlEnvelopeCurrent: true,
      reconnectRevisionBound: true,
      controlGenerationBound: true,
      decisionSequenceVerified: false,
    },
    authority: {
      controlFreshnessVerified: true,
      matchIdentityVerified: false,
      matchParticipantAuthenticated: false,
      gameplayAuthoritative: false,
      gameplayRoleAuthority: 'NONE',
      rewardLabelAuthority: 'NONE',
      regretLabelAuthority: 'NONE',
      optimalActionAuthority: 'NONE',
    },
    training: {
      eligible: false,
      reason: 'SERVER_MATCH_PARTICIPANT_AUTH_AND_APPROVED_LABEL_REQUIRED',
    },
    containsPrivate: false,
  });
}

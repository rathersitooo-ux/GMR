const POLICY_ID = 'repair_timing_v1';

const TROUBLE_CLASSES = new Set([
  'none',
  'hearing_or_parse_unknown',
  'reference_ambiguity',
  'candidate_confirmation',
  'stale_or_authority_unknown',
]);
const TURN_BOUNDARY_STATES = new Set(['open', 'repair_pending', 'accepted']);
const PROCESSING_LATENCY_STATES = new Set(['normal', 'already_high', 'unknown']);
const PRIOR_REPAIR_OUTCOMES = new Set(['none', 'unresolved', 'resolved']);
const IDENTITY_STATES = new Set(['matched', 'unknown', 'mismatch']);
const VERSION_STATES = new Set(['current', 'unknown', 'mismatch']);
const AUTHORITY_STATES = new Set(['approved', 'unknown', 'rejected']);
const SOURCE_STATES = new Set(['approved', 'unknown', 'rejected']);

function exactToken(value) {
  if (typeof value !== 'string') return null;
  if (!value || value.length > 128 || value.trim() !== value) return null;
  return value;
}

function enumToken(value, allowed) {
  const token = exactToken(value);
  return token && allowed.has(token) ? token : null;
}

function stableDecisionKey({ partnerId, sessionId, turnId, sourceUseSite, rulesContentVersion }) {
  return [POLICY_ID, partnerId, sessionId, turnId, sourceUseSite, rulesContentVersion]
    .map((part) => encodeURIComponent(part))
    .join('|');
}

function decision({
  ok,
  decisionKey,
  repairNeeded,
  cancelPending,
  addedHold,
  expression,
  specificTarget,
  reason,
  converged,
}) {
  return Object.freeze({
    ok,
    policyId: POLICY_ID,
    decisionKey,
    repairNeeded,
    cancelPending,
    addedHold,
    expression,
    specificTarget,
    reason,
    converged,
    containsCharacterText: false,
    containsPrivate: false,
  });
}

function fail(reason, decisionKey = null) {
  return decision({
    ok: false,
    decisionKey,
    repairNeeded: false,
    cancelPending: true,
    addedHold: 'none',
    expression: 'silence',
    specificTarget: null,
    reason,
    converged: true,
  });
}

function noRepair(reason, decisionKey, { cancelPending = false, converged = true } = {}) {
  return decision({
    ok: true,
    decisionKey,
    repairNeeded: false,
    cancelPending,
    addedHold: 'none',
    expression: 'none',
    specificTarget: null,
    reason,
    converged,
  });
}

/**
 * Pure, Browser-neutral evaluator for the bounded `repair_timing_v1` policy.
 *
 * This module never emits dialogue text and never owns timing thresholds. A caller
 * may only receive an abstract `bounded_candidate` hold marker when observed
 * processing latency is not already high. Live scheduling, dedupe storage,
 * persona wording, gameplay, save, reward and relationship mutations are outside
 * this module.
 */
export function evaluateNeutralRepair(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INPUT_REQUIRED');

  const partnerId = exactToken(input.partnerId);
  const sessionId = exactToken(input.sessionId);
  const turnId = exactToken(input.turnId);
  const sourceUseSite = exactToken(input.sourceUseSite);
  const rulesContentVersion = exactToken(input.rulesContentVersion);
  if (!partnerId || !sessionId || !turnId || !sourceUseSite || !rulesContentVersion) {
    return fail('BOUNDARY_ID_REQUIRED');
  }

  const troubleClass = enumToken(input.troubleClass ?? 'none', TROUBLE_CLASSES);
  const turnBoundaryState = enumToken(input.turnBoundaryState ?? 'open', TURN_BOUNDARY_STATES);
  const processingLatencyState = enumToken(
    input.processingLatencyState ?? 'unknown',
    PROCESSING_LATENCY_STATES,
  );
  const priorRepairOutcome = enumToken(input.priorRepairOutcome ?? 'none', PRIOR_REPAIR_OUTCOMES);
  const identityState = enumToken(input.identityState ?? 'unknown', IDENTITY_STATES);
  const versionState = enumToken(input.versionState ?? 'unknown', VERSION_STATES);
  const evidenceAuthority = enumToken(input.evidenceAuthority ?? 'unknown', AUTHORITY_STATES);
  const sourceState = enumToken(input.sourceState ?? 'unknown', SOURCE_STATES);
  if (
    !troubleClass ||
    !turnBoundaryState ||
    !processingLatencyState ||
    !priorRepairOutcome ||
    !identityState ||
    !versionState ||
    !evidenceAuthority ||
    !sourceState
  ) {
    return fail('BOUNDARY_STATE_INVALID');
  }

  if (!Number.isSafeInteger(input.repairAttemptIndex ?? 0) || (input.repairAttemptIndex ?? 0) < 0) {
    return fail('REPAIR_ATTEMPT_INVALID');
  }
  const repairAttemptIndex = input.repairAttemptIndex ?? 0;

  if (
    typeof (input.selfRepairAccepted ?? false) !== 'boolean' ||
    typeof (input.userResumedSpeaking ?? false) !== 'boolean'
  ) {
    return fail('TURN_SIGNAL_INVALID');
  }
  const selfRepairAccepted = input.selfRepairAccepted ?? false;
  const userResumedSpeaking = input.userResumedSpeaking ?? false;

  let authorizedSpecificTarget = null;
  if (input.authorizedSpecificTarget !== undefined && input.authorizedSpecificTarget !== null) {
    authorizedSpecificTarget = exactToken(input.authorizedSpecificTarget);
    if (!authorizedSpecificTarget) return fail('SPECIFIC_TARGET_INVALID');
  }

  const decisionKey = stableDecisionKey({
    partnerId,
    sessionId,
    turnId,
    sourceUseSite,
    rulesContentVersion,
  });

  if (identityState !== 'matched') return fail('IDENTITY_NOT_MATCHED', decisionKey);
  if (versionState !== 'current') return fail('VERSION_NOT_CURRENT', decisionKey);
  if (evidenceAuthority !== 'approved') return fail('AUTHORITY_NOT_APPROVED', decisionKey);
  if (sourceState !== 'approved') return fail('SOURCE_NOT_APPROVED', decisionKey);

  if (userResumedSpeaking) {
    return noRepair('USER_RESUMED_SPEAKING', decisionKey, { cancelPending: true });
  }
  if (selfRepairAccepted) {
    return noRepair('SELF_REPAIR_ACCEPTED', decisionKey, { cancelPending: true });
  }
  if (turnBoundaryState === 'accepted') return noRepair('TURN_ALREADY_ACCEPTED', decisionKey);
  if (troubleClass === 'none') return noRepair('CLEAR_INPUT', decisionKey);
  if (priorRepairOutcome === 'resolved') return noRepair('PRIOR_REPAIR_RESOLVED', decisionKey);

  if (troubleClass === 'stale_or_authority_unknown') {
    return fail('STALE_OR_AUTHORITY_UNKNOWN', decisionKey);
  }

  if (priorRepairOutcome === 'unresolved' && repairAttemptIndex > 0 && !authorizedSpecificTarget) {
    return decision({
      ok: true,
      decisionKey,
      repairNeeded: false,
      cancelPending: false,
      addedHold: 'none',
      expression: 'silence',
      specificTarget: null,
      reason: 'REPEAT_REPAIR_CONVERGED',
      converged: true,
    });
  }

  const addedHold = processingLatencyState === 'normal' ? 'bounded_candidate' : 'none';
  const expression = authorizedSpecificTarget ? 'specific_confirmation' : 'neutral_clarification';

  return decision({
    ok: true,
    decisionKey,
    repairNeeded: true,
    cancelPending: false,
    addedHold,
    expression,
    specificTarget: authorizedSpecificTarget,
    reason: authorizedSpecificTarget ? 'AUTHORIZED_SPECIFIC_REPAIR' : 'NEUTRAL_REPAIR',
    converged: false,
  });
}

export const REPAIR_TIMING_POLICY_ID = POLICY_ID;

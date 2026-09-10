const LEGACY_SEVEN_WIN_GATE_SCHEMA = 'GAMEROAD_NEW_BASE_LEGACY_SEVEN_WIN_GATE_V1';
const COMPLETION_RULE_SCHEMA = 'GAMEROAD_BATTLE_COMPLETION_RULE_V1';
const COMPLETION_PROJECTION_SCHEMA = 'GAMEROAD_BATTLE_COMPLETION_PROJECTION_V1';

export const COMPLETION_CONSEQUENCE = Object.freeze({
  DIRECT_COMPLETION_WIN: 'DIRECT_COMPLETION_WIN',
  CONNECT_GOAL_PATH: 'CONNECT_GOAL_PATH'
});

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label}_REQUIRED`);
  return value;
}

function requiredPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label}_POSITIVE_INTEGER_REQUIRED`);
  }
  return value;
}

function requiredNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label}_NON_NEGATIVE_INTEGER_REQUIRED`);
  }
  return value;
}

function optionalPositiveInteger(value, label) {
  if (value == null) return null;
  return requiredPositiveInteger(value, label);
}

function requiredCompletionConsequence(value) {
  if (!Object.values(COMPLETION_CONSEQUENCE).includes(value)) {
    throw new TypeError('COMPLETION_CONSEQUENCE_REQUIRED');
  }
  return value;
}

/**
 * Resolves the immutable completion rule supplied by the authoritative match/room profile.
 *
 * The target count and the consequence are deliberately separate. A room can therefore
 * choose N cards as a direct victory condition, while another profile can use the same N
 * only to connect/open the GOAL path. This module does not choose a default N.
 *
 * maxReachableCount is optional because the authoritative count source is owned by the
 * caller. Pass it when the selected source/topology has a known hard maximum (for example,
 * a seven-slot lane) so impossible room configurations fail closed instead of inventing
 * overflow spaces or silently changing the count source.
 */
export function resolveCompletionRule({
  completionTargetCount,
  completionConsequence,
  maxReachableCount = null
} = {}) {
  const target = requiredPositiveInteger(completionTargetCount, 'COMPLETION_TARGET_COUNT');
  const consequence = requiredCompletionConsequence(completionConsequence);
  const maximum = optionalPositiveInteger(maxReachableCount, 'MAX_REACHABLE_COUNT');

  if (maximum != null && target > maximum) {
    throw new RangeError('COMPLETION_TARGET_UNREACHABLE_FOR_COUNT_SOURCE');
  }

  return Object.freeze({
    schema: COMPLETION_RULE_SCHEMA,
    completionTargetCount: target,
    completionConsequence: consequence,
    maxReachableCount: maximum
  });
}

/**
 * Projects a caller-authoritative current count through a resolved completion rule.
 *
 * CONNECT_GOAL_PATH is non-terminal: it only says that the GOAL gate/path may be opened by
 * the appropriate authority/presentation consumer. It never manufactures GOAL_REACHED.
 * DIRECT_COMPLETION_WIN is terminal-by-rule, but winner identity/result emission remains
 * outside this pure projection.
 */
export function projectCompletionRule({
  authoritativeCount,
  resolvedRule
} = {}) {
  const count = requiredNonNegativeInteger(authoritativeCount, 'AUTHORITATIVE_COUNT');
  if (!resolvedRule || typeof resolvedRule !== 'object') {
    throw new TypeError('RESOLVED_COMPLETION_RULE_REQUIRED');
  }

  const rule = resolveCompletionRule({
    completionTargetCount: resolvedRule.completionTargetCount,
    completionConsequence: resolvedRule.completionConsequence,
    maxReachableCount: resolvedRule.maxReachableCount
  });
  const thresholdReached = count >= rule.completionTargetCount;
  const directWin = thresholdReached &&
    rule.completionConsequence === COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN;
  const connectGoalPath = thresholdReached &&
    rule.completionConsequence === COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH;

  return Object.freeze({
    schema: COMPLETION_PROJECTION_SCHEMA,
    authoritativeCount: count,
    completionTargetCount: rule.completionTargetCount,
    completionConsequence: rule.completionConsequence,
    thresholdReached,
    forwardCompletionWin: directWin,
    connectGoalPath,
    terminalByCompletionRule: directWin,
    goalReachStillRequired: connectGoalPath,
    gateUnlockPresentationText: connectGoalPath ? 'ゲート解放！' : null
  });
}

/**
 * Compatibility gate for the old "ROAD reached seven => terminal" predicate.
 *
 * Existing legacy callers keep their old behavior. New configurable rules should use
 * resolveCompletionRule/projectCompletionRule and must not infer their target from this API.
 */
export function projectLegacySevenRoadWinGate({
  rulesetIsNewBase,
  legacySevenRoadWin
} = {}) {
  const newBase = requiredBoolean(rulesetIsNewBase, 'RULESET_IS_NEW_BASE');
  const legacyWin = requiredBoolean(legacySevenRoadWin, 'LEGACY_SEVEN_ROAD_WIN');
  const forwardLegacyWin = newBase ? false : legacyWin;

  return Object.freeze({
    schema: LEGACY_SEVEN_WIN_GATE_SCHEMA,
    rulesetIsNewBase: newBase,
    legacySevenRoadWin: legacyWin,
    forwardLegacyWin,
    suppressedForNewBase: newBase && legacyWin
  });
}

export function shouldForwardLegacySevenRoadWin(input) {
  return projectLegacySevenRoadWinGate(input).forwardLegacyWin;
}

export const BATTLE_COMPLETION_RULE = Object.freeze({
  schema: COMPLETION_RULE_SCHEMA,
  countAuthority: 'caller_owned_authoritative_count',
  targetPolicy: 'resolved_profile_positive_integer_no_implicit_default',
  consequencePolicy: 'resolved_separately_from_target_count',
  directWinConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN,
  goalGateConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
  goalGateTerminal: false,
  goalReachedInference: false,
  winnerInference: false,
  resultEmission: false,
  topologyMutation: false
});

export const NEW_BASE_LEGACY_SEVEN_WIN_GATE = Object.freeze({
  schema: LEGACY_SEVEN_WIN_GATE_SCHEMA,
  authority: 'legacy_terminal_route_forwarding_only',
  newBasePolicy: 'suppress_legacy_seven_road_terminal',
  nonNewBasePolicy: 'preserve_legacy_predicate_unchanged',
  winnerInference: false,
  roadCounting: false,
  goalMutation: false,
  resultEmission: false,
  honeyMutation: false,
  pursuitMutation: false
});

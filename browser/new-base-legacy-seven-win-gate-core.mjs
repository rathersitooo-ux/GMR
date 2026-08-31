const LEGACY_SEVEN_WIN_GATE_SCHEMA = 'GAMEROAD_NEW_BASE_LEGACY_SEVEN_WIN_GATE_V1';

function requiredBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label}_REQUIRED`);
  return value;
}

/**
 * Separates the legacy "ROAD reached seven => terminal" route from the new-base ruleset.
 *
 * This is deliberately only a forwarding gate. It does not decide who won, count ROAD,
 * open GOAL, emit Result, or alter legacy/Honey behavior. Those authorities remain with
 * their existing or dedicated new-base consumers.
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

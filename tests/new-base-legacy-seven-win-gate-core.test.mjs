import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_COMPLETION_RULE,
  COMPLETION_CONSEQUENCE,
  NEW_BASE_LEGACY_SEVEN_WIN_GATE,
  projectCompletionRule,
  projectLegacySevenRoadWinGate,
  resolveCompletionRule,
  shouldForwardLegacySevenRoadWin
} from '../browser/new-base-legacy-seven-win-gate-core.mjs';

test('room profile can choose an arbitrary positive N for direct completion victory', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 3,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN
  });

  assert.equal(projectCompletionRule({ authoritativeCount: 2, resolvedRule: rule }).thresholdReached, false);

  const reached = projectCompletionRule({ authoritativeCount: 3, resolvedRule: rule });
  assert.equal(reached.thresholdReached, true);
  assert.equal(reached.forwardCompletionWin, true);
  assert.equal(reached.terminalByCompletionRule, true);
  assert.equal(reached.connectGoalPath, false);
  assert.equal(reached.gateUnlockPresentationText, null);
});

test('target count is not globally fixed at seven', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 10,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN
  });

  assert.equal(projectCompletionRule({ authoritativeCount: 7, resolvedRule: rule }).forwardCompletionWin, false);
  assert.equal(projectCompletionRule({ authoritativeCount: 10, resolvedRule: rule }).forwardCompletionWin, true);
});

test('GOAL mode uses the configured N to open/connect the gate without terminalizing completion', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 5,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
    maxReachableCount: 7
  });

  const before = projectCompletionRule({ authoritativeCount: 4, resolvedRule: rule });
  assert.equal(before.connectGoalPath, false);
  assert.equal(before.terminalByCompletionRule, false);

  const reached = projectCompletionRule({ authoritativeCount: 5, resolvedRule: rule });
  assert.equal(reached.thresholdReached, true);
  assert.equal(reached.connectGoalPath, true);
  assert.equal(reached.forwardCompletionWin, false);
  assert.equal(reached.terminalByCompletionRule, false);
  assert.equal(reached.goalReachStillRequired, true);
  assert.equal(reached.gateUnlockPresentationText, 'ゲート解放！');
});

test('bounded count source rejects an unreachable room target instead of inventing overflow', () => {
  assert.throws(() => resolveCompletionRule({
    completionTargetCount: 8,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH,
    maxReachableCount: 7
  }), /COMPLETION_TARGET_UNREACHABLE_FOR_COUNT_SOURCE/);
});

test('configurable rule fails closed and never silently defaults its target to seven', () => {
  assert.throws(() => resolveCompletionRule({
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN
  }), /COMPLETION_TARGET_COUNT_POSITIVE_INTEGER_REQUIRED/);
  assert.throws(() => resolveCompletionRule({
    completionTargetCount: 0,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN
  }), /COMPLETION_TARGET_COUNT_POSITIVE_INTEGER_REQUIRED/);
  assert.throws(() => resolveCompletionRule({
    completionTargetCount: 7,
    completionConsequence: 'WIN_OR_GATE_MAYBE'
  }), /COMPLETION_CONSEQUENCE_REQUIRED/);
});

test('completion projection requires a caller-authoritative non-negative count', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 4,
    completionConsequence: COMPLETION_CONSEQUENCE.DIRECT_COMPLETION_WIN
  });

  assert.throws(() => projectCompletionRule({ resolvedRule: rule }), /AUTHORITATIVE_COUNT_NON_NEGATIVE_INTEGER_REQUIRED/);
  assert.throws(() => projectCompletionRule({ authoritativeCount: -1, resolvedRule: rule }), /AUTHORITATIVE_COUNT_NON_NEGATIVE_INTEGER_REQUIRED/);
});

test('resolved rule and projection are immutable and carry no winner/result/GOAL_REACHED authority', () => {
  const rule = resolveCompletionRule({
    completionTargetCount: 6,
    completionConsequence: COMPLETION_CONSEQUENCE.CONNECT_GOAL_PATH
  });
  const projection = projectCompletionRule({ authoritativeCount: 6, resolvedRule: rule });

  assert.equal(Object.isFrozen(rule), true);
  assert.equal(Object.isFrozen(projection), true);
  for (const forbidden of [
    'winnerIds', 'winnerId', 'result', 'finalizedResult', 'goalReached',
    'ranking', 'honey', 'pursuit'
  ]) {
    assert.equal(Object.hasOwn(projection, forbidden), false, forbidden);
  }

  assert.deepEqual(BATTLE_COMPLETION_RULE, {
    schema: 'GAMEROAD_BATTLE_COMPLETION_RULE_V1',
    countAuthority: 'caller_owned_authoritative_count',
    targetPolicy: 'resolved_profile_positive_integer_no_implicit_default',
    consequencePolicy: 'resolved_separately_from_target_count',
    directWinConsequence: 'DIRECT_COMPLETION_WIN',
    goalGateConsequence: 'CONNECT_GOAL_PATH',
    goalGateTerminal: false,
    goalReachedInference: false,
    winnerInference: false,
    resultEmission: false,
    topologyMutation: false
  });
});

test('non-new-base preserves a true legacy seven-road terminal predicate', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: false,
    legacySevenRoadWin: true
  });

  assert.equal(projection.forwardLegacyWin, true);
  assert.equal(projection.suppressedForNewBase, false);
  assert.equal(shouldForwardLegacySevenRoadWin({
    rulesetIsNewBase: false,
    legacySevenRoadWin: true
  }), true);
});

test('non-new-base preserves a false legacy predicate', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: false,
    legacySevenRoadWin: false
  });

  assert.equal(projection.forwardLegacyWin, false);
  assert.equal(projection.suppressedForNewBase, false);
});

test('new base compatibility gate still suppresses the old hardcoded seven-terminal route', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: true
  });

  assert.equal(projection.forwardLegacyWin, false);
  assert.equal(projection.suppressedForNewBase, true);
});

test('new base compatibility gate stays non-terminal when the legacy predicate is false', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: false
  });

  assert.equal(projection.forwardLegacyWin, false);
  assert.equal(projection.suppressedForNewBase, false);
});

test('legacy gate fails closed unless both caller-authoritative booleans are explicit', () => {
  assert.throws(() => projectLegacySevenRoadWinGate(), /RULESET_IS_NEW_BASE_REQUIRED/);
  assert.throws(() => projectLegacySevenRoadWinGate({
    rulesetIsNewBase: 'true',
    legacySevenRoadWin: true
  }), /RULESET_IS_NEW_BASE_REQUIRED/);
  assert.throws(() => projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true
  }), /LEGACY_SEVEN_ROAD_WIN_REQUIRED/);
  assert.throws(() => projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: 1
  }), /LEGACY_SEVEN_ROAD_WIN_REQUIRED/);
});

test('legacy projection stays immutable and carries no winner/result/goal authority', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: true
  });

  assert.equal(Object.isFrozen(projection), true);
  for (const forbidden of [
    'winnerIds', 'winnerId', 'result', 'finalizedResult', 'goal', 'goalOpen',
    'ranking', 'roadCount', 'honey', 'pursuit'
  ]) {
    assert.equal(Object.hasOwn(projection, forbidden), false, forbidden);
  }

  assert.deepEqual(NEW_BASE_LEGACY_SEVEN_WIN_GATE, {
    schema: 'GAMEROAD_NEW_BASE_LEGACY_SEVEN_WIN_GATE_V1',
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
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_LEGACY_SEVEN_WIN_GATE,
  projectLegacySevenRoadWinGate,
  shouldForwardLegacySevenRoadWin
} from '../browser/new-base-legacy-seven-win-gate-core.mjs';

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

test('new base suppresses legacy seven-road terminal even when it fired', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: true
  });

  assert.equal(projection.forwardLegacyWin, false);
  assert.equal(projection.suppressedForNewBase, true);
});

test('new base stays non-terminal when the legacy predicate is false', () => {
  const projection = projectLegacySevenRoadWinGate({
    rulesetIsNewBase: true,
    legacySevenRoadWin: false
  });

  assert.equal(projection.forwardLegacyWin, false);
  assert.equal(projection.suppressedForNewBase, false);
});

test('the gate fails closed unless both caller-authoritative booleans are explicit', () => {
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

test('projection is immutable and carries no winner/result/goal authority', () => {
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

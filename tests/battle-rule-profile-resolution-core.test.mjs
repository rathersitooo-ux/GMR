import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT,
  buildBattleRuleFingerprint,
  preflightBattleRuleProfile,
  projectBattleRuleAffordances,
  resolveBattleRuleProfile,
} from '../browser/battle-rule-profile-resolution-core.mjs';

function baseInput(overrides = {}) {
  return {
    authorityRef: 'RULE_CONTEXT:BASIC:CURRENT',
    rulesVersion: 'battle-rules-2026-09-09',
    mode: { id: 'FFA4' },
    ruleset: { id: 'BASIC' },
    topology: { sharedField: true, shieldLinkedLanesPerPlayer: 3 },
    progression: {
      threshold: 7,
      onComplete: 'CONNECT_GOAL_PATH',
      terminalEvent: 'GOAL_REACHED',
    },
    modules: {
      dice: { enabled: false },
      roulette: { enabled: false },
    },
    parameters: {},
    capabilities: ['goalTopology', 'goalPathProducer', 'goalReachedProducer'],
    unresolved: [],
    lineage: [],
    ...overrides,
  };
}

test('changing progression threshold does not change completion consequence or terminal event', () => {
  const seven = resolveBattleRuleProfile(baseInput());
  const nine = resolveBattleRuleProfile(baseInput({
    progression: {
      threshold: 9,
      onComplete: 'CONNECT_GOAL_PATH',
      terminalEvent: 'GOAL_REACHED',
    },
  }));

  assert.equal(seven.progression.threshold, 7);
  assert.equal(nine.progression.threshold, 9);
  assert.equal(seven.progression.onComplete, 'CONNECT_GOAL_PATH');
  assert.equal(nine.progression.onComplete, 'CONNECT_GOAL_PATH');
  assert.equal(seven.eventContract.terminal, 'GOAL_REACHED');
  assert.equal(nine.eventContract.terminal, 'GOAL_REACHED');
  assert.notEqual(seven.fingerprint, nine.fingerprint);
});

test('NO_DEFEAT cannot be disabled by a ruleset profile', () => {
  assert.throws(
    () => resolveBattleRuleProfile(baseInput({ invariants: { noDefeat: false } })),
    /NO_DEFEAT is an invariant/,
  );

  const profile = resolveBattleRuleProfile(baseInput({ invariants: { noDefeat: true } }));
  assert.equal(profile.invariants.noDefeat, true);
});

test('GOAL path composition fails before match when required capabilities are absent', () => {
  const profile = resolveBattleRuleProfile(baseInput({ capabilities: [] }));
  const preflight = preflightBattleRuleProfile(profile);

  assert.equal(preflight.status, 'INVALID_COMPOSITION');
  assert.equal(preflight.matchStartAllowed, false);
  assert.deepEqual(preflight.errors, [{
    code: 'MISSING_REQUIRED_CAPABILITY',
    subject: 'progression:CONNECT_GOAL_PATH',
    missing: ['goalTopology', 'goalPathProducer', 'goalReachedProducer'],
  }]);
  assert.equal(profile.progression.onComplete, 'CONNECT_GOAL_PATH');
  assert.equal(profile.eventContract.terminal, 'GOAL_REACHED');
});

test('Basic explicitly disabled dice and roulette produce no optional affordance', () => {
  const profile = resolveBattleRuleProfile(baseInput());
  const preflight = preflightBattleRuleProfile(profile);
  const affordances = projectBattleRuleAffordances(profile, preflight);

  assert.equal(preflight.status, 'READY');
  assert.deepEqual(affordances, ['progression.goalGate']);
  assert.equal(affordances.includes('dice.optionalMovement'), false);
  assert.equal(affordances.includes('roulette.optionalInput'), false);
});

test('enabled dice requires the existing movement-budget consumer', () => {
  const missing = resolveBattleRuleProfile(baseInput({
    modules: {
      dice: {
        enabled: true,
        requiredForMatch: true,
        affordances: ['dice.optionalMovement'],
      },
      roulette: { enabled: false },
    },
  }));
  assert.deepEqual(preflightBattleRuleProfile(missing).errors, [{
    code: 'MISSING_REQUIRED_CAPABILITY',
    subject: 'module:dice',
    missing: ['movementBudgetConsumer'],
  }]);

  const ready = resolveBattleRuleProfile(baseInput({
    modules: {
      dice: {
        enabled: true,
        requiredForMatch: true,
        affordances: ['dice.optionalMovement'],
      },
      roulette: { enabled: false },
    },
    capabilities: [
      'goalTopology',
      'goalPathProducer',
      'goalReachedProducer',
      'movementBudgetConsumer',
    ],
  }));
  const preflight = preflightBattleRuleProfile(ready);
  assert.equal(preflight.status, 'READY');
  assert.equal(projectBattleRuleAffordances(ready, preflight).includes('dice.optionalMovement'), true);
});

test('enabled roulette requires candidate projection and existing card commit authority', () => {
  const missing = resolveBattleRuleProfile(baseInput({
    modules: {
      dice: { enabled: false },
      roulette: {
        enabled: true,
        requiredForMatch: true,
        affordances: ['roulette.optionalInput'],
      },
    },
  }));
  assert.deepEqual(preflightBattleRuleProfile(missing).errors, [{
    code: 'MISSING_REQUIRED_CAPABILITY',
    subject: 'module:roulette',
    missing: ['cardCommitAuthority', 'playableCandidateProjection'],
  }]);

  const ready = resolveBattleRuleProfile(baseInput({
    modules: {
      dice: { enabled: false },
      roulette: {
        enabled: true,
        requiredForMatch: true,
        affordances: ['roulette.optionalInput'],
      },
    },
    capabilities: [
      'goalTopology',
      'goalPathProducer',
      'goalReachedProducer',
      'playableCandidateProjection',
      'cardCommitAuthority',
    ],
  }));
  assert.equal(preflightBattleRuleProfile(ready).status, 'READY');
  assert.equal(projectBattleRuleAffordances(ready).includes('roulette.optionalInput'), true);
});

test('an unresolved optional atom blocks only its dependent module', () => {
  const profile = resolveBattleRuleProfile(baseInput({
    modules: {
      dice: { enabled: false },
      roulette: { enabled: false },
      manaRecovery: {
        enabled: true,
        requiredForMatch: false,
        affordances: ['mana.turnStartRecovery'],
      },
    },
    unresolved: [{
      atom: 'turnStartManaRecoveryAmount',
      blocks: ['manaRecovery'],
      reason: 'VALUE_NOT_ADJUDICATED',
    }],
  }));
  const preflight = preflightBattleRuleProfile(profile);

  assert.equal(preflight.status, 'READY_WITH_LOCAL_BLOCKS');
  assert.equal(preflight.matchStartAllowed, true);
  assert.deepEqual(preflight.blockedModules, ['manaRecovery']);
  assert.deepEqual(preflight.errors, []);
  assert.deepEqual(projectBattleRuleAffordances(profile, preflight), ['progression.goalGate']);
});

test('the same semantic profile has a stable fingerprint regardless of set ordering', () => {
  const left = resolveBattleRuleProfile(baseInput({
    capabilities: ['goalReachedProducer', 'goalTopology', 'goalPathProducer'],
  }));
  const right = resolveBattleRuleProfile(baseInput({
    capabilities: ['goalPathProducer', 'goalReachedProducer', 'goalTopology', 'goalTopology'],
  }));

  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(buildBattleRuleFingerprint(left), left.fingerprint);
});

test('legacy lineage is retained for traceability but never becomes fallback semantics', () => {
  const profile = resolveBattleRuleProfile(baseInput({
    lineage: [{
      origin: 'LEGACY_BATTLE',
      currentStatus: 'SUPERSEDED',
      threshold: 7,
      onComplete: 'TERMINAL_WIN',
      reusableMechanism: 'straight-count-census',
    }],
  }));

  assert.equal(profile.lineage[0].onComplete, 'TERMINAL_WIN');
  assert.equal(profile.progression.onComplete, 'CONNECT_GOAL_PATH');
  assert.equal(profile.eventContract.terminal, 'GOAL_REACHED');
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.legacyLineageIsFallbackAuthority, false);
});

test('progression completion, GOAL path connection, and GOAL reach remain distinct events', () => {
  const profile = resolveBattleRuleProfile(baseInput());
  const events = Object.values(profile.eventContract);

  assert.deepEqual(events, ['PROGRESSION_COMPLETED', 'GOAL_PATH_CONNECTED', 'GOAL_REACHED']);
  assert.equal(new Set(events).size, 3);
  assert.throws(
    () => resolveBattleRuleProfile(baseInput({
      progression: {
        threshold: 7,
        onComplete: 'CONNECT_GOAL_PATH',
        terminalEvent: 'PROGRESSION_COMPLETED',
      },
    })),
    /completion and terminal event must remain distinct/,
  );
});

test('2v2 composition requires team-aware target projection without inventing targeting', () => {
  const profile = resolveBattleRuleProfile(baseInput({ mode: { id: '2V2' } }));
  const preflight = preflightBattleRuleProfile(profile);

  assert.deepEqual(preflight.errors, [{
    code: 'MISSING_REQUIRED_CAPABILITY',
    subject: 'mode:2V2',
    missing: ['teamAwareTargetProjection'],
  }]);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.computesTargets, false);
});

test('resolved profiles are detached and deeply frozen', () => {
  const input = baseInput({
    topology: { sharedField: true, nested: { laneCount: 12 } },
  });
  const profile = resolveBattleRuleProfile(input);

  input.topology.nested.laneCount = 99;
  assert.equal(profile.topology.nested.laneCount, 12);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.topology.nested), true);
  assert.throws(() => {
    profile.progression.threshold = 99;
  }, TypeError);
});

test('rule-profile core owns no gameplay, target, movement, save, network, or UI writes', () => {
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.progressionThresholdIndependentFromConsequence, true);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.progressionCompletionIndependentFromTerminal, true);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.unresolvedFailsClosedLocally, true);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.resolvesGameplayLegality, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.computesTargets, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.computesMovement, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.computesWinner, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.uiWrite, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.saveWrite, false);
  assert.equal(BATTLE_RULE_PROFILE_RESOLUTION_CONTRACT.networkWrite, false);
});

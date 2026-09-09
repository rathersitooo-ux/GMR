import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_RULE_COVERAGE_CONTRACT,
  assessBattleRuleAtom,
  assessBattleRuleCoverage,
} from '../browser/battle-rule-coverage-chain-core.mjs';

function atom(overrides = {}) {
  return {
    atomId: 'example.atom',
    concept: {
      status: 'KNOWN',
      authorityRefs: ['CURRENT:example'],
    },
    activation: {
      state: 'ENABLED',
      profileRefs: ['PROFILE:BASIC'],
    },
    preservation: {
      predecessorPresent: false,
      disposition: 'NOT_PREDECESSOR',
    },
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'tests'],
      evidence: {
        authority: ['CURRENT:example'],
        producer: ['CODE:producer'],
        consumer: ['CODE:consumer'],
        playerFacing: ['UI:surface'],
        tests: ['TEST:focused'],
      },
    },
    ...overrides,
  };
}

test('a fully evidenced enabled atom is complete', () => {
  const result = assessBattleRuleAtom(atom());
  assert.equal(result.concept.status, 'KNOWN');
  assert.equal(result.implementation.status, 'IMPLEMENTED');
  assert.equal(result.activation.state, 'ENABLED');
  assert.equal(result.overallStatus, 'COMPLETE');
  assert.deepEqual(result.issues, []);
});

test('HATE-like preserved behavior with producer but missing HUD consumer is surfaced without user complaint', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'battle.hateTimer',
    preservation: {
      predecessorPresent: true,
      disposition: 'PRESERVE',
      evidenceRefs: ['PREDECESSOR:HATE'],
    },
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'reconnect', 'tests'],
      evidence: {
        authority: ['CURRENT:HATE'],
        producer: ['CODE:hateMs'],
        consumer: ['CODE:forcedDelegation'],
        reconnect: ['CODE:hateReconnect'],
        tests: ['TEST:hateExactlyOnce'],
      },
    },
  }));

  assert.equal(result.implementation.status, 'DISCONNECTED');
  assert.deepEqual(result.implementation.missingStages, ['playerFacing']);
  assert.equal(result.overallStatus, 'PRESERVATION_VIOLATION');
  assert.equal(result.issues.some((entry) => entry.code === 'PRESERVED_FEATURE_IMPLEMENTATION_GAP'), true);
});

test('an unrecovered timer meaning stays concept-blocked instead of receiving a guessed implementation', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'battle.unknownTimer',
    concept: {
      status: 'UNRESOLVED',
      authorityRefs: ['PREDECESSOR:TIMER_VISIBLE'],
      unresolvedAtoms: ['timerMeaning', 'startStopResetPolicy'],
    },
    activation: {
      state: 'NO_PROFILE',
      profileRefs: [],
      expectedInAtLeastOneProfile: false,
    },
    preservation: {
      predecessorPresent: true,
      disposition: 'UNASSESSED',
    },
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'tests'],
      evidence: {
        authority: ['PREDECESSOR:TIMER_VISIBLE'],
      },
    },
  }));

  assert.equal(result.implementationActionAllowed, false);
  assert.equal(result.issues.some((entry) => entry.code === 'CONCEPT_UNRESOLVED'), true);
  assert.equal(result.issues.some((entry) => entry.code === 'PREDECESSOR_DISPOSITION_UNASSESSED'), true);
  assert.equal(result.overallStatus, 'PRESERVATION_VIOLATION');
});

test('merged GOAL-arrival core without player-facing mount is implementation-disconnected, not complete', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'battle.goalArrival',
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'tests'],
      evidence: {
        authority: ['CURRENT:GOAL_REACHED'],
        producer: ['CODE:goalArrivalCore'],
        consumer: ['CODE:goalArrivalAdapter'],
        tests: ['TEST:goalArrivalCore'],
      },
    },
  }));

  assert.equal(result.implementation.status, 'DISCONNECTED');
  assert.equal(result.overallStatus, 'IMPLEMENTATION_GAP');
  assert.deepEqual(result.implementation.missingStages, ['playerFacing']);
});

test('Basic dice can be intentionally disabled without becoming an omission', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'battle.optional.dice',
    activation: {
      state: 'INTENTIONALLY_DISABLED',
      profileRefs: ['PROFILE:BASIC'],
    },
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'tests'],
      evidence: {
        authority: ['CURRENT:DICE_OPTIONAL'],
        producer: ['CODE:diceCore'],
        tests: ['TEST:diceCore'],
      },
    },
  }));

  assert.equal(result.implementation.status, 'DISCONNECTED');
  assert.equal(result.overallStatus, 'INTENTIONALLY_INACTIVE');
  assert.equal(result.issues.some((entry) => entry.axis === 'implementation'), false);
  assert.equal(result.issues.some((entry) => entry.axis === 'activation'), false);
});

test('an enabled optional module with code but no live consumer becomes an activation-visible implementation gap', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'battle.optional.roulette',
    activation: {
      state: 'ENABLED',
      profileRefs: ['PROFILE:EVENT-ROULETTE'],
    },
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'playerFacing', 'tests'],
      evidence: {
        authority: ['CURRENT:ROULETTE_OPTIONAL'],
        producer: ['CODE:rouletteCore'],
        tests: ['TEST:rouletteCore'],
      },
    },
  }));

  assert.equal(result.implementation.status, 'DISCONNECTED');
  assert.equal(result.overallStatus, 'IMPLEMENTATION_GAP');
  assert.equal(result.issues.some((entry) => entry.code === 'ENABLED_WITH_IMPLEMENTATION_GAP'), true);
});

test('legacy seven-is-terminal semantics can be explicitly replaced without being revived as a missing feature', () => {
  const result = assessBattleRuleAtom({
    atomId: 'legacy.progression.sevenTerminalWin',
    concept: {
      status: 'KNOWN',
      authorityRefs: ['HISTORY:SEVEN_TERMINAL'],
    },
    activation: {
      state: 'NOT_APPLICABLE',
      profileRefs: [],
    },
    preservation: {
      predecessorPresent: true,
      disposition: 'EXPLICIT_REPLACEMENT',
      evidenceRefs: ['CURRENT:PROGRESSION_CONNECTS_GOAL_PATH'],
      successorAtomIds: ['battle.progression.threshold', 'battle.progression.onComplete'],
    },
    chain: {
      requiredStages: [],
      evidence: {},
    },
  });

  assert.equal(result.implementation.status, 'NOT_REQUIRED');
  assert.equal(result.issues.length, 0);
  assert.equal(result.overallStatus, 'INTENTIONALLY_INACTIVE');
});

test('a predecessor feature cannot disappear merely because no disposition was recorded', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'predecessor.visibleFeature',
    preservation: {
      predecessorPresent: true,
      disposition: 'UNASSESSED',
    },
  }));

  assert.equal(result.overallStatus, 'PRESERVATION_VIOLATION');
  assert.equal(result.issues.some((entry) => entry.code === 'PREDECESSOR_DISPOSITION_UNASSESSED'), true);
});

test('explicit replacement requires both evidence and a successor identity', () => {
  const noEvidence = assessBattleRuleAtom(atom({
    atomId: 'old.feature.noEvidence',
    preservation: {
      predecessorPresent: true,
      disposition: 'EXPLICIT_REPLACEMENT',
      successorAtomIds: ['new.feature'],
    },
  }));
  assert.equal(noEvidence.issues.some((entry) => entry.code === 'PREDECESSOR_DISPOSITION_UNEVIDENCED'), true);

  const noSuccessor = assessBattleRuleAtom(atom({
    atomId: 'old.feature.noSuccessor',
    preservation: {
      predecessorPresent: true,
      disposition: 'EXPLICIT_REPLACEMENT',
      evidenceRefs: ['CURRENT:replacement-ruling'],
    },
  }));
  assert.equal(noSuccessor.issues.some((entry) => entry.code === 'PREDECESSOR_REPLACEMENT_SUCCESSOR_MISSING'), true);
});

test('missing implementation is distinct from disconnected implementation', () => {
  const missing = assessBattleRuleAtom(atom({
    atomId: 'feature.missing',
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'tests'],
      evidence: { authority: ['CURRENT:x'] },
    },
  }));
  const disconnected = assessBattleRuleAtom(atom({
    atomId: 'feature.disconnected',
    chain: {
      requiredStages: ['authority', 'producer', 'consumer', 'tests'],
      evidence: {
        authority: ['CURRENT:x'],
        producer: ['CODE:x'],
        tests: ['TEST:x'],
      },
    },
  }));

  assert.equal(missing.implementation.status, 'MISSING');
  assert.equal(disconnected.implementation.status, 'DISCONNECTED');
});

test('a known feature expected somewhere but absent from every profile is an activation gap', () => {
  const result = assessBattleRuleAtom(atom({
    atomId: 'feature.noProfile',
    activation: {
      state: 'NO_PROFILE',
      profileRefs: [],
      expectedInAtLeastOneProfile: true,
    },
  }));

  assert.equal(result.implementation.status, 'IMPLEMENTED');
  assert.equal(result.overallStatus, 'ACTIVATION_GAP');
  assert.equal(result.issues.some((entry) => entry.code === 'ACTIVATION_PROFILE_MISSING'), true);
});

test('coverage census reports only unexplained holes and keeps intended-disabled atoms out', () => {
  const coverage = assessBattleRuleCoverage([
    atom({ atomId: 'complete' }),
    atom({
      atomId: 'disabled-dice',
      activation: { state: 'INTENTIONALLY_DISABLED', profileRefs: ['PROFILE:BASIC'] },
      chain: { requiredStages: ['authority', 'producer', 'consumer'], evidence: { authority: ['A'], producer: ['P'] } },
    }),
    atom({
      atomId: 'missing-live-ui',
      chain: {
        requiredStages: ['authority', 'producer', 'consumer', 'playerFacing'],
        evidence: { authority: ['A'], producer: ['P'], consumer: ['C'] },
      },
    }),
  ]);

  assert.equal(coverage.complete, false);
  assert.deepEqual(coverage.holes.map((entry) => entry.atomId), ['missing-live-ui']);
  assert.equal(coverage.counts.COMPLETE, 1);
  assert.equal(coverage.counts.INTENTIONALLY_INACTIVE, 1);
  assert.equal(coverage.counts.IMPLEMENTATION_GAP, 1);
});

test('duplicate atom IDs fail closed so one concept cannot silently shadow another', () => {
  assert.throws(
    () => assessBattleRuleCoverage([atom({ atomId: 'dup' }), atom({ atomId: 'dup' })]),
    /duplicate atomId: dup/,
  );
});

test('diagnostic contract has no authority or mutation role', () => {
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.conceptImplementationActivationIndependent, true);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.predecessorSilenceIsNotRemovalAuthority, true);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.intentionallyDisabledOptionalRuleIsNotAnOmission, true);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.codeExistenceAloneMeansImplemented, false);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.unresolvedConceptAllowsImplementationGuess, false);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.diagnosticWritesGameplay, false);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.diagnosticWritesRules, false);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.diagnosticWritesUi, false);
  assert.equal(BATTLE_RULE_COVERAGE_CONTRACT.diagnosticCreatesSecondTracker, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { planBattleConveyor } from '../browser/battle-conveyor-presentation-core.mjs';
import {
  BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT,
  auditBattleFinalResolutionEmphasis,
  projectBattleFinalResolutionEmphasis,
} from '../browser/battle-final-resolution-emphasis-core.mjs';

function settlePlan(options = {}) {
  const conveyor = planBattleConveyor([
    {
      accepted: true,
      eventId: 'attack-1',
      kind: 'attack',
      publicData: { sourceId: 'P1', targetIds: ['P3'] },
    },
    {
      accepted: true,
      eventId: 'settle-1',
      kind: 'settle',
      publicData: { acceptedResolutionRef: 'resolution:1' },
    },
  ], options);
  return conveyor.plans.find((plan) => plan.kind === 'settle');
}

test('projects final accepted settle as high-priority presentation without changing semantics', () => {
  const plan = settlePlan();
  const result = projectBattleFinalResolutionEmphasis({ settlePlan: plan });

  assert.equal(result.schema, 'gameroad.battle-final-resolution-emphasis.v1');
  assert.equal(result.presentationOnly, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.winnerCalculation, false);
  assert.equal(result.resultCalculation, false);
  assert.equal(result.targetCalculation, false);
  assert.equal(result.effectCalculation, false);
  assert.equal(result.cardMovementCalculation, false);
  assert.equal(result.timingCalculation, false);

  assert.equal(result.eventId, plan.eventId);
  assert.equal(result.sourceKind, 'settle');
  assert.equal(result.sourceTransition, plan.transition);
  assert.deepEqual(result.sourceStage, plan.stage);
  assert.equal(result.timelineWindow.startMs, plan.timing.start);
  assert.equal(result.timelineWindow.endMs, plan.timing.recoveryEnd);
  assert.equal(result.timelineWindow.durationMs, plan.timing.recoveryEnd - plan.timing.start);
  assert.equal(result.timelineWindow.authority, 'existing_battle_conveyor_timing');

  assert.equal(result.visualHierarchy.priority, 'high');
  assert.equal(result.visualHierarchy.foregroundIntent, 'FINAL_RESOLUTION_FOCUS');
  assert.equal(result.visualHierarchy.backgroundIntent, 'SUBDUE_NON_RESULT_INFORMATION');
  assert.equal(result.visualHierarchy.boardReturnIntent, 'HANDOFF_TO_EXISTING_AFTERMATH');
  assert.equal(result.visualHierarchy.extraHoldRequested, false);
  assert.equal(result.visualHierarchy.formalStrengthLocked, false);
  assert.equal(result.motion.mode, 'presentation_allowed');
  assert.equal(result.humanReviewRequiredForFinalStrength, true);
  assert.equal(auditBattleFinalResolutionEmphasis(result).ok, true);
});

test('reduced-motion and low-performance modes preserve the same accepted event and timing', () => {
  const plan = settlePlan();

  for (const flags of [{ reducedMotion: true }, { lowPerf: true }]) {
    const result = projectBattleFinalResolutionEmphasis({
      settlePlan: plan,
      ...flags,
    });
    assert.equal(result.eventId, plan.eventId);
    assert.equal(result.timelineWindow.startMs, plan.timing.start);
    assert.equal(result.timelineWindow.endMs, plan.timing.recoveryEnd);
    assert.equal(result.motion.mode, 'static_only');
    assert.equal(result.motion.emphasisIntent, 'STATIC_FINAL_RESOLUTION_FOCUS');
    assert.equal(result.motion.transitionIntent, 'STATIC_AFTERMATH_HANDOFF');
    assert.equal(result.visualHierarchy.extraHoldRequested, false);
    assert.equal(auditBattleFinalResolutionEmphasis(result).ok, true);
  }
});

test('also respects suppression already carried by the existing conveyor plan', () => {
  const reducedPlan = settlePlan({ reducedMotion: true });
  const lowPerfPlan = settlePlan({ lowPerf: true });

  assert.equal(
    projectBattleFinalResolutionEmphasis({ settlePlan: reducedPlan }).motion.mode,
    'static_only',
  );
  assert.equal(
    projectBattleFinalResolutionEmphasis({ settlePlan: lowPerfPlan }).motion.mode,
    'static_only',
  );
});

test('fails closed for non-settle and non-authoritative plans', () => {
  const attack = planBattleConveyor([
    {
      accepted: true,
      eventId: 'attack-only',
      kind: 'attack',
      publicData: { sourceId: 'P1', targetIds: ['P2'] },
    },
  ]).plans[0];

  assert.throws(
    () => projectBattleFinalResolutionEmphasis({ settlePlan: attack }),
    /SETTLE_REQUIRED/,
  );

  const valid = settlePlan();
  assert.throws(
    () => projectBattleFinalResolutionEmphasis({
      settlePlan: { ...valid, authorityBoundary: 'wrong' },
    }),
    /SOURCE_INVALID/,
  );
});

test('contract keeps result meaning, timing extension, and final strength outside this slice', () => {
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.authority, 'NONE_PRESENTATION_ONLY');
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.acceptedSourceKind, 'settle');
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.timingAuthority, 'EXISTING_BATTLE_CONVEYOR');
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.resultAuthority, 'NONE');
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.winnerAuthority, 'NONE');
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.extraHoldAuthority, 'NONE');
  assert.equal(
    BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.formalVisualStrengthAuthority,
    'HUMAN_REVIEW_LATER',
  );
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.liveMountOwnedHere, false);
  assert.equal(BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT.formalVisualOwnedHere, false);
});

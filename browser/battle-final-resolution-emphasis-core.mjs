const SCHEMA = 'gameroad.battle-final-resolution-emphasis.v1';
const SOURCE_SCHEMA = 'gameroad.battle-conveyor-presentation.v2';

function fail(code) {
  throw new TypeError(code);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

function finiteNumber(value, code) {
  if (!Number.isFinite(value)) fail(code);
  return Number(value);
}

function normalizeSettlePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    fail('BATTLE_FINAL_RESOLUTION_PLAN_REQUIRED');
  }
  if (
    plan.schema !== SOURCE_SCHEMA ||
    plan.presentationOnly !== true ||
    plan.authorityBoundary !== 'accepted_public_event_only'
  ) {
    fail('BATTLE_FINAL_RESOLUTION_SOURCE_INVALID');
  }
  if (plan.kind !== 'settle') fail('BATTLE_FINAL_RESOLUTION_SETTLE_REQUIRED');

  const eventId = requiredString(plan.eventId, 'BATTLE_FINAL_RESOLUTION_EVENT_ID_INVALID');
  const timing = plan.timing;
  if (!timing || typeof timing !== 'object' || Array.isArray(timing)) {
    fail('BATTLE_FINAL_RESOLUTION_TIMING_REQUIRED');
  }
  const startMs = finiteNumber(timing.start, 'BATTLE_FINAL_RESOLUTION_START_INVALID');
  const recoveryEndMs = finiteNumber(timing.recoveryEnd, 'BATTLE_FINAL_RESOLUTION_END_INVALID');
  if (startMs < 0 || recoveryEndMs < startMs) {
    fail('BATTLE_FINAL_RESOLUTION_TIMING_ORDER_INVALID');
  }

  return freeze({
    eventId,
    transition: requiredString(plan.transition, 'BATTLE_FINAL_RESOLUTION_TRANSITION_INVALID'),
    stage: plan.stage && typeof plan.stage === 'object' && !Array.isArray(plan.stage)
      ? {
          left: typeof plan.stage.left === 'string' ? plan.stage.left : null,
          right: typeof plan.stage.right === 'string' ? plan.stage.right : null,
        }
      : null,
    startMs,
    recoveryEndMs,
    durationMs: recoveryEndMs - startMs,
    reducedMotion: plan.reducedMotion === true,
    lowPerf: plan.lowPerf === true,
  });
}

export function projectBattleFinalResolutionEmphasis({
  settlePlan,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const plan = normalizeSettlePlan(settlePlan);
  const motionSuppressed =
    reducedMotion === true ||
    lowPerf === true ||
    plan.reducedMotion === true ||
    plan.lowPerf === true;

  return freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    winnerCalculation: false,
    resultCalculation: false,
    targetCalculation: false,
    effectCalculation: false,
    cardMovementCalculation: false,
    timingCalculation: false,
    eventId: plan.eventId,
    semanticRole: 'accepted_final_resolution_emphasis',
    sourcePlanSchema: SOURCE_SCHEMA,
    sourceKind: 'settle',
    sourceTransition: plan.transition,
    sourceStage: plan.stage,
    timelineWindow: {
      startMs: plan.startMs,
      endMs: plan.recoveryEndMs,
      durationMs: plan.durationMs,
      authority: 'existing_battle_conveyor_timing',
    },
    visualHierarchy: {
      priority: 'high',
      foregroundIntent: 'FINAL_RESOLUTION_FOCUS',
      backgroundIntent: 'SUBDUE_NON_RESULT_INFORMATION',
      boardReturnIntent: 'HANDOFF_TO_EXISTING_AFTERMATH',
      extraHoldRequested: false,
      formalStrengthLocked: false,
    },
    motion: {
      mode: motionSuppressed ? 'static_only' : 'presentation_allowed',
      emphasisIntent: motionSuppressed ? 'STATIC_FINAL_RESOLUTION_FOCUS' : 'FINAL_RESOLUTION_FOCUS',
      transitionIntent: motionSuppressed ? 'STATIC_AFTERMATH_HANDOFF' : 'CLEAN_AFTERMATH_HANDOFF',
    },
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    humanReviewRequiredForFinalStrength: true,
  });
}

export function auditBattleFinalResolutionEmphasis(model) {
  const defects = [];
  if (!model || model.schema !== SCHEMA) defects.push('SCHEMA');
  if (
    model?.presentationOnly !== true ||
    model?.gameplayAuthority !== false ||
    model?.gameStateWrite !== false
  ) {
    defects.push('AUTHORITY');
  }
  if (
    model?.winnerCalculation !== false ||
    model?.resultCalculation !== false ||
    model?.targetCalculation !== false ||
    model?.effectCalculation !== false ||
    model?.cardMovementCalculation !== false ||
    model?.timingCalculation !== false
  ) {
    defects.push('RECALCULATION');
  }
  if (model?.sourceKind !== 'settle') defects.push('SOURCE_KIND');
  if (model?.timelineWindow?.authority !== 'existing_battle_conveyor_timing') defects.push('TIMING_AUTHORITY');
  if (model?.visualHierarchy?.extraHoldRequested !== false) defects.push('EXTRA_HOLD');
  if (model?.visualHierarchy?.formalStrengthLocked !== false) defects.push('FORMAL_LOCK');
  if (!['presentation_allowed', 'static_only'].includes(model?.motion?.mode)) defects.push('MOTION');
  if (model?.humanReviewRequiredForFinalStrength !== true) defects.push('HUMAN_REVIEW');
  return freeze({ ok: defects.length === 0, defects });
}

export const BATTLE_FINAL_RESOLUTION_EMPHASIS_CONTRACT = freeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  sourcePlanSchema: SOURCE_SCHEMA,
  acceptedSourceKind: 'settle',
  timingAuthority: 'EXISTING_BATTLE_CONVEYOR',
  resultAuthority: 'NONE',
  winnerAuthority: 'NONE',
  targetAuthority: 'NONE',
  effectAuthority: 'NONE',
  cardMovementAuthority: 'NONE',
  extraHoldAuthority: 'NONE',
  formalVisualStrengthAuthority: 'HUMAN_REVIEW_LATER',
  gameplayStateWrite: false,
  liveMountOwnedHere: false,
  formalVisualOwnedHere: false,
});

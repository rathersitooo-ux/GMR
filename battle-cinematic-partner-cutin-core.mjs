const SCHEMA = 'gameroad.battle-cinematic-partner-cutin.v1';
const SOURCE_SCHEMA = 'gameroad.battle-conveyor-presentation.v2';
const REQUIRED_TRANSITION = 'PARTNER_CUTIN_LEFT';

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

function optionalString(value, code) {
  if (value == null) return null;
  return requiredString(value, code);
}

function finiteNumber(value, code) {
  if (!Number.isFinite(value)) fail(code);
  return value;
}

function keyed(source, key, code) {
  if (source instanceof Map) return source.get(key);
  if (source && typeof source === 'object' && !Array.isArray(source)) return source[key];
  fail(code);
}

function normalizeActor(raw, partnerId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('BATTLE_CUTIN_ACTOR_REQUIRED');
  }
  const actorPartnerId = optionalString(raw.partnerId, 'BATTLE_CUTIN_ACTOR_PARTNER_ID_INVALID') ?? partnerId;
  if (actorPartnerId !== partnerId) fail('BATTLE_CUTIN_ACTOR_PARTNER_MISMATCH');
  return freeze({
    partnerId,
    actorRef: requiredString(raw.actorRef, 'BATTLE_CUTIN_ACTOR_REF_INVALID'),
    label: optionalString(raw.label, 'BATTLE_CUTIN_ACTOR_LABEL_INVALID'),
    visualRef: optionalString(raw.visualRef, 'BATTLE_CUTIN_VISUAL_REF_INVALID'),
    identityAuthority: 'caller_supplied_existing_partner_identity'
  });
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('BATTLE_CUTIN_PLAN_INVALID');
  }
  if (raw.schema !== SOURCE_SCHEMA ||
      raw.presentationOnly !== true ||
      raw.authorityBoundary !== 'accepted_public_event_only') {
    fail('BATTLE_CUTIN_PLAN_SOURCE_INVALID');
  }
  const eventId = requiredString(raw.eventId, 'BATTLE_CUTIN_EVENT_ID_INVALID');
  const kind = requiredString(raw.kind, 'BATTLE_CUTIN_KIND_INVALID');
  if (kind !== 'partner_cutin') return null;
  const partnerId = requiredString(raw.publicData?.partnerId, 'BATTLE_CUTIN_PARTNER_ID_INVALID');
  const transition = requiredString(raw.transition, 'BATTLE_CUTIN_TRANSITION_INVALID');
  if (transition !== REQUIRED_TRANSITION) fail('BATTLE_CUTIN_TRANSITION_MISMATCH');

  const timing = raw.timing;
  if (!timing || typeof timing !== 'object' || Array.isArray(timing)) fail('BATTLE_CUTIN_TIMING_REQUIRED');
  const startMs = finiteNumber(timing.start, 'BATTLE_CUTIN_START_INVALID');
  const endMs = finiteNumber(timing.recoveryEnd, 'BATTLE_CUTIN_END_INVALID');
  if (startMs < 0 || endMs < startMs) fail('BATTLE_CUTIN_TIMING_ORDER_INVALID');

  return freeze({
    eventId,
    partnerId,
    transition,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    reducedMotion: raw.reducedMotion === true,
    lowPerf: raw.lowPerf === true
  });
}

function normalizeNextPlan(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      raw.schema !== SOURCE_SCHEMA ||
      raw.presentationOnly !== true ||
      raw.authorityBoundary !== 'accepted_public_event_only') {
    fail('BATTLE_CUTIN_NEXT_PLAN_INVALID');
  }
  const startMs = finiteNumber(raw.timing?.start, 'BATTLE_CUTIN_NEXT_START_INVALID');
  return freeze({
    eventId: requiredString(raw.eventId, 'BATTLE_CUTIN_NEXT_EVENT_INVALID'),
    kind: requiredString(raw.kind, 'BATTLE_CUTIN_NEXT_KIND_INVALID'),
    startMs
  });
}

export function projectBattlePartnerCutins({
  plans,
  actorsByPartnerId,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  if (!Array.isArray(plans)) fail('BATTLE_CUTIN_PLANS_REQUIRED');
  if (!(actorsByPartnerId instanceof Map) &&
      (!actorsByPartnerId || typeof actorsByPartnerId !== 'object' || Array.isArray(actorsByPartnerId))) {
    fail('BATTLE_CUTIN_ACTOR_SOURCE_INVALID');
  }

  const cutins = [];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = normalizePlan(plans[index]);
    if (!plan) continue;

    const actor = normalizeActor(
      keyed(actorsByPartnerId, plan.partnerId, 'BATTLE_CUTIN_ACTOR_SOURCE_INVALID'),
      plan.partnerId
    );
    const next = normalizeNextPlan(plans[index + 1] ?? null);
    if (next && next.startMs !== plan.endMs) {
      fail('BATTLE_CUTIN_RESUME_POINT_MISMATCH');
    }
    const motionSuppressed = reducedMotion === true || lowPerf === true ||
      plan.reducedMotion === true || plan.lowPerf === true;

    cutins.push(freeze({
      eventId: plan.eventId,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      actorIdentityCalculation: false,
      abilityCalculation: false,
      targetCalculation: false,
      winnerCalculation: false,
      timelineCalculation: false,
      partnerId: plan.partnerId,
      actor,
      semanticRole: 'existing_partner_cutin_event',
      sourceTransition: plan.transition,
      visualIntent: 'single_actor_cutin_insert',
      timelineWindow: {
        startMs: plan.startMs,
        endMs: plan.endMs,
        durationMs: plan.durationMs,
        source: 'existing_battle_conveyor_timing'
      },
      motion: {
        mode: motionSuppressed ? 'static_only' : 'presentation_allowed',
        entryIntent: motionSuppressed ? 'STATIC_FOCUS' : 'EXISTING_CUTIN_ENTRY',
        exitIntent: motionSuppressed ? 'STATIC_RELEASE' : 'RETURN_TO_BATTLE_TIMELINE'
      },
      resume: next
        ? {
            mode: 'NEXT_ACCEPTED_BATTLE_PLAN',
            eventId: next.eventId,
            kind: next.kind,
            resumeAtMs: next.startMs
          }
        : {
            mode: 'SEQUENCE_END',
            eventId: null,
            kind: null,
            resumeAtMs: plan.endMs
          }
    }));
  }

  return freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    actorIdentityCalculation: false,
    abilityCalculation: false,
    targetCalculation: false,
    winnerCalculation: false,
    timelineCalculation: false,
    authorityBoundary: 'existing_battle_conveyor_partner_cutin_plus_caller_partner_visual_identity_only',
    sourcePlanSchema: SOURCE_SCHEMA,
    motion: reducedMotion === true || lowPerf === true ? 'static_only' : 'presentation_allowed',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    cutins
  });
}

export function auditBattlePartnerCutins(model) {
  const defects = [];
  if (!model || model.schema !== SCHEMA) defects.push('SCHEMA');
  if (model && (model.presentationOnly !== true || model.gameplayAuthority !== false || model.gameStateWrite !== false)) {
    defects.push('AUTHORITY');
  }
  if (model && (model.actorIdentityCalculation !== false || model.abilityCalculation !== false ||
      model.targetCalculation !== false || model.winnerCalculation !== false || model.timelineCalculation !== false)) {
    defects.push('RECALCULATION');
  }
  if (!Array.isArray(model?.cutins)) defects.push('CUTINS');
  for (const cutin of model?.cutins ?? []) {
    if (cutin.semanticRole !== 'existing_partner_cutin_event') defects.push('SEMANTIC_ROLE');
    if (cutin.sourceTransition !== REQUIRED_TRANSITION) defects.push('TRANSITION');
    if (!cutin.actor?.partnerId || !cutin.actor?.actorRef || cutin.actor.partnerId !== cutin.partnerId) defects.push('ACTOR');
    if (cutin.timelineWindow?.source !== 'existing_battle_conveyor_timing') defects.push('TIMELINE_SOURCE');
    if (!['presentation_allowed', 'static_only'].includes(cutin.motion?.mode)) defects.push('MOTION');
    if (!['NEXT_ACCEPTED_BATTLE_PLAN', 'SEQUENCE_END'].includes(cutin.resume?.mode)) defects.push('RESUME');
    if (cutin.resume?.mode === 'NEXT_ACCEPTED_BATTLE_PLAN' &&
        cutin.resume.resumeAtMs !== cutin.timelineWindow.endMs) defects.push('RESUME_POINT');
  }
  return freeze({ ok: defects.length === 0, defects });
}

export const BATTLE_PARTNER_CUTIN_CONTRACT = freeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  sourcePlanSchema: SOURCE_SCHEMA,
  acceptedSourceKind: 'partner_cutin',
  acceptedSourceTransition: REQUIRED_TRANSITION,
  actorIdentityAuthority: 'CALLER_EXISTING_PARTNER_IDENTITY',
  timelineAuthority: 'EXISTING_BATTLE_CONVEYOR',
  gameplayStateWrite: false,
  liveMountOwnedHere: false,
  formalVisualOwnedHere: false
});

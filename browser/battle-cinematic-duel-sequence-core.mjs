const SCHEMA = 'gameroad.battle-cinematic-duel-sequence.v1';
const CONVEYOR_SCHEMA = 'gameroad.battle-conveyor-presentation.v2';
const DUEL_KINDS = new Set(['attack', 'ability']);
const REACTIONS = Object.freeze(['HIT', 'BLOCK', 'NULLIFIED', 'COUNTER', 'UNRESOLVED']);
const REACTION_SET = new Set(REACTIONS);

function fail(code) { throw new TypeError(code); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function req(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value.trim();
}
function opt(value, code) { return value == null ? null : req(value, code); }
function num(value, code) {
  if (!Number.isFinite(value)) fail(code);
  return value;
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants) || participants.length !== 4) fail('BATTLE_DUEL_SEQUENCE_REQUIRES_FOUR_PARTICIPANTS');
  const rows = participants.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_DUEL_SEQUENCE_PARTICIPANT_INVALID');
    return {
      id: req(raw.id, 'BATTLE_DUEL_SEQUENCE_PARTICIPANT_ID_INVALID'),
      label: opt(raw.label, 'BATTLE_DUEL_SEQUENCE_PARTICIPANT_LABEL_INVALID') || 'P' + (index + 1),
      actorRef: opt(raw.actorRef, 'BATTLE_DUEL_SEQUENCE_ACTOR_REF_INVALID'),
      team: opt(raw.team, 'BATTLE_DUEL_SEQUENCE_TEAM_INVALID')
    };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail('BATTLE_DUEL_SEQUENCE_PARTICIPANT_IDS_NOT_UNIQUE');
  return rows;
}

function keyed(source, key, code) {
  if (source instanceof Map) return source.get(key);
  if (source && typeof source === 'object' && !Array.isArray(source)) return source[key];
  fail(code);
}

function normalizeCard(raw, sourceId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_DUEL_SEQUENCE_ACTION_CARD_REQUIRED');
  const ownerId = req(raw.ownerId, 'BATTLE_DUEL_SEQUENCE_ACTION_CARD_OWNER_INVALID');
  if (ownerId !== sourceId) fail('BATTLE_DUEL_SEQUENCE_ACTION_CARD_OWNER_MISMATCH');
  let printedNumber = null;
  if (raw.printedNumber != null) {
    if (typeof raw.printedNumber === 'number' && Number.isFinite(raw.printedNumber)) printedNumber = raw.printedNumber;
    else if (typeof raw.printedNumber === 'string' && raw.printedNumber.trim()) printedNumber = raw.printedNumber.trim();
    else fail('BATTLE_DUEL_SEQUENCE_ACTION_CARD_NUMBER_INVALID');
  }
  return freeze({
    physicalCardId: req(raw.cardId, 'BATTLE_DUEL_SEQUENCE_ACTION_CARD_ID_INVALID'),
    ownerId,
    printedNumber,
    nativeSuit: opt(raw.nativeSuit, 'BATTLE_DUEL_SEQUENCE_ACTION_CARD_SUIT_INVALID'),
    artRef: opt(raw.artRef, 'BATTLE_DUEL_SEQUENCE_ACTION_CARD_ART_INVALID'),
    identityAuthority: 'caller_supplied_accepted_action_card',
    abstractReplacementAllowed: false
  });
}

function normalizePlan(raw, participantIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      raw.schema !== CONVEYOR_SCHEMA || raw.presentationOnly !== true ||
      raw.authorityBoundary !== 'accepted_public_event_only') fail('BATTLE_DUEL_SEQUENCE_PLAN_INVALID');
  const eventId = req(raw.eventId, 'BATTLE_DUEL_SEQUENCE_EVENT_ID_INVALID');
  const kind = req(raw.kind, 'BATTLE_DUEL_SEQUENCE_KIND_INVALID');
  if (!DUEL_KINDS.has(kind)) return null;
  const sourceId = req(raw.publicData && raw.publicData.sourceId, 'BATTLE_DUEL_SEQUENCE_SOURCE_INVALID');
  if (!participantIds.has(sourceId)) fail('BATTLE_DUEL_SEQUENCE_SOURCE_UNKNOWN');
  if (!Array.isArray(raw.groupTargets) || raw.groupTargets.length === 0) fail('BATTLE_DUEL_SEQUENCE_TARGETS_REQUIRED');
  const targetIds = raw.groupTargets.map(id => req(id, 'BATTLE_DUEL_SEQUENCE_TARGET_INVALID'));
  if (new Set(targetIds).size !== targetIds.length) fail('BATTLE_DUEL_SEQUENCE_TARGET_DUPLICATE');
  for (const targetId of targetIds) {
    if (!participantIds.has(targetId)) fail('BATTLE_DUEL_SEQUENCE_TARGET_UNKNOWN');
    if (targetId === sourceId) fail('BATTLE_DUEL_SEQUENCE_SELF_TARGET_FORBIDDEN');
  }
  const stage = raw.stage;
  if (!stage || typeof stage !== 'object' || Array.isArray(stage)) fail('BATTLE_DUEL_SEQUENCE_STAGE_REQUIRED');
  const left = req(stage.left, 'BATTLE_DUEL_SEQUENCE_STAGE_LEFT_INVALID');
  const right = req(stage.right, 'BATTLE_DUEL_SEQUENCE_STAGE_RIGHT_INVALID');
  if (left === right) fail('BATTLE_DUEL_SEQUENCE_STAGE_DUPLICATE');
  if (!participantIds.has(left) || !participantIds.has(right)) fail('BATTLE_DUEL_SEQUENCE_STAGE_PARTICIPANT_UNKNOWN');
  if (left !== sourceId && right !== sourceId) fail('BATTLE_DUEL_SEQUENCE_STAGE_SOURCE_MISSING');
  if (left !== targetIds[0] && right !== targetIds[0]) fail('BATTLE_DUEL_SEQUENCE_STAGE_PRIMARY_TARGET_MISSING');
  const timing = raw.timing;
  if (!timing || typeof timing !== 'object' || Array.isArray(timing)) fail('BATTLE_DUEL_SEQUENCE_TIMING_REQUIRED');
  const start = num(timing.start, 'BATTLE_DUEL_SEQUENCE_TIMING_START_INVALID');
  const impact = num(timing.impact, 'BATTLE_DUEL_SEQUENCE_TIMING_IMPACT_INVALID');
  const handoffAt = num(timing.handoffAt, 'BATTLE_DUEL_SEQUENCE_TIMING_HANDOFF_INVALID');
  const recoveryEnd = num(timing.recoveryEnd, 'BATTLE_DUEL_SEQUENCE_TIMING_RECOVERY_INVALID');
  if (!(start <= impact && impact <= handoffAt && handoffAt <= recoveryEnd)) fail('BATTLE_DUEL_SEQUENCE_TIMING_ORDER_INVALID');
  return freeze({
    eventId, kind, sourceId, targetIds,
    transition: req(raw.transition, 'BATTLE_DUEL_SEQUENCE_TRANSITION_INVALID'),
    stage: { left, right },
    timing: { start, impact, handoffAt, recoveryEnd },
    reducedMotion: raw.reducedMotion === true,
    lowPerf: raw.lowPerf === true
  });
}

function actor(participantById, participantId, stage) {
  const row = participantById.get(participantId);
  return freeze({
    participantId,
    label: row.label,
    actorRef: row.actorRef,
    stageSide: stage.left === participantId ? 'left' : stage.right === participantId ? 'right' : null
  });
}

function reactionMap(raw, targetIds) {
  if (raw == null) return new Map();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('BATTLE_DUEL_SEQUENCE_REACTION_MAP_INVALID');
  const entries = raw instanceof Map ? Array.from(raw.entries()) : Object.entries(raw);
  const known = new Set(targetIds);
  const result = new Map();
  for (const entry of entries) {
    const targetId = req(entry[0], 'BATTLE_DUEL_SEQUENCE_REACTION_TARGET_INVALID');
    if (!known.has(targetId)) fail('BATTLE_DUEL_SEQUENCE_REACTION_TARGET_UNKNOWN');
    const reaction = req(entry[1], 'BATTLE_DUEL_SEQUENCE_REACTION_INVALID').toUpperCase();
    if (!REACTION_SET.has(reaction)) fail('BATTLE_DUEL_SEQUENCE_REACTION_UNKNOWN');
    result.set(targetId, reaction);
  }
  return result;
}

function reactionIntent(reaction, suppressed) {
  if (suppressed) return 'STATIC_RESULT';
  if (reaction === 'HIT') return 'RECOIL';
  if (reaction === 'BLOCK') return 'GUARD_REBOUND';
  if (reaction === 'NULLIFIED') return 'EFFECT_DISSOLVE';
  if (reaction === 'COUNTER') return 'GUARD_THEN_COUNTER_CUE';
  return 'HOLD_RESULT';
}

function handoff(current, nextRaw, participantIds) {
  const currentMembers = [current.stage.left, current.stage.right];
  if (!nextRaw) return freeze({
    mode: 'SEQUENCE_END', nextEventId: null, nextKind: null, nextTransition: null,
    preservedParticipantIds: [], exitingParticipantIds: currentMembers, enteringParticipantIds: [],
    startsAtMs: current.timing.handoffAt, nextStartsAtMs: null,
    currentRecoveryEndsAtMs: current.timing.recoveryEnd, overlapMs: 0
  });
  if (!DUEL_KINDS.has(nextRaw.kind)) return freeze({
    mode: 'PHASE_BOUNDARY',
    nextEventId: opt(nextRaw.eventId, 'BATTLE_DUEL_SEQUENCE_NEXT_EVENT_INVALID'),
    nextKind: req(nextRaw.kind, 'BATTLE_DUEL_SEQUENCE_NEXT_KIND_INVALID'),
    nextTransition: opt(nextRaw.transition, 'BATTLE_DUEL_SEQUENCE_NEXT_TRANSITION_INVALID'),
    preservedParticipantIds: [], exitingParticipantIds: [], enteringParticipantIds: [],
    startsAtMs: current.timing.handoffAt,
    nextStartsAtMs: Number.isFinite(nextRaw.timing && nextRaw.timing.start) ? nextRaw.timing.start : null,
    currentRecoveryEndsAtMs: current.timing.recoveryEnd, overlapMs: 0
  });
  const next = normalizePlan(nextRaw, participantIds);
  const currentSet = new Set(currentMembers);
  const nextMembers = [next.stage.left, next.stage.right];
  const nextSet = new Set(nextMembers);
  return freeze({
    mode: 'DUEL_HANDOFF',
    nextEventId: next.eventId,
    nextKind: next.kind,
    nextTransition: next.transition,
    preservedParticipantIds: currentMembers.filter(id => nextSet.has(id)),
    exitingParticipantIds: currentMembers.filter(id => !nextSet.has(id)),
    enteringParticipantIds: nextMembers.filter(id => !currentSet.has(id)),
    startsAtMs: current.timing.handoffAt,
    nextStartsAtMs: next.timing.start,
    currentRecoveryEndsAtMs: current.timing.recoveryEnd,
    overlapMs: Math.max(0, current.timing.recoveryEnd - next.timing.start)
  });
}

export function projectBattleCinematicDuelSequence({
  participants,
  plans,
  actionCardsByEventId,
  acceptedReactionsByEventId = {},
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const rows = normalizeParticipants(participants);
  const participantIds = new Set(rows.map(row => row.id));
  const participantById = new Map(rows.map(row => [row.id, row]));
  if (!Array.isArray(plans)) fail('BATTLE_DUEL_SEQUENCE_PLANS_REQUIRED');
  if (!(acceptedReactionsByEventId instanceof Map) &&
      (!acceptedReactionsByEventId || typeof acceptedReactionsByEventId !== 'object' || Array.isArray(acceptedReactionsByEventId))) {
    fail('BATTLE_DUEL_SEQUENCE_REACTION_SOURCE_INVALID');
  }

  const actions = [];
  for (let index = 0; index < plans.length; index += 1) {
    const plan = normalizePlan(plans[index], participantIds);
    if (!plan) continue;
    const card = normalizeCard(
      keyed(actionCardsByEventId, plan.eventId, 'BATTLE_DUEL_SEQUENCE_ACTION_CARD_MAP_INVALID'),
      plan.sourceId
    );
    const rawReactions = acceptedReactionsByEventId instanceof Map
      ? acceptedReactionsByEventId.get(plan.eventId)
      : acceptedReactionsByEventId[plan.eventId];
    const reactions = reactionMap(rawReactions, plan.targetIds);
    const suppressed = reducedMotion === true || lowPerf === true || plan.reducedMotion || plan.lowPerf;
    const defenders = plan.targetIds.map(targetId => {
      const reactionKind = reactions.get(targetId) || 'UNRESOLVED';
      return freeze({
        actor: actor(participantById, targetId, plan.stage),
        reactionKind,
        reactionAuthority: reactions.has(targetId) ? 'caller_supplied_accepted_result' : 'not_supplied',
        reactionMotionIntent: reactionIntent(reactionKind, suppressed),
        counterPresentation: reactionKind === 'COUNTER'
      });
    });
    actions.push(freeze({
      eventId: plan.eventId,
      kind: plan.kind,
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      targetCalculation: false,
      winnerCalculation: false,
      reactionCalculation: false,
      actionCardCalculation: false,
      attacker: actor(participantById, plan.sourceId, plan.stage),
      defenders,
      actionCard: card,
      stage: plan.stage,
      incomingTransition: plan.transition,
      motion: {
        mode: suppressed ? 'static_only' : 'presentation_allowed',
        sourceMotionIntent: suppressed ? 'STATIC_ATTACKER' : 'LUNGE_TO_TARGET',
        actionCardMotionIntent: suppressed ? 'STATIC_CARD_FOCUS' : 'CARD_ANCHOR_WITH_ATTACK',
        startMs: plan.timing.start,
        impactMs: plan.timing.impact,
        handoffAtMs: plan.timing.handoffAt,
        recoveryEndMs: plan.timing.recoveryEnd
      },
      handoff: handoff(plan, plans[index + 1] || null, participantIds)
    }));
  }

  return freeze({
    schema: SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    orderCalculation: false,
    targetCalculation: false,
    winnerCalculation: false,
    reactionCalculation: false,
    actionCardCalculation: false,
    actorIdentityCalculation: false,
    authorityBoundary: 'existing_battle_conveyor_plans_plus_caller_action_card_and_accepted_reaction_only',
    motion: reducedMotion === true || lowPerf === true ? 'static_only' : 'presentation_allowed',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    actions
  });
}

export function auditBattleCinematicDuelSequence(sequence) {
  const defects = [];
  if (!sequence || sequence.schema !== SCHEMA) defects.push('SCHEMA');
  if (sequence && (sequence.presentationOnly !== true || sequence.gameplayAuthority !== false || sequence.gameStateWrite !== false)) defects.push('AUTHORITY');
  if (sequence && (sequence.orderCalculation !== false || sequence.targetCalculation !== false ||
      sequence.winnerCalculation !== false || sequence.reactionCalculation !== false ||
      sequence.actionCardCalculation !== false || sequence.actorIdentityCalculation !== false)) defects.push('RECALCULATION');
  if (!Array.isArray(sequence && sequence.actions)) defects.push('ACTIONS');
  for (const action of (sequence && sequence.actions) || []) {
    if (!DUEL_KINDS.has(action.kind)) defects.push('KIND');
    if (action.presentationOnly !== true || action.gameplayAuthority !== false || action.gameStateWrite !== false) defects.push('ACTION_AUTHORITY');
    if (!action.attacker || !action.attacker.participantId || !Array.isArray(action.defenders) || !action.defenders.length) defects.push('ACTORS');
    if (!action.actionCard || action.actionCard.ownerId !== action.attacker.participantId || !action.actionCard.physicalCardId) defects.push('CARD_LINEAGE');
    if (action.defenders.some(row => !REACTION_SET.has(row.reactionKind))) defects.push('REACTION');
    if (!['presentation_allowed', 'static_only'].includes(action.motion && action.motion.mode)) defects.push('MOTION');
    if (!['DUEL_HANDOFF', 'PHASE_BOUNDARY', 'SEQUENCE_END'].includes(action.handoff && action.handoff.mode)) defects.push('HANDOFF');
  }
  return freeze({ ok: defects.length === 0, defects });
}

export const BATTLE_CINEMATIC_DUEL_SEQUENCE_CONTRACT = freeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  sourcePlanSchema: CONVEYOR_SCHEMA,
  actionKinds: Object.freeze(Array.from(DUEL_KINDS)),
  reactionKinds: Object.freeze(Array.from(REACTIONS)),
  orderAuthority: 'EXISTING_BATTLE_CONVEYOR',
  targetAuthority: 'EXISTING_ACCEPTED_PLAN',
  actionCardAuthority: 'CALLER_SUPPLIED_ACCEPTED_ACTION_CARD',
  reactionAuthority: 'CALLER_SUPPLIED_ACCEPTED_RESULT_OR_UNRESOLVED',
  actorIdentityAuthority: 'CALLER_PARTICIPANT_MODEL',
  handoffAuthority: 'EXISTING_CONVEYOR_STAGE_AND_TIMING_ONLY',
  liveMountOwnedHere: false,
  formalArtOwnedHere: false,
  gameplayStateWrite: false
});

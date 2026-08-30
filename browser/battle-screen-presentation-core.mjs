import { planBattleConveyor } from './battle-conveyor-presentation-core.mjs';

const MODEL_SCHEMA = 'gameroad.battle-screen-presentation.v1';
const TIMELINE_SCHEMA = 'gameroad.battle-screen-timeline.v1';
const RETURN_INTENTS = new Set(['MATCH_PLAN', 'RESULT']);
const PLAN_KINDS = new Set(['partner_cutin', 'reveal', 'attack', 'ability', 'compare4', 'finisher', 'settle']);
const LANE_ROLES = new Set(['idle', 'source', 'target', 'winner', 'loser', 'revealed']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonEmptyString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(code);
  return value.trim();
}

function optionalString(value, code) {
  if (value == null) return null;
  return nonEmptyString(value, code);
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants) || participants.length !== 4) {
    throw new TypeError('BATTLE_SCREEN_REQUIRES_FOUR_PARTICIPANTS');
  }
  const normalized = participants.map((participant, index) => {
    if (!participant || typeof participant !== 'object' || Array.isArray(participant)) {
      throw new TypeError('BATTLE_SCREEN_PARTICIPANT_INVALID');
    }
    return {
      id: nonEmptyString(participant.id, 'BATTLE_SCREEN_PARTICIPANT_ID_INVALID'),
      label: optionalString(participant.label, 'BATTLE_SCREEN_PARTICIPANT_LABEL_INVALID') ?? `P${index + 1}`,
      team: optionalString(participant.team, 'BATTLE_SCREEN_PARTICIPANT_TEAM_INVALID'),
      order: index
    };
  });
  if (new Set(normalized.map(row => row.id)).size !== 4) {
    throw new TypeError('BATTLE_SCREEN_PARTICIPANT_IDS_NOT_UNIQUE');
  }
  return normalized;
}

function normalizeAfterstate(rows, participantIds) {
  if (rows == null) return [];
  if (!Array.isArray(rows)) throw new TypeError('BATTLE_SCREEN_AFTERSTATE_INVALID');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('BATTLE_SCREEN_AFTERSTATE_ROW_INVALID');
    }
    const participantId = nonEmptyString(row.participantId, 'BATTLE_SCREEN_AFTERSTATE_PARTICIPANT_INVALID');
    if (!participantIds.has(participantId)) throw new TypeError('BATTLE_SCREEN_AFTERSTATE_PARTICIPANT_UNKNOWN');
    return {
      id: optionalString(row.id, 'BATTLE_SCREEN_AFTERSTATE_ID_INVALID') ?? `afterstate-${index + 1}`,
      participantId,
      text: nonEmptyString(row.text, 'BATTLE_SCREEN_AFTERSTATE_TEXT_INVALID')
    };
  });
}

function normalizePlan(plan) {
  if (plan == null) return null;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) ||
      plan.presentationOnly !== true ||
      plan.authorityBoundary !== 'accepted_public_event_only' ||
      !PLAN_KINDS.has(plan.kind)) {
    throw new TypeError('BATTLE_SCREEN_PLAN_INVALID');
  }
  return plan;
}

function idsFromPlan(plan) {
  const data = plan?.publicData ?? {};
  if (!plan) return [];
  if (plan.kind === 'reveal' || plan.kind === 'compare4') {
    return Array.isArray(data.playerIds) ? data.playerIds : [];
  }
  if (plan.kind === 'attack' || plan.kind === 'ability') {
    return [data.sourceId, ...(Array.isArray(plan.groupTargets) ? plan.groupTargets : [])].filter(Boolean);
  }
  if (plan.kind === 'finisher') {
    return [data.winnerId, ...(Array.isArray(data.loserIds) ? data.loserIds : [])].filter(Boolean);
  }
  return [];
}

function assertPlanParticipantsKnown(plan, participantIds) {
  for (const id of idsFromPlan(plan)) {
    if (!participantIds.has(id)) throw new TypeError(`BATTLE_SCREEN_PLAN_PARTICIPANT_UNKNOWN:${id}`);
  }
}

function rolesForPlan(plan, participants) {
  const roles = new Map(participants.map(row => [row.id, 'idle']));
  if (!plan) return roles;
  const data = plan.publicData ?? {};

  if (plan.kind === 'reveal') {
    for (const id of data.playerIds ?? []) roles.set(id, 'revealed');
  } else if (plan.kind === 'attack' || plan.kind === 'ability') {
    roles.set(data.sourceId, 'source');
    for (const id of plan.groupTargets ?? []) roles.set(id, 'target');
  } else if (plan.kind === 'compare4') {
    for (const id of data.playerIds ?? []) roles.set(id, 'revealed');
    for (const id of data.winnerIds ?? []) roles.set(id, 'winner');
  } else if (plan.kind === 'finisher') {
    roles.set(data.winnerId, 'winner');
    for (const id of data.loserIds ?? []) roles.set(id, 'loser');
  }
  return roles;
}

function focusForPlan(plan) {
  if (!plan) return deepFreeze({ causeId: null, targetIds: [], winnerIds: [] });
  const data = plan.publicData ?? {};
  if (plan.kind === 'attack' || plan.kind === 'ability') {
    return deepFreeze({
      causeId: data.sourceId ?? null,
      targetIds: Array.isArray(plan.groupTargets) ? [...plan.groupTargets] : [],
      winnerIds: []
    });
  }
  if (plan.kind === 'compare4') {
    return deepFreeze({
      causeId: null,
      targetIds: [],
      winnerIds: Array.isArray(data.winnerIds) ? [...data.winnerIds] : []
    });
  }
  if (plan.kind === 'finisher') {
    return deepFreeze({
      causeId: data.winnerId ?? null,
      targetIds: Array.isArray(data.loserIds) ? [...data.loserIds] : [],
      winnerIds: data.winnerId ? [data.winnerId] : []
    });
  }
  return deepFreeze({ causeId: null, targetIds: [], winnerIds: [] });
}

export function createBattleScreenModel({
  participants,
  plan = null,
  persistentAfterstate = [],
  returnIntent = null,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const normalizedParticipants = normalizeParticipants(participants);
  const participantIds = new Set(normalizedParticipants.map(row => row.id));
  const normalizedPlan = normalizePlan(plan);
  if (normalizedPlan) assertPlanParticipantsKnown(normalizedPlan, participantIds);
  const normalizedAfterstate = normalizeAfterstate(persistentAfterstate, participantIds);
  if (returnIntent != null && !RETURN_INTENTS.has(returnIntent)) {
    throw new TypeError('BATTLE_SCREEN_RETURN_INTENT_INVALID');
  }

  const inBattlePhase = normalizedPlan !== null;
  const roles = rolesForPlan(normalizedPlan, normalizedParticipants);
  const afterstateByParticipant = new Map(normalizedParticipants.map(row => [row.id, []]));
  for (const row of normalizedAfterstate) afterstateByParticipant.get(row.participantId).push(row);

  const lanes = normalizedParticipants.map(participant => deepFreeze({
    ...participant,
    role: roles.get(participant.id),
    afterstate: afterstateByParticipant.get(participant.id)
  }));

  const model = {
    schema: MODEL_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    winnerCalculation: false,
    targetCalculation: false,
    secretProjectionAuthority: false,
    screenMode: inBattlePhase ? 'BATTLE_PHASE' : 'MATCH_PLAN',
    phase: inBattlePhase ? normalizedPlan.kind : 'plan',
    eventId: normalizedPlan?.eventId ?? null,
    transition: normalizedPlan?.transition ?? null,
    importance: normalizedPlan?.importance ?? 'ambient',
    fourLaneCausalStructure: true,
    layoutIntent: 'source_left__causal_depth_middle__consequence_right',
    boardInteractionOwnedByCaller: !inBattlePhase,
    battlePhaseBoardInteractionAllowed: false,
    battlePhaseInputPolicy: inBattlePhase
      ? ['skip', 'public_info', 'accessibility']
      : [],
    planSurfacePolicy: 'caller_owned_no_second_plan_state_machine',
    anchors: {
      phaseSurfaceId: 'battlePhaseSurface',
      resolutionId: 'battleResolution',
      planSlotAttr: 'data-battle-plan-slot',
      laneAttr: 'data-battle-screen-lane'
    },
    focus: focusForPlan(normalizedPlan),
    lanes,
    persistentAfterstate: normalizedAfterstate,
    returnIntent,
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    motion: reducedMotion === true || lowPerf === true ? 'static_only' : 'allowed'
  };
  return deepFreeze(model);
}

export function projectAcceptedBattleEventsToScreen({
  participants,
  events,
  persistentAfterstate = [],
  returnIntent = null,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const conveyor = planBattleConveyor(events, { reducedMotion, lowPerf });
  const models = conveyor.plans.map(plan => createBattleScreenModel({
    participants,
    plan,
    persistentAfterstate,
    returnIntent,
    reducedMotion,
    lowPerf
  }));
  return deepFreeze({
    schema: TIMELINE_SCHEMA,
    presentationOnly: true,
    authorityBoundary: 'existing_battle_conveyor_accepted_public_event_only',
    gameStateWrite: false,
    timelineEnd: conveyor.timelineEnd,
    models
  });
}

export function auditBattleScreenModel(model) {
  const defects = [];
  if (!model || model.schema !== MODEL_SCHEMA) defects.push('SCHEMA');
  if (model?.presentationOnly !== true || model?.gameplayAuthority !== false || model?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (model?.winnerCalculation !== false || model?.targetCalculation !== false || model?.secretProjectionAuthority !== false) defects.push('RECALCULATION');
  if (model?.fourLaneCausalStructure !== true || !Array.isArray(model?.lanes) || model.lanes.length !== 4) defects.push('FOUR_LANES');
  if (Array.isArray(model?.lanes)) {
    if (new Set(model.lanes.map(row => row.id)).size !== model.lanes.length) defects.push('LANE_IDENTITY');
    if (model.lanes.some(row => !LANE_ROLES.has(row.role))) defects.push('LANE_ROLE');
  }
  if (model?.screenMode === 'BATTLE_PHASE') {
    if (model.battlePhaseBoardInteractionAllowed !== false || model.boardInteractionOwnedByCaller !== false) defects.push('BATTLE_INPUT_SCOPE');
    if (!Array.isArray(model.battlePhaseInputPolicy) || model.battlePhaseInputPolicy.join('|') !== 'skip|public_info|accessibility') defects.push('BATTLE_INPUT_POLICY');
  }
  if (model?.screenMode === 'MATCH_PLAN' && model.boardInteractionOwnedByCaller !== true) defects.push('PLAN_OWNER');
  if (model?.motion !== 'allowed' && model?.motion !== 'static_only') defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_SCREEN_PRESENTATION = deepFreeze({
  schema: MODEL_SCHEMA,
  timelineSchema: TIMELINE_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  laneCount: 4,
  planOwner: 'CALLER',
  battleEventAuthority: 'battle-conveyor-presentation-core accepted public events',
  requiredAnchors: ['battlePhaseSurface', 'battleResolution'],
  formalArtOwnedHere: false
});

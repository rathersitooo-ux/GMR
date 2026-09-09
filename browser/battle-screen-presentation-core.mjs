import { planBattleConveyor } from './battle-conveyor-presentation-core.mjs';
import { projectBattleResolutionWithActionOrder } from './battle-resolution-action-order-adapter.mjs';

const MODEL_SCHEMA = 'gameroad.battle-screen-presentation.v1';
const TIMELINE_SCHEMA = 'gameroad.battle-screen-timeline.v1';
const COMPOUND_ATTACK_SCHEMA = 'gameroad.battle-janken-compound-attack-package.v1';
const FOUR_PUBLIC_CARD_SCHEMA = 'gameroad.battle-four-public-card-state.v1';
const RETURN_INTENTS = new Set(['MATCH_PLAN', 'RESULT']);
const PLAN_KINDS = new Set(['partner_cutin', 'reveal', 'attack', 'ability', 'compare4', 'finisher', 'settle']);
const LANE_ROLES = new Set(['idle', 'source', 'target', 'winner', 'revealed']);
const SHIELD_LANES = new Set(['L', 'C', 'R']);
const JANKEN_LABELS = new Map([
  ['ROCK', 'グー'],
  ['SCISSORS', 'チョキ'],
  ['PAPER', 'パー'],
  ['グー', 'グー'],
  ['チョキ', 'チョキ'],
  ['パー', 'パー']
]);

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

function cloneAcceptedPath(path) {
  if (!Array.isArray(path) || path.length === 0) throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_PATH_REQUIRED');
  try {
    return JSON.parse(JSON.stringify(path));
  } catch {
    throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_PATH_INVALID');
  }
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

export function projectBattleFourPublicCardState({ participants, publicCards } = {}) {
  const normalizedParticipants = normalizeParticipants(participants);
  const participantIds = new Set(normalizedParticipants.map(row => row.id));
  if (!Array.isArray(publicCards) || publicCards.length !== 4) {
    throw new TypeError('BATTLE_SCREEN_PUBLIC_CARDS_REQUIRE_FOUR');
  }
  const byPlayer = new Map();
  for (const raw of publicCards) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('BATTLE_SCREEN_PUBLIC_CARD_INVALID');
    }
    const playerId = nonEmptyString(raw.playerId, 'BATTLE_SCREEN_PUBLIC_CARD_PLAYER_INVALID');
    if (!participantIds.has(playerId)) throw new TypeError(`BATTLE_SCREEN_PUBLIC_CARD_PLAYER_UNKNOWN:${playerId}`);
    if (byPlayer.has(playerId)) throw new TypeError(`BATTLE_SCREEN_PUBLIC_CARD_PLAYER_DUPLICATE:${playerId}`);
    const cardId = nonEmptyString(raw.cardId, 'BATTLE_SCREEN_PUBLIC_CARD_ID_INVALID');
    let displayNumber = null;
    if (raw.displayNumber != null) {
      if (typeof raw.displayNumber === 'number' && Number.isFinite(raw.displayNumber)) {
        displayNumber = raw.displayNumber;
      } else if (typeof raw.displayNumber === 'string' && raw.displayNumber.trim()) {
        displayNumber = raw.displayNumber.trim();
      } else {
        throw new TypeError('BATTLE_SCREEN_PUBLIC_CARD_NUMBER_INVALID');
      }
    }
    byPlayer.set(playerId, deepFreeze({
      playerId,
      cardId,
      displayNumber,
      hand: optionalString(raw.hand, 'BATTLE_SCREEN_PUBLIC_CARD_HAND_INVALID')
    }));
  }
  const cards = normalizedParticipants.map(participant => {
    const card = byPlayer.get(participant.id);
    if (!card) throw new TypeError(`BATTLE_SCREEN_PUBLIC_CARD_PLAYER_MISSING:${participant.id}`);
    return card;
  });
  return deepFreeze({
    schema: FOUR_PUBLIC_CARD_SCHEMA,
    presentationOnly: true,
    authorityBoundary: 'caller_authoritative_public_cards_only',
    gameplayAuthority: false,
    gameStateWrite: false,
    secretProjectionAuthority: false,
    orderCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    playerCount: 4,
    cards
  });
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

function normalizeBoardReturn(plan, participantIds) {
  if (!plan || plan.kind !== 'settle') return null;
  const raw = plan.publicData?.compoundAttackPackage;
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_PACKAGE_INVALID');
  }
  if (raw.schema !== COMPOUND_ATTACK_SCHEMA) {
    throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_PACKAGE_SCHEMA');
  }

  const cardId = nonEmptyString(raw.cardId, 'BATTLE_SCREEN_BOARD_RETURN_CARD_INVALID');
  const jankenHand = nonEmptyString(raw.jankenHand, 'BATTLE_SCREEN_BOARD_RETURN_HAND_INVALID');
  const opponentId = nonEmptyString(raw.opponentId, 'BATTLE_SCREEN_BOARD_RETURN_OPPONENT_INVALID');
  if (!participantIds.has(opponentId)) throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_OPPONENT_UNKNOWN');

  const shieldLane = nonEmptyString(raw.shieldLane, 'BATTLE_SCREEN_BOARD_RETURN_SHIELD_INVALID').toUpperCase();
  if (!SHIELD_LANES.has(shieldLane)) throw new TypeError('BATTLE_SCREEN_BOARD_RETURN_SHIELD_UNKNOWN');

  return deepFreeze({
    eventId: plan.eventId,
    compoundPackageSchema: COMPOUND_ATTACK_SCHEMA,
    cardId,
    jankenHand,
    path: cloneAcceptedPath(raw.path),
    direction: optionalString(raw.direction, 'BATTLE_SCREEN_BOARD_RETURN_DIRECTION_INVALID'),
    roadId: optionalString(raw.roadId, 'BATTLE_SCREEN_BOARD_RETURN_ROAD_INVALID'),
    battleId: optionalString(raw.battleId, 'BATTLE_SCREEN_BOARD_RETURN_BATTLE_INVALID'),
    opponentId,
    shieldLane,
    shieldRef: optionalString(raw.shieldRef, 'BATTLE_SCREEN_BOARD_RETURN_SHIELD_REF_INVALID'),
    destinationKey: `${opponentId}:${shieldLane}`,
    source: 'accepted_public_compound_attack_package',
    visualIntent: 'resolution_to_committed_shield',
    effectMutationClaimed: false
  });
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
    return [data.winnerId].filter(Boolean);
  }
  return [];
}

function assertPlanParticipantsKnown(plan, participantIds) {
  for (const id of idsFromPlan(plan)) {
    if (!participantIds.has(id)) throw new TypeError(`BATTLE_SCREEN_PLAN_PARTICIPANT_UNKNOWN:${id}`);
  }
}

function rolesForPlan(plan, participants, boardReturn = null) {
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
  } else if (plan.kind === 'settle' && boardReturn) {
    roles.set(boardReturn.opponentId, 'target');
  }
  return roles;
}

function focusForPlan(plan, boardReturn = null) {
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
      targetIds: [],
      winnerIds: data.winnerId ? [data.winnerId] : []
    });
  }
  if (plan.kind === 'settle' && boardReturn) {
    return deepFreeze({ causeId: null, targetIds: [boardReturn.opponentId], winnerIds: [] });
  }
  return deepFreeze({ causeId: null, targetIds: [], winnerIds: [] });
}

function jankenLabel(hand) {
  const value = nonEmptyString(hand, 'BATTLE_SCREEN_CAUSAL_HAND_INVALID');
  return JANKEN_LABELS.get(value.toUpperCase()) ?? JANKEN_LABELS.get(value) ?? value;
}

function causalAfterstateRows(causalReturn, participants) {
  if (!causalReturn) return [];
  const destinationParticipantId = causalReturn.destination.opponentId;
  const hand = jankenLabel(causalReturn.sourceCard.jankenHand);
  const rows = [];
  if (causalReturn.processing) {
    rows.push({
      id: `causal-cause:${causalReturn.eventId}`,
      participantId: destinationParticipantId,
      text: `使用札（${hand}） → 処理開始`
    });
    const labelById = new Map(participants.map(row => [row.id, row.label]));
    const order = causalReturn.processing.processingOrder.map(id => labelById.get(id) ?? id);
    rows.push({
      id: `causal-order:${causalReturn.eventId}`,
      participantId: destinationParticipantId,
      text: `処理順 ${order.join(' → ')} → 解決 → Shield ${causalReturn.destination.shieldLane}`
    });
    return rows;
  }
  rows.push({
    id: `causal-return:${causalReturn.eventId}`,
    participantId: destinationParticipantId,
    text: `使用札（${hand}） → 解決 → Shield ${causalReturn.destination.shieldLane}`
  });
  return rows;
}

function actionOrderForEvent(actionOrderByEventId, eventId) {
  if (actionOrderByEventId == null) return null;
  if (actionOrderByEventId instanceof Map) return actionOrderByEventId.get(eventId) ?? null;
  if (!actionOrderByEventId || typeof actionOrderByEventId !== 'object' || Array.isArray(actionOrderByEventId)) {
    throw new TypeError('BATTLE_SCREEN_ACTION_ORDER_BY_EVENT_INVALID');
  }
  return actionOrderByEventId[eventId] ?? null;
}

export function createBattleScreenModel({
  participants,
  plan = null,
  persistentAfterstate = [],
  returnIntent = null,
  reducedMotion = false,
  lowPerf = false,
  actionOrder = null,
  publicCards = null
} = {}) {
  const normalizedParticipants = normalizeParticipants(participants);
  const participantIds = new Set(normalizedParticipants.map(row => row.id));
  const normalizedPlan = normalizePlan(plan);
  if (normalizedPlan) assertPlanParticipantsKnown(normalizedPlan, participantIds);
  const boardReturn = normalizeBoardReturn(normalizedPlan, participantIds);
  const acceptedPlanPublicCards = (normalizedPlan?.kind === 'reveal' || normalizedPlan?.kind === 'compare4')
    ? normalizedPlan.publicData?.publicCards ?? null
    : null;
  const publicCardSource = publicCards ?? acceptedPlanPublicCards;
  const publicCardState = publicCardSource == null
    ? null
    : projectBattleFourPublicCardState({ participants: normalizedParticipants, publicCards: publicCardSource });
  const publicCardByPlayer = new Map((publicCardState?.cards ?? []).map(card => [card.playerId, card]));
  const normalizedAfterstate = normalizeAfterstate(persistentAfterstate, participantIds);
  if (returnIntent != null && !RETURN_INTENTS.has(returnIntent)) {
    throw new TypeError('BATTLE_SCREEN_RETURN_INTENT_INVALID');
  }

  const causalReturn = boardReturn
    ? projectBattleResolutionWithActionOrder({ boardReturn, actionOrder, reducedMotion, lowPerf })
    : null;
  const inBattlePhase = normalizedPlan !== null;
  const roles = rolesForPlan(normalizedPlan, normalizedParticipants, boardReturn);
  const afterstateByParticipant = new Map(normalizedParticipants.map(row => [row.id, []]));
  for (const row of normalizedAfterstate) afterstateByParticipant.get(row.participantId).push(row);
  for (const row of causalAfterstateRows(causalReturn, normalizedParticipants)) {
    afterstateByParticipant.get(row.participantId).push(row);
  }

  const lanes = normalizedParticipants.map(participant => deepFreeze({
    ...participant,
    role: roles.get(participant.id),
    publicCard: publicCardByPlayer.get(participant.id) ?? null,
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
    boardEffectCalculation: false,
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
      laneAttr: 'data-battle-screen-lane',
      shieldSlotAttr: 'data-battle-shield-slot'
    },
    focus: focusForPlan(normalizedPlan, boardReturn),
    publicCardState,
    boardReturn,
    causalReturn,
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
  lowPerf = false,
  actionOrderByEventId = null
} = {}) {
  const conveyor = planBattleConveyor(events, { reducedMotion, lowPerf });
  let carriedPublicCards = null;
  const models = conveyor.plans.map(plan => {
    if ((plan.kind === 'reveal' || plan.kind === 'compare4')
      && Object.prototype.hasOwnProperty.call(plan.publicData ?? {}, 'publicCards')) {
      carriedPublicCards = plan.publicData.publicCards;
    }
    return createBattleScreenModel({
      participants,
      plan,
      persistentAfterstate,
      returnIntent,
      reducedMotion,
      lowPerf,
      publicCards: carriedPublicCards,
      actionOrder: actionOrderForEvent(actionOrderByEventId, plan.eventId)
    });
  });
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
  if (model?.winnerCalculation !== false || model?.targetCalculation !== false || model?.secretProjectionAuthority !== false || model?.boardEffectCalculation !== false) defects.push('RECALCULATION');
  if (model?.fourLaneCausalStructure !== true || !Array.isArray(model?.lanes) || model.lanes.length !== 4) defects.push('FOUR_LANES');
  if (model?.publicCardState != null) {
    const publicState = model.publicCardState;
    if (publicState.schema !== FOUR_PUBLIC_CARD_SCHEMA || publicState.presentationOnly !== true
      || publicState.gameplayAuthority !== false || publicState.gameStateWrite !== false
      || publicState.secretProjectionAuthority !== false || publicState.playerCount !== 4
      || !Array.isArray(publicState.cards) || publicState.cards.length !== 4) defects.push('FOUR_PUBLIC_CARDS');
    if (publicState.orderCalculation !== false || publicState.winnerCalculation !== false || publicState.targetCalculation !== false) defects.push('FOUR_PUBLIC_CARD_RECALCULATION');
    const cardByPlayer = new Map((publicState.cards ?? []).map(card => [card.playerId, card]));
    if (Array.isArray(model?.lanes) && model.lanes.some(lane => lane.publicCard !== (cardByPlayer.get(lane.id) ?? null))) defects.push('FOUR_PUBLIC_CARD_LANE_BINDING');
  } else if (Array.isArray(model?.lanes) && model.lanes.some(lane => lane.publicCard != null)) {
    defects.push('FOUR_PUBLIC_CARD_GHOST');
  }
  if (Array.isArray(model?.lanes)) {
    if (new Set(model.lanes.map(row => row.id)).size !== model.lanes.length) defects.push('LANE_IDENTITY');
    if (model.lanes.some(row => !LANE_ROLES.has(row.role))) defects.push('LANE_ROLE');
  }
  if (model?.boardReturn != null) {
    if (model.phase !== 'settle') defects.push('BOARD_RETURN_PHASE');
    if (model.boardReturn.compoundPackageSchema !== COMPOUND_ATTACK_SCHEMA) defects.push('BOARD_RETURN_PACKAGE_SCHEMA');
    if (!SHIELD_LANES.has(model.boardReturn.shieldLane)) defects.push('BOARD_RETURN_SHIELD');
    if (!model.lanes.some(row => row.id === model.boardReturn.opponentId && row.role === 'target')) defects.push('BOARD_RETURN_TARGET');
    if (model.boardReturn.effectMutationClaimed !== false) defects.push('BOARD_RETURN_EFFECT_AUTHORITY');
  }
  if ((model?.boardReturn == null) !== (model?.causalReturn == null)) defects.push('CAUSAL_RETURN_PRESENCE');
  if (model?.causalReturn != null) {
    const causal = model.causalReturn;
    if (causal.presentationOnly !== true || causal.gameplayAuthority !== false || causal.gameStateWrite !== false) defects.push('CAUSAL_RETURN_AUTHORITY');
    if (causal.targetCalculation !== false || causal.winnerCalculation !== false || causal.effectCalculation !== false || causal.legalityCalculation !== false || causal.routeCalculation !== false) defects.push('CAUSAL_RETURN_RECALCULATION');
    if (causal.eventId !== model.boardReturn.eventId) defects.push('CAUSAL_RETURN_EVENT');
    if (causal.sourceCard?.cardId !== model.boardReturn.cardId || causal.sourceCard?.jankenHand !== model.boardReturn.jankenHand) defects.push('CAUSAL_RETURN_CAUSE');
    if (causal.destination?.destinationKey !== model.boardReturn.destinationKey || causal.destination?.shieldLane !== model.boardReturn.shieldLane) defects.push('CAUSAL_RETURN_DESTINATION');
    const targetLane = model.lanes.find(row => row.id === model.boardReturn.opponentId);
    const causalRowPrefix = causal.processing ? 'causal-order:' : 'causal-return:';
    if (!targetLane?.afterstate?.some(row => row.id === `${causalRowPrefix}${causal.eventId}`)) defects.push('CAUSAL_RETURN_VISIBLE_ROW');
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
  fourPublicCardSchema: FOUR_PUBLIC_CARD_SCHEMA,
  fourPublicCardAuthority: 'CALLER_AUTHORITATIVE_ACCEPTED_PUBLIC_CARDS_ONLY',
  planOwner: 'CALLER',
  battleEventAuthority: 'battle-conveyor-presentation-core accepted public events',
  compoundAttackPackageSchema: COMPOUND_ATTACK_SCHEMA,
  boardReturnAuthority: 'NORMALIZED_COMPOUND_ATTACK_PACKAGE_FROM_ACCEPTED_SETTLE_EVENT_ONLY',
  boardReturnEffectPolicy: 'NO_EFFECT_INFERENCE_OR_GAME_STATE_WRITE',
  causalReturnAuthority: 'MERGED_CAUSAL_RETURN_PROJECTOR_ACCEPTED_BOARD_RETURN_ONLY',
  causalOrderAuthority: 'OPTIONAL_CALLER_AUTHORITATIVE_ACTION_ORDER_PRESENTATION_ONLY',
  causalPathGeometryPolicy: 'ACCEPTED_PATH_DATA_ONLY_NO_GEOMETRY_INFERENCE',
  shieldLanes: Object.freeze([...SHIELD_LANES]),
  requiredAnchors: ['battlePhaseSurface', 'battleResolution'],
  formalArtOwnedHere: false
});
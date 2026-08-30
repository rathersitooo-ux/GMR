const MODEL_SCHEMA = 'gameroad.battle-plan-hud-presentation.v1';
const BOARD_PROJECTION_SCHEMA = 'gameroad.battle-board-visual-explanation.v1';
const CARD_READINESS = new Set(['ready', 'blocked', 'unknown']);

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

function clonePlain(value, code) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => clonePlain(item, code));
  if (typeof value !== 'object') throw new TypeError(code);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError(code);
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = clonePlain(child, code);
  return out;
}

function normalizeStringList(values, code) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new TypeError(code);
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const token = nonEmptyString(value, code);
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants) || participants.length !== 4) {
    throw new TypeError('BATTLE_PLAN_HUD_REQUIRES_FOUR_PARTICIPANTS');
  }
  const normalized = participants.map((participant, index) => {
    if (!participant || typeof participant !== 'object' || Array.isArray(participant)) {
      throw new TypeError('BATTLE_PLAN_HUD_PARTICIPANT_INVALID');
    }
    return {
      id: nonEmptyString(participant.id, 'BATTLE_PLAN_HUD_PARTICIPANT_ID_INVALID'),
      label: optionalString(participant.label, 'BATTLE_PLAN_HUD_PARTICIPANT_LABEL_INVALID') ?? `P${index + 1}`,
      team: optionalString(participant.team, 'BATTLE_PLAN_HUD_PARTICIPANT_TEAM_INVALID'),
      publicBadges: normalizeStringList(participant.publicBadges, 'BATTLE_PLAN_HUD_PARTICIPANT_BADGES_INVALID'),
      order: index
    };
  });
  if (new Set(normalized.map(row => row.id)).size !== 4) {
    throw new TypeError('BATTLE_PLAN_HUD_PARTICIPANT_IDS_NOT_UNIQUE');
  }
  return normalized;
}

function assertKnownParticipant(id, participantIds, code) {
  if (id != null && !participantIds.has(id)) throw new TypeError(code);
}

function normalizeOwnHand(cards) {
  if (cards == null) return [];
  if (!Array.isArray(cards)) throw new TypeError('BATTLE_PLAN_HUD_OWN_HAND_INVALID');
  const normalized = cards.map((card, index) => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError('BATTLE_PLAN_HUD_OWN_HAND_CARD_INVALID');
    }
    const readiness = card.readiness == null ? 'unknown' : nonEmptyString(card.readiness, 'BATTLE_PLAN_HUD_CARD_READINESS_INVALID');
    if (!CARD_READINESS.has(readiness)) throw new TypeError('BATTLE_PLAN_HUD_CARD_READINESS_INVALID');
    return {
      id: optionalString(card.id, 'BATTLE_PLAN_HUD_CARD_ID_INVALID') ?? `hand-${index + 1}`,
      label: optionalString(card.label, 'BATTLE_PLAN_HUD_CARD_LABEL_INVALID') ?? `CARD ${index + 1}`,
      selected: card.selected === true,
      readiness
    };
  });
  if (new Set(normalized.map(row => row.id)).size !== normalized.length) {
    throw new TypeError('BATTLE_PLAN_HUD_CARD_IDS_NOT_UNIQUE');
  }
  return normalized;
}

function normalizeBoardProjection(boardProjection) {
  if (boardProjection == null) return null;
  if (!boardProjection || typeof boardProjection !== 'object' || Array.isArray(boardProjection)) {
    throw new TypeError('BATTLE_PLAN_HUD_BOARD_PROJECTION_INVALID');
  }
  if (boardProjection.schema !== BOARD_PROJECTION_SCHEMA) {
    throw new TypeError('BATTLE_PLAN_HUD_BOARD_PROJECTION_SCHEMA_MISMATCH');
  }
  return clonePlain(boardProjection, 'BATTLE_PLAN_HUD_BOARD_PROJECTION_INVALID');
}

function normalizeBoardContext(boardContext) {
  if (boardContext == null) boardContext = {};
  if (!boardContext || typeof boardContext !== 'object' || Array.isArray(boardContext)) {
    throw new TypeError('BATTLE_PLAN_HUD_BOARD_CONTEXT_INVALID');
  }
  return {
    selectedPositionId: optionalString(boardContext.selectedPositionId, 'BATTLE_PLAN_HUD_SELECTED_POSITION_INVALID'),
    selectedTargetId: optionalString(boardContext.selectedTargetId, 'BATTLE_PLAN_HUD_SELECTED_TARGET_INVALID'),
    targetKind: optionalString(boardContext.targetKind, 'BATTLE_PLAN_HUD_TARGET_KIND_INVALID'),
    prompt: optionalString(boardContext.prompt, 'BATTLE_PLAN_HUD_PROMPT_INVALID'),
    projection: normalizeBoardProjection(boardContext.projection)
  };
}

function normalizePrimaryAction(primaryAction) {
  if (primaryAction == null) {
    return {
      id: 'battle-plan-primary',
      label: '決定',
      intent: null,
      ready: false,
      disabledReason: 'CALLER_READINESS_UNAVAILABLE'
    };
  }
  if (!primaryAction || typeof primaryAction !== 'object' || Array.isArray(primaryAction)) {
    throw new TypeError('BATTLE_PLAN_HUD_PRIMARY_ACTION_INVALID');
  }
  if (typeof primaryAction.ready !== 'boolean') {
    throw new TypeError('BATTLE_PLAN_HUD_PRIMARY_ACTION_READY_REQUIRED');
  }
  return {
    id: optionalString(primaryAction.id, 'BATTLE_PLAN_HUD_PRIMARY_ACTION_ID_INVALID') ?? 'battle-plan-primary',
    label: optionalString(primaryAction.label, 'BATTLE_PLAN_HUD_PRIMARY_ACTION_LABEL_INVALID') ?? '決定',
    intent: optionalString(primaryAction.intent, 'BATTLE_PLAN_HUD_PRIMARY_ACTION_INTENT_INVALID'),
    ready: primaryAction.ready,
    disabledReason: primaryAction.ready
      ? null
      : optionalString(primaryAction.disabledReason, 'BATTLE_PLAN_HUD_PRIMARY_ACTION_DISABLED_REASON_INVALID')
  };
}

export function createBattlePlanHudModel({
  participants,
  viewerParticipantId,
  currentActorId = null,
  roundLabel = null,
  phaseLabel = 'PLAN',
  boardContext = null,
  ownHand = [],
  primaryAction = null,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const normalizedParticipants = normalizeParticipants(participants);
  const participantIds = new Set(normalizedParticipants.map(row => row.id));
  const viewerId = nonEmptyString(viewerParticipantId, 'BATTLE_PLAN_HUD_VIEWER_ID_INVALID');
  assertKnownParticipant(viewerId, participantIds, 'BATTLE_PLAN_HUD_VIEWER_UNKNOWN');
  const actorId = optionalString(currentActorId, 'BATTLE_PLAN_HUD_CURRENT_ACTOR_INVALID');
  assertKnownParticipant(actorId, participantIds, 'BATTLE_PLAN_HUD_CURRENT_ACTOR_UNKNOWN');

  const normalizedBoard = normalizeBoardContext(boardContext);
  const normalizedHand = normalizeOwnHand(ownHand);
  const normalizedAction = normalizePrimaryAction(primaryAction);

  const model = {
    schema: MODEL_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    winnerCalculation: false,
    targetCalculation: false,
    legalityCalculation: false,
    secretProjectionAuthority: false,
    screenMode: 'MATCH_PLAN',
    phaseLabel: nonEmptyString(phaseLabel, 'BATTLE_PLAN_HUD_PHASE_LABEL_INVALID'),
    roundLabel: optionalString(roundLabel, 'BATTLE_PLAN_HUD_ROUND_LABEL_INVALID'),
    viewerParticipantId: viewerId,
    currentActorId: actorId,
    participants: normalizedParticipants.map(participant => ({
      ...participant,
      isViewer: participant.id === viewerId,
      isCurrentActor: participant.id === actorId
    })),
    board: normalizedBoard,
    hand: {
      ownerId: viewerId,
      privacy: 'SELF_ONLY_CALLER_PROJECTION',
      cards: normalizedHand,
      count: normalizedHand.length
    },
    primaryAction: normalizedAction,
    actionReadinessAuthority: 'CALLER',
    selectedTargetAuthority: 'CALLER',
    boardProjectionAuthority: 'EXISTING_RULES_DERIVED_PRESENTATION_INPUT',
    anchors: {
      rootId: 'battlePlanHud',
      participantsId: 'battlePlanParticipants',
      boardId: 'battlePlanBoard',
      targetId: 'battlePlanTarget',
      ownHandId: 'battlePlanOwnHand',
      primaryActionId: 'battlePlanPrimaryAction'
    },
    layoutIntent: 'board_center__participants_edges__own_hand_lower_right__primary_action_thumb_reach',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    motion: reducedMotion === true || lowPerf === true ? 'static_only' : 'allowed'
  };
  return deepFreeze(model);
}

export function auditBattlePlanHudModel(model) {
  const defects = [];
  if (!model || model.schema !== MODEL_SCHEMA) defects.push('SCHEMA');
  if (model?.presentationOnly !== true || model?.gameplayAuthority !== false || model?.gameStateWrite !== false) defects.push('AUTHORITY');
  if (model?.winnerCalculation !== false || model?.targetCalculation !== false || model?.legalityCalculation !== false || model?.secretProjectionAuthority !== false) defects.push('RECALCULATION');
  if (model?.screenMode !== 'MATCH_PLAN') defects.push('SCREEN_MODE');
  if (!Array.isArray(model?.participants) || model.participants.length !== 4) defects.push('PARTICIPANTS');
  if (Array.isArray(model?.participants)) {
    if (new Set(model.participants.map(row => row.id)).size !== 4) defects.push('PARTICIPANT_IDENTITY');
    if (model.participants.filter(row => row.isViewer).length !== 1) defects.push('VIEWER');
    if (model.participants.some(row => Object.prototype.hasOwnProperty.call(row, 'hand') || Object.prototype.hasOwnProperty.call(row, 'deck') || Object.prototype.hasOwnProperty.call(row, 'private'))) defects.push('PARTICIPANT_SECRET_SURFACE');
  }
  if (model?.hand?.ownerId !== model?.viewerParticipantId || model?.hand?.privacy !== 'SELF_ONLY_CALLER_PROJECTION' || !Array.isArray(model?.hand?.cards)) defects.push('HAND_SCOPE');
  if (typeof model?.primaryAction?.ready !== 'boolean' || model?.actionReadinessAuthority !== 'CALLER') defects.push('ACTION_READINESS');
  if (model?.selectedTargetAuthority !== 'CALLER') defects.push('TARGET_AUTHORITY');
  if (model?.motion !== 'allowed' && model?.motion !== 'static_only') defects.push('MOTION');
  return deepFreeze({ ok: defects.length === 0, defects });
}

export const BATTLE_PLAN_HUD_PRESENTATION = deepFreeze({
  schema: MODEL_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  screenMode: 'MATCH_PLAN',
  participantCount: 4,
  handScope: 'SELF_ONLY_CALLER_PROJECTION',
  boardOwner: 'CALLER_AND_EXISTING_RULES_DERIVED_PROJECTION',
  actionReadinessOwner: 'CALLER',
  selectedTargetOwner: 'CALLER',
  formalArtOwnedHere: false,
  domOwnedHere: false,
  requiredAnchors: [
    'battlePlanHud',
    'battlePlanParticipants',
    'battlePlanBoard',
    'battlePlanTarget',
    'battlePlanOwnHand',
    'battlePlanPrimaryAction'
  ]
});

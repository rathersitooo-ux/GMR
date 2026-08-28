const PLAN_HUD_SCHEMA = 'gameroad.battle-plan-hud-presentation.v1';

export const BATTLE_PLAN_HAND_PRESENTATION_STATES = Object.freeze([
  'normal',
  'focus',
  'pressed',
  'detail',
  'selected',
  'pending',
  'confirmed',
  'failed',
  'disabled'
]);

const HAND_STATE_SET = new Set(BATTLE_PLAN_HAND_PRESENTATION_STATES);
const RESOURCE_KEYS = Object.freeze([
  'mana',
  'hate',
  'deckCount',
  'ex',
  'chip',
  'honey',
  'graveyard',
  'banished',
  'shields'
]);
const CONTROL_KEYS = Object.freeze([
  'confirm',
  'cancel',
  'detail',
  'targetChange',
  'undoPath',
  'submit'
]);
const OPPONENT_ALLOWED_KEYS = new Set([
  'playerId',
  'seat',
  'displayName',
  'portraitRef',
  'teamId',
  'handCount',
  'shields',
  'laneProgress',
  'ready',
  'submitState',
  'publicStatus',
  'connected'
]);
const OPPONENT_SECRET_KEYS = new Set([
  'hand',
  'handCards',
  'cards',
  'cardIds',
  'deckCards',
  'private',
  'privateState',
  'secret',
  'secretState',
  'reservations',
  'roadReservation',
  'battleReservation',
  'reservedRoadCardId',
  'reservedBattleCardId'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value, label) {
  if (value == null) return null;
  if (!nonEmptyString(value)) throw new TypeError(`${label}_INVALID`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${label}_INVALID`);
  return value;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function fail(reason) {
  return deepFreeze({
    schema: PLAN_HUD_SCHEMA,
    ok: false,
    clear: true,
    reason,
    brandingVisible: false
  });
}

function normalizeRevision(input) {
  const revision = isObject(input.revision) ? input.revision : {};
  const expected = revision.expected ?? input.expectedRevisionToken ?? null;
  const current = revision.current ?? input.currentRevisionToken ?? null;
  if (expected != null && current != null && expected !== current) {
    return { stale: true, expected, current };
  }
  return { stale: false, expected, current };
}

function projectPhase(value) {
  if (!isObject(value)) return null;
  const out = {};
  for (const key of [
    'round',
    'phase',
    'status',
    'readyCount',
    'totalPlayers',
    'actionClockMs',
    'quickClockMs',
    'waitingOnPlayerId'
  ]) {
    if (value[key] !== undefined) out[key] = cloneJson(value[key]);
  }
  return Object.keys(out).length ? out : null;
}

function projectPartner(value) {
  if (!isObject(value)) return null;
  const out = {};
  for (const key of ['partnerId', 'displayName', 'portraitRef', 'bodyRef', 'status', 'expression']) {
    if (value[key] !== undefined) out[key] = cloneJson(value[key]);
  }
  return Object.keys(out).length ? out : null;
}

function projectResources(value) {
  if (!isObject(value)) return {};
  const out = {};
  for (const key of RESOURCE_KEYS) {
    if (value[key] !== undefined) out[key] = cloneJson(value[key]);
  }
  return out;
}

function projectControls(value) {
  if (!isObject(value)) return {};
  const out = {};
  for (const key of CONTROL_KEYS) {
    if (value[key] !== undefined) out[key] = cloneJson(value[key]);
  }
  return out;
}

function projectHand(hand) {
  if (hand == null) {
    return { targetCount: 3, count: 0, transientShortfall: true, cards: [] };
  }
  if (!Array.isArray(hand)) throw new TypeError('SELF_HAND_INVALID');
  if (hand.length > 3) throw new TypeError('SELF_HAND_EXCEEDS_PLAN_TARGET');

  const slots = new Set();
  const cards = hand.map((card, index) => {
    if (!isObject(card)) throw new TypeError('SELF_HAND_CARD_INVALID');
    const slot = Number.isInteger(card.slot) ? card.slot : index;
    if (slot < 0 || slot > 2 || slots.has(slot)) throw new TypeError('SELF_HAND_SLOT_INVALID');
    slots.add(slot);
    if (!nonEmptyString(card.cardId)) throw new TypeError('SELF_HAND_CARD_ID_REQUIRED');

    const presentationState = card.presentationState ?? 'normal';
    if (!HAND_STATE_SET.has(presentationState)) throw new TypeError('SELF_HAND_STATE_INVALID');

    const out = {
      slot,
      cardId: card.cardId,
      presentationState
    };
    for (const key of [
      'faceRef',
      'name',
      'selected',
      'detail',
      'pending',
      'confirmed',
      'failed',
      'disabled',
      'disabledReason',
      'operationToken'
    ]) {
      if (card[key] !== undefined) out[key] = cloneJson(card[key]);
    }
    return out;
  }).sort((a, b) => a.slot - b.slot);

  return {
    targetCount: 3,
    count: cards.length,
    transientShortfall: cards.length < 3,
    cards
  };
}

function projectReservations(value) {
  if (!isObject(value)) return { road: null, battle: null, private: null };
  return {
    road: value.road === undefined ? null : cloneJson(value.road),
    battle: value.battle === undefined ? null : cloneJson(value.battle),
    private: value.private === undefined ? null : cloneJson(value.private)
  };
}

function projectSelf(value) {
  if (!isObject(value)) throw new TypeError('SELF_REQUIRED');
  if (!nonEmptyString(value.playerId)) throw new TypeError('SELF_PLAYER_ID_REQUIRED');
  return {
    playerId: value.playerId,
    displayName: value.displayName ?? null,
    portraitRef: value.portraitRef ?? null,
    teamId: value.teamId ?? null,
    partner: projectPartner(value.partner),
    resources: projectResources(value.resources),
    hand: projectHand(value.hand),
    reservations: projectReservations(value.reservations),
    controls: projectControls(value.controls)
  };
}

function validateOpponentKeys(value) {
  for (const key of Object.keys(value)) {
    if (OPPONENT_SECRET_KEYS.has(key)) throw new TypeError('OPPONENT_SECRET_FIELD_FORBIDDEN');
    if (!OPPONENT_ALLOWED_KEYS.has(key)) throw new TypeError(`OPPONENT_FIELD_FORBIDDEN:${key}`);
  }
}

function projectLaneProgress(value) {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError('OPPONENT_LANE_PROGRESS_INVALID');
  return value.map(item => nonNegativeInteger(item, 'OPPONENT_LANE_PROGRESS'));
}

function projectOpponent(value, index) {
  if (!isObject(value)) throw new TypeError('OPPONENT_INVALID');
  validateOpponentKeys(value);
  if (!nonEmptyString(value.playerId)) throw new TypeError('OPPONENT_PLAYER_ID_REQUIRED');

  const seat = value.seat === undefined ? index : value.seat;
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new TypeError('OPPONENT_SEAT_INVALID');

  const out = {
    playerId: value.playerId,
    seat,
    displayName: optionalString(value.displayName, 'OPPONENT_DISPLAY_NAME'),
    portraitRef: optionalString(value.portraitRef, 'OPPONENT_PORTRAIT_REF'),
    teamId: optionalString(value.teamId, 'OPPONENT_TEAM_ID')
  };

  if (value.handCount !== undefined) {
    const handCount = nonNegativeInteger(value.handCount, 'OPPONENT_HAND_COUNT');
    if (handCount > 3) throw new TypeError('OPPONENT_HAND_COUNT_INVALID');
    out.handCount = handCount;
  }
  if (value.shields !== undefined) out.shields = nonNegativeInteger(value.shields, 'OPPONENT_SHIELDS');
  if (value.laneProgress !== undefined) out.laneProgress = projectLaneProgress(value.laneProgress);
  if (value.ready !== undefined) {
    if (typeof value.ready !== 'boolean') throw new TypeError('OPPONENT_READY_INVALID');
    out.ready = value.ready;
  }
  if (value.submitState !== undefined) out.submitState = optionalString(value.submitState, 'OPPONENT_SUBMIT_STATE');
  if (value.publicStatus !== undefined) out.publicStatus = optionalString(value.publicStatus, 'OPPONENT_PUBLIC_STATUS');
  if (value.connected !== undefined) {
    if (typeof value.connected !== 'boolean') throw new TypeError('OPPONENT_CONNECTED_INVALID');
    out.connected = value.connected;
  }

  return out;
}

function projectOpponents(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError('OPPONENTS_INVALID');
  if (value.length > 3) throw new TypeError('OPPONENT_COUNT_EXCEEDS_PLAN_VIEW');
  const projected = value.map(projectOpponent);
  const ids = new Set();
  const seats = new Set();
  for (const opponent of projected) {
    if (ids.has(opponent.playerId)) throw new TypeError('OPPONENT_PLAYER_ID_DUPLICATE');
    if (seats.has(opponent.seat)) throw new TypeError('OPPONENT_SEAT_DUPLICATE');
    ids.add(opponent.playerId);
    seats.add(opponent.seat);
  }
  return projected.sort((a, b) => a.seat - b.seat || a.playerId.localeCompare(b.playerId));
}

export function projectBattlePlanHudPresentation(input = {}) {
  if (!isObject(input)) return fail('INPUT_INVALID');

  const revision = normalizeRevision(input);
  if (revision.stale) return fail('STALE_REVISION');

  try {
    const self = projectSelf(input.self);
    const opponents = projectOpponents(input.opponents);
    if (opponents.some(opponent => opponent.playerId === self.playerId)) {
      return fail('SELF_PRESENT_IN_OPPONENTS');
    }

    return deepFreeze({
      schema: PLAN_HUD_SCHEMA,
      ok: true,
      clear: false,
      reason: null,
      brandingVisible: false,
      layout: {
        selfHud: 'bottom-left',
        hand: 'bottom-center-right',
        opponents: 'top-right',
        status: 'top-left',
        primaryControls: 'right-thumb',
        responsiveMode: input.responsiveMode ?? 'auto'
      },
      revision: {
        expected: revision.expected,
        current: revision.current
      },
      phase: projectPhase(input.phase),
      self,
      opponents,
      privacy: {
        opponentProjection: 'explicit-public-fields-only',
        opponentSecretsExposed: false,
        selfPrivateReservationsVisible: true
      },
      authority: {
        mode: 'presentation-only',
        computesLegality: false,
        mutatesAuthoritativeState: false,
        autoExecutesActions: false,
        mountsProductHtml: false
      }
    });
  } catch (error) {
    return fail(error?.message || 'PROJECTION_FAILED');
  }
}

export const BATTLE_PLAN_HUD_PRESENTATION_CORE = Object.freeze({
  schema: PLAN_HUD_SCHEMA,
  handPresentationStates: BATTLE_PLAN_HAND_PRESENTATION_STATES,
  handTargetCount: 3,
  brandingVisible: false,
  opponentProjection: 'explicit-public-fields-only'
});

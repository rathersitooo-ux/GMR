const RECONNECT_SCHEMA = 'GAMEROAD_BATTLE_2V2_RECONNECT_V1';

export const BATTLE_2V2_CONTROL_MODES = Object.freeze({
  SELF: 'self',
  TEMPORARY_PARTNER: 'temporary_partner',
  UNCONTROLLED: 'uncontrolled'
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function validateSeatShape(seats) {
  if (!Array.isArray(seats) || seats.length !== 4) {
    throw new TypeError('FOUR_SEATS_REQUIRED');
  }

  const seatIds = new Set();
  const playerIds = new Set();
  const teams = new Map();

  for (const seat of seats) {
    if (!seat || typeof seat !== 'object' || Array.isArray(seat)) {
      throw new TypeError('SEAT_INVALID');
    }
    for (const key of ['seatId', 'playerId', 'teamId']) {
      if (!nonEmptyString(seat[key])) throw new TypeError(`${key.toUpperCase()}_INVALID`);
    }
    if (seatIds.has(seat.seatId)) throw new TypeError('SEAT_ID_DUPLICATE');
    if (playerIds.has(seat.playerId)) throw new TypeError('PLAYER_ID_DUPLICATE');
    seatIds.add(seat.seatId);
    playerIds.add(seat.playerId);
    teams.set(seat.teamId, (teams.get(seat.teamId) || 0) + 1);
  }

  if (teams.size !== 2 || [...teams.values()].some(count => count !== 2)) {
    throw new TypeError('TWO_TEAMS_OF_TWO_REQUIRED');
  }
}

function validateState(state) {
  if (!state || typeof state !== 'object' || state.schema !== RECONNECT_SCHEMA) {
    throw new TypeError('STATE_INVALID');
  }
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new TypeError('STATE_REVISION_INVALID');
  }
  validateSeatShape(state.seats);
  if (state.seats.some(seat => typeof seat.connected !== 'boolean')) {
    throw new TypeError('STATE_CONNECTION_INVALID');
  }
}

function freezeState(seats, revision) {
  return deepFreeze({
    schema: RECONNECT_SCHEMA,
    revision,
    seats: seats.map(seat => ({
      seatId: seat.seatId,
      playerId: seat.playerId,
      teamId: seat.teamId,
      connected: seat.connected
    }))
  });
}

export function create2v2ReconnectState({ seats } = {}) {
  validateSeatShape(seats);
  return freezeState(
    seats.map(seat => ({ ...seat, connected: true })),
    0
  );
}

function setPlayerConnection(state, playerId, connected) {
  validateState(state);
  if (!nonEmptyString(playerId)) {
    return deepFreeze({ ok: false, reason: 'PLAYER_INVALID', changed: false, state });
  }

  const target = state.seats.find(seat => seat.playerId === playerId);
  if (!target) {
    return deepFreeze({ ok: false, reason: 'PLAYER_UNKNOWN', changed: false, state });
  }
  if (target.connected === connected) {
    return deepFreeze({ ok: true, status: 'unchanged', changed: false, state });
  }

  const next = freezeState(
    state.seats.map(seat => seat.playerId === playerId ? { ...seat, connected } : seat),
    state.revision + 1
  );
  return deepFreeze({
    ok: true,
    status: connected ? 'reconnected' : 'disconnected',
    changed: true,
    state: next
  });
}

export function disconnect2v2Player(state, playerId) {
  return setPlayerConnection(state, playerId, false);
}

export function reconnect2v2Player(state, playerId) {
  return setPlayerConnection(state, playerId, true);
}

export function project2v2SeatControl(state) {
  validateState(state);

  const projected = state.seats.map(seat => {
    if (seat.connected) {
      return {
        seatId: seat.seatId,
        playerId: seat.playerId,
        teamId: seat.teamId,
        connected: true,
        controlMode: BATTLE_2V2_CONTROL_MODES.SELF,
        controllerSeatId: seat.seatId,
        controllerPlayerId: seat.playerId
      };
    }

    return {
      seatId: seat.seatId,
      playerId: seat.playerId,
      teamId: seat.teamId,
      connected: false,
      controlMode: BATTLE_2V2_CONTROL_MODES.UNCONTROLLED,
      controllerSeatId: null,
      controllerPlayerId: null
    };
  });

  return deepFreeze({
    schema: RECONNECT_SCHEMA,
    revision: state.revision,
    seats: projected
  });
}

export const BATTLE_2V2_RECONNECT_CORE = Object.freeze({
  schema: RECONNECT_SCHEMA,
  controlModes: BATTLE_2V2_CONTROL_MODES
});

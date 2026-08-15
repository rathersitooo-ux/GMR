const RECONNECT_SCHEMA = 'GAMEROAD_BATTLE_2V2_RECONNECT_V1';

export const BATTLE_2V2_CONTROL_MODES = Object.freeze({
  SELF: 'self',
  TEMPORARY_PARTNER: 'temporary_partner',
  PERMANENT_PARTNER: 'permanent_partner',
  UNCONTROLLED: 'uncontrolled'
});

const VALID_CONTROL_MODES = new Set(Object.values(BATTLE_2V2_CONTROL_MODES));

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

  for (const seat of state.seats) {
    if (typeof seat.connected !== 'boolean') {
      throw new TypeError('STATE_CONNECTION_INVALID');
    }
    if (!VALID_CONTROL_MODES.has(seat.controlMode)) {
      throw new TypeError('STATE_CONTROL_MODE_INVALID');
    }
    if (!Number.isSafeInteger(seat.controlGeneration) || seat.controlGeneration < 0) {
      throw new TypeError('STATE_CONTROL_GENERATION_INVALID');
    }

    const shouldBeConnected = seat.controlMode === BATTLE_2V2_CONTROL_MODES.SELF;
    if (seat.connected !== shouldBeConnected) {
      throw new TypeError('STATE_CONTROL_CONNECTION_MISMATCH');
    }
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
      connected: seat.connected,
      controlMode: seat.controlMode,
      controlGeneration: seat.controlGeneration
    }))
  });
}

export function create2v2ReconnectState({ seats } = {}) {
  validateSeatShape(seats);
  return freezeState(
    seats.map(seat => ({
      ...seat,
      connected: true,
      controlMode: BATTLE_2V2_CONTROL_MODES.SELF,
      controlGeneration: 0
    })),
    0
  );
}

function findPlayerSeat(state, playerId) {
  validateState(state);
  if (!nonEmptyString(playerId)) {
    return { ok: false, reason: 'PLAYER_INVALID' };
  }

  const seat = state.seats.find(candidate => candidate.playerId === playerId);
  if (!seat) {
    return { ok: false, reason: 'PLAYER_UNKNOWN' };
  }
  return { ok: true, seat };
}

function transitionSeat(state, targetSeat, patch, status) {
  const next = freezeState(
    state.seats.map(seat => seat.seatId === targetSeat.seatId
      ? {
          ...seat,
          ...patch,
          controlGeneration: seat.controlGeneration + 1
        }
      : seat),
    state.revision + 1
  );

  return deepFreeze({
    ok: true,
    status,
    changed: true,
    state: next
  });
}

export function disconnect2v2Player(state, playerId) {
  const found = findPlayerSeat(state, playerId);
  if (!found.ok) {
    return deepFreeze({ ok: false, reason: found.reason, changed: false, state });
  }

  const target = found.seat;
  if (target.controlMode === BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER
      || target.controlMode === BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER) {
    return deepFreeze({ ok: true, status: 'unchanged', changed: false, state });
  }
  if (target.controlMode !== BATTLE_2V2_CONTROL_MODES.SELF) {
    return deepFreeze({
      ok: false,
      reason: 'CONTROL_STATE_INVALID_FOR_DISCONNECT',
      changed: false,
      state
    });
  }

  return transitionSeat(
    state,
    target,
    {
      connected: false,
      controlMode: BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER
    },
    'disconnected'
  );
}

export function reconnect2v2Player(state, playerId) {
  const found = findPlayerSeat(state, playerId);
  if (!found.ok) {
    return deepFreeze({ ok: false, reason: found.reason, changed: false, state });
  }

  const target = found.seat;
  if (target.controlMode === BATTLE_2V2_CONTROL_MODES.SELF) {
    return deepFreeze({ ok: true, status: 'unchanged', changed: false, state });
  }
  if (target.controlMode === BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER) {
    return deepFreeze({
      ok: false,
      reason: 'PERMANENT_PARTNER_LOCKED',
      changed: false,
      state
    });
  }
  if (target.controlMode !== BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER) {
    return deepFreeze({
      ok: false,
      reason: 'CONTROL_STATE_INVALID_FOR_RECONNECT',
      changed: false,
      state
    });
  }

  return transitionSeat(
    state,
    target,
    {
      connected: true,
      controlMode: BATTLE_2V2_CONTROL_MODES.SELF
    },
    'reconnected'
  );
}

export function expire2v2ReconnectGrace(state, playerId) {
  const found = findPlayerSeat(state, playerId);
  if (!found.ok) {
    return deepFreeze({ ok: false, reason: found.reason, changed: false, state });
  }

  const target = found.seat;
  if (target.controlMode === BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER) {
    return deepFreeze({ ok: true, status: 'unchanged', changed: false, state });
  }
  if (target.controlMode === BATTLE_2V2_CONTROL_MODES.SELF) {
    return deepFreeze({
      ok: false,
      reason: 'GRACE_NOT_ACTIVE',
      changed: false,
      state
    });
  }
  if (target.controlMode !== BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER) {
    return deepFreeze({
      ok: false,
      reason: 'CONTROL_STATE_INVALID_FOR_EXPIRY',
      changed: false,
      state
    });
  }

  return transitionSeat(
    state,
    target,
    {
      connected: false,
      controlMode: BATTLE_2V2_CONTROL_MODES.PERMANENT_PARTNER
    },
    'permanent_partner'
  );
}

export function isCurrent2v2ControlEnvelope(state, envelope) {
  validateState(state);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;

  const { seatId, controlMode, controlGeneration } = envelope;
  if (!nonEmptyString(seatId)
      || !VALID_CONTROL_MODES.has(controlMode)
      || !Number.isSafeInteger(controlGeneration)
      || controlGeneration < 0
      || controlMode === BATTLE_2V2_CONTROL_MODES.UNCONTROLLED) {
    return false;
  }

  const seat = state.seats.find(candidate => candidate.seatId === seatId);
  if (!seat || seat.controlMode === BATTLE_2V2_CONTROL_MODES.UNCONTROLLED) return false;

  return seat.controlMode === controlMode
    && seat.controlGeneration === controlGeneration;
}

export function project2v2SeatControl(state) {
  validateState(state);

  const projected = state.seats.map(seat => {
    if (seat.controlMode === BATTLE_2V2_CONTROL_MODES.SELF) {
      return {
        seatId: seat.seatId,
        playerId: seat.playerId,
        teamId: seat.teamId,
        connected: true,
        controlMode: seat.controlMode,
        controlGeneration: seat.controlGeneration,
        controllerSeatId: seat.seatId,
        controllerPlayerId: seat.playerId
      };
    }

    return {
      seatId: seat.seatId,
      playerId: seat.playerId,
      teamId: seat.teamId,
      connected: false,
      controlMode: seat.controlMode,
      controlGeneration: seat.controlGeneration,
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

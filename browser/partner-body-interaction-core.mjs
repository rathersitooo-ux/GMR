const SCHEMA = 'gameroad.partner-body-interaction.v1';

export const PARTNER_BODY_INTERACTION_PHASES = Object.freeze({
  IDLE: 'IDLE',
  APPROACH_EVADE: 'APPROACH_EVADE',
  TAP_REMOTE_PRESSURE: 'TAP_REMOTE_PRESSURE',
  PRESS_CONTACT: 'PRESS_CONTACT',
  PUSH_OFF: 'PUSH_OFF',
  FREE_SWING: 'FREE_SWING',
  LONG_PRESS_ATTRACT: 'LONG_PRESS_ATTRACT',
  CLING_CAPTURE: 'CLING_CAPTURE',
  CLING_FOLLOW: 'CLING_FOLLOW',
  PEEL_RELEASE: 'PEEL_RELEASE',
  RECONTACT_CLING: 'RECONTACT_CLING',
  SETTLE: 'SETTLE',
});

export const PARTNER_BODY_ZONE_KINDS = Object.freeze(['bust', 'cheek', 'thigh', 'generic']);
export const PARTNER_BODY_INTERACTION_SCHEMA = SCHEMA;

const PHASES = new Set(Object.values(PARTNER_BODY_INTERACTION_PHASES));
const ZONES = new Set(PARTNER_BODY_ZONE_KINDS);

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function nonNegative(value, label) {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be non-negative`);
  return value;
}

function unit(value, label) {
  finite(value, label);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1`);
  return value;
}

function positive(value, label) {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('config is required');
  const normalized = {
    awarenessRadius: positive(config.awarenessRadius, 'awarenessRadius'),
    contactRadius: positive(config.contactRadius, 'contactRadius'),
    clingRadius: positive(config.clingRadius, 'clingRadius'),
    holdMs: nonNegative(config.holdMs, 'holdMs'),
    pushOffCompression: unit(config.pushOffCompression, 'pushOffCompression'),
    evadeGain: nonNegative(config.evadeGain, 'evadeGain'),
    remotePressureGain: nonNegative(config.remotePressureGain, 'remotePressureGain'),
    pushOffGain: nonNegative(config.pushOffGain, 'pushOffGain'),
    attractionGain: nonNegative(config.attractionGain, 'attractionGain'),
    clingAdhesion: unit(config.clingAdhesion, 'clingAdhesion'),
    clingFollowLag: unit(config.clingFollowLag, 'clingFollowLag'),
    peelAdhesion: unit(config.peelAdhesion, 'peelAdhesion'),
    freeSwingGain: nonNegative(config.freeSwingGain, 'freeSwingGain'),
    recontactAdhesion: unit(config.recontactAdhesion, 'recontactAdhesion'),
    lowPerfMotionScale: unit(config.lowPerfMotionScale, 'lowPerfMotionScale'),
  };
  if (!(normalized.clingRadius <= normalized.contactRadius && normalized.contactRadius < normalized.awarenessRadius)) {
    throw new RangeError('radii must satisfy clingRadius <= contactRadius < awarenessRadius');
  }
  return deepFreeze(normalized);
}

function validateVector(x, y, label = 'direction') {
  finite(x, `${label}.x`);
  finite(y, `${label}.y`);
  const length = Math.hypot(x, y);
  if (length === 0) return deepFreeze({ x: 0, y: 0 });
  return deepFreeze({ x: x / length, y: y / length });
}

function validateDistance(value, label = 'distance') {
  return nonNegative(value, label);
}

function proximity(config, distance) {
  if (distance <= config.clingRadius) return 1;
  if (distance >= config.awarenessRadius) return 0;
  return 1 - ((distance - config.clingRadius) / (config.awarenessRadius - config.clingRadius));
}

function motionMode(state) {
  if (state.reducedMotion) return 'static';
  if (state.lowPerf) return 'reduced';
  return 'full';
}

function motionEnergy(state, raw) {
  if (state.reducedMotion) return 0;
  return raw * (state.lowPerf ? state.config.lowPerfMotionScale : 1);
}

function emptyReaction() {
  return {
    direction: { x: 0, y: 0 },
    displacement: 0,
    compression: 0,
    attraction: 0,
    adhesion: 0,
    followLag: 0,
    secondaryMotion: { driver: null, mode: 'full', energy: 0 },
  };
}

function validateState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schema !== SCHEMA) throw new TypeError('unsupported state');
  if (!ZONES.has(state.zone)) throw new TypeError('invalid zone');
  if (!PHASES.has(state.phase)) throw new TypeError('invalid phase');
  if (!Number.isInteger(state.sequence) || state.sequence < 0) throw new TypeError('invalid sequence');
  validateConfig(state.config);
  if (state.pointer) {
    finite(state.pointer.downAtMs, 'pointer.downAtMs');
    validateDistance(state.pointer.distance, 'pointer.distance');
  }
  if (state.suppressedBy !== null && !['card', 'major_battle_control', 'disabled'].includes(state.suppressedBy)) throw new TypeError('invalid suppression');
  return state;
}

function next(state, patch) {
  return deepFreeze(validateState({ ...state, ...patch, sequence: state.sequence + 1 }));
}

function baseReactionFor(state) {
  return {
    ...emptyReaction(),
    secondaryMotion: { driver: null, mode: motionMode(state), energy: 0 },
  };
}

function withReaction(state, phase, reason, reaction, patch = {}) {
  return next(state, {
    phase,
    reason,
    reaction: {
      ...baseReactionFor(state),
      ...reaction,
      secondaryMotion: {
        ...baseReactionFor(state).secondaryMotion,
        ...(reaction.secondaryMotion ?? {}),
      },
    },
    ...patch,
  });
}

export function resolvePartnerBodyInputPriority({ cardInteractionActive = false, majorBattleControlActive = false, partnerEnabled = true } = {}) {
  if (cardInteractionActive) return deepFreeze({ owner: 'card', partnerAllowed: false });
  if (majorBattleControlActive) return deepFreeze({ owner: 'major_battle_control', partnerAllowed: false });
  if (!partnerEnabled) return deepFreeze({ owner: 'disabled', partnerAllowed: false });
  return deepFreeze({ owner: 'partner', partnerAllowed: true });
}

export function createPartnerBodyInteractionState({ zone, profileId, config, reducedMotion = false, lowPerf = false } = {}) {
  if (!ZONES.has(zone)) throw new TypeError('zone must be bust, cheek, thigh, or generic');
  const normalizedConfig = validateConfig(config);
  return deepFreeze(validateState({
    schema: SCHEMA,
    zone,
    profileId: nonEmpty(profileId ?? `${zone}:default`, 'profileId'),
    config: normalizedConfig,
    sequence: 0,
    phase: PARTNER_BODY_INTERACTION_PHASES.IDLE,
    reason: 'ready',
    pointer: null,
    suppressedBy: null,
    reducedMotion: Boolean(reducedMotion),
    lowPerf: Boolean(lowPerf),
    reaction: {
      ...emptyReaction(),
      secondaryMotion: { driver: null, mode: reducedMotion ? 'static' : lowPerf ? 'reduced' : 'full', energy: 0 },
    },
    presentationOnly: true,
  }));
}

function suppress(state, suppressedBy) {
  return next(state, {
    phase: PARTNER_BODY_INTERACTION_PHASES.IDLE,
    reason: `suppressed:${suppressedBy}`,
    pointer: null,
    suppressedBy,
    reaction: baseReactionFor(state),
  });
}

function ensureNotSuppressed(state) {
  return state.suppressedBy === null;
}

export function applyPartnerBodyInteractionEvent(state, event = {}) {
  validateState(state);
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('event must be an object');
  const type = nonEmpty(event.type, 'event.type');

  if (type === 'SET_ARBITRATION') {
    const priority = resolvePartnerBodyInputPriority(event);
    if (!priority.partnerAllowed) return suppress(state, priority.owner);
    return next(state, {
      phase: PARTNER_BODY_INTERACTION_PHASES.IDLE,
      reason: 'partner_input_enabled',
      pointer: null,
      suppressedBy: null,
      reaction: baseReactionFor(state),
    });
  }

  if (!ensureNotSuppressed(state)) return state;

  switch (type) {
    case 'POINTER_APPROACH': {
      const distance = validateDistance(event.distance);
      const approachStrength = unit(event.approachStrength, 'approachStrength');
      const direction = validateVector(event.directionX, event.directionY);
      if (distance <= state.config.contactRadius || distance > state.config.awarenessRadius || approachStrength === 0) return state;
      const strength = state.config.evadeGain * proximity(state.config, distance) * approachStrength;
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.APPROACH_EVADE, 'pointer_approach_evade', {
        direction,
        displacement: strength,
      });
    }
    case 'REMOTE_TAP': {
      const distance = validateDistance(event.distance);
      const tapStrength = unit(event.tapStrength, 'tapStrength');
      const direction = validateVector(event.directionX, event.directionY);
      if (distance > state.config.awarenessRadius || tapStrength === 0) return state;
      const impulse = state.config.remotePressureGain * proximity(state.config, distance) * tapStrength;
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.TAP_REMOTE_PRESSURE, 'remote_tap_pressure', {
        direction,
        displacement: impulse,
        secondaryMotion: { driver: 'remote_pressure', mode: motionMode(state), energy: motionEnergy(state, state.config.freeSwingGain * impulse) },
      });
    }
    case 'POINTER_DOWN': {
      const distance = validateDistance(event.distance);
      finite(event.atMs, 'atMs');
      const direction = validateVector(event.directionX, event.directionY);
      const pointer = { downAtMs: event.atMs, distance, direction };
      if (distance <= state.config.contactRadius) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.PRESS_CONTACT, 'direct_press_contact', {
          direction,
          compression: unit(event.compression ?? 0, 'compression'),
        }, { pointer });
      }
      return next(state, { pointer, reason: 'pointer_down_waiting', reaction: baseReactionFor(state) });
    }
    case 'PRESS_PROGRESS': {
      if (!state.pointer || state.phase !== PARTNER_BODY_INTERACTION_PHASES.PRESS_CONTACT) throw new Error('PRESS_PROGRESS requires PRESS_CONTACT');
      const compression = unit(event.compression, 'compression');
      const direction = validateVector(event.directionX ?? state.pointer.direction.x, event.directionY ?? state.pointer.direction.y);
      if (compression < state.config.pushOffCompression) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.PRESS_CONTACT, 'press_compressing', { direction, compression });
      }
      const impulse = state.config.pushOffGain * compression;
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.PUSH_OFF, 'press_push_off', {
        direction,
        compression,
        displacement: impulse,
        secondaryMotion: { driver: 'push_off', mode: motionMode(state), energy: motionEnergy(state, state.config.freeSwingGain * impulse) },
      });
    }
    case 'POINTER_MOVE': {
      if (!state.pointer) throw new Error('POINTER_MOVE requires pointer');
      const distance = validateDistance(event.distance);
      const direction = validateVector(event.directionX, event.directionY);
      const pointer = { ...state.pointer, distance, direction };
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.CLING_CAPTURE || state.phase === PARTNER_BODY_INTERACTION_PHASES.CLING_FOLLOW) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.CLING_FOLLOW, 'cling_follow', {
          direction,
          attraction: state.config.attractionGain * proximity(state.config, distance),
          adhesion: state.config.clingAdhesion,
          followLag: state.config.clingFollowLag,
        }, { pointer });
      }
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.LONG_PRESS_ATTRACT) {
        if (distance <= state.config.clingRadius) {
          return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.CLING_CAPTURE, 'cling_capture', {
            direction,
            attraction: state.config.attractionGain,
            adhesion: state.config.clingAdhesion,
            followLag: state.config.clingFollowLag,
          }, { pointer });
        }
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.LONG_PRESS_ATTRACT, 'long_press_attract', {
          direction,
          attraction: state.config.attractionGain * proximity(state.config, distance),
        }, { pointer });
      }
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.PRESS_CONTACT) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.PRESS_CONTACT, 'direct_press_contact', {
          direction,
          compression: state.reaction.compression,
        }, { pointer });
      }
      return next(state, { pointer, reason: 'pointer_move', reaction: baseReactionFor(state) });
    }
    case 'TICK': {
      if (!state.pointer) return state;
      finite(event.atMs, 'atMs');
      if (event.atMs - state.pointer.downAtMs < state.config.holdMs) return state;
      const attraction = state.config.attractionGain * proximity(state.config, state.pointer.distance);
      if (state.pointer.distance <= state.config.clingRadius) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.CLING_CAPTURE, 'cling_capture', {
          direction: state.pointer.direction,
          attraction,
          adhesion: state.config.clingAdhesion,
          followLag: state.config.clingFollowLag,
        });
      }
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.LONG_PRESS_ATTRACT, 'long_press_attract', {
        direction: state.pointer.direction,
        attraction,
      });
    }
    case 'POINTER_UP': {
      if (!state.pointer) throw new Error('POINTER_UP requires pointer');
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.CLING_CAPTURE || state.phase === PARTNER_BODY_INTERACTION_PHASES.CLING_FOLLOW) {
        const direction = state.pointer.direction;
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.PEEL_RELEASE, 'peel_release', {
          direction,
          adhesion: state.config.peelAdhesion,
          secondaryMotion: { driver: 'peel_release', mode: motionMode(state), energy: motionEnergy(state, state.config.freeSwingGain) },
        }, { pointer: null });
      }
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.SETTLE, 'pointer_release_settle', {}, { pointer: null });
    }
    case 'SHAKE_IMPULSE': {
      const strength = unit(event.strength, 'strength');
      const direction = validateVector(event.directionX, event.directionY);
      return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.FREE_SWING, 'shake_free_swing', {
        direction,
        secondaryMotion: { driver: 'shake', mode: motionMode(state), energy: motionEnergy(state, state.config.freeSwingGain * strength) },
      });
    }
    case 'MOTION_ADVANCE': {
      const recontact = event.recontact === true;
      if ([PARTNER_BODY_INTERACTION_PHASES.TAP_REMOTE_PRESSURE, PARTNER_BODY_INTERACTION_PHASES.PUSH_OFF, PARTNER_BODY_INTERACTION_PHASES.PEEL_RELEASE].includes(state.phase)) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.FREE_SWING, 'energetic_free_swing', {
          direction: state.reaction.direction,
          secondaryMotion: { driver: state.reaction.secondaryMotion.driver ?? 'release', mode: motionMode(state), energy: state.reaction.secondaryMotion.energy },
        }, { pointer: null });
      }
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.FREE_SWING) {
        if (recontact) {
          return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.RECONTACT_CLING, 'recontact_cling', {
            direction: state.reaction.direction,
            adhesion: state.config.recontactAdhesion,
            secondaryMotion: { driver: 'recontact', mode: motionMode(state), energy: motionEnergy(state, state.reaction.secondaryMotion.energy) },
          });
        }
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.SETTLE, 'free_swing_settle', {});
      }
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.RECONTACT_CLING) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.SETTLE, 'recontact_settle', {});
      }
      if (state.phase === PARTNER_BODY_INTERACTION_PHASES.SETTLE || state.phase === PARTNER_BODY_INTERACTION_PHASES.APPROACH_EVADE) {
        return withReaction(state, PARTNER_BODY_INTERACTION_PHASES.IDLE, 'ready', {});
      }
      return state;
    }
    case 'RESET':
      return next(state, {
        phase: PARTNER_BODY_INTERACTION_PHASES.IDLE,
        reason: 'ready',
        pointer: null,
        reaction: baseReactionFor(state),
      });
    default:
      throw new Error(`unsupported event: ${type}`);
  }
}

export function projectPartnerBodyInteraction(state) {
  validateState(state);
  return deepFreeze({
    schema: state.schema,
    zone: state.zone,
    profileId: state.profileId,
    phase: state.phase,
    reason: state.reason,
    presentationOnly: true,
    suppressedBy: state.suppressedBy,
    reaction: {
      direction: state.reaction.direction,
      displacement: state.reaction.displacement,
      compression: state.reaction.compression,
      attraction: state.reaction.attraction,
      adhesion: state.reaction.adhesion,
      followLag: state.reaction.followLag,
      secondaryMotion: state.reaction.secondaryMotion,
    },
    accessibility: {
      reducedMotion: state.reducedMotion,
      lowPerf: state.lowPerf,
      motionMode: motionMode(state),
    },
  });
}

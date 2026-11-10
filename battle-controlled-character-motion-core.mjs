const DEFAULT_TIMINGS = Object.freeze({
  idle: 2200,
  selected: 140,
  moving: 180,
  reacting: 160,
  settle: 180,
});

const REACTIONS = new Set(['ack', 'commit', 'impact', 'settle', 'turn-handoff']);
const FACINGS = new Set(['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right', 'forward', 'back']);

function asNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function sequencingOf(source = {}) {
  return {
    revision: asNonNegativeInteger(source.revision, 0),
    controlGeneration: asNonNegativeInteger(source.controlGeneration, 0),
  };
}

function isStale(state, event) {
  const next = sequencingOf(event);
  if (next.controlGeneration < state.controlGeneration) return true;
  if (next.controlGeneration > state.controlGeneration) return false;
  return next.revision < state.revision;
}

function withTransition(state, patch, accepted, reason, eventType) {
  return Object.freeze({
    ...state,
    ...patch,
    lastTransition: Object.freeze({ accepted, reason, eventType }),
  });
}

function acceptSequencing(state, event) {
  const next = sequencingOf(event);
  return {
    revision: next.revision,
    controlGeneration: next.controlGeneration,
  };
}

export function createControlledCharacterMotionState({
  participantId = null,
  characterId = null,
  revision = 0,
  controlGeneration = 0,
  positionKey = null,
} = {}) {
  const sequence = sequencingOf({ revision, controlGeneration });
  return Object.freeze({
    participantId,
    characterId,
    revision: sequence.revision,
    controlGeneration: sequence.controlGeneration,
    positionKey,
    phase: 'idle',
    facing: 'forward',
    reaction: null,
    selected: false,
    motionSerial: 0,
    presentationOnly: true,
    gameplayAuthority: false,
    positionAuthority: 'EXTERNAL_PARENT_BOARD_MARKER',
    lastTransition: Object.freeze({ accepted: true, reason: 'INITIALIZED', eventType: 'INIT' }),
  });
}

export function transitionControlledCharacterMotion(state, event = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state must be a controlled-character motion state');
  }

  const type = String(event.type || '');
  if (!type) return withTransition(state, {}, false, 'MISSING_EVENT_TYPE', '');

  if (isStale(state, event)) {
    return withTransition(state, {}, false, 'STALE_SEQUENCE', type);
  }

  const sequencing = acceptSequencing(state, event);

  switch (type) {
    case 'SELECT':
      return withTransition(state, {
        ...sequencing,
        phase: 'selected',
        selected: true,
        reaction: null,
        motionSerial: state.motionSerial + 1,
      }, true, 'SELECTED', type);

    case 'MOVE_ACCEPTED': {
      if (event.toPositionKey == null) {
        return withTransition(state, {}, false, 'MISSING_ACCEPTED_DESTINATION', type);
      }
      const facing = FACINGS.has(event.facing) ? event.facing : state.facing;
      return withTransition(state, {
        ...sequencing,
        phase: 'moving',
        selected: false,
        reaction: null,
        facing,
        positionKey: event.toPositionKey,
        motionSerial: state.motionSerial + 1,
      }, true, 'ACCEPTED_MOVEMENT_PROJECTED', type);
    }

    case 'REACTION': {
      const reaction = String(event.reaction || '');
      if (!REACTIONS.has(reaction)) {
        return withTransition(state, {}, false, 'UNSUPPORTED_REACTION', type);
      }
      return withTransition(state, {
        ...sequencing,
        phase: 'reacting',
        selected: false,
        reaction,
        motionSerial: state.motionSerial + 1,
      }, true, 'REACTION_PROJECTED', type);
    }

    case 'SETTLE':
      return withTransition(state, {
        ...sequencing,
        phase: 'idle',
        selected: false,
        reaction: null,
        motionSerial: state.motionSerial + 1,
      }, true, 'SETTLED', type);

    case 'RECONNECT':
      return withTransition(state, {
        ...sequencing,
        positionKey: event.positionKey ?? state.positionKey,
        phase: 'idle',
        selected: false,
        reaction: null,
        motionSerial: state.motionSerial + 1,
      }, true, 'RECONNECTED_TO_AUTHORITY', type);

    default:
      return withTransition(state, {}, false, 'UNSUPPORTED_EVENT', type);
  }
}

function timingFor(phase, timings) {
  if (phase === 'idle') return timings.idle;
  if (phase === 'selected') return timings.selected;
  if (phase === 'moving') return timings.moving;
  if (phase === 'reacting') return timings.reacting;
  return timings.settle;
}

function animationFor(state, reducedMotion) {
  if (reducedMotion) {
    if (state.phase === 'idle') return 'reduced-idle';
    if (state.phase === 'selected') return 'reduced-selected-focus';
    if (state.phase === 'moving') return 'reduced-move-cue';
    if (state.phase === 'reacting') return `reduced-reaction-${state.reaction || 'ack'}`;
    return 'reduced-settle';
  }
  if (state.phase === 'idle') return 'idle-breathe';
  if (state.phase === 'selected') return 'selected-focus';
  if (state.phase === 'moving') return 'accepted-move';
  if (state.phase === 'reacting') return `reaction-${state.reaction || 'ack'}`;
  return 'settle';
}

export function projectControlledCharacterMotion(state, {
  reducedMotion = false,
  lowPerformance = false,
  timings = DEFAULT_TIMINGS,
  visualAvailable = true,
} = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state must be a controlled-character motion state');
  }

  const safeTimings = { ...DEFAULT_TIMINGS, ...(timings || {}) };
  const durationMs = reducedMotion
    ? Math.min(timingFor(state.phase, safeTimings), state.phase === 'idle' ? 0 : 90)
    : timingFor(state.phase, safeTimings);

  const effects = Object.freeze({
    transform: true,
    opacity: true,
    outline: state.phase === 'selected',
    travelBob: !reducedMotion && !lowPerformance && state.phase === 'moving',
    overshoot: !reducedMotion && !lowPerformance && state.phase === 'selected',
    blur: false,
    particles: false,
  });

  return Object.freeze({
    phase: state.phase,
    animation: visualAvailable ? animationFor(state, reducedMotion) : 'static-marker',
    durationMs: visualAvailable ? durationMs : 0,
    easing: reducedMotion ? 'linear' : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    loop: visualAvailable && !reducedMotion && state.phase === 'idle',
    facing: state.facing,
    reaction: state.reaction,
    motionSerial: state.motionSerial,
    reducedMotion: Boolean(reducedMotion),
    lowPerformance: Boolean(lowPerformance),
    failVisible: true,
    fallback: 'static-marker',
    presentationOnly: true,
    gameplayAuthority: false,
    positionAuthority: 'EXTERNAL_PARENT_BOARD_MARKER',
    positionKey: state.positionKey,
    effects,
  });
}

export const CONTROLLED_CHARACTER_MOTION_CONTRACT = Object.freeze({
  acceptedMovementEvent: 'MOVE_ACCEPTED',
  positionAuthority: 'EXTERNAL_PARENT_BOARD_MARKER',
  coordinateProjection: 'NONE',
  presentationOnly: true,
  gameplayAuthority: false,
  failVisible: true,
  reconnectInvalidation: Object.freeze(['controlGeneration', 'revision']),
  reactions: Object.freeze([...REACTIONS]),
  timings: DEFAULT_TIMINGS,
});

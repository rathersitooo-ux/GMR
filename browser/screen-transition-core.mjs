export const SCREEN_TRANSITION_MODE = Object.freeze({
  NORMAL: 'normal',
  REDUCED: 'reduced',
  LOW_PERF: 'lowPerf'
});

export const SCREEN_TRANSITION_PHASE = Object.freeze({
  PREPARE: 'prepare',
  EXIT: 'exit',
  ENTER: 'enter',
  SETTLE: 'settle'
});

export const SCREEN_TRANSITION_EVENT = Object.freeze({
  PREPARED: 'prepared',
  SWAPPED: 'swapped',
  ENTERED: 'entered',
  SETTLED: 'settled',
  SKIP_TO_END: 'skip-to-end'
});

export const SCREEN_TRANSITION_REJECTION = Object.freeze({
  EMPTY_TARGET: 'empty-target',
  VISIBLE_SCREEN: 'visible-screen',
  ACTIVE_TARGET: 'active-target',
  NO_ACTIVE_TRANSITION: 'no-active-transition',
  STALE_GENERATION: 'stale-generation',
  INVALID_EVENT_FOR_PHASE: 'invalid-event-for-phase'
});

const VALID_MODES = new Set(Object.values(SCREEN_TRANSITION_MODE));
const VALID_PHASE_EVENTS = Object.freeze({
  [SCREEN_TRANSITION_PHASE.PREPARE]: SCREEN_TRANSITION_EVENT.PREPARED,
  [SCREEN_TRANSITION_PHASE.EXIT]: SCREEN_TRANSITION_EVENT.SWAPPED,
  [SCREEN_TRANSITION_PHASE.ENTER]: SCREEN_TRANSITION_EVENT.ENTERED,
  [SCREEN_TRANSITION_PHASE.SETTLE]: SCREEN_TRANSITION_EVENT.SETTLED
});

function normalizeScreen(value) {
  return String(value ?? '').trim();
}

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : SCREEN_TRANSITION_MODE.NORMAL;
}

function normalizeImportance(value) {
  const normalized = String(value ?? 'normal').trim().toLowerCase();
  if (normalized === 'result' || normalized === 'important') return normalized;
  return 'normal';
}

function arrivalEmphasisFor(importance) {
  if (importance === 'result') return 'strong';
  if (importance === 'important') return 'standard';
  return 'subtle';
}

export function resolveScreenTransitionMotionProfile(mode = SCREEN_TRANSITION_MODE.NORMAL, importance = 'normal') {
  const resolvedMode = normalizeMode(mode);
  const resolvedImportance = normalizeImportance(importance);

  if (resolvedMode === SCREEN_TRANSITION_MODE.REDUCED) {
    return Object.freeze({
      mode: resolvedMode,
      movement: 'none',
      opacity: 'crossfade',
      scale: 'none',
      direction: 'none',
      arrivalEmphasis: 'none',
      timingToken: 'reduced-opacity',
      interruptible: true,
      skippable: true
    });
  }

  if (resolvedMode === SCREEN_TRANSITION_MODE.LOW_PERF) {
    return Object.freeze({
      mode: resolvedMode,
      movement: 'none',
      opacity: 'instant',
      scale: 'none',
      direction: 'none',
      arrivalEmphasis: 'none',
      timingToken: 'immediate',
      interruptible: true,
      skippable: true
    });
  }

  return Object.freeze({
    mode: resolvedMode,
    movement: 'short-axis',
    opacity: 'crossfade',
    scale: resolvedImportance === 'normal' ? 'none' : 'arrival-emphasis',
    direction: 'route-relative',
    arrivalEmphasis: arrivalEmphasisFor(resolvedImportance),
    timingToken: 'runtime-motion-token',
    interruptible: true,
    skippable: true
  });
}

function freezeActive(active) {
  return active ? Object.freeze({ ...active }) : null;
}

function freezeState(state) {
  return Object.freeze({ ...state, active: freezeActive(state.active) });
}

export function createScreenTransitionState(initialScreen = 'home', mode = SCREEN_TRANSITION_MODE.NORMAL) {
  const screen = normalizeScreen(initialScreen) || 'home';
  return freezeState({
    currentScreen: screen,
    visibleScreen: screen,
    generation: 0,
    mode: normalizeMode(mode),
    active: null
  });
}

export function beginScreenTransition(state, request = {}) {
  const target = normalizeScreen(request.to);
  if (!target) {
    return Object.freeze({ state, accepted: false, reason: SCREEN_TRANSITION_REJECTION.EMPTY_TARGET });
  }

  if (state.active?.to === target) {
    return Object.freeze({ state, accepted: false, reason: SCREEN_TRANSITION_REJECTION.ACTIVE_TARGET });
  }

  if (!state.active && target === state.visibleScreen) {
    return Object.freeze({ state, accepted: false, reason: SCREEN_TRANSITION_REJECTION.VISIBLE_SCREEN });
  }

  const generation = state.generation + 1;
  const importance = normalizeImportance(request.importance);
  const active = Object.freeze({
    generation,
    from: state.visibleScreen,
    to: target,
    cause: String(request.cause ?? 'navigate'),
    importance,
    phase: SCREEN_TRANSITION_PHASE.PREPARE,
    inputOwner: `screen-transition:${generation}`,
    motion: resolveScreenTransitionMotionProfile(state.mode, importance)
  });
  const nextState = freezeState({
    ...state,
    generation,
    active
  });

  return Object.freeze({
    state: nextState,
    accepted: true,
    generation,
    supersededGeneration: state.active?.generation ?? null,
    inputOwner: active.inputOwner,
    blocksInput: true,
    motion: active.motion
  });
}

function activeGenerationCheck(state, generation) {
  if (!state.active) return SCREEN_TRANSITION_REJECTION.NO_ACTIVE_TRANSITION;
  if (state.active.generation !== generation) return SCREEN_TRANSITION_REJECTION.STALE_GENERATION;
  return null;
}

export function advanceScreenTransition(state, generation, event) {
  const generationError = activeGenerationCheck(state, generation);
  if (generationError) {
    return Object.freeze({ state, applied: false, reason: generationError });
  }

  if (event === SCREEN_TRANSITION_EVENT.SKIP_TO_END) {
    const target = state.active.to;
    return Object.freeze({
      state: freezeState({ ...state, currentScreen: target, visibleScreen: target, active: null }),
      applied: true,
      completed: true,
      skipped: true,
      blocksInput: false
    });
  }

  const expectedEvent = VALID_PHASE_EVENTS[state.active.phase];
  if (event !== expectedEvent) {
    return Object.freeze({ state, applied: false, reason: SCREEN_TRANSITION_REJECTION.INVALID_EVENT_FOR_PHASE });
  }

  if (state.active.phase === SCREEN_TRANSITION_PHASE.PREPARE) {
    return Object.freeze({
      state: freezeState({ ...state, active: { ...state.active, phase: SCREEN_TRANSITION_PHASE.EXIT } }),
      applied: true,
      completed: false,
      blocksInput: true
    });
  }

  if (state.active.phase === SCREEN_TRANSITION_PHASE.EXIT) {
    return Object.freeze({
      state: freezeState({
        ...state,
        visibleScreen: state.active.to,
        active: { ...state.active, phase: SCREEN_TRANSITION_PHASE.ENTER }
      }),
      applied: true,
      completed: false,
      blocksInput: true
    });
  }

  if (state.active.phase === SCREEN_TRANSITION_PHASE.ENTER) {
    return Object.freeze({
      state: freezeState({ ...state, active: { ...state.active, phase: SCREEN_TRANSITION_PHASE.SETTLE } }),
      applied: true,
      completed: false,
      blocksInput: true
    });
  }

  const target = state.visibleScreen;
  return Object.freeze({
    state: freezeState({ ...state, currentScreen: target, active: null }),
    applied: true,
    completed: true,
    blocksInput: false
  });
}

export function cancelScreenTransition(state, generation, reason = 'cancelled') {
  const generationError = activeGenerationCheck(state, generation);
  if (generationError) {
    return Object.freeze({ state, cancelled: false, reason: generationError });
  }

  const swapped = state.visibleScreen === state.active.to;
  const nextState = freezeState({
    ...state,
    currentScreen: swapped ? state.visibleScreen : state.currentScreen,
    active: null
  });

  return Object.freeze({
    state: nextState,
    cancelled: true,
    reason: String(reason),
    committedVisibleScreen: swapped,
    blocksInput: false
  });
}

export function setScreenTransitionMode(state, mode) {
  const resolvedMode = normalizeMode(mode);
  if (resolvedMode === state.mode) return state;
  return freezeState({ ...state, mode: resolvedMode });
}

export function getScreenTransitionSnapshot(state) {
  return Object.freeze({
    currentScreen: state.currentScreen,
    visibleScreen: state.visibleScreen,
    generation: state.generation,
    mode: state.mode,
    activeGeneration: state.active?.generation ?? null,
    activeTarget: state.active?.to ?? null,
    phase: state.active?.phase ?? null,
    inputOwner: state.active?.inputOwner ?? null,
    blocksInput: Boolean(state.active),
    motion: state.active?.motion ?? null
  });
}

export function createScreenTransitionRuntimeBridge(options = {}) {
  let state = createScreenTransitionState(options.initialScreen, options.mode);

  return Object.freeze({
    begin(request) {
      const result = beginScreenTransition(state, request);
      state = result.state;
      return result;
    },
    advance(generation, event) {
      const result = advanceScreenTransition(state, generation, event);
      state = result.state;
      return result;
    },
    cancel(generation, reason) {
      const result = cancelScreenTransition(state, generation, reason);
      state = result.state;
      return result;
    },
    setMode(mode) {
      state = setScreenTransitionMode(state, mode);
      return getScreenTransitionSnapshot(state);
    },
    snapshot() {
      return getScreenTransitionSnapshot(state);
    }
  });
}

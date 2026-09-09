const SCHEMA = 'GAMEROAD_NEW_BASE_GOAL_ARRIVAL_PRESENTATION_V1';
const TERMINAL_REASON = 'GOAL_REACHED';

const STAGE = Object.freeze({
  ARRIVE: 'ARRIVE',
  CONFIRM: 'CONFIRM',
  CELEBRATE: 'CELEBRATE',
  HANDOFF: 'HANDOFF'
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion) {
    return Object.freeze({
      id: 'REDUCED_MOTION',
      travel: false,
      cameraMotion: false,
      particles: false,
      blur: false,
      pulse: 'STATIC_EMPHASIS'
    });
  }
  if (lowPerf) {
    return Object.freeze({
      id: 'LOW_PERF',
      travel: true,
      cameraMotion: false,
      particles: false,
      blur: false,
      pulse: 'TRANSFORM_ONLY'
    });
  }
  return Object.freeze({
    id: 'NORMAL',
    travel: true,
    cameraMotion: true,
    particles: true,
    blur: true,
    pulse: 'FULL'
  });
}

function buildStages(profile) {
  const durations = profile.id === 'REDUCED_MOTION'
    ? [120, 140, 260, 100]
    : profile.id === 'LOW_PERF'
      ? [180, 180, 420, 120]
      : [260, 220, 720, 180];

  return [
    {
      id: STAGE.ARRIVE,
      semantic: 'AUTHORITATIVE_ACTOR_REACHED_GOAL',
      visualCue: profile.travel ? 'ACTOR_TO_GOAL_TRACE' : 'GOAL_STATIC_LOCK',
      durationMs: durations[0]
    },
    {
      id: STAGE.CONFIRM,
      semantic: 'GOAL_ARRIVAL_CONFIRMED',
      visualCue: profile.pulse === 'STATIC_EMPHASIS' ? 'GOAL_STATIC_CONFIRM' : 'GOAL_CONFIRM_PULSE',
      durationMs: durations[1]
    },
    {
      id: STAGE.CELEBRATE,
      semantic: 'GOAL_TERMINAL_CELEBRATION',
      visualCue: profile.particles ? 'GOAL_HALO_BURST' : 'GOAL_HALO_EMPHASIS',
      durationMs: durations[2]
    },
    {
      id: STAGE.HANDOFF,
      semantic: 'RESULT_PRESENTATION_HANDOFF',
      visualCue: 'GOAL_SETTLE',
      durationMs: durations[3]
    }
  ];
}

function acceptedFirstGoalResult(transition) {
  if (!transition || typeof transition !== 'object' || Array.isArray(transition)) return null;
  if (transition.accepted !== true || transition.duplicate === true) return null;
  const state = transition.state;
  const result = state?.finalizedResult;
  const arrival = result?.goalArrival;
  if (state?.status !== 'ENDED') return null;
  if (result?.terminalReason !== TERMINAL_REASON) return null;
  if (!nonEmptyString(result.resultId) || !nonEmptyString(result.matchId)) return null;
  if (!Array.isArray(result.winnerIds) || result.winnerIds.length === 0) return null;
  if (!arrival || !nonEmptyString(arrival.eventId) || !nonEmptyString(arrival.actorId) || !nonEmptyString(arrival.goalId)) {
    return null;
  }
  return { result, arrival };
}

/**
 * Build the strong GOAL-arrival beat from an already accepted authority transition.
 * This function never decides victory and intentionally refuses duplicate/rejected/progression-only input.
 * Durations are presentation timing only; they are not gameplay timing or authority.
 */
export function createNewBaseGoalArrivalPresentation(transition, options = {}) {
  const accepted = acceptedFirstGoalResult(transition);
  if (!accepted) return null;
  const profile = resolveProfile(options);
  const { result, arrival } = accepted;

  return deepFreeze({
    schema: SCHEMA,
    kind: 'NEW_BASE_GOAL_ARRIVAL',
    authority: 'CALLER_ACCEPTED_GOAL_REACHED_ONLY',
    eventId: arrival.eventId.trim(),
    resultId: result.resultId.trim(),
    matchId: result.matchId.trim(),
    actorId: arrival.actorId.trim(),
    goalId: arrival.goalId.trim(),
    winnerIds: result.winnerIds.map((value) => String(value).trim()).filter(Boolean),
    terminalReason: TERMINAL_REASON,
    profile,
    stages: buildStages(profile),
    resultHandoff: true,
    timingIsGameplay: false
  });
}

export function isNewBaseGoalArrivalPresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && value.schema === SCHEMA
      && value.kind === 'NEW_BASE_GOAL_ARRIVAL'
      && value.terminalReason === TERMINAL_REASON
      && nonEmptyString(value.eventId)
      && nonEmptyString(value.actorId)
      && nonEmptyString(value.goalId)
      && Array.isArray(value.stages)
      && value.stages.length === 4
  );
}

export const NEW_BASE_GOAL_ARRIVAL_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  terminalReason: TERMINAL_REASON,
  stages: STAGE
});

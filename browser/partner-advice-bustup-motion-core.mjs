export const PARTNER_ADVICE_BUSTUP_MOTION_SCHEMA = 'gameroad.partner-advice-bustup-motion.v1';

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token && token === value && token.length <= max ? token : null;
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const partnerId = exactToken(profile.partnerId);
  const personality = exactToken(profile.motionPersonality);
  const initialState = exactToken(profile.initialState);
  const guideState = exactToken(profile.guideState);
  const states = profile.states && typeof profile.states === 'object' && !Array.isArray(profile.states)
    ? profile.states
    : null;
  if (!partnerId || !personality || !initialState || !guideState || !states?.[initialState] || !states?.[guideState]) return null;
  for (const spec of Object.values(states)) {
    if (!exactToken(spec?.mode) || !exactToken(spec?.assetPath, 512) || !exactToken(spec?.animationKey) || !exactToken(spec?.motionPreset)) {
      return null;
    }
  }
  return profile;
}

function stateDurationMs(spec) {
  const fixed = finiteNonNegative(spec?.durationMs);
  if (fixed !== null) return fixed;
  if (Array.isArray(spec?.durationRangeMs) && spec.durationRangeMs.length === 2) {
    const lo = finiteNonNegative(spec.durationRangeMs[0]);
    const hi = finiteNonNegative(spec.durationRangeMs[1]);
    if (lo !== null && hi !== null && hi >= lo) return hi;
  }
  return 0;
}

function presentation(profile, stateId, nowMs, activeReaction, queuedReaction, guideActive) {
  const spec = profile.states[stateId] || profile.states[profile.initialState];
  const remainingMs = activeReaction
    ? Math.max(0, activeReaction.untilMs - nowMs)
    : null;
  return freeze({
    schema: PARTNER_ADVICE_BUSTUP_MOTION_SCHEMA,
    active: true,
    partnerId: profile.partnerId,
    motionPersonality: profile.motionPersonality,
    stateId,
    side: spec.side,
    mode: spec.mode,
    assetPath: spec.assetPath,
    animationKey: spec.animationKey,
    motionPreset: spec.motionPreset,
    guideActive,
    reactionActive: Boolean(activeReaction),
    queuedStateId: queuedReaction?.stateId ?? null,
    remainingMs,
    presentationOnly: true,
    saveMutated: false,
    gameplayAuthorityMutated: false,
  });
}

export function createPartnerAdviceBustupMotionController({ profile, now = () => Date.now() } = {}) {
  const currentProfile = normalizeProfile(profile);
  if (!currentProfile) throw new TypeError('valid bust-up motion profile is required');
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  let guideActive = false;
  let activeReaction = null;
  let queuedReaction = null;
  const consumedEvents = new Set();

  const currentTime = () => {
    const value = Number(now());
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };

  const expire = (atMs = currentTime()) => {
    if (!activeReaction || atMs < activeReaction.untilMs) return false;
    activeReaction = null;
    if (!guideActive && queuedReaction) {
      const queued = queuedReaction;
      queuedReaction = null;
      const spec = currentProfile.states[queued.stateId];
      const durationMs = stateDurationMs(spec);
      activeReaction = freeze({ ...queued, startedAtMs: atMs, untilMs: atMs + durationMs });
    }
    return true;
  };

  const startReaction = (stateId, eventId, atMs) => {
    const spec = currentProfile.states[stateId];
    const durationMs = stateDurationMs(spec);
    activeReaction = freeze({
      stateId,
      eventId,
      priority: Number.isFinite(spec?.priority) ? spec.priority : 0,
      startedAtMs: atMs,
      untilMs: atMs + durationMs,
    });
    return true;
  };

  return Object.freeze({
    setGuideActive(next) {
      const value = next === true;
      if (guideActive === value) return false;
      guideActive = value;
      const atMs = currentTime();
      expire(atMs);
      if (!guideActive && !activeReaction && queuedReaction) {
        const queued = queuedReaction;
        queuedReaction = null;
        startReaction(queued.stateId, queued.eventId, atMs);
      }
      return true;
    },
    trigger(stateId, { eventId = null } = {}) {
      const id = exactToken(stateId);
      const spec = id ? currentProfile.states[id] : null;
      if (!spec || spec.reaction !== true) return false;
      const event = exactToken(eventId, 256) || `${id}:anonymous`;
      if (consumedEvents.has(event)) return false;
      consumedEvents.add(event);
      const candidate = freeze({ stateId: id, eventId: event, priority: Number.isFinite(spec.priority) ? spec.priority : 0 });
      if (guideActive && spec.deferDuringGuide !== false) {
        if (!queuedReaction || candidate.priority >= queuedReaction.priority) queuedReaction = candidate;
        return true;
      }
      const atMs = currentTime();
      expire(atMs);
      if (activeReaction && candidate.priority < activeReaction.priority) {
        if (!queuedReaction || candidate.priority >= queuedReaction.priority) queuedReaction = candidate;
        return true;
      }
      return startReaction(id, event, atMs);
    },
    clearReaction() {
      if (!activeReaction && !queuedReaction) return false;
      activeReaction = null;
      queuedReaction = null;
      return true;
    },
    tick() {
      expire(currentTime());
      return this.status();
    },
    status() {
      const atMs = currentTime();
      expire(atMs);
      const stateId = activeReaction?.stateId || (guideActive ? currentProfile.guideState : currentProfile.initialState);
      return presentation(currentProfile, stateId, atMs, activeReaction, queuedReaction, guideActive);
    },
  });
}

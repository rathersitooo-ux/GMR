const HATE_FORCE_THRESHOLD = 1000;

function cloneSelection(selection = {}) {
  return {
    mode: selection.mode ?? null,
    regulation: selection.regulation ?? null,
    deck: Array.isArray(selection.deck) ? [...selection.deck] : selection.deck ?? null,
  };
}

export function createHateDelegationState({ matchId, selection, hate = 0 } = {}) {
  if (!matchId) throw new Error('matchId required');
  return {
    matchId,
    hate: Number.isFinite(hate) ? Math.max(0, hate) : 0,
    forcedDelegationApplied: false,
    forcedDelegationEventId: null,
    lastAuthoritativeRevision: -1,
    selection: cloneSelection(selection),
  };
}

export function applyAuthoritativeHate(state, event = {}) {
  if (!state?.matchId) throw new Error('valid state required');
  if (event.matchId !== state.matchId) return { state, effect: null, accepted: false, reason: 'match_mismatch' };
  if (!Number.isInteger(event.revision) || event.revision <= state.lastAuthoritativeRevision) {
    return { state, effect: null, accepted: false, reason: 'stale_or_duplicate_revision' };
  }
  if (!Number.isFinite(event.hate) || event.hate < 0) {
    return { state, effect: null, accepted: false, reason: 'invalid_hate' };
  }

  const next = {
    ...state,
    hate: event.hate,
    lastAuthoritativeRevision: event.revision,
    selection: cloneSelection(state.selection),
  };

  if (next.forcedDelegationApplied || event.hate < HATE_FORCE_THRESHOLD) {
    return { state: next, effect: null, accepted: true, reason: 'state_advanced' };
  }

  const eventId = `hate1000:${state.matchId}`;
  next.forcedDelegationApplied = true;
  next.forcedDelegationEventId = eventId;
  return {
    state: next,
    accepted: true,
    reason: 'forced_delegation',
    effect: {
      type: 'FORCE_DELEGATION',
      eventId,
      matchId: state.matchId,
      selection: cloneSelection(state.selection),
    },
  };
}

export function restoreHateDelegationState(snapshot = {}) {
  if (!snapshot.matchId) throw new Error('matchId required');
  return {
    matchId: snapshot.matchId,
    hate: Number.isFinite(snapshot.hate) ? Math.max(0, snapshot.hate) : 0,
    forcedDelegationApplied: snapshot.forcedDelegationApplied === true,
    forcedDelegationEventId: snapshot.forcedDelegationEventId ?? null,
    lastAuthoritativeRevision: Number.isInteger(snapshot.lastAuthoritativeRevision) ? snapshot.lastAuthoritativeRevision : -1,
    selection: cloneSelection(snapshot.selection),
  };
}

export { HATE_FORCE_THRESHOLD };

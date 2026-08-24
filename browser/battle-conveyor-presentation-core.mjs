const SCHEMA = 'gameroad.battle-conveyor-presentation.v2';
const BATTLE_START_SCHEMA = 'gameroad.battle-start-handoff.v1';
const BATTLE_START_LIVE_SCHEMA = 'gameroad.battle-start-live-handoff.v1';

const EVENT_KINDS = Object.freeze([
  'partner_cutin', 'reveal', 'attack', 'ability', 'compare4', 'finisher', 'settle'
]);

const TRANSITIONS = Object.freeze({
  ENTRY: 'ENTRY',
  CONTINUE: 'CONTINUE',
  REPLACE_RIGHT: 'IMPACT_CARRY_RIGHT',
  REPLACE_LEFT: 'IMPACT_CARRY_LEFT',
  PAIR_SWAP_RIGHT: 'PAIR_SWAP_RIGHT',
  MULTI_TARGET_SPREAD: 'MULTI_TARGET_SPREAD',
  MULTI_TARGET_COLLAPSE: 'MULTI_TARGET_COLLAPSE',
  PARTNER_CUTIN: 'PARTNER_CUTIN_LEFT',
  COMPARE4: 'COMPARE4',
  FINISHER_GATHER: 'FINISHER_GATHER'
});

const EMPHASIS = Object.freeze({
  ambient: { anticipation: 0, impact: 0, shake: 0, overshoot: 0 },
  normal: { anticipation: 1, impact: 1, shake: 1, overshoot: 1 },
  strong: { anticipation: 1.35, impact: 1.5, shake: 1.5, overshoot: 1.35 },
  major: { anticipation: 1.8, impact: 2.25, shake: 2.15, overshoot: 1.8 }
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function str(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label}_REQUIRED`);
  return value;
}
function nonNegativeMs(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label}_INVALID`);
  return value;
}
function positiveMs(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${label}_INVALID`);
  return value;
}
function normalizeAcceptedEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('EVENT_REQUIRED');
  if (raw.accepted !== true) throw new TypeError('EVENT_NOT_ACCEPTED');
  const eventId = str(raw.eventId, 'EVENT_ID');
  const kind = str(raw.kind, 'KIND');
  if (!EVENT_KINDS.includes(kind)) throw new TypeError(`UNSUPPORTED_EVENT:${kind}`);
  const publicData = raw.publicData && typeof raw.publicData === 'object' && !Array.isArray(raw.publicData)
    ? clone(raw.publicData) : {};
  return freeze({ accepted: true, eventId, kind, publicData });
}
function sideOf(stage, id) {
  if (!stage) return null;
  if (stage.left === id) return 'left';
  if (stage.right === id) return 'right';
  return null;
}
function duelTransition(stage, sourceId, targetId) {
  if (!stage?.left || !stage?.right) return { transition: TRANSITIONS.ENTRY, stage: { left: sourceId, right: targetId } };
  const ids = new Set([stage.left, stage.right]);
  if (ids.has(sourceId) && ids.has(targetId)) return { transition: TRANSITIONS.CONTINUE, stage: clone(stage) };
  const sourceSide = sideOf(stage, sourceId);
  const targetSide = sideOf(stage, targetId);
  if (sourceSide === 'left') return { transition: TRANSITIONS.REPLACE_RIGHT, stage: { left: sourceId, right: targetId } };
  if (sourceSide === 'right') return { transition: TRANSITIONS.REPLACE_LEFT, stage: { left: targetId, right: sourceId } };
  if (targetSide === 'right') return { transition: TRANSITIONS.REPLACE_LEFT, stage: { left: sourceId, right: targetId } };
  if (targetSide === 'left') return { transition: TRANSITIONS.REPLACE_RIGHT, stage: { left: targetId, right: sourceId } };
  return { transition: TRANSITIONS.PAIR_SWAP_RIGHT, stage: { left: sourceId, right: targetId } };
}
function normalizeTargets(data) {
  if (!Array.isArray(data.targetIds) || !data.targetIds.length) throw new TypeError('TARGET_IDS_REQUIRED');
  return data.targetIds.map(id => str(id, 'TARGET_ID'));
}
function importanceFor(kind, data) {
  if (kind === 'finisher') return 'major';
  if (data.importance === 'major' || data.importance === 'strong' || data.importance === 'normal') return data.importance;
  if (kind === 'ability' && data.simultaneous === true) return 'strong';
  return kind === 'attack' || kind === 'ability' ? 'normal' : 'ambient';
}
function motionMarkers(kind, importance, reducedMotion = false) {
  const base = kind === 'finisher'
    ? { anticipation: 520, travel: 310, hitStop: 120, reaction: 580, recovery: 650, handoffLead: 330 }
    : importance === 'strong'
      ? { anticipation: 310, travel: 220, hitStop: 86, reaction: 420, recovery: 460, handoffLead: 250 }
      : { anticipation: 230, travel: 180, hitStop: 58, reaction: 330, recovery: 380, handoffLead: 210 };
  if (reducedMotion) {
    return freeze({ anticipation: 70, travel: 50, hitStop: 40, reaction: 90, recovery: 100, handoffLead: 70 });
  }
  return freeze(base);
}

const ENVIRONMENT_PHASES = Object.freeze({
  IDLE_READ: 'IDLE_READ',
  RESOLVE: 'RESOLVE',
  SETTLE_AFTERMATH: 'SETTLE_AFTERMATH'
});
const ENVIRONMENT_MOTION_INTENT = Object.freeze({
  IDLE_READ: 'AMBIENT_OPTIONAL',
  RESOLVE: 'BURST',
  SETTLE_AFTERMATH: 'SETTLE'
});
function loopUnit(value) { return ((value % 1) + 1) % 1; }
function environmentDepthCurve(depth) { return depth * depth * (3 - 2 * depth); }

export function planBattleConveyorEnvironmentFrame({
  segmentCount,
  travel,
  phase,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  if (!Number.isSafeInteger(segmentCount) || segmentCount < 3 || segmentCount > 64) {
    throw new TypeError('ENVIRONMENT_SEGMENT_COUNT_INVALID');
  }
  if (!Number.isFinite(travel) || travel < 0) throw new TypeError('ENVIRONMENT_TRAVEL_INVALID');
  if (!Object.prototype.hasOwnProperty.call(ENVIRONMENT_PHASES, phase)) {
    throw new TypeError(`ENVIRONMENT_PHASE_INVALID:${phase}`);
  }
  const motionSuppressed = reducedMotion === true || lowPerf === true;
  const effectiveTravel = motionSuppressed ? 0 : travel;
  const segments = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const baseDepth = index / segmentCount;
    const rawDepth = baseDepth + effectiveTravel;
    const normalizedDepth = loopUnit(rawDepth);
    const perspectiveDepth = environmentDepthCurve(normalizedDepth);
    segments.push(freeze({
      segmentId: `visual-segment-${index}`,
      normalizedDepth,
      recycleCycle: Math.floor(rawDepth),
      screenY: 0.12 + (0.60 * perspectiveDepth),
      scale: 0.18 + (0.82 * perspectiveDepth),
      opacity: 0.18 + (0.82 * perspectiveDepth),
      recycleOnly: true
    }));
  }
  return freeze({
    schema: 'gameroad.battle-conveyor-environment.v1',
    presentationOnly: true,
    environmentAuthority: 'decorative_visual_loop_only',
    gameStateWrite: false,
    position109Write: false,
    targetWrite: false,
    orderWrite: false,
    formalArt: false,
    phase: ENVIRONMENT_PHASES[phase],
    motionIntent: ENVIRONMENT_MOTION_INTENT[phase],
    motionSuppressed,
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    requestedTravel: travel,
    effectiveTravel,
    worldLayerScope: ['floor', 'path', 'side_scenery'],
    screenSpaceAnchors: ['target_feedback', 'status', 'winner_afterstate'],
    seamPolicy: 'recycle_only_outside_decision_surface_or_behind_vanishing_mask',
    segments
  });
}

export function planBattleConveyor(events, { reducedMotion = false, lowPerf = false } = {}) {
  if (!Array.isArray(events)) throw new TypeError('EVENTS_REQUIRED');
  let stage = null;
  let cursor = 0;
  const plans = [];
  for (const raw of events) {
    const event = normalizeAcceptedEvent(raw);
    const data = event.publicData;
    let nextStage = stage ? clone(stage) : null;
    let transition = TRANSITIONS.CONTINUE;
    let targets = [];

    if (event.kind === 'partner_cutin') {
      str(data.partnerId, 'PARTNER_ID');
      transition = TRANSITIONS.PARTNER_CUTIN;
    } else if (event.kind === 'reveal') {
      if (!Array.isArray(data.playerIds) || data.playerIds.length < 2) throw new TypeError('REVEAL_PLAYERS_REQUIRED');
      if (!stage) {
        nextStage = { left: str(data.playerIds[0], 'PLAYER_ID'), right: str(data.playerIds[1], 'PLAYER_ID') };
        transition = TRANSITIONS.ENTRY;
      }
    } else if (event.kind === 'attack' || event.kind === 'ability') {
      const sourceId = str(data.sourceId, 'SOURCE_ID');
      targets = normalizeTargets(data);
      if (targets.length > 1) {
        transition = TRANSITIONS.MULTI_TARGET_SPREAD;
        nextStage = sideOf(stage, sourceId) === 'right'
          ? { left: targets[0], right: sourceId }
          : { left: sourceId, right: targets[0] };
      } else {
        const d = duelTransition(stage, sourceId, targets[0]);
        transition = d.transition;
        nextStage = d.stage;
      }
    } else if (event.kind === 'compare4') {
      if (!Array.isArray(data.playerIds) || data.playerIds.length !== 4) throw new TypeError('COMPARE4_REQUIRES_FOUR');
      transition = TRANSITIONS.COMPARE4;
    } else if (event.kind === 'finisher') {
      const winnerId = str(data.winnerId, 'WINNER_ID');
      if (!Array.isArray(data.loserIds) || data.loserIds.length !== 3) throw new TypeError('FINISHER_REQUIRES_THREE_LOSERS');
      targets = data.loserIds.map(id => str(id, 'LOSER_ID'));
      if (targets.includes(winnerId)) throw new TypeError('FINISHER_WINNER_IN_LOSERS');
      transition = TRANSITIONS.FINISHER_GATHER;
      nextStage = { left: winnerId, right: targets[0] };
    }

    const importance = importanceFor(event.kind, data);
    const markers = motionMarkers(event.kind, importance, reducedMotion || lowPerf);
    const isAction = event.kind === 'attack' || event.kind === 'ability' || event.kind === 'finisher';
    const duration = isAction
      ? markers.anticipation + markers.travel + markers.hitStop + markers.reaction + markers.recovery
      : event.kind === 'partner_cutin' ? (reducedMotion || lowPerf ? 180 : 640)
        : event.kind === 'reveal' ? 560
          : event.kind === 'compare4' ? 760 : 180;
    const actionImpact = isAction ? cursor + markers.anticipation + markers.travel : null;
    const recoveryEnd = cursor + duration;
    const handoffAt = isAction ? Math.max(cursor, recoveryEnd - markers.handoffLead) : recoveryEnd;

    plans.push(freeze({
      schema: SCHEMA,
      presentationOnly: true,
      authorityBoundary: 'accepted_public_event_only',
      eventId: event.eventId,
      kind: event.kind,
      transition,
      stage: nextStage ? clone(nextStage) : null,
      groupTargets: targets,
      importance,
      emphasis: EMPHASIS[importance],
      timing: { start: cursor, impact: actionImpact, handoffAt, recoveryEnd, duration, markers },
      ambientMotionRequired: true,
      reducedMotion: reducedMotion === true,
      lowPerf: lowPerf === true,
      publicData: clone(data)
    }));

    cursor = isAction ? handoffAt : recoveryEnd;
    stage = nextStage;
  }
  const timelineEnd = plans.reduce((m, p) => Math.max(m, p.timing.recoveryEnd), 0);
  return freeze({ schema: SCHEMA, presentationOnly: true, ambientTrack: { start: 0, end: timelineEnd }, plans, timelineEnd });
}

export function planBattleStartHandoff({
  prewarmStartMs,
  readyBarrierMs,
  titleDurationMs,
  entryDurationMs,
  movieReadyAtMs,
  reducedMotion = false,
  lowPerf = false
} = {}) {
  const prewarmStart = nonNegativeMs(prewarmStartMs, 'PREWARM_START_MS');
  const readyBarrier = nonNegativeMs(readyBarrierMs, 'READY_BARRIER_MS');
  const titleDuration = positiveMs(titleDurationMs, 'TITLE_DURATION_MS');
  const entryDuration = positiveMs(entryDurationMs, 'ENTRY_DURATION_MS');
  const movieReadyAt = nonNegativeMs(movieReadyAtMs, 'MOVIE_READY_AT_MS');
  if (prewarmStart > readyBarrier) throw new TypeError('PREWARM_AFTER_READY_BARRIER');

  const titleStart = readyBarrier;
  const titleEnd = titleStart + titleDuration;
  const entryStart = titleEnd;
  const entryEnd = entryStart + entryDuration;
  const handoffAt = Math.max(entryEnd, movieReadyAt);
  const bridgeWaitMs = Math.max(0, movieReadyAt - entryEnd);

  return freeze({
    schema: BATTLE_START_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    loadingBlocksGameplay: false,
    preload: { start: prewarmStart, readyBarrier, movieReadyAt, mayRunDuringBoardChain: true },
    sequence: [
      { kind: 'BATTLE_START_TITLE', headlineKey: 'BATTLE_START', layoutIntent: 'dominant_fullscreen_headline', start: titleStart, end: titleEnd },
      { kind: 'BATTLE_START_ENTRY', layoutIntent: 'seamless_entry_animation', start: entryStart, end: entryEnd },
      ...(bridgeWaitMs > 0 ? [{ kind: 'MOVIE_READY_BRIDGE', layoutIntent: 'continuity_filler_only', start: entryEnd, end: handoffAt }] : []),
      { kind: 'BATTLE_MOVIE_HANDOFF', layoutIntent: 'handoff_point', start: handoffAt, end: handoffAt }
    ],
    handoffAt,
    bridgeWaitMs,
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    timingAuthority: 'caller_supplied_candidate_not_formal'
  });
}

export function auditBattleStartHandoff(plan) {
  if (!plan || plan.schema !== BATTLE_START_SCHEMA) throw new TypeError('BATTLE_START_PLAN_INVALID');
  const defects = [];
  if (plan.presentationOnly !== true || plan.gameplayAuthority !== false || plan.gameStateWrite !== false) defects.push('AUTHORITY');
  if (plan.loadingBlocksGameplay !== false) defects.push('LOADING_BLOCKS_GAMEPLAY');
  if (plan.preload.start > plan.preload.readyBarrier) defects.push('PREWARM_ORDER');
  const title = plan.sequence.find(x => x.kind === 'BATTLE_START_TITLE');
  const entry = plan.sequence.find(x => x.kind === 'BATTLE_START_ENTRY');
  const bridge = plan.sequence.find(x => x.kind === 'MOVIE_READY_BRIDGE');
  const handoff = plan.sequence.find(x => x.kind === 'BATTLE_MOVIE_HANDOFF');
  if (!title || !entry || !handoff) defects.push('REQUIRED_SEGMENT_MISSING');
  if (title && title.start !== plan.preload.readyBarrier) defects.push('TITLE_NOT_AT_READY_BARRIER');
  if (title && title.end <= title.start) defects.push('TITLE_NONPOSITIVE');
  if (title && entry && entry.start !== title.end) defects.push('TITLE_ENTRY_GAP');
  if (entry && entry.end <= entry.start) defects.push('ENTRY_NONPOSITIVE');
  if (entry && handoff && handoff.start < entry.end) defects.push('HANDOFF_BEFORE_ENTRY_END');
  if (handoff && handoff.start < plan.preload.movieReadyAt) defects.push('HANDOFF_BEFORE_MOVIE_READY');
  if (bridge) {
    if (!entry || bridge.start !== entry.end || bridge.end !== handoff.start) defects.push('BRIDGE_GAP');
    if (bridge.end <= bridge.start) defects.push('BRIDGE_NONPOSITIVE');
  } else if (entry && handoff && handoff.start !== entry.end) defects.push('UNDECLARED_WAIT_GAP');
  return freeze({ ok: defects.length === 0, reason: defects.length ? 'DEFECTS' : 'OK', defects, bridgeWaitMs: plan.bridgeWaitMs, handoffAt: plan.handoffAt });
}

function phaseAt(state, nowMs) {
  if (['HANDOFF','FALLBACK_REQUIRED','CANCELLED'].includes(state.phase)) return state.phase;
  if (nowMs < state.timing.readyBarrier) return 'PREWARM';
  if (nowMs < state.timing.titleEnd) return 'TITLE';
  if (nowMs < state.timing.entryEnd) return 'ENTRY';
  if (state.movieReady === true) return 'HANDOFF';
  if (nowMs >= state.timing.fallbackAt) return 'FALLBACK_REQUIRED';
  return 'BRIDGE';
}

export function createBattleStartLiveHandoff({ generationId, prewarmStartMs, readyBarrierMs, titleDurationMs, entryDurationMs, maxBridgeMs, reducedMotion = false, lowPerf = false } = {}) {
  const generation = str(generationId, 'GENERATION_ID');
  const prewarmStart = nonNegativeMs(prewarmStartMs, 'PREWARM_START_MS');
  const readyBarrier = nonNegativeMs(readyBarrierMs, 'READY_BARRIER_MS');
  const titleDuration = positiveMs(titleDurationMs, 'TITLE_DURATION_MS');
  const entryDuration = positiveMs(entryDurationMs, 'ENTRY_DURATION_MS');
  const maxBridge = nonNegativeMs(maxBridgeMs, 'MAX_BRIDGE_MS');
  if (prewarmStart > readyBarrier) throw new TypeError('PREWARM_AFTER_READY_BARRIER');
  const titleEnd = readyBarrier + titleDuration;
  const entryEnd = titleEnd + entryDuration;
  return freeze({
    schema: BATTLE_START_LIVE_SCHEMA,
    generationId: generation,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    loadingBlocksGameplay: false,
    phase: 'PREWARM',
    movieReady: false,
    nowMs: prewarmStart,
    timing: { prewarmStart, readyBarrier, titleEnd, entryEnd, fallbackAt: entryEnd + maxBridge },
    lastEventDisposition: 'CREATED',
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    timingAuthority: 'caller_supplied_candidate_not_formal'
  });
}

export function reduceBattleStartLiveHandoff(state, rawEvent) {
  if (!state || state.schema !== BATTLE_START_LIVE_SCHEMA) throw new TypeError('LIVE_HANDOFF_STATE_INVALID');
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) throw new TypeError('LIVE_HANDOFF_EVENT_REQUIRED');
  const eventGeneration = str(rawEvent.generationId, 'GENERATION_ID');
  if (eventGeneration !== state.generationId) return freeze({ ...clone(state), lastEventDisposition: 'IGNORED_STALE_GENERATION' });
  if (['HANDOFF','FALLBACK_REQUIRED','CANCELLED'].includes(state.phase)) return freeze({ ...clone(state), lastEventDisposition: 'IGNORED_TERMINAL' });
  if (rawEvent.type === 'CANCEL') return freeze({ ...clone(state), phase: 'CANCELLED', lastEventDisposition: 'CANCELLED' });
  if (rawEvent.type === 'MOVIE_READY') {
    if (state.movieReady === true) return freeze({ ...clone(state), lastEventDisposition: 'IGNORED_DUPLICATE_READY' });
    const next = clone(state);
    next.movieReady = true;
    next.phase = phaseAt(next, next.nowMs);
    next.lastEventDisposition = next.phase === 'HANDOFF' ? 'READY_AND_HANDOFF' : 'READY_ACCEPTED';
    return freeze(next);
  }
  if (rawEvent.type === 'ADVANCE') {
    const nowMs = nonNegativeMs(rawEvent.nowMs, 'NOW_MS');
    if (nowMs < state.nowMs) return freeze({ ...clone(state), lastEventDisposition: 'IGNORED_CLOCK_REWIND' });
    const next = clone(state);
    next.nowMs = nowMs;
    next.phase = phaseAt(next, nowMs);
    next.lastEventDisposition = next.phase === 'HANDOFF' ? 'HANDOFF_READY' : next.phase === 'FALLBACK_REQUIRED' ? 'FALLBACK_REQUIRED' : 'ADVANCED';
    return freeze(next);
  }
  throw new TypeError(`UNSUPPORTED_LIVE_HANDOFF_EVENT:${rawEvent.type}`);
}

export function auditBattleStartLiveHandoff(state) {
  if (!state || state.schema !== BATTLE_START_LIVE_SCHEMA) throw new TypeError('LIVE_HANDOFF_STATE_INVALID');
  const defects = [];
  if (state.presentationOnly !== true || state.gameplayAuthority !== false || state.gameStateWrite !== false) defects.push('AUTHORITY');
  if (state.loadingBlocksGameplay !== false) defects.push('LOADING_BLOCKS_GAMEPLAY');
  if (!state.generationId) defects.push('GENERATION_ID');
  if (state.timing.prewarmStart > state.timing.readyBarrier) defects.push('PREWARM_ORDER');
  if (state.timing.titleEnd <= state.timing.readyBarrier) defects.push('TITLE_NONPOSITIVE');
  if (state.timing.entryEnd <= state.timing.titleEnd) defects.push('ENTRY_NONPOSITIVE');
  if (state.timing.fallbackAt < state.timing.entryEnd) defects.push('FALLBACK_BEFORE_ENTRY_END');
  if (state.phase === 'HANDOFF' && state.movieReady !== true) defects.push('HANDOFF_WITHOUT_READY');
  if (state.phase === 'HANDOFF' && state.nowMs < state.timing.entryEnd) defects.push('HANDOFF_BEFORE_ENTRY_END');
  if (state.phase === 'FALLBACK_REQUIRED' && state.nowMs < state.timing.fallbackAt) defects.push('EARLY_FALLBACK');
  return freeze({ ok: defects.length === 0, reason: defects.length ? 'DEFECTS' : 'OK', defects });
}

export function auditMotionContinuity(timeline) {
  if (!timeline || timeline.schema !== SCHEMA || timeline.presentationOnly !== true) throw new TypeError('TIMELINE_INVALID');
  if (!timeline.ambientTrack || timeline.ambientTrack.start !== 0 || timeline.ambientTrack.end < timeline.timelineEnd) return freeze({ ok: false, reason: 'AMBIENT_TRACK_GAP' });
  const defects = [];
  let deadGapMs = 0;
  let handoffOverlapMs = 0;
  let handoffPairs = 0;
  for (let i = 0; i < timeline.plans.length; i += 1) {
    const p = timeline.plans[i];
    if (p.presentationOnly !== true || p.authorityBoundary !== 'accepted_public_event_only') defects.push(`${p.eventId}:AUTHORITY`);
    if (!p.ambientMotionRequired) defects.push(`${p.eventId}:AMBIENT_FALSE`);
    const next = timeline.plans[i + 1];
    if (next && ['attack','ability','finisher'].includes(p.kind)) {
      const gap = Math.max(0, next.timing.start - p.timing.recoveryEnd);
      const overlap = Math.max(0, p.timing.recoveryEnd - next.timing.start);
      deadGapMs += gap;
      handoffOverlapMs += overlap;
      handoffPairs += 1;
      if (gap > 0) defects.push(`${p.eventId}:DEAD_GAP`);
      if (next.timing.start !== p.timing.handoffAt) defects.push(`${p.eventId}:NO_HANDOFF_PREROLL`);
    }
  }
  const ambientSpan = Math.max(0, Math.min(timeline.timelineEnd, timeline.ambientTrack.end) - Math.max(0, timeline.ambientTrack.start));
  const declaredAmbientCoverage = timeline.timelineEnd === 0 ? 1 : ambientSpan / timeline.timelineEnd;
  return freeze({ ok: defects.length === 0, reason: defects.length ? 'DEFECTS' : 'OK', defects, declaredAmbientCoverage, deadGapMs, handoffOverlapMs, handoffPairs });
}

export const BATTLE_CONVEYOR_PRESENTATION_CORE = freeze({
  schema: SCHEMA,
  battleStartSchema: BATTLE_START_SCHEMA,
  battleStartLiveSchema: BATTLE_START_LIVE_SCHEMA,
  eventKinds: EVENT_KINDS,
  transitions: TRANSITIONS,
  emphasis: EMPHASIS
});

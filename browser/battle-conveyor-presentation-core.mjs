const SCHEMA = 'gameroad.battle-conveyor-presentation.v2';
const BATTLE_START_SCHEMA = 'gameroad.battle-start-handoff.v1';

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

    // The next event may start before the previous recovery finishes. This is the conveyor pre-roll.
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
  const titleDuration = nonNegativeMs(titleDurationMs, 'TITLE_DURATION_MS');
  const entryDuration = nonNegativeMs(entryDurationMs, 'ENTRY_DURATION_MS');
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
    preload: {
      start: prewarmStart,
      readyBarrier,
      movieReadyAt,
      mayRunDuringBoardChain: true
    },
    sequence: [
      {
        kind: 'BATTLE_START_TITLE',
        headlineKey: 'BATTLE_START',
        layoutIntent: 'dominant_fullscreen_headline',
        start: titleStart,
        end: titleEnd
      },
      {
        kind: 'BATTLE_START_ENTRY',
        layoutIntent: 'seamless_entry_animation',
        start: entryStart,
        end: entryEnd
      },
      ...(bridgeWaitMs > 0 ? [{
        kind: 'MOVIE_READY_BRIDGE',
        layoutIntent: 'continuity_filler_only',
        start: entryEnd,
        end: handoffAt
      }] : []),
      {
        kind: 'BATTLE_MOVIE_HANDOFF',
        layoutIntent: 'handoff_point',
        start: handoffAt,
        end: handoffAt
      }
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
  if (title && entry && entry.start !== title.end) defects.push('TITLE_ENTRY_GAP');
  if (entry && handoff && handoff.start < entry.end) defects.push('HANDOFF_BEFORE_ENTRY_END');
  if (handoff && handoff.start < plan.preload.movieReadyAt) defects.push('HANDOFF_BEFORE_MOVIE_READY');
  if (bridge) {
    if (!entry || bridge.start !== entry.end || bridge.end !== handoff.start) defects.push('BRIDGE_GAP');
    if (bridge.end <= bridge.start) defects.push('BRIDGE_NONPOSITIVE');
  } else if (entry && handoff && handoff.start !== entry.end) {
    defects.push('UNDECLARED_WAIT_GAP');
  }
  return freeze({
    ok: defects.length === 0,
    reason: defects.length ? 'DEFECTS' : 'OK',
    defects,
    bridgeWaitMs: plan.bridgeWaitMs,
    handoffAt: plan.handoffAt
  });
}

export function auditMotionContinuity(timeline) {
  if (!timeline || timeline.schema !== SCHEMA || timeline.presentationOnly !== true) throw new TypeError('TIMELINE_INVALID');
  if (!timeline.ambientTrack || timeline.ambientTrack.start !== 0 || timeline.ambientTrack.end < timeline.timelineEnd) {
    return freeze({ ok: false, reason: 'AMBIENT_TRACK_GAP' });
  }
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
  return freeze({
    ok: defects.length === 0,
    reason: defects.length ? 'DEFECTS' : 'OK',
    defects,
    declaredAmbientCoverage,
    deadGapMs,
    handoffOverlapMs,
    handoffPairs
  });
}

export const BATTLE_CONVEYOR_PRESENTATION_CORE = freeze({
  schema: SCHEMA,
  battleStartSchema: BATTLE_START_SCHEMA,
  eventKinds: EVENT_KINDS,
  transitions: TRANSITIONS,
  emphasis: EMPHASIS
});
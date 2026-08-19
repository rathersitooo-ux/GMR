const SCHEMA = 'gameroad.battle-conveyor-presentation.v2';

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

export function auditMotionContinuity(timeline) {
  if (!timeline || timeline.schema !== SCHEMA || timeline.presentationOnly !== true) throw new TypeError('TIMELINE_INVALID');
  if (!timeline.ambientTrack || timeline.ambientTrack.start !== 0 || timeline.ambientTrack.end < timeline.timelineEnd) {
    return freeze({ ok: false, reason: 'AMBIENT_TRACK_GAP' });
  }
  const defects = [];
  for (let i = 0; i < timeline.plans.length; i += 1) {
    const p = timeline.plans[i];
    if (p.presentationOnly !== true || p.authorityBoundary !== 'accepted_public_event_only') defects.push(`${p.eventId}:AUTHORITY`);
    if (!p.ambientMotionRequired) defects.push(`${p.eventId}:AMBIENT_FALSE`);
    const next = timeline.plans[i + 1];
    if (next && ['attack','ability','finisher'].includes(p.kind) && next.timing.start > p.timing.recoveryEnd) defects.push(`${p.eventId}:DEAD_GAP`);
    if (next && ['attack','ability','finisher'].includes(p.kind) && next.timing.start !== p.timing.handoffAt) defects.push(`${p.eventId}:NO_HANDOFF_PREROLL`);
  }
  return freeze({ ok: defects.length === 0, reason: defects.length ? 'DEFECTS' : 'OK', defects, motionCoverage: timeline.timelineEnd === 0 ? 1 : 1 });
}

export const BATTLE_CONVEYOR_PRESENTATION_CORE = freeze({
  schema: SCHEMA,
  eventKinds: EVENT_KINDS,
  transitions: TRANSITIONS,
  emphasis: EMPHASIS
});

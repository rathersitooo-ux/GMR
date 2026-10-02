export const BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA = 'gameroad.battle-card-release-flight-motion.v2';

export const BATTLE_CARD_RELEASE_FLIGHT_MODE = Object.freeze({
  FULL: 'FULL',
  REDUCED: 'REDUCED',
});

export const BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS = 560;
export const BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS = 240;
export const BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET = 0.38;
export const BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET = 0.86;
export const BATTLE_CARD_RELEASE_FLIGHT_SAMPLE_OFFSETS = Object.freeze([0, 0.1, 0.22, 0.38, 0.56, 0.72, 0.86, 1]);

const ROLE = Object.freeze({
  TOP: 'top',
  MIDDLE: 'middle',
  BOTTOM: 'bottom',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function canonicalRole(value) {
  if (value === ROLE.TOP || value === ROLE.BOTTOM) return value;
  return ROLE.MIDDLE;
}

function canonicalDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS;
}

function canonicalOffsets(values) {
  if (!Array.isArray(values) || values.length < 2) return BATTLE_CARD_RELEASE_FLIGHT_SAMPLE_OFFSETS;
  const normalized = [...new Set(values
    .map(Number)
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.min(1, value))))]
    .sort((a, b) => a - b);
  if (normalized.length < 2 || normalized[0] !== 0 || normalized.at(-1) !== 1) {
    return BATTLE_CARD_RELEASE_FLIGHT_SAMPLE_OFFSETS;
  }
  return normalized;
}

function smoothDepth(t) {
  return t * t * (3 - (2 * t));
}

function cubicPoint({ dx, dy, p1, p2 }, t) {
  const inv = 1 - t;
  return {
    x: (3 * inv * inv * t * p1.x) + (3 * inv * t * t * p2.x) + (t * t * t * dx),
    y: (3 * inv * inv * t * p1.y) + (3 * inv * t * t * p2.y) + (t * t * t * dy),
  };
}

function fullGeometry(start, target, role) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const flightDistance = Math.max(1, Math.hypot(dx, dy));
  const outwardSign = role === ROLE.TOP ? -1 : role === ROLE.BOTTOM ? 1 : 0;
  const bendPx = outwardSign === 0 ? 0 : Math.min(190, Math.max(72, flightDistance * 0.26));
  return {
    dx,
    dy,
    flightDistance,
    outwardSign,
    bendPx,
    p1: { x: dx * 0.18, y: (dy * 0.16) + (outwardSign * bendPx) },
    p2: { x: dx * 0.72, y: (dy * 0.72) + (outwardSign * bendPx * 0.1) },
  };
}

function travelFrame(geometry, offset) {
  const progress = Math.min(1, offset / BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const eased = smoothDepth(progress);
  const point = cubicPoint(geometry, progress);
  const lean = geometry.outwardSign * 14 * Math.sin(Math.PI * progress);
  return Object.freeze({
    offset,
    x: point.x,
    y: point.y,
    rotationDeg: lean,
    scale: 1 - (0.18 * eased),
    opacity: 1 - (0.18 * eased),
    blurPx: 0.55 * Math.sin(Math.PI * progress),
    brightness: 1 + (0.42 * eased),
  });
}

function heroFrame(geometry, offset) {
  const heroSpan = Math.max(0.001, BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET - BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const heroProgress = Math.max(0, Math.min(1, (offset - BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET) / heroSpan));
  const settle = smoothDepth(heroProgress);
  const reveal = smoothDepth(Math.min(1, heroProgress / 0.4));
  const heroScale = 0.82 + (0.30 * Math.min(1, heroProgress / 0.43));
  const settledScale = heroProgress <= 0.43
    ? heroScale
    : 1.12 - (0.06 * smoothDepth((heroProgress - 0.43) / 0.57));
  return Object.freeze({
    offset,
    x: geometry.dx,
    y: geometry.dy,
    rotationDeg: 0,
    scale: settledScale,
    opacity: 0.82 + (0.18 * reveal),
    blurPx: Math.max(0, 0.34 * (1 - settle)),
    brightness: 1.42 - (0.32 * settle),
  });
}

function finalDissolveFrame(geometry) {
  return Object.freeze({
    offset: 1,
    x: geometry.dx,
    y: geometry.dy,
    rotationDeg: 0,
    scale: 1.04,
    opacity: 0,
    blurPx: 0.2,
    brightness: 1.28,
  });
}

function projectFullFrames(geometry, offsets) {
  return offsets.map((offset) => {
    if (offset < BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET) return travelFrame(geometry, offset);
    if (offset < 1) return heroFrame(geometry, offset);
    return finalDissolveFrame(geometry);
  });
}

function projectLowPerfFrames(start, target) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  return [
    Object.freeze({ offset: 0, x: 0, y: 0, rotationDeg: 0, scale: 1, opacity: 1, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 0.55, x: dx, y: dy, rotationDeg: 0, scale: 0.92, opacity: 0.88, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 0.78, x: dx, y: dy, rotationDeg: 0, scale: 1.06, opacity: 1, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 1, x: dx, y: dy, rotationDeg: 0, scale: 1.02, opacity: 0, blurPx: 0, brightness: 1 }),
  ];
}

function projectReducedFrames(start, target) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  return [
    Object.freeze({ offset: 0, x: dx, y: dy, rotationDeg: 0, scale: 0.98, opacity: 0, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 0.35, x: dx, y: dy, rotationDeg: 0, scale: 1, opacity: 1, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 0.78, x: dx, y: dy, rotationDeg: 0, scale: 1, opacity: 1, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 1, x: dx, y: dy, rotationDeg: 0, scale: 1, opacity: 0, blurPx: 0, brightness: 1 }),
  ];
}

function trailCue(start, geometry) {
  return {
    kind: 'PROCEDURAL_SVG_CUBIC',
    start: { x: start.x, y: start.y },
    control1: { x: start.x + geometry.p1.x, y: start.y + geometry.p1.y },
    control2: { x: start.x + geometry.p2.x, y: start.y + geometry.p2.y },
    target: { x: start.x + geometry.dx, y: start.y + geometry.dy },
    endOffset: BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET,
  };
}

function heroCue(target) {
  return {
    kind: 'CENTER_HERO',
    x: target.x,
    y: target.y,
    arrivalOffset: BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET,
    holdEndOffset: BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET,
  };
}

export function projectBattleCardReleaseFlightMotion({
  start,
  target,
  role = ROLE.MIDDLE,
  reducedMotion = false,
  lowPerf = false,
  durationMs = BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  sampleOffsets = BATTLE_CARD_RELEASE_FLIGHT_SAMPLE_OFFSETS,
} = {}) {
  const source = finitePoint(start);
  const destination = finitePoint(target);
  if (!source || !destination) return null;

  const normalizedRole = canonicalRole(role);
  const normalizedDurationMs = canonicalDuration(durationMs);
  const isReduced = reducedMotion === true;
  const isLowPerf = lowPerf === true;

  if (isReduced) {
    return deepFreeze({
      schema: BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA,
      mode: BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED,
      role: normalizedRole,
      durationMs: Math.min(normalizedDurationMs, 180),
      lowPerf: isLowPerf,
      start: source,
      target: destination,
      spinDeg: 0,
      bendPx: 0,
      frames: projectReducedFrames(source, destination),
      trailCue: { kind: 'NONE' },
      heroCue: heroCue(destination),
      destinationCue: {
        kind: 'DESTINATION_PULSE',
        x: destination.x,
        y: destination.y,
      },
    });
  }

  if (isLowPerf) {
    return deepFreeze({
      schema: BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA,
      mode: BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL,
      role: normalizedRole,
      durationMs: Math.min(normalizedDurationMs, BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS),
      lowPerf: true,
      start: source,
      target: destination,
      spinDeg: 0,
      bendPx: 0,
      frames: projectLowPerfFrames(source, destination),
      trailCue: { kind: 'NONE' },
      heroCue: heroCue(destination),
      destinationCue: {
        kind: 'NONE',
        x: destination.x,
        y: destination.y,
      },
    });
  }

  const geometry = fullGeometry(source, destination, normalizedRole);
  return deepFreeze({
    schema: BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA,
    mode: BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL,
    role: normalizedRole,
    durationMs: normalizedDurationMs,
    lowPerf: false,
    start: source,
    target: destination,
    spinDeg: 0,
    bendPx: geometry.bendPx,
    frames: projectFullFrames(geometry, canonicalOffsets(sampleOffsets)),
    trailCue: trailCue(source, geometry),
    heroCue: heroCue(destination),
    destinationCue: {
      kind: 'NONE',
      x: destination.x,
      y: destination.y,
    },
  });
}

export function toBattleCardReleaseFlightKeyframes(projection) {
  if (!projection?.frames || !Array.isArray(projection.frames)) return Object.freeze([]);
  const noFilter = projection.mode === BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED || projection.lowPerf === true;
  return Object.freeze(projection.frames.map((frame) => Object.freeze({
    offset: frame.offset,
    opacity: frame.opacity,
    filter: noFilter
      ? 'none'
      : `blur(${frame.blurPx.toFixed(2)}px) brightness(${frame.brightness.toFixed(3)})`,
    transform: `translate3d(${frame.x.toFixed(2)}px,${frame.y.toFixed(2)}px,0) rotate(${frame.rotationDeg.toFixed(2)}deg) scale(${frame.scale.toFixed(3)})`,
  })));
}

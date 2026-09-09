export const BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA = 'gameroad.battle-card-release-flight-motion.v1';

export const BATTLE_CARD_RELEASE_FLIGHT_MODE = Object.freeze({
  FULL: 'FULL',
  REDUCED: 'REDUCED',
});

export const BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS = 560;
export const BATTLE_CARD_RELEASE_FLIGHT_SAMPLE_OFFSETS = Object.freeze([0, 0.12, 0.28, 0.46, 0.64, 0.82, 1]);

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
  const normalized = values
    .map(Number)
    .filter(Number.isFinite)
    .map((value) => Math.max(0, Math.min(1, value)))
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
  const spinDeg = role === ROLE.TOP ? -720 : role === ROLE.BOTTOM ? 720 : 0;
  const bendPx = outwardSign === 0 ? 0 : Math.min(230, Math.max(96, flightDistance * 0.34));
  return {
    dx,
    dy,
    flightDistance,
    outwardSign,
    spinDeg,
    bendPx,
    p1: { x: dx * 0.16, y: (dy * 0.14) + (outwardSign * bendPx) },
    p2: { x: dx * 0.76, y: (dy * 0.76) + (outwardSign * bendPx * 0.12) },
  };
}

function projectFullFrames(geometry, offsets, lowPerf) {
  return offsets.map((offset) => {
    const point = cubicPoint(geometry, offset);
    const depth = smoothDepth(offset);
    return Object.freeze({
      offset,
      x: point.x,
      y: point.y,
      rotationDeg: geometry.spinDeg * offset,
      scale: 1 - (0.66 * depth),
      opacity: 1 - (0.42 * depth),
      blurPx: lowPerf ? 0 : 0.7 * depth,
      brightness: lowPerf ? 1 : 1 - (0.12 * depth),
    });
  });
}

function projectReducedFrames() {
  return [
    Object.freeze({ offset: 0, x: 0, y: 0, rotationDeg: 0, scale: 1, opacity: 1, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 0.5, x: 0, y: 0, rotationDeg: 0, scale: 0.985, opacity: 0.86, blurPx: 0, brightness: 1 }),
    Object.freeze({ offset: 1, x: 0, y: 0, rotationDeg: 0, scale: 0.97, opacity: 0.58, blurPx: 0, brightness: 1 }),
  ];
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
      frames: projectReducedFrames(),
      destinationCue: {
        kind: 'DESTINATION_PULSE',
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
    lowPerf: isLowPerf,
    start: source,
    target: destination,
    spinDeg: geometry.spinDeg,
    bendPx: geometry.bendPx,
    frames: projectFullFrames(geometry, canonicalOffsets(sampleOffsets), isLowPerf),
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

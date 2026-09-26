import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET,
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET,
  BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from '../browser/battle-card-release-flight-motion-core.mjs';

const start = Object.freeze({ x: 100, y: 200 });
const target = Object.freeze({ x: 500, y: 200 });

function full(role, options = {}) {
  return projectBattleCardReleaseFlightMotion({ start, target, role, ...options });
}

test('release motion v2 keeps the captured screen-center destination as presentation authority', () => {
  const projection = full('middle');
  assert.equal(BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA, 'gameroad.battle-card-release-flight-motion.v2');
  assert.equal(projection.schema, BATTLE_CARD_RELEASE_FLIGHT_MOTION_SCHEMA);
  assert.deepEqual(projection.start, start);
  assert.deepEqual(projection.target, target);
  assert.equal(projection.durationMs, BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS);
  assert.equal(projection.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
  const travelMs = projection.durationMs * BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET;
  const heroMs = projection.durationMs * (BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET - BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const dissolveMs = projection.durationMs * (1 - BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET);
  assert.ok(travelMs >= 200 && travelMs <= 220, 'release reaches center quickly instead of spending most of the beat in transit');
  assert.ok(heroMs >= 260 && heroMs <= 280, 'the center hero shot owns the longest presentation beat');
  assert.ok(dissolveMs <= 80, 'the close is a short dissolve, not a second travel sequence');
});

test('upper and lower releases arc outward but settle upright at the same center hero position', () => {
  const top = full('top');
  const middle = full('middle');
  const bottom = full('bottom');
  const topTravel = top.frames.filter((frame) => frame.offset < BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const bottomTravel = bottom.frames.filter((frame) => frame.offset < BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const middleTravel = middle.frames.filter((frame) => frame.offset < BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);

  assert.ok(Math.min(...topTravel.map((frame) => frame.y)) < -35);
  assert.ok(Math.max(...bottomTravel.map((frame) => frame.y)) > 35);
  assert.deepEqual(middleTravel.map((frame) => frame.y), middleTravel.map(() => 0));

  const dx = target.x - start.x;
  const dy = target.y - start.y;
  for (const projection of [top, middle, bottom]) {
    const arrival = projection.frames.find((frame) => frame.offset === BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
    const end = projection.frames.at(-1);
    assert.deepEqual([arrival.x, arrival.y], [dx, dy]);
    assert.deepEqual([end.x, end.y], [dx, dy]);
    assert.equal(arrival.rotationDeg, 0);
    assert.equal(end.rotationDeg, 0);
  }
});

test('main payoff is a readable center hero hold instead of terminal depth shrink', () => {
  const projection = full('top');
  const arrival = projection.frames.find((frame) => frame.offset === BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  const hero = projection.frames.find((frame) => frame.offset === 0.72);
  const holdEnd = projection.frames.find((frame) => frame.offset === BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET);
  const end = projection.frames.at(-1);

  assert.ok(arrival.scale < 1, 'arrival may compress briefly before the hero reveal');
  assert.ok(hero.scale > 1.05, 'the card grows into the central hero shot');
  assert.ok(holdEnd.scale >= 1.05, 'the center card stays readable before dissolve');
  assert.equal(hero.opacity, 1);
  assert.equal(holdEnd.opacity, 1);
  assert.equal(end.opacity, 0, 'the presentation clone dissolves at center rather than flying to the order rail');
  assert.ok(end.scale >= 1, 'the clone never depth-shrinks into the order slot');
});

test('normal mode exposes a procedural cubic trail and a center hero cue from the same captured geometry', () => {
  const projection = full('bottom');
  assert.equal(projection.trailCue.kind, 'PROCEDURAL_SVG_CUBIC');
  assert.deepEqual(projection.trailCue.start, start);
  assert.deepEqual(projection.trailCue.target, target);
  assert.equal(projection.trailCue.endOffset, BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  assert.equal(projection.heroCue.kind, 'CENTER_HERO');
  assert.equal(projection.heroCue.x, target.x);
  assert.equal(projection.heroCue.y, target.y);
  assert.equal(projection.heroCue.arrivalOffset, BATTLE_CARD_RELEASE_FLIGHT_ARRIVAL_OFFSET);
  assert.equal(projection.heroCue.holdEndOffset, BATTLE_CARD_RELEASE_FLIGHT_HERO_HOLD_END_OFFSET);
});

test('low performance keeps center causality and hero confirmation with transform/opacity only', () => {
  for (const role of ['top', 'middle', 'bottom']) {
    const lowPerf = full(role, { lowPerf: true });
    const end = lowPerf.frames.at(-1);
    assert.equal(lowPerf.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
    assert.equal(lowPerf.lowPerf, true);
    assert.equal(lowPerf.durationMs, BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS);
    assert.deepEqual(lowPerf.frames.map((frame) => frame.offset), [0, 0.55, 0.78, 1]);
    assert.equal(lowPerf.frames.every((frame) => frame.rotationDeg === 0 && frame.blurPx === 0 && frame.brightness === 1), true);
    assert.equal(lowPerf.frames[2].scale, 1.06);
    assert.equal(lowPerf.frames[2].opacity, 1);
    assert.deepEqual([end.x, end.y], [target.x - start.x, target.y - start.y]);
    assert.equal(end.opacity, 0);
    assert.equal(toBattleCardReleaseFlightKeyframes(lowPerf).every((frame) => frame.filter === 'none'), true);
    assert.deepEqual(lowPerf.trailCue, { kind: 'NONE' });
    assert.equal(lowPerf.heroCue.kind, 'CENTER_HERO');
  }
});

test('custom shorter duration stays authoritative in low performance mode', () => {
  const lowPerf = full('top', { lowPerf: true, durationMs: 120 });
  assert.equal(lowPerf.durationMs, 120);
});

test('reduced motion snaps presentation to center and uses opacity instead of large travel', () => {
  const reduced = full('top', { reducedMotion: true });
  const dx = target.x - start.x;
  const dy = target.y - start.y;

  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.equal(reduced.spinDeg, 0);
  assert.equal(reduced.bendPx, 0);
  assert.ok(reduced.durationMs <= 180);
  assert.equal(reduced.frames.every((frame) => frame.x === dx && frame.y === dy && frame.rotationDeg === 0), true);
  assert.equal(reduced.frames.some((frame) => frame.opacity === 1), true);
  assert.deepEqual(reduced.trailCue, { kind: 'NONE' });
  assert.deepEqual(reduced.destinationCue, {
    kind: 'DESTINATION_PULSE',
    x: target.x,
    y: target.y,
  });
  assert.equal(toBattleCardReleaseFlightKeyframes(reduced).every((frame) => frame.filter === 'none'), true);
});

test('reduced motion remains the stronger accessibility override when low performance is also enabled', () => {
  const reducedLowPerf = full('bottom', { reducedMotion: true, lowPerf: true });
  assert.equal(reducedLowPerf.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.equal(reducedLowPerf.lowPerf, true);
  assert.deepEqual(reducedLowPerf.trailCue, { kind: 'NONE' });
  assert.equal(reducedLowPerf.frames.every((frame) => frame.rotationDeg === 0), true);
});

test('projection fails closed without finite source and destination geometry', () => {
  assert.equal(projectBattleCardReleaseFlightMotion({ start: null, target, role: 'top' }), null);
  assert.equal(projectBattleCardReleaseFlightMotion({ start, target: { x: Number.NaN, y: 2 }, role: 'bottom' }), null);
});

test('web-animation keyframes finish at center upright and dissolved', () => {
  const topFrames = toBattleCardReleaseFlightKeyframes(full('top'));
  const bottomFrames = toBattleCardReleaseFlightKeyframes(full('bottom'));

  assert.match(topFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(0\.00deg\) scale\(1\.040\)/);
  assert.match(bottomFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(0\.00deg\) scale\(1\.040\)/);
  assert.equal(topFrames.at(-1).opacity, 0);
  assert.equal(bottomFrames.at(-1).opacity, 0);
});

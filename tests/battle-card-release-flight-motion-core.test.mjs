import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
  BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE,
  BATTLE_CARD_RELEASE_PROVISIONAL_HOLD_START,
  projectBattleCardReleaseFlightMotion,
  toBattleCardReleaseFlightKeyframes,
} from '../browser/battle-card-release-flight-motion-core.mjs';

const start = Object.freeze({ x: 100, y: 200 });
const target = Object.freeze({ x: 500, y: 200 });

function full(role, options = {}) {
  return projectBattleCardReleaseFlightMotion({ start, target, role, ...options });
}

test('top/middle/bottom preserve the existing release-flight spin contract', () => {
  const top = full('top');
  const middle = full('middle');
  const bottom = full('bottom');

  assert.equal(top.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
  assert.equal(top.durationMs, BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS);
  assert.equal(top.spinDeg, -720);
  assert.equal(middle.spinDeg, 0);
  assert.equal(bottom.spinDeg, 720);
  assert.ok(top.bendPx >= 96 && top.bendPx <= 230);
  assert.equal(middle.bendPx, 0);
  assert.equal(bottom.bendPx, top.bendPx);
});

test('upper and lower cards visibly travel outward before converging while the middle stays direct', () => {
  const top = full('top');
  const middle = full('middle');
  const bottom = full('bottom');
  const topYs = top.frames.map((frame) => frame.y);
  const bottomYs = bottom.frames.map((frame) => frame.y);
  const middleYs = middle.frames.map((frame) => frame.y);

  assert.ok(Math.min(...topYs.slice(1, -1)) < -40, 'upper flight must visibly arc outward above the direct line');
  assert.ok(Math.max(...bottomYs.slice(1, -1)) > 40, 'lower flight must visibly arc outward below the direct line');
  assert.deepEqual(middleYs, middleYs.map(() => 0), 'middle flight remains on the direct line when source and target share y');

  for (let index = 0; index < top.frames.length; index += 1) {
    assert.ok(Math.abs(top.frames[index].y + bottom.frames[index].y) < 0.001, 'upper/lower curves remain mirrored');
  }
});

test('all full-motion roles arrive at the authoritative captured destination as a large provisional center card', () => {
  for (const role of ['top', 'middle', 'bottom']) {
    const projection = full(role);
    const end = projection.frames.at(-1);
    const hold = projection.frames.find((frame) => frame.offset === BATTLE_CARD_RELEASE_PROVISIONAL_HOLD_START);
    assert.ok(hold, 'projection includes a center-card hold frame');
    assert.equal(hold.x, target.x - start.x);
    assert.equal(hold.y, target.y - start.y);
    assert.equal(hold.scale, BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE);
    assert.equal(end.x, target.x - start.x);
    assert.equal(end.y, target.y - start.y);
    assert.equal(end.scale, BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE);
    assert.equal(end.opacity, 1);
  }
});

test('full-motion card compresses during flight then grows into the provisional center-card hold', () => {
  const projection = full('top');
  const preHold = projection.frames.filter((frame) => frame.offset < BATTLE_CARD_RELEASE_PROVISIONAL_HOLD_START);
  assert.ok(preHold.some((frame) => frame.scale < 1), 'flight still has depth compression before arrival');
  const hold = projection.frames.filter((frame) => frame.offset >= BATTLE_CARD_RELEASE_PROVISIONAL_HOLD_START);
  assert.ok(hold.length >= 2, 'center-card arrival has a visible hold segment');
  assert.equal(hold.every((frame) => frame.scale === BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE), true);
  assert.equal(hold.every((frame) => frame.x === target.x - start.x && frame.y === target.y - start.y), true);
});

test('low performance mode keeps exact source-to-destination meaning with a short straight no-spin projection', () => {
  for (const role of ['top', 'middle', 'bottom']) {
    const lowPerf = full(role, { lowPerf: true });
    const end = lowPerf.frames.at(-1);

    assert.equal(lowPerf.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.FULL);
    assert.equal(lowPerf.lowPerf, true);
    assert.equal(lowPerf.durationMs, BATTLE_CARD_RELEASE_FLIGHT_LOW_PERF_MAX_DURATION_MS);
    assert.equal(lowPerf.frames.length, 3);
    assert.equal(lowPerf.spinDeg, 0);
    assert.equal(lowPerf.bendPx, 0);
    assert.deepEqual(lowPerf.frames.map((frame) => frame.offset), [0, BATTLE_CARD_RELEASE_PROVISIONAL_HOLD_START, 1]);
    assert.equal(lowPerf.frames.every((frame) => frame.rotationDeg === 0 && frame.blurPx === 0 && frame.brightness === 1), true);
    assert.equal(lowPerf.frames[0].x, 0);
    assert.equal(lowPerf.frames[0].y, 0);
    assert.equal(end.x, target.x - start.x);
    assert.equal(end.y, target.y - start.y);
    assert.equal(end.scale, BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE);
    assert.equal(end.opacity, 1);
    assert.equal(toBattleCardReleaseFlightKeyframes(lowPerf).every((frame) => frame.filter === 'none'), true);
    assert.deepEqual(lowPerf.destinationCue, {
      kind: 'NONE',
      x: target.x,
      y: target.y,
    });
  }
});

test('custom shorter duration stays authoritative in low performance mode', () => {
  const lowPerf = full('top', { lowPerf: true, durationMs: 120 });
  assert.equal(lowPerf.durationMs, 120);
});

test('reduced motion removes large translation/rotation and exposes a destination cue instead of erasing meaning', () => {
  const reduced = full('top', { reducedMotion: true });

  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.equal(reduced.spinDeg, 0);
  assert.equal(reduced.bendPx, 0);
  assert.ok(reduced.durationMs <= 180);
  assert.equal(reduced.frames.every((frame) => frame.x === target.x - start.x && frame.y === target.y - start.y && frame.rotationDeg === 0), true);
  assert.equal(reduced.frames.every((frame) => frame.scale === BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE), true);
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
  assert.equal(reducedLowPerf.frames.every((frame) => frame.x === target.x - start.x && frame.y === target.y - start.y && frame.rotationDeg === 0), true);
  assert.equal(reducedLowPerf.frames.every((frame) => frame.scale === BATTLE_CARD_RELEASE_PROVISIONAL_CENTER_SCALE), true);
  assert.deepEqual(reducedLowPerf.destinationCue, {
    kind: 'DESTINATION_PULSE',
    x: target.x,
    y: target.y,
  });
});

test('full motion does not fabricate a second destination effect', () => {
  assert.deepEqual(full('middle').destinationCue, {
    kind: 'NONE',
    x: target.x,
    y: target.y,
  });
});

test('projection fails closed without finite source and destination geometry', () => {
  assert.equal(projectBattleCardReleaseFlightMotion({ start: null, target, role: 'top' }), null);
  assert.equal(projectBattleCardReleaseFlightMotion({ start, target: { x: Number.NaN, y: 2 }, role: 'bottom' }), null);
});

test('web-animation projection retains exact endpoint transform and role rotation', () => {
  const topFrames = toBattleCardReleaseFlightKeyframes(full('top'));
  const bottomFrames = toBattleCardReleaseFlightKeyframes(full('bottom'));

  assert.match(topFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(-720\.00deg\) scale\(2\.000\)/);
  assert.match(bottomFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(720\.00deg\) scale\(2\.000\)/);
});

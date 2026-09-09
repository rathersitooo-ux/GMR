import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_CARD_RELEASE_FLIGHT_DEFAULT_DURATION_MS,
  BATTLE_CARD_RELEASE_FLIGHT_MODE,
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

test('all full-motion roles arrive at the authoritative captured destination with material depth recession', () => {
  for (const role of ['top', 'middle', 'bottom']) {
    const projection = full(role);
    const end = projection.frames.at(-1);
    assert.equal(end.x, target.x - start.x);
    assert.equal(end.y, target.y - start.y);
    assert.ok(Math.abs(end.scale - 0.34) < 1e-9, `${role} ends at the existing ~0.34 depth scale`);
    assert.ok(Math.abs(end.opacity - 0.58) < 1e-9, `${role} retains the existing terminal opacity`);
  }
});

test('full-motion depth scale decreases monotonically toward the board', () => {
  const projection = full('top');
  for (let index = 1; index < projection.frames.length; index += 1) {
    assert.ok(
      projection.frames[index].scale <= projection.frames[index - 1].scale,
      'depth recession must not grow the card again on approach',
    );
  }
});

test('low performance mode preserves geometry and depth while removing filter work', () => {
  const normal = full('bottom');
  const lowPerf = full('bottom', { lowPerf: true });

  assert.equal(lowPerf.lowPerf, true);
  assert.deepEqual(
    lowPerf.frames.map(({ offset, x, y, rotationDeg, scale, opacity }) => ({ offset, x, y, rotationDeg, scale, opacity })),
    normal.frames.map(({ offset, x, y, rotationDeg, scale, opacity }) => ({ offset, x, y, rotationDeg, scale, opacity })),
  );
  assert.equal(lowPerf.frames.every((frame) => frame.blurPx === 0 && frame.brightness === 1), true);
  assert.equal(toBattleCardReleaseFlightKeyframes(lowPerf).every((frame) => frame.filter === 'none'), true);
});

test('reduced motion removes large translation/rotation and exposes a destination cue instead of erasing meaning', () => {
  const reduced = full('top', { reducedMotion: true });

  assert.equal(reduced.mode, BATTLE_CARD_RELEASE_FLIGHT_MODE.REDUCED);
  assert.equal(reduced.spinDeg, 0);
  assert.equal(reduced.bendPx, 0);
  assert.ok(reduced.durationMs <= 180);
  assert.equal(reduced.frames.every((frame) => frame.x === 0 && frame.y === 0 && frame.rotationDeg === 0), true);
  assert.deepEqual(reduced.destinationCue, {
    kind: 'DESTINATION_PULSE',
    x: target.x,
    y: target.y,
  });
  assert.equal(toBattleCardReleaseFlightKeyframes(reduced).every((frame) => frame.filter === 'none'), true);
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

  assert.match(topFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(-720\.00deg\) scale\(0\.340\)/);
  assert.match(bottomFrames.at(-1).transform, /translate3d\(400\.00px,0\.00px,0\) rotate\(720\.00deg\) scale\(0\.340\)/);
});

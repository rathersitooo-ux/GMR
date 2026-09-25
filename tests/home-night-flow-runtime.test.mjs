import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HOME_NIGHT_FLOW_PROFILE,
  curlNoise2D,
  homeNightOpacityMask,
  homeNightVelocity,
  resolveHomeNightParticleBudget,
  resolveHomeNightTargetFps,
  valueNoise2D,
} from '../browser/home-night-flow-runtime.mjs';

test('Home night flow is calibrated to the inspected moonlit source art', () => {
  assert.equal(HOME_NIGHT_FLOW_PROFILE.sourceArt.driveId, '1t-viE1VSuatsJd6rC1yuc2ctncguwOVx');
  assert.deepEqual(
    [HOME_NIGHT_FLOW_PROFILE.sourceArt.width, HOME_NIGHT_FLOW_PROFILE.sourceArt.height],
    [1536, 864],
  );
  assert.ok(HOME_NIGHT_FLOW_PROFILE.moon.x < 0.3);
  assert.ok(HOME_NIGHT_FLOW_PROFILE.characterQuietZone.x > 0.55);
});

test('value noise and normalized curl remain finite and deterministic', () => {
  const a = valueNoise2D(1.23, 4.56);
  const b = valueNoise2D(1.23, 4.56);
  assert.equal(a, b);
  assert.ok(Number.isFinite(a));
  const curl = curlNoise2D(0.32, 0.71, 9.5);
  assert.ok(Number.isFinite(curl.x));
  assert.ok(Number.isFinite(curl.y));
  assert.ok(Math.abs(Math.hypot(curl.x, curl.y) - 1) < 1e-9);
});

test('Home wind generally advances left-to-right while curl keeps local variation', () => {
  const points = [
    homeNightVelocity(0.08, 0.72, 1),
    homeNightVelocity(0.28, 0.58, 3),
    homeNightVelocity(0.51, 0.77, 5),
  ];
  assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  assert.ok(meanX > 0.006, 'meanX=' + meanX);
  assert.ok(new Set(points.map((point) => point.y.toFixed(5))).size > 1);
});

test('character focal zone receives fewer particles than the moon and lower-left ribbon field', () => {
  const face = homeNightOpacityMask(0.64, 0.43);
  const moon = homeNightOpacityMask(0.22, 0.15);
  const lowerLeft = homeNightOpacityMask(0.05, 0.82);
  assert.ok(face < moon, face + ' !< ' + moon);
  assert.ok(face < lowerLeft, face + ' !< ' + lowerLeft);
  for (const value of [face, moon, lowerLeft]) assert.ok(value >= 0 && value <= 1);
});

test('Reduced Motion and LowPerf reduce particle count and animation cadence', () => {
  assert.equal(resolveHomeNightParticleBudget({}), 680);
  assert.equal(resolveHomeNightParticleBudget({ lowPerf: true }), 220);
  assert.equal(resolveHomeNightParticleBudget({ reducedMotion: true }), 90);
  assert.equal(resolveHomeNightTargetFps({}), 30);
  assert.equal(resolveHomeNightTargetFps({ lowPerf: true }), 20);
  assert.equal(resolveHomeNightTargetFps({ reducedMotion: true }), 16);
});

test('runtime stays presentation-only and night audio is user-gesture-gated', () => {
  const source = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('pointer-events:none'));
  assert.ok(source.includes("doc.addEventListener('pointerdown', gesture"));
  assert.ok(source.includes("doc.addEventListener('keydown', gesture"));
  assert.ok(source.includes('AudioContext'));
  assert.ok(source.includes('startAudio(r.audio)'));
  assert.equal(source.includes('autoplay'), false);
  for (const forbidden of ['state.match', 'reward', 'economy', 'saveGame', 'fetch(']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

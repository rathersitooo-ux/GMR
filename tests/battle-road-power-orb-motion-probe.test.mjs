import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { projectBattlePowerOrbLaunchMotion } from '../browser/battle-janken-slidepad-runtime-mount.mjs';

const sourceUrl = new URL('../browser/battle-janken-slidepad-runtime-mount.mjs', import.meta.url);

function launchInput(overrides = {}) {
  return {
    start: { x: 120, y: 500 },
    aura: { x: 300, y: 440 },
    target: { x: 700, y: 260 },
    cardSize: { width: 80, height: 120 },
    ...overrides,
  };
}

test('Power Orb motion exposes wrap, draw, fire, trail and impact as presentation phases', () => {
  const motion = projectBattlePowerOrbLaunchMotion(launchInput());

  assert.equal(motion.schema, 'gameroad.battle-power-orb-motion.v1');
  assert.equal(motion.presentationOnly, true);
  assert.equal(motion.gameplayAuthority, false);
  assert.equal(motion.gameStateWrite, false);
  assert.deepEqual(motion.sequence, ['wrap', 'draw', 'fire', 'trail', 'impact']);
  assert.ok(motion.cardKeyframes.some((frame) => frame.phase === 'wrap'));
  assert.ok(motion.cardKeyframes.some((frame) => frame.phase === 'draw'));
  assert.ok(motion.cardKeyframes.some((frame) => frame.phase === 'fire'));
  assert.ok(motion.trailKeyframes.length >= 2);
  assert.deepEqual(motion.impact, { x: 700, y: 260 });
  assert.ok(motion.cardKeyframes.every((frame) => Number.isFinite(frame.offset)));
  assert.equal(motion.cardKeyframes[0].offset, 0);
  assert.equal(motion.cardKeyframes.at(-1).offset, 1);
});

test('reduced motion keeps the same sequence but emits no moving keyframes', () => {
  const motion = projectBattlePowerOrbLaunchMotion(launchInput({ reducedMotion: true }));

  assert.deepEqual(motion.sequence, ['wrap', 'draw', 'fire', 'trail', 'impact']);
  assert.equal(motion.motionMode, 'semantic-only');
  assert.deepEqual(motion.cardKeyframes, []);
  assert.deepEqual(motion.trailKeyframes, []);
  assert.equal(motion.gameStateWrite, false);
});

test('invalid geometry fails closed without manufacturing a route', () => {
  assert.equal(projectBattlePowerOrbLaunchMotion(launchInput({ aura: null })), null);
  assert.equal(projectBattlePowerOrbLaunchMotion(launchInput({ target: { x: Number.NaN, y: 2 } })), null);
  assert.equal(projectBattlePowerOrbLaunchMotion(launchInput({ cardSize: { width: 0, height: 0 } })), null);
});

test('live release still starts the visual only after the existing successful card commit', async () => {
  const source = (await readFile(sourceUrl, 'utf8')).replace(/\r\n/g, '\n');
  const successfulRelease = source.match(/if \(effectiveCommit && clicked\) \{([\s\S]*?)\n    \}/);

  assert.ok(successfulRelease, 'the existing success-only release gate remains');
  assert.match(successfulRelease[1], /animateHandAuraLaunch\(globalRef, documentRef, root, powerEnergy, ghost\);/);
  assert.match(source, /projectBattlePowerOrbLaunchMotion\(/);
  assert.match(source, /@keyframes grPowerEnergyFlame/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
});

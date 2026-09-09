import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROLLED_CHARACTER_MOTION_CONTRACT,
  createControlledCharacterMotionState,
  projectControlledCharacterMotion,
  transitionControlledCharacterMotion,
} from '../browser/battle-controlled-character-motion-core.mjs';

const forbiddenAuthorityKeys = new Set(['left', 'top', 'x', 'y', 'dx', 'dy', 'path', 'budget', 'route']);

function assertNoCoordinateAuthority(value, trail = 'root') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenAuthorityKeys.has(key), false, `${trail}.${key} must not own coordinate/gameplay authority`);
    assertNoCoordinateAuthority(child, `${trail}.${key}`);
  }
}

test('initial state is presentation-only and owns no board coordinates', () => {
  const state = createControlledCharacterMotionState({ participantId: 'p1', characterId: 'hero', positionKey: 'node-A' });
  assert.equal(state.phase, 'idle');
  assert.equal(state.positionAuthority, 'EXTERNAL_PARENT_BOARD_MARKER');
  assert.equal(state.gameplayAuthority, false);
  assertNoCoordinateAuthority(state);
});

test('only MOVE_ACCEPTED can enter moving phase', () => {
  const initial = createControlledCharacterMotionState({ revision: 3, controlGeneration: 2, positionKey: 'A' });
  for (const type of ['POINTER_MOVE', 'MOVE_PREVIEW', 'DRAG', 'PATH_CHANGED']) {
    const next = transitionControlledCharacterMotion(initial, { type, revision: 3, controlGeneration: 2, toPositionKey: 'B' });
    assert.notEqual(next.phase, 'moving');
    assert.equal(next.positionKey, 'A');
    assert.equal(next.lastTransition.accepted, false);
  }
  const moved = transitionControlledCharacterMotion(initial, {
    type: 'MOVE_ACCEPTED', revision: 3, controlGeneration: 2, fromPositionKey: 'A', toPositionKey: 'B', facing: 'right',
  });
  assert.equal(moved.phase, 'moving');
  assert.equal(moved.positionKey, 'B');
  assert.equal(moved.facing, 'right');
  assert.equal(moved.lastTransition.accepted, true);
});

test('accepted move consumes supplied facing without deriving a route', () => {
  const initial = createControlledCharacterMotionState({ positionKey: 'road-10' });
  const moved = transitionControlledCharacterMotion(initial, {
    type: 'MOVE_ACCEPTED', toPositionKey: 'road-11', facing: 'up-left', revision: 1, controlGeneration: 0,
  });
  assert.equal(moved.facing, 'up-left');
  assert.equal(moved.positionKey, 'road-11');
  assertNoCoordinateAuthority(moved);
  assertNoCoordinateAuthority(projectControlledCharacterMotion(moved));
});

test('stale revision is ignored inside the same control generation', () => {
  const initial = createControlledCharacterMotionState({ revision: 8, controlGeneration: 4, positionKey: 'A' });
  const stale = transitionControlledCharacterMotion(initial, {
    type: 'MOVE_ACCEPTED', revision: 7, controlGeneration: 4, toPositionKey: 'B', facing: 'left',
  });
  assert.equal(stale.positionKey, 'A');
  assert.equal(stale.phase, 'idle');
  assert.equal(stale.lastTransition.reason, 'STALE_SEQUENCE');
});

test('new control generation wins even when revision resets', () => {
  const initial = createControlledCharacterMotionState({ revision: 22, controlGeneration: 4, positionKey: 'A' });
  const next = transitionControlledCharacterMotion(initial, {
    type: 'MOVE_ACCEPTED', revision: 1, controlGeneration: 5, toPositionKey: 'B', facing: 'right',
  });
  assert.equal(next.controlGeneration, 5);
  assert.equal(next.revision, 1);
  assert.equal(next.positionKey, 'B');
  assert.equal(next.phase, 'moving');
});

test('reconnect cancels active motion and settles at authoritative position key', () => {
  const moving = transitionControlledCharacterMotion(
    createControlledCharacterMotionState({ revision: 5, controlGeneration: 2, positionKey: 'A' }),
    { type: 'MOVE_ACCEPTED', revision: 6, controlGeneration: 2, toPositionKey: 'B', facing: 'right' },
  );
  const reconnected = transitionControlledCharacterMotion(moving, {
    type: 'RECONNECT', revision: 1, controlGeneration: 3, positionKey: 'SERVER-C',
  });
  assert.equal(reconnected.phase, 'idle');
  assert.equal(reconnected.positionKey, 'SERVER-C');
  assert.equal(reconnected.reaction, null);
  assert.equal(reconnected.lastTransition.reason, 'RECONNECTED_TO_AUTHORITY');
});

test('selection and generic reactions never mutate authoritative position echo', () => {
  let state = createControlledCharacterMotionState({ positionKey: 'A' });
  state = transitionControlledCharacterMotion(state, { type: 'SELECT' });
  assert.equal(state.phase, 'selected');
  assert.equal(state.positionKey, 'A');
  state = transitionControlledCharacterMotion(state, { type: 'REACTION', reaction: 'commit' });
  assert.equal(state.phase, 'reacting');
  assert.equal(state.reaction, 'commit');
  assert.equal(state.positionKey, 'A');
});

test('unsupported reactions fail closed instead of inventing game semantics', () => {
  const initial = createControlledCharacterMotionState({ positionKey: 'A' });
  const next = transitionControlledCharacterMotion(initial, { type: 'REACTION', reaction: 'victory' });
  assert.equal(next.phase, 'idle');
  assert.equal(next.lastTransition.accepted, false);
  assert.equal(next.lastTransition.reason, 'UNSUPPORTED_REACTION');
});

test('ReducedMotion removes travel bob and overshoot', () => {
  const moving = transitionControlledCharacterMotion(createControlledCharacterMotionState(), {
    type: 'MOVE_ACCEPTED', revision: 1, toPositionKey: 'B', facing: 'right',
  });
  const projection = projectControlledCharacterMotion(moving, { reducedMotion: true });
  assert.equal(projection.effects.travelBob, false);
  assert.equal(projection.effects.overshoot, false);
  assert.equal(projection.effects.blur, false);
  assert.equal(projection.effects.particles, false);
  assert.ok(projection.durationMs <= 90);
});

test('LowPerf projection remains transform/opacity based with no heavy effects', () => {
  const moving = transitionControlledCharacterMotion(createControlledCharacterMotionState(), {
    type: 'MOVE_ACCEPTED', revision: 1, toPositionKey: 'B', facing: 'right',
  });
  const projection = projectControlledCharacterMotion(moving, { lowPerformance: true });
  assert.equal(projection.effects.transform, true);
  assert.equal(projection.effects.opacity, true);
  assert.equal(projection.effects.travelBob, false);
  assert.equal(projection.effects.blur, false);
  assert.equal(projection.effects.particles, false);
});

test('missing visual asset fails visible as a static marker', () => {
  const projection = projectControlledCharacterMotion(createControlledCharacterMotionState(), { visualAvailable: false });
  assert.equal(projection.failVisible, true);
  assert.equal(projection.animation, 'static-marker');
  assert.equal(projection.fallback, 'static-marker');
  assert.equal(projection.durationMs, 0);
});

test('contract explicitly rejects coordinate projection and gameplay authority', () => {
  assert.equal(CONTROLLED_CHARACTER_MOTION_CONTRACT.coordinateProjection, 'NONE');
  assert.equal(CONTROLLED_CHARACTER_MOTION_CONTRACT.gameplayAuthority, false);
  assert.equal(CONTROLLED_CHARACTER_MOTION_CONTRACT.acceptedMovementEvent, 'MOVE_ACCEPTED');
  assert.deepEqual(CONTROLLED_CHARACTER_MOTION_CONTRACT.reconnectInvalidation, ['controlGeneration', 'revision']);
  assertNoCoordinateAuthority(CONTROLLED_CHARACTER_MOTION_CONTRACT);
});

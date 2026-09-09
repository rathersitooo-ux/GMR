import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT,
  applyFourParticipantControlledCharacterEvent,
  createFourParticipantControlledCharacterMotionState,
  projectFourParticipantControlledCharacterMotion,
  reconcileFourParticipantControlledCharacters,
} from '../browser/battle-controlled-character-4p-motion-director.mjs';

const participants = [
  { participantId: 'P1', characterId: 'hero.alpha', positionKey: 'node-A', revision: 1, controlGeneration: 1 },
  { participantId: 'P2', characterId: 'hero.beta', positionKey: 'node-B', revision: 1, controlGeneration: 1 },
  { participantId: 'P3', characterId: 'hero.gamma', positionKey: 'node-C', revision: 1, controlGeneration: 1 },
  { participantId: 'P4', characterId: 'hero.delta', positionKey: 'node-D', revision: 1, controlGeneration: 1 },
];

function initial() {
  return createFourParticipantControlledCharacterMotionState({ participants });
}

const forbiddenAuthorityKeys = new Set(['left', 'top', 'x', 'y', 'dx', 'dy', 'path', 'budget', 'route', 'legalTargets']);
function assertNoMovementAuthority(value, trail = 'root') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenAuthorityKeys.has(key), false, `${trail}.${key}`);
    assertNoMovementAuthority(child, `${trail}.${key}`);
  }
}

test('requires exactly four unique participants with caller-owned character identities', () => {
  const state = initial();
  assert.deepEqual(state.participantOrder, ['P1', 'P2', 'P3', 'P4']);
  assert.equal(state.stateByParticipant.P1.characterId, 'hero.alpha');
  assert.equal(state.stateByParticipant.P4.characterId, 'hero.delta');
  assert.equal(state.gameplayAuthority, false);
  assert.throws(
    () => createFourParticipantControlledCharacterMotionState({ participants: participants.slice(0, 3) }),
    /FOUR_CONTROLLED_PARTICIPANTS_REQUIRED/,
  );
  assertNoMovementAuthority(state);
});

test('one participant MOVE_ACCEPTED does not mutate the other three participants', () => {
  const before = initial();
  const result = applyFourParticipantControlledCharacterEvent(before, 'P2', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'node-E', facing: 'up-left',
  });
  assert.equal(result.accepted, true);
  assert.equal(result.state.stateByParticipant.P2.phase, 'moving');
  assert.equal(result.state.stateByParticipant.P2.positionKey, 'node-E');
  assert.equal(result.state.stateByParticipant.P2.facing, 'up-left');
  assert.strictEqual(result.state.stateByParticipant.P1, before.stateByParticipant.P1);
  assert.strictEqual(result.state.stateByParticipant.P3, before.stateByParticipant.P3);
  assert.strictEqual(result.state.stateByParticipant.P4, before.stateByParticipant.P4);
});

test('same authoritative position preserves every participant instead of deduplicating by node', () => {
  let state = initial();
  state = applyFourParticipantControlledCharacterEvent(state, 'P1', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'shared-node', facing: 'right',
  }).state;
  state = applyFourParticipantControlledCharacterEvent(state, 'P2', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'shared-node', facing: 'left',
  }).state;
  const projection = projectFourParticipantControlledCharacterMotion(state);
  const shared = projection.filter((row) => row.positionKey === 'shared-node');
  assert.equal(shared.length, 2);
  assert.deepEqual(shared.map((row) => row.participantId), ['P1', 'P2']);
  assert.deepEqual(shared.map((row) => row.characterId), ['hero.alpha', 'hero.beta']);
});

test('accepted per-step motion remains temporally distinct and consumes caller supplied facing', () => {
  let state = initial();
  const first = applyFourParticipantControlledCharacterEvent(state, 'P1', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'node-B2', facing: 'right',
  });
  assert.equal(first.state.stateByParticipant.P1.positionKey, 'node-B2');
  assert.equal(first.state.stateByParticipant.P1.motionSerial, 1);
  state = applyFourParticipantControlledCharacterEvent(first.state, 'P1', {
    type: 'SETTLE', revision: 3, controlGeneration: 1,
  }).state;
  const second = applyFourParticipantControlledCharacterEvent(state, 'P1', {
    type: 'MOVE_ACCEPTED', revision: 4, controlGeneration: 1, toPositionKey: 'node-C2', facing: 'down-right',
  });
  assert.equal(second.state.stateByParticipant.P1.positionKey, 'node-C2');
  assert.equal(second.state.stateByParticipant.P1.facing, 'down-right');
  assert.equal(second.state.stateByParticipant.P1.motionSerial, 3);
});

test('events cannot replace caller-owned controlled-character identity', () => {
  const result = applyFourParticipantControlledCharacterEvent(initial(), 'P3', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'node-Z', facing: 'down',
    characterId: 'partner.naki',
  });
  assert.equal(result.state.stateByParticipant.P3.characterId, 'hero.gamma');
  assert.equal(result.characterId, 'hero.gamma');
});

test('reconcile rejects identity swaps and accepts authoritative reconnect positions', () => {
  const state = initial();
  const identitySwap = participants.map((row) => ({ ...row }));
  identitySwap[0].characterId = 'different.character';
  const rejected = reconcileFourParticipantControlledCharacters(state, { participants: identitySwap });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'CHARACTER_IDENTITY_CHANGED');
  assert.strictEqual(rejected.state, state);

  const reconnect = participants.map((row, index) => ({
    ...row,
    positionKey: `server-${index + 1}`,
    revision: 1,
    controlGeneration: 2,
  }));
  const accepted = reconcileFourParticipantControlledCharacters(state, { participants: reconnect });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.stateByParticipant.P1.positionKey, 'server-1');
  assert.equal(accepted.state.stateByParticipant.P4.positionKey, 'server-4');
  assert.equal(accepted.state.stateByParticipant.P1.phase, 'idle');
});

test('stale participant movement is rejected by the reused single-character motion core', () => {
  const result = applyFourParticipantControlledCharacterEvent(initial(), 'P4', {
    type: 'MOVE_ACCEPTED', revision: 0, controlGeneration: 1, toPositionKey: 'stale-node', facing: 'left',
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'STALE_SEQUENCE');
  assert.equal(result.state.stateByParticipant.P4.positionKey, 'node-D');
});

test('ReducedMotion, LowPerf and missing visuals project independently for all four', () => {
  let state = initial();
  state = applyFourParticipantControlledCharacterEvent(state, 'P1', {
    type: 'MOVE_ACCEPTED', revision: 2, controlGeneration: 1, toPositionKey: 'node-E', facing: 'right',
  }).state;
  const projection = projectFourParticipantControlledCharacterMotion(state, {
    reducedMotion: true,
    lowPerformance: true,
    visualAvailableByParticipant: { P3: false },
  });
  assert.equal(projection.length, 4);
  assert.equal(projection[0].motion.effects.travelBob, false);
  assert.ok(projection[0].motion.durationMs <= 90);
  assert.equal(projection[2].motion.animation, 'static-marker');
  assert.equal(projection[2].motion.durationMs, 0);
});

test('unknown participant and contract remain fail-closed presentation-only', () => {
  const state = initial();
  const result = applyFourParticipantControlledCharacterEvent(state, 'P5', { type: 'SELECT' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'UNKNOWN_PARTICIPANT');
  assert.strictEqual(result.state, state);
  assert.equal(FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT.participantCount, 4);
  assert.equal(FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT.gameplayAuthority, false);
  assert.equal(FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT.advicePartnerCoupling, false);
  assert.equal(FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT.liveBindingIncluded, false);
  assertNoMovementAuthority(FOUR_PARTICIPANT_CONTROLLED_CHARACTER_MOTION_CONTRACT);
});

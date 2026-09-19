import assert from 'node:assert/strict';
import {
  BATTLE_CINEMATIC_SKIP_INTENT,
  DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO,
  DEFAULT_WIPE_MIN_DISTANCE_PX,
  classifyBattleCinematicWipe,
  createBattleCinematicSkipIntent,
  createBattleCinematicSkipIntentFromWipe,
  routeBattleCinematicSkipIntent
} from '../browser/battle-cinematic-skip-intent-core.mjs';

const allowedInputs = ['skip', 'public_info', 'accessibility'];

const buttonIntent = createBattleCinematicSkipIntent({
  source: 'button',
  eventId: 'attack-1',
  phase: 'attack',
  allowedInputs
});
assert.equal(buttonIntent.accepted, true);
assert.equal(buttonIntent.presentationCommand, 'JUMP_TO_TIMELINE_END');
assert.equal(buttonIntent.presentationOnly, true);
assert.equal(buttonIntent.gameplayAuthority, false);
assert.equal(buttonIntent.gameStateWrite, false);
assert.equal(buttonIntent.winnerCalculation, false);
assert.equal(buttonIntent.orderCalculation, false);
assert.equal(buttonIntent.cardMovementCalculation, false);
assert.equal(buttonIntent.resultMutation, false);
assert.equal(buttonIntent.preserveAuthoritativeState, true);

const blockedButton = createBattleCinematicSkipIntent({
  source: 'button',
  eventId: 'attack-2',
  phase: 'attack',
  allowedInputs: ['public_info']
});
assert.equal(blockedButton.accepted, false);
assert.equal(blockedButton.reason, 'SKIP_NOT_ALLOWED');
assert.equal('presentationCommand' in blockedButton, false);

const leftWipe = classifyBattleCinematicWipe({
  startX: 300,
  startY: 220,
  endX: 190,
  endY: 236
});
assert.equal(leftWipe.accepted, true);
assert.equal(leftWipe.direction, 'left');
assert.equal(leftWipe.primaryDistance, 110);
assert.ok(leftWipe.crossAxisRatio <= DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO);

const rightWipe = classifyBattleCinematicWipe({
  startX: 100,
  startY: 180,
  endX: 190,
  endY: 160
});
assert.equal(rightWipe.accepted, true);
assert.equal(rightWipe.direction, 'right');

const shortWipe = classifyBattleCinematicWipe({
  startX: 100,
  startY: 100,
  endX: 100 + DEFAULT_WIPE_MIN_DISTANCE_PX - 1,
  endY: 100
});
assert.equal(shortWipe.accepted, false);
assert.equal(shortWipe.reason, 'WIPE_TOO_SHORT');

const verticalWipe = classifyBattleCinematicWipe({
  startX: 100,
  startY: 100,
  endX: 190,
  endY: 220
});
assert.equal(verticalWipe.accepted, false);
assert.equal(verticalWipe.reason, 'WIPE_TOO_VERTICAL');

const wipeIntent = createBattleCinematicSkipIntentFromWipe({
  gesture: leftWipe,
  eventId: 'attack-3',
  phase: 'attack',
  allowedInputs
});
assert.equal(wipeIntent.accepted, true);
assert.equal(wipeIntent.source, 'wipe');
assert.equal(wipeIntent.presentationCommand, 'JUMP_TO_TIMELINE_END');

const rejectedWipeIntent = createBattleCinematicSkipIntentFromWipe({
  gesture: shortWipe,
  eventId: 'attack-4',
  phase: 'attack',
  allowedInputs
});
assert.equal(rejectedWipeIntent.accepted, false);
assert.equal(rejectedWipeIntent.reason, 'WIPE_TOO_SHORT');

const authoritativeState = {
  winnerIds: ['P4'],
  processingOrder: ['P2', 'P1', 'P4', 'P3'],
  movedCards: [{ cardId: 'C-202', destination: 'HAND' }],
  boardResult: { shield: 'P3:R', columnDepth: 6 }
};
const before = JSON.stringify(authoritativeState);
const routed = routeBattleCinematicSkipIntent({
  intent: wipeIntent,
  authoritativeState
});
assert.equal(routed.consumed, true);
assert.equal(routed.presentationCommand, 'JUMP_TO_TIMELINE_END');
assert.strictEqual(routed.authoritativeState, authoritativeState);
assert.equal(routed.authoritativeStatePreservedByReference, true);
assert.equal(routed.gameStateWrite, false);
assert.equal(JSON.stringify(authoritativeState), before);

const blockedRoute = routeBattleCinematicSkipIntent({
  intent: blockedButton,
  authoritativeState
});
assert.equal(blockedRoute.consumed, false);
assert.equal(blockedRoute.presentationCommand, null);
assert.strictEqual(blockedRoute.authoritativeState, authoritativeState);
assert.equal(JSON.stringify(authoritativeState), before);

assert.throws(
  () => createBattleCinematicSkipIntent({ source: 'tap', eventId: 'bad', allowedInputs }),
  /BATTLE_CINEMATIC_SKIP_SOURCE_INVALID/
);
assert.throws(
  () => classifyBattleCinematicWipe({ startX: 0, startY: 0, endX: 100, endY: 0, minDistancePx: 0 }),
  /BATTLE_CINEMATIC_WIPE_MIN_DISTANCE_INVALID/
);
assert.throws(
  () => createBattleCinematicSkipIntentFromWipe({ gesture: {}, eventId: 'bad', allowedInputs }),
  /BATTLE_CINEMATIC_WIPE_GESTURE_REQUIRED/
);

assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.presentationOnly, true);
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.gameStateWrite, false);
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.authority, 'NONE');
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.command, 'JUMP_TO_TIMELINE_END');
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.authoritativeStatePolicy, 'PASS_THROUGH_SAME_REFERENCE_NO_MUTATION');
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.wipeMinDistancePx, DEFAULT_WIPE_MIN_DISTANCE_PX);
assert.equal(BATTLE_CINEMATIC_SKIP_INTENT.wipeMaxCrossAxisRatio, DEFAULT_WIPE_MAX_CROSS_AXIS_RATIO);

console.log(JSON.stringify({
  ok: true,
  tests: 45,
  button: { accepted: buttonIntent.accepted, command: buttonIntent.presentationCommand },
  wipe: {
    left: leftWipe.accepted,
    right: rightWipe.accepted,
    short: shortWipe.reason,
    vertical: verticalWipe.reason
  },
  authoritativeStatePreserved: JSON.stringify(authoritativeState) === before
}, null, 2));

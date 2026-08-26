import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_BODY_INTERACTION_PHASES as P,
  applyPartnerBodyInteractionEvent,
  createPartnerBodyInteractionState,
  projectPartnerBodyInteraction,
  resolvePartnerBodyInputPriority,
} from '../browser/partner-body-interaction-core.mjs';

const config = Object.freeze({
  awarenessRadius: 100,
  contactRadius: 24,
  clingRadius: 16,
  holdMs: 300,
  pushOffCompression: 0.55,
  evadeGain: 1.2,
  remotePressureGain: 1.4,
  pushOffGain: 1.6,
  attractionGain: 1.3,
  clingAdhesion: 0.85,
  clingFollowLag: 0.45,
  peelAdhesion: 0.6,
  freeSwingGain: 2.2,
  recontactAdhesion: 0.75,
  lowPerfMotionScale: 0.5,
});

const make = (zone = 'bust', extra = {}) => createPartnerBodyInteractionState({
  zone,
  profileId: `${zone}:test`,
  config,
  ...extra,
});

const down = (state, distance = 20, atMs = 0) => applyPartnerBodyInteractionEvent(state, {
  type: 'POINTER_DOWN', distance, atMs, directionX: -1, directionY: 0, compression: 0.1,
});

test('input arbitration is card > major battle control > partner', () => {
  assert.deepEqual(resolvePartnerBodyInputPriority({ cardInteractionActive: true, majorBattleControlActive: true }), { owner: 'card', partnerAllowed: false });
  assert.deepEqual(resolvePartnerBodyInputPriority({ majorBattleControlActive: true }), { owner: 'major_battle_control', partnerAllowed: false });
  assert.deepEqual(resolvePartnerBodyInputPriority({}), { owner: 'partner', partnerAllowed: true });
});

test('approaching before contact creates evade intent without inventing contact', () => {
  const state = applyPartnerBodyInteractionEvent(make(), {
    type: 'POINTER_APPROACH', distance: 60, approachStrength: 0.9, directionX: -1, directionY: 0,
  });
  assert.equal(state.phase, P.APPROACH_EVADE);
  assert.ok(state.reaction.displacement > 0);
  assert.equal(state.reaction.compression, 0);
});

test('remote tap creates non-contact pressure then energetic free swing', () => {
  let state = applyPartnerBodyInteractionEvent(make(), {
    type: 'REMOTE_TAP', distance: 55, tapStrength: 1, directionX: -1, directionY: 0,
  });
  assert.equal(state.phase, P.TAP_REMOTE_PRESSURE);
  assert.equal(state.pointer, null);
  assert.ok(state.reaction.secondaryMotion.energy > 0);
  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE' });
  assert.equal(state.phase, P.FREE_SWING);
  assert.equal(state.reaction.secondaryMotion.driver, 'remote_pressure');
});

test('direct contact cannot skip PRESS_CONTACT and only pressure progress can push off', () => {
  let state = down(make());
  assert.equal(state.phase, P.PRESS_CONTACT, 'direct down must expose the pressed intermediate state');
  assert.equal(state.reaction.displacement, 0, 'raw distance repulsion must not fake a push-off');

  state = applyPartnerBodyInteractionEvent(state, { type: 'PRESS_PROGRESS', compression: 0.4 });
  assert.equal(state.phase, P.PRESS_CONTACT);
  assert.equal(state.reaction.compression, 0.4);

  state = applyPartnerBodyInteractionEvent(state, { type: 'PRESS_PROGRESS', compression: 0.7 });
  assert.equal(state.phase, P.PUSH_OFF);
  assert.ok(state.reaction.displacement > 0);
  assert.ok(state.reaction.secondaryMotion.energy > 0);

  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE' });
  assert.equal(state.phase, P.FREE_SWING);
});

test('long press reverses into attraction and proximity increases attraction strength', () => {
  let far = down(make(), 70, 0);
  far = applyPartnerBodyInteractionEvent(far, { type: 'TICK', atMs: 300 });
  assert.equal(far.phase, P.LONG_PRESS_ATTRACT);

  let near = down(make(), 35, 0);
  near = applyPartnerBodyInteractionEvent(near, { type: 'TICK', atMs: 300 });
  assert.equal(near.phase, P.LONG_PRESS_ATTRACT);
  assert.ok(near.reaction.attraction > far.reaction.attraction);
});

test('near long press captures, follows with lag, peels, then returns to free swing', () => {
  let state = down(make(), 14, 0);
  state = applyPartnerBodyInteractionEvent(state, { type: 'TICK', atMs: 300 });
  assert.equal(state.phase, P.CLING_CAPTURE);
  assert.ok(state.reaction.adhesion > 0);

  state = applyPartnerBodyInteractionEvent(state, { type: 'POINTER_MOVE', distance: 12, directionX: 0, directionY: 1 });
  assert.equal(state.phase, P.CLING_FOLLOW);
  assert.equal(state.reaction.followLag, config.clingFollowLag);

  state = applyPartnerBodyInteractionEvent(state, { type: 'POINTER_UP' });
  assert.equal(state.phase, P.PEEL_RELEASE);
  assert.ok(state.reaction.adhesion > 0);

  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE' });
  assert.equal(state.phase, P.FREE_SWING);
  assert.ok(state.reaction.secondaryMotion.energy > 0);
});

test('sticky response is confined to cling/recontact and free swing is not sticky', () => {
  let state = applyPartnerBodyInteractionEvent(make(), {
    type: 'REMOTE_TAP', distance: 40, tapStrength: 1, directionX: 1, directionY: 0,
  });
  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE' });
  assert.equal(state.phase, P.FREE_SWING);
  assert.equal(state.reaction.adhesion, 0);

  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE', recontact: true });
  assert.equal(state.phase, P.RECONTACT_CLING);
  assert.equal(state.reaction.adhesion, config.recontactAdhesion);

  state = applyPartnerBodyInteractionEvent(state, { type: 'MOTION_ADVANCE' });
  assert.equal(state.phase, P.SETTLE);
  assert.equal(state.reaction.adhesion, 0);
});

test('card/control ownership suppresses and clears partner interaction', () => {
  let state = applyPartnerBodyInteractionEvent(make(), {
    type: 'POINTER_APPROACH', distance: 50, approachStrength: 1, directionX: -1, directionY: 0,
  });
  assert.equal(state.phase, P.APPROACH_EVADE);

  state = applyPartnerBodyInteractionEvent(state, { type: 'SET_ARBITRATION', cardInteractionActive: true, majorBattleControlActive: true });
  assert.equal(state.phase, P.IDLE);
  assert.equal(state.suppressedBy, 'card');

  const unchanged = applyPartnerBodyInteractionEvent(state, {
    type: 'REMOTE_TAP', distance: 30, tapStrength: 1, directionX: -1, directionY: 0,
  });
  assert.equal(unchanged, state);
});

test('same interaction engine supports bust, cheek, and thigh without separate schemas', () => {
  for (const zone of ['bust', 'cheek', 'thigh']) {
    let state = down(make(zone));
    assert.equal(state.zone, zone);
    assert.equal(state.phase, P.PRESS_CONTACT);
    assert.equal(state.schema, 'gameroad.partner-body-interaction.v1');
    state = applyPartnerBodyInteractionEvent(state, { type: 'PRESS_PROGRESS', compression: 0.8 });
    assert.equal(state.phase, P.PUSH_OFF);
  }
});

test('shake uses the same secondary-motion output and accessibility changes cost, not semantics', () => {
  const full = applyPartnerBodyInteractionEvent(make(), { type: 'SHAKE_IMPULSE', strength: 1, directionX: 1, directionY: 0 });
  const low = applyPartnerBodyInteractionEvent(make('bust', { lowPerf: true }), { type: 'SHAKE_IMPULSE', strength: 1, directionX: 1, directionY: 0 });
  const reduced = applyPartnerBodyInteractionEvent(make('bust', { reducedMotion: true }), { type: 'SHAKE_IMPULSE', strength: 1, directionX: 1, directionY: 0 });

  for (const state of [full, low, reduced]) {
    assert.equal(state.phase, P.FREE_SWING);
    assert.equal(state.reaction.secondaryMotion.driver, 'shake');
  }
  assert.ok(full.reaction.secondaryMotion.energy > low.reaction.secondaryMotion.energy);
  assert.equal(reduced.reaction.secondaryMotion.energy, 0);
  assert.equal(reduced.reaction.secondaryMotion.mode, 'static');
});

test('projection is presentation-only and exposes no gameplay/save/economy authority', () => {
  const projection = projectPartnerBodyInteraction(down(make('thigh')));
  assert.equal(projection.presentationOnly, true);
  assert.equal(projection.phase, P.PRESS_CONTACT);
  for (const forbidden of ['gameplay', 'save', 'reward', 'economy', 'cardMutation', 'persona', 'relationship', 'canon']) {
    assert.equal(Object.hasOwn(projection, forbidden), false, forbidden);
  }
  assert.ok(Object.isFrozen(projection));
  assert.ok(Object.isFrozen(projection.reaction));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_MOTION_FAMILY,
  UI_MOTION_ROLE,
  motionTransform,
  resolveContinuityKey,
  resolveControlMotionRole,
  resolveMenuMotionIntent,
  resolveMotionFamily
} from '../browser/ui-motion-intent-core.mjs';

test('route destinations resolve to distinct motion families without inventing routes', () => {
  assert.equal(resolveMotionFamily('cards'), UI_MOTION_FAMILY.CARDS);
  assert.equal(resolveMotionFamily('characters'), UI_MOTION_FAMILY.CHARACTER);
  assert.equal(resolveMotionFamily('shop'), UI_MOTION_FAMILY.ECONOMY);
  assert.equal(resolveMotionFamily('battle'), UI_MOTION_FAMILY.BATTLE);
  assert.equal(resolveMotionFamily('settings'), UI_MOTION_FAMILY.UTILITY);
  assert.equal(resolveMotionFamily('future-screen'), UI_MOTION_FAMILY.ROUTE);
});

test('existing route datasets automatically opt controls into route semantics', () => {
  const control = {dataset: {homeTarget: 'cards'}, getAttribute() { return null; }};
  assert.equal(resolveControlMotionRole(control), UI_MOTION_ROLE.ROUTE);
  assert.equal(resolveContinuityKey(control), 'route:cards');
});

test('explicit role and continuity key override fallback inference', () => {
  const control = {
    dataset: {motionRole: 'detail', motionKey: 'card:42', homeTarget: 'cards'},
    getAttribute() { return null; }
  };
  assert.equal(resolveControlMotionRole(control), UI_MOTION_ROLE.DETAIL);
  assert.equal(resolveContinuityKey(control), 'card:42');
});

test('shared continuity carries the selected logical object instead of choosing a generic bridge', () => {
  const plan = resolveMenuMotionIntent({
    from: 'home',
    to: 'cards',
    controlRole: UI_MOTION_ROLE.ROUTE,
    continuityKey: 'route:cards',
    destinationHasContinuity: true
  });
  assert.equal(plan.family, UI_MOTION_FAMILY.CARDS);
  assert.equal(plan.bridge, 'shared-element');
  assert.deepEqual(plan.choreography, ['carry-selected-object', 'quiet-sibling-surfaces']);
});

test('back navigation is a semantic collapse rather than literal frame reversal', () => {
  const forward = resolveMenuMotionIntent({from: 'home', to: 'shop'});
  const back = resolveMenuMotionIntent({from: 'shop', to: 'home', reason: 'back'});
  assert.equal(forward.reverseSemantic, false);
  assert.equal(back.reverseSemantic, true);
  assert.equal(back.choreography[1], 'collapse-to-parent-anchor');
  assert.notEqual(forward.kinetics.enterSign, back.kinetics.enterSign);
});

test('future routes receive a safe route-family fallback instead of being animationless', () => {
  const plan = resolveMenuMotionIntent({from: 'home', to: 'future-screen'});
  assert.equal(plan.family, UI_MOTION_FAMILY.ROUTE);
  assert.equal(plan.bridge, 'route-bridge');
});

test('motionTransform produces transform-only projection strings', () => {
  assert.equal(
    motionTransform({axis: 'x', distance: 18, scale: 0.985, rotateDeg: -0.7}),
    'translate3d(18px,0,0) rotate(-0.7deg) scale(0.985)'
  );
  assert.equal(motionTransform({axis: 'y', distance: -12}), 'translate3d(0,-12px,0)');
});

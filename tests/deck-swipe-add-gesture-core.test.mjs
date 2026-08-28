import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_SWIPE_ADD_OUTCOMES,
  DEFAULT_DECK_SWIPE_ADD_CONFIG,
  classifyDeckSwipeAddGesture,
  createDeckSwipeAddGestureTracker
} from '../browser/deck-swipe-add-gesture-core.mjs';

const p = (pointerId, x, y) => ({ pointerId, x, y });

test('default gesture contract is stable and frozen', () => {
  assert.deepEqual(DECK_SWIPE_ADD_OUTCOMES, {
    ADD: 'SWIPE_RIGHT_ADD',
    TAP: 'TAP',
    CANCEL: 'CANCEL'
  });
  assert.deepEqual(DEFAULT_DECK_SWIPE_ADD_CONFIG, {
    minSwipeDistancePx: 44,
    axisDominanceRatio: 1.2,
    tapSlopPx: 10
  });
  assert.equal(Object.isFrozen(DECK_SWIPE_ADD_OUTCOMES), true);
  assert.equal(Object.isFrozen(DEFAULT_DECK_SWIPE_ADD_CONFIG), true);
});

test('right swipe classifies as one add intent', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(1, 100, 200),
    end: p(1, 160, 205)
  });
  assert.deepEqual(result, {
    outcome: 'SWIPE_RIGHT_ADD',
    reason: 'RIGHT_SWIPE_ACCEPTED',
    dx: 60,
    dy: 5
  });
});

test('vertical scroll-like motion never classifies as add', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(1, 100, 100),
    end: p(1, 150, 180)
  });
  assert.equal(result.outcome, 'CANCEL');
  assert.equal(result.reason, 'AXIS_REJECTED');
});

test('left swipe never classifies as add', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(1, 100, 100),
    end: p(1, 35, 102)
  });
  assert.equal(result.outcome, 'CANCEL');
  assert.equal(result.reason, 'DIRECTION_REJECTED');
});

test('small movement remains tap so existing tap behavior can be preserved', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(1, 100, 100),
    end: p(1, 106, 94)
  });
  assert.equal(result.outcome, 'TAP');
  assert.equal(result.reason, 'TAP_SLOP');
});

test('short right drag outside tap slop does not become add', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(1, 100, 100),
    end: p(1, 125, 102)
  });
  assert.equal(result.outcome, 'CANCEL');
  assert.equal(result.reason, 'DISTANCE_NOT_MET');
});

test('diagonal right swipe is accepted only when horizontal intent dominates', () => {
  const accepted = classifyDeckSwipeAddGesture({
    start: p(1, 0, 0),
    end: p(1, 60, 40)
  });
  assert.equal(accepted.outcome, 'SWIPE_RIGHT_ADD');

  const rejected = classifyDeckSwipeAddGesture({
    start: p(1, 0, 0),
    end: p(1, 60, 55)
  });
  assert.equal(rejected.outcome, 'CANCEL');
  assert.equal(rejected.reason, 'AXIS_REJECTED');
});

test('thresholds can be tuned by the later product mount without changing deck rules', () => {
  const result = classifyDeckSwipeAddGesture({
    start: p(7, 0, 0),
    end: p(7, 35, 2)
  }, {
    minSwipeDistancePx: 32,
    axisDominanceRatio: 1.1,
    tapSlopPx: 8
  });
  assert.equal(result.outcome, 'SWIPE_RIGHT_ADD');
});

test('tracker emits at most one add outcome for one pointer gesture', () => {
  const tracker = createDeckSwipeAddGestureTracker();
  assert.equal(tracker.begin(p(9, 10, 20)).accepted, true);
  const moving = tracker.move(p(9, 40, 21));
  assert.equal(moving.accepted, true);
  assert.ok(moving.progress > 0 && moving.progress < 1);

  const firstFinish = tracker.finish(p(9, 70, 22));
  assert.equal(firstFinish.outcome, 'SWIPE_RIGHT_ADD');
  assert.deepEqual(tracker.getState(), { active: false });

  const duplicateFinish = tracker.finish(p(9, 80, 22));
  assert.equal(duplicateFinish.outcome, 'CANCEL');
  assert.equal(duplicateFinish.reason, 'NO_ACTIVE_GESTURE');
});

test('secondary pointer cannot hijack or terminate the active gesture', () => {
  const tracker = createDeckSwipeAddGestureTracker();
  tracker.begin(p(1, 0, 0));
  assert.deepEqual(tracker.begin(p(2, 0, 0)), {
    accepted: false,
    reason: 'GESTURE_ALREADY_ACTIVE',
    pointerId: 2
  });
  assert.equal(tracker.move(p(2, 100, 0)).reason, 'POINTER_MISMATCH');
  assert.equal(tracker.finish(p(2, 100, 0)).reason, 'POINTER_MISMATCH');
  assert.deepEqual(tracker.getState(), { active: true, pointerId: 1, x: 0, y: 0 });

  const ownerFinish = tracker.finish(p(1, 60, 0));
  assert.equal(ownerFinish.outcome, 'SWIPE_RIGHT_ADD');
});

test('pointer cancel clears tracking without producing an add', () => {
  const tracker = createDeckSwipeAddGestureTracker();
  tracker.begin(p(3, 5, 5));
  tracker.move(p(3, 80, 5));
  const cancelled = tracker.cancel(3);
  assert.deepEqual(cancelled, {
    outcome: 'CANCEL',
    reason: 'POINTER_CANCELLED',
    dx: 0,
    dy: 0
  });
  assert.deepEqual(tracker.getState(), { active: false });
});

test('invalid gesture configuration and coordinates fail closed', () => {
  assert.throws(
    () => createDeckSwipeAddGestureTracker({ minSwipeDistancePx: 10, tapSlopPx: 10 }),
    /TAP_SLOP_MUST_BE_BELOW_SWIPE_DISTANCE/
  );
  assert.throws(
    () => classifyDeckSwipeAddGesture({ start: p(1, 0, 0), end: p(1, Number.NaN, 1) }),
    /X_INVALID/
  );
  assert.throws(
    () => classifyDeckSwipeAddGesture({ start: { x: 0, y: 0 }, end: p(1, 60, 0) }),
    /POINTER_ID_REQUIRED/
  );
});

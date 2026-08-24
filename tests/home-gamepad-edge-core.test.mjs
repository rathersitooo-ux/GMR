import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_GAMEPAD_EDGE_SCHEMA,
  advanceHomeGamepadEdge,
  createHomeGamepadEdgeLatch,
} from '../browser/home-gamepad-edge-core.mjs';

function legacyStep(previous, sample = {}) {
  let confirmHeld = Boolean(previous?.confirmHeld);
  let cancelHeld = Boolean(previous?.cancelHeld);
  const confirmPressed = Boolean(sample.confirmPressed);
  const cancelPressed = Boolean(sample.cancelPressed);

  if (sample.interactive === false) {
    confirmHeld = confirmPressed;
    cancelHeld = cancelPressed;
    return { state: { confirmHeld, cancelHeld }, confirmEdge: false, cancelEdge: false };
  }

  if (sample.busy) {
    if (!confirmPressed) confirmHeld = false;
    if (!cancelPressed) cancelHeld = false;
    return { state: { confirmHeld, cancelHeld }, confirmEdge: false, cancelEdge: false };
  }

  const confirmEdge = confirmPressed && !confirmHeld;
  const cancelEdge = cancelPressed && !cancelHeld;
  return {
    state: { confirmHeld: confirmPressed, cancelHeld: cancelPressed },
    confirmEdge,
    cancelEdge,
  };
}

function runLegacyBusyHeld(button) {
  const pressed = button === 'confirm'
    ? { confirmPressed: true }
    : { cancelPressed: true };
  let result = legacyStep(undefined, { ...pressed, busy: true });
  result = legacyStep(result.state, { ...pressed, busy: false });
  return result;
}

function runCurrentBusyHeld(button) {
  const pressed = button === 'confirm'
    ? { confirmPressed: true }
    : { cancelPressed: true };
  const latch = createHomeGamepadEdgeLatch();
  latch.sample({ ...pressed, busy: true });
  return latch.sample({ ...pressed, busy: false });
}

test('schema is explicit for production mounting', () => {
  assert.equal(HOME_GAMEPAD_EDGE_SCHEMA, 'gameroad.home-gamepad-edge.v1');
});

test('sensitivity: legacy busy branch turns held confirm/cancel into stale fresh edges', () => {
  const legacyConfirm = runLegacyBusyHeld('confirm');
  const legacyCancel = runLegacyBusyHeld('cancel');
  assert.equal(legacyConfirm.confirmEdge, true);
  assert.equal(legacyCancel.cancelEdge, true);

  const currentConfirm = runCurrentBusyHeld('confirm');
  const currentCancel = runCurrentBusyHeld('cancel');
  assert.equal(currentConfirm.confirmEdge, false);
  assert.equal(currentCancel.cancelEdge, false);
  assert.equal(currentConfirm.suppressed, false);
  assert.equal(currentCancel.suppressed, false);
});

test('a held button fires only once during normal interactive polling', () => {
  const latch = createHomeGamepadEdgeLatch();

  assert.equal(latch.sample({ confirmPressed: false }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true }).confirmEdge, true);
  assert.equal(latch.sample({ confirmPressed: true }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: false }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true }).confirmEdge, true);
});

test('busy-started hold requires release before a new edge can fire', () => {
  const latch = createHomeGamepadEdgeLatch();

  const duringBusy = latch.sample({ confirmPressed: true, busy: true });
  assert.equal(duringBusy.suppressed, true);
  assert.equal(duringBusy.confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true, busy: false }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: false, busy: false }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true, busy: false }).confirmEdge, true);
});

test('release during busy re-arms a later fresh press', () => {
  const latch = createHomeGamepadEdgeLatch({ confirmHeld: true });

  assert.equal(latch.sample({ confirmPressed: false, busy: true }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: false, busy: false }).confirmEdge, false);
  assert.equal(latch.sample({ confirmPressed: true, busy: false }).confirmEdge, true);
});

test('noninteractive frames synchronize held levels and suppress stale return edges', () => {
  const latch = createHomeGamepadEdgeLatch();

  const away = latch.sample({ cancelPressed: true, interactive: false });
  assert.equal(away.suppressed, true);
  assert.equal(away.cancelEdge, false);
  assert.equal(latch.sample({ cancelPressed: true, interactive: true }).cancelEdge, false);
  assert.equal(latch.sample({ cancelPressed: false, interactive: true }).cancelEdge, false);
  assert.equal(latch.sample({ cancelPressed: true, interactive: true }).cancelEdge, true);
});

test('confirm and cancel edges stay independent so the production caller retains priority policy', () => {
  const first = advanceHomeGamepadEdge(undefined, {
    confirmPressed: true,
    cancelPressed: true,
  });
  assert.equal(first.confirmEdge, true);
  assert.equal(first.cancelEdge, true);

  const held = advanceHomeGamepadEdge(first.state, {
    confirmPressed: true,
    cancelPressed: true,
  });
  assert.equal(held.confirmEdge, false);
  assert.equal(held.cancelEdge, false);
});

test('suppressed sampling records both held levels without emitting actions', () => {
  const result = advanceHomeGamepadEdge(
    { confirmHeld: false, cancelHeld: false },
    { confirmPressed: true, cancelPressed: true, busy: true },
  );

  assert.deepEqual(result.state, { confirmHeld: true, cancelHeld: true });
  assert.equal(result.confirmEdge, false);
  assert.equal(result.cancelEdge, false);
  assert.equal(result.suppressed, true);
});

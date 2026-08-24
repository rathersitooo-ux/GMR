export const HOME_GAMEPAD_EDGE_SCHEMA = 'gameroad.home-gamepad-edge.v1';

function freezeState(confirmHeld, cancelHeld) {
  return Object.freeze({
    confirmHeld: Boolean(confirmHeld),
    cancelHeld: Boolean(cancelHeld),
  });
}

export function createHomeGamepadEdgeState(initial = {}) {
  return freezeState(initial.confirmHeld, initial.cancelHeld);
}

export function advanceHomeGamepadEdge(previousState, sample = {}) {
  const previous = createHomeGamepadEdgeState(previousState);
  const confirmPressed = Boolean(sample.confirmPressed);
  const cancelPressed = Boolean(sample.cancelPressed);
  const interactive = sample.interactive !== false;
  const busy = Boolean(sample.busy);
  const state = freezeState(confirmPressed, cancelPressed);

  // GamepadButton.pressed is a sampled level, not a rising-edge event. Even while
  // actions are suppressed, keep the held snapshot synchronized so a press that
  // began during a transition cannot become a stale "new" press afterwards.
  if (!interactive || busy) {
    return Object.freeze({
      state,
      confirmEdge: false,
      cancelEdge: false,
      suppressed: true,
    });
  }

  return Object.freeze({
    state,
    confirmEdge: confirmPressed && !previous.confirmHeld,
    cancelEdge: cancelPressed && !previous.cancelHeld,
    suppressed: false,
  });
}

export function createHomeGamepadEdgeLatch(initialState) {
  let state = createHomeGamepadEdgeState(initialState);

  return Object.freeze({
    sample(input) {
      const result = advanceHomeGamepadEdge(state, input);
      state = result.state;
      return result;
    },
    reset(nextState) {
      state = createHomeGamepadEdgeState(nextState);
      return state;
    },
    snapshot() {
      return state;
    },
  });
}

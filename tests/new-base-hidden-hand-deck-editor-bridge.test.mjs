import test from 'node:test';
import assert from 'node:assert/strict';

import { createHiddenHandDeckEditorBridge } from '../browser/new-base-hidden-hand-deck-editor-bridge.mjs';

test('forwards the selected card reference unchanged exactly once', () => {
  const selectedCardRef = { cardId: 'opaque-card-ref', untouched: { suit: 'native-suit-stays-external' } };
  const received = [];
  const portResult = Object.freeze({ downstream: 'owned-by-registration-port' });
  const bridge = createHiddenHandDeckEditorBridge({
    getSelectedCardRef: () => selectedCardRef,
    registrationPort: (candidate) => {
      received.push(candidate);
      return portResult;
    },
  });

  const result = bridge.requestRegistration();

  assert.equal(result, portResult);
  assert.equal(received.length, 1);
  assert.equal(received[0], selectedCardRef);
  assert.deepEqual(selectedCardRef, {
    cardId: 'opaque-card-ref',
    untouched: { suit: 'native-suit-stays-external' },
  });
});

test('currentSelection is a stateless read-through of the editor selection', () => {
  const first = { cardId: 'first' };
  const second = { cardId: 'second' };
  let current = first;
  const bridge = createHiddenHandDeckEditorBridge({
    getSelectedCardRef: () => current,
    registrationPort: () => undefined,
  });

  assert.equal(bridge.currentSelection(), first);
  current = second;
  assert.equal(bridge.currentSelection(), second);
});

test('null or undefined selection fails closed before the registration port', () => {
  for (const missing of [null, undefined]) {
    let portCalls = 0;
    const bridge = createHiddenHandDeckEditorBridge({
      getSelectedCardRef: () => missing,
      registrationPort: () => {
        portCalls += 1;
      },
    });

    assert.throws(
      () => bridge.requestRegistration(),
      /requires a selected card reference/,
    );
    assert.equal(portCalls, 0);
  }
});

test('does not normalize non-null opaque references or impose a card-id shape', () => {
  for (const selectedCardRef of ['', 0, false, Symbol('opaque')]) {
    let received;
    const bridge = createHiddenHandDeckEditorBridge({
      getSelectedCardRef: () => selectedCardRef,
      registrationPort: (candidate) => {
        received = candidate;
        return candidate;
      },
    });

    assert.equal(bridge.requestRegistration(), selectedCardRef);
    assert.equal(received, selectedCardRef);
  }
});

test('returns an async registration-port result without wrapping it', () => {
  const pending = Promise.resolve({ acceptedByDownstream: true });
  const bridge = createHiddenHandDeckEditorBridge({
    getSelectedCardRef: () => 'opaque-ref',
    registrationPort: () => pending,
  });

  assert.equal(bridge.requestRegistration(), pending);
});

test('propagates registration-port failure without replacing downstream authority', () => {
  const downstreamFailure = new Error('downstream schema rejected candidate');
  const bridge = createHiddenHandDeckEditorBridge({
    getSelectedCardRef: () => 'opaque-ref',
    registrationPort: () => {
      throw downstreamFailure;
    },
  });

  assert.throws(() => bridge.requestRegistration(), (error) => error === downstreamFailure);
});

test('never receives or mutates the existing main/ex Deck Editor state', () => {
  const existingDeckDraft = {
    main: ['MAIN_A', 'MAIN_B'],
    ex: ['EX_A'],
    saved: true,
  };
  const before = structuredClone(existingDeckDraft);
  const bridge = createHiddenHandDeckEditorBridge({
    getSelectedCardRef: () => 'HIDDEN_CANDIDATE',
    registrationPort: (candidate) => ({ candidate }),
  });

  assert.deepEqual(bridge.requestRegistration(), { candidate: 'HIDDEN_CANDIDATE' });
  assert.deepEqual(existingDeckDraft, before);
});

test('requires explicit editor-selection and registration dependencies', () => {
  assert.throws(() => createHiddenHandDeckEditorBridge(), /getSelectedCardRef must be a function/);
  assert.throws(
    () => createHiddenHandDeckEditorBridge({ getSelectedCardRef: () => 'card' }),
    /registrationPort must be a function/,
  );
});

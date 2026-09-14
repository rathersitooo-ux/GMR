import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mountBattleJankenFocusRuntimeSurface,
} from '../browser/battle-janken-focus-runtime-surface.mjs';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.listeners = new Map();
    this.removed = false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  remove() {
    this.removed = true;
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

function createFakeDocument() {
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  return {
    body,
    head,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (selector === '[data-gr-janken-focus-surface-style]') {
        return head.children.find((child) => child.attributes.has('data-gr-janken-focus-surface-style')) ?? null;
      }
      return null;
    },
  };
}

function authoritativePackages(generation = 'pointer') {
  return [
    {
      jankenHand: 'ROCK',
      cardId: `rock-card-${generation}`,
      path: [`${generation}:r0`, `${generation}:r1`],
      direction: 'RIGHT',
      roadId: `road-rock-${generation}`,
      battleId: `battle-${generation}`,
      opponentId: `opponent-rock-${generation}`,
      shieldLane: 'LEFT',
      shieldRef: `shield-rock-${generation}`,
    },
    {
      jankenHand: 'SCISSORS',
      cardId: `scissors-card-${generation}`,
      path: [`${generation}:s0`, `${generation}:s1`],
      direction: 'CENTER',
      roadId: `road-scissors-${generation}`,
      battleId: `battle-${generation}`,
      opponentId: `opponent-scissors-${generation}`,
      shieldLane: 'CENTER',
      shieldRef: `shield-scissors-${generation}`,
    },
    {
      jankenHand: 'PAPER',
      cardId: `paper-card-${generation}`,
      path: [`${generation}:p0`, `${generation}:p1`],
      direction: 'LEFT',
      roadId: `road-paper-${generation}`,
      battleId: `battle-${generation}`,
      opponentId: `opponent-paper-${generation}`,
      shieldLane: 'RIGHT',
      shieldRef: `shield-paper-${generation}`,
    },
  ];
}

function createLiveStack() {
  const calls = { focus: [], cancel: 0, commit: 0 };
  let readyHand = null;
  let previewReady = false;
  return {
    calls,
    async focus(hand) {
      calls.focus.push(hand);
      readyHand = hand;
      previewReady = true;
      return {
        ok: true,
        staged: true,
        reason: 'LATEST_FOCUS_PREVIEW_READY',
        jankenHand: hand,
      };
    },
    async cancel() {
      calls.cancel += 1;
      readyHand = null;
      previewReady = false;
      return { ok: true, cleared: true, reason: 'PRECOMMIT_SELECTION_CLEARED' };
    },
    async commit() {
      calls.commit += 1;
      readyHand = null;
      previewReady = false;
      return { ok: true, committed: true, reason: 'COMMITTED' };
    },
    status() {
      return {
        readyHand,
        previewReady,
        commitPending: false,
      };
    },
  };
}

function mount() {
  const documentRef = createFakeDocument();
  const liveInputStack = createLiveStack();
  const runtime = mountBattleJankenFocusRuntimeSurface({
    documentRef,
    mountRoot: documentRef.body,
    liveInputStack,
    packages: authoritativePackages(),
    generationId: 'pointer',
  });
  return { documentRef, liveInputStack, runtime };
}

function pointerActionTarget(action) {
  const node = {
    dataset: { grJankenFocusAction: action },
    closest(selector) {
      return selector === '[data-gr-janken-focus-action]' ? node : null;
    },
  };
  return node;
}

function dispatch(runtime, type, event) {
  const listener = runtime.host.listeners.get(type);
  assert.equal(typeof listener, 'function', `listener ${type} must exist`);
  listener(event);
}

test('same-control primary pointer with short travel authorizes pointer-derived commit', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: 100,
  });
  dispatch(runtime, 'pointermove', {
    target: commitButton,
    pointerId: 1,
    clientX: 105,
    clientY: 104,
  });
  dispatch(runtime, 'pointerup', {
    target: commitButton,
    pointerId: 1,
    clientX: 106,
    clientY: 104,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 1);
});

test('travel beyond 12px disarms commit even if the pointer returns before release', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 2,
    isPrimary: true,
    button: 0,
    clientX: 0,
    clientY: 0,
  });
  dispatch(runtime, 'pointermove', {
    target: commitButton,
    pointerId: 2,
    clientX: 20,
    clientY: 0,
  });
  dispatch(runtime, 'pointerup', {
    target: commitButton,
    pointerId: 2,
    clientX: 0,
    clientY: 0,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 0);
});

test('pointercancel disarms pointer-derived commit', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 3,
    isPrimary: true,
    button: 0,
    clientX: 40,
    clientY: 40,
  });
  dispatch(runtime, 'pointercancel', {
    target: commitButton,
    pointerId: 3,
    clientX: 40,
    clientY: 40,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 0);
});

test('release on another control cannot authorize a later commit click', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');
  const cancelButton = pointerActionTarget('cancel');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 4,
    isPrimary: true,
    button: 0,
    clientX: 20,
    clientY: 20,
  });
  dispatch(runtime, 'pointerup', {
    target: cancelButton,
    pointerId: 4,
    clientX: 22,
    clientY: 20,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 0);
});

test('non-primary or non-left pointer cannot arm commit', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 5,
    isPrimary: false,
    button: 0,
    clientX: 30,
    clientY: 30,
  });
  dispatch(runtime, 'pointerup', {
    target: commitButton,
    pointerId: 5,
    clientX: 30,
    clientY: 30,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();
  assert.equal(liveInputStack.calls.commit, 0);

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 6,
    isPrimary: true,
    button: 2,
    clientX: 30,
    clientY: 30,
  });
  dispatch(runtime, 'pointerup', {
    target: commitButton,
    pointerId: 6,
    clientX: 30,
    clientY: 30,
  });
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();
  assert.equal(liveInputStack.calls.commit, 0);
});

test('keyboard-style detail zero click keeps the existing accessible commit path', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'click', { target: commitButton, detail: 0 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 1);
});

test('sync clears any prior pointer arm before a new LOAD_FOCUS', async () => {
  const { liveInputStack, runtime } = mount();
  await runtime.focus('ROCK');
  const commitButton = pointerActionTarget('commit');

  dispatch(runtime, 'pointerdown', {
    target: commitButton,
    pointerId: 7,
    isPrimary: true,
    button: 0,
    clientX: 50,
    clientY: 50,
  });
  dispatch(runtime, 'pointerup', {
    target: commitButton,
    pointerId: 7,
    clientX: 52,
    clientY: 50,
  });

  runtime.sync();
  await runtime.focus('ROCK');
  dispatch(runtime, 'click', { target: commitButton, detail: 1 });
  await Promise.resolve();

  assert.equal(liveInputStack.calls.commit, 0);
});

test('destroy removes pointer and click listeners', () => {
  const { runtime } = mount();
  assert.equal(runtime.destroy(), true);
  assert.equal(runtime.host.listeners.has('pointerdown'), false);
  assert.equal(runtime.host.listeners.has('pointermove'), false);
  assert.equal(runtime.host.listeners.has('pointerup'), false);
  assert.equal(runtime.host.listeners.has('pointercancel'), false);
  assert.equal(runtime.host.listeners.has('click'), false);
});

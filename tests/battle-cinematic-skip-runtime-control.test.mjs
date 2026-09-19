import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL,
  mountBattleCinematicSkipRuntime
} from '../browser/battle-cinematic-skip-runtime-control.mjs';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.listeners = new Map();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.textContent = '';
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }
}

function fixture() {
  const document = {
    createElement(tagName) {
      return new FakeNode(tagName);
    }
  };
  const phaseSurface = new FakeNode('section');
  phaseSurface.ownerDocument = document;

  let context = {
    eventId: 'attack-1',
    phase: 'attack',
    allowedInputs: ['skip', 'public_info', 'accessibility']
  };
  const authoritativeState = {
    winnerIds: ['P4'],
    processingOrder: ['P2', 'P1', 'P4', 'P3'],
    movedCards: [{ cardId: 'C-202', destination: 'HAND' }],
    boardResult: { shield: 'P3:R', columnDepth: 6 }
  };
  const before = JSON.stringify(authoritativeState);
  const commands = [];

  const runtime = mountBattleCinematicSkipRuntime({
    phaseSurface,
    getContext: () => context,
    getAuthoritativeState: () => authoritativeState,
    onPresentationCommand: command => commands.push(command)
  });

  return {
    phaseSurface,
    authoritativeState,
    before,
    commands,
    runtime,
    setContext(next) {
      context = next;
    }
  };
}

test('button skip emits one presentation command and preserves authoritative state by reference', () => {
  const f = fixture();

  assert.equal(f.runtime.button.textContent, 'スキップ');
  assert.equal(f.runtime.button.getAttribute('aria-label'), '戦闘演出をスキップ');
  assert.equal(f.runtime.button.hidden, false);
  assert.equal(f.runtime.button.disabled, false);
  assert.equal(f.phaseSurface.getAttribute('data-battle-cinematic-skip-runtime'), '1');

  const result = f.runtime.skipByButton();
  assert.equal(result.consumed, true);
  assert.equal(result.reason, 'SKIP_CONSUMED');
  assert.equal(result.presentationCommand, 'JUMP_TO_TIMELINE_END');
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.resultMutation, false);
  assert.strictEqual(result.authoritativeState, f.authoritativeState);
  assert.equal(result.authoritativeStatePreservedByReference, true);
  assert.equal(JSON.stringify(f.authoritativeState), f.before);

  assert.equal(f.commands.length, 1);
  assert.deepEqual(f.commands[0], {
    schema: 'gameroad.battle-cinematic-skip-runtime-control.v1',
    presentationCommand: 'JUMP_TO_TIMELINE_END',
    eventId: 'attack-1',
    phase: 'attack',
    source: 'button',
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false
  });
});

test('same accepted event cannot emit a second skip command even through another input', () => {
  const f = fixture();
  const first = f.runtime.skipByButton();
  assert.equal(first.consumed, true);

  const duplicate = f.runtime.skipByButton();
  assert.equal(duplicate.consumed, false);
  assert.equal(duplicate.reason, 'EVENT_ALREADY_SKIPPED');
  assert.strictEqual(duplicate.authoritativeState, f.authoritativeState);
  assert.equal(f.commands.length, 1);
  assert.equal(JSON.stringify(f.authoritativeState), f.before);
});

test('created button is a real runtime input for each new authoritative event', () => {
  const f = fixture();

  f.runtime.button.dispatch('click');
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].eventId, 'attack-1');

  f.setContext({
    eventId: 'attack-2',
    phase: 'ability',
    allowedInputs: ['skip', 'public_info']
  });
  const refreshed = f.runtime.refresh();
  assert.equal(refreshed.skipAllowed, true);
  assert.equal(refreshed.eventId, 'attack-2');

  f.runtime.button.dispatch('click');
  assert.equal(f.commands.length, 2);
  assert.equal(f.commands[1].eventId, 'attack-2');
  assert.equal(f.commands[1].phase, 'ability');
  assert.equal(JSON.stringify(f.authoritativeState), f.before);
});

test('horizontal pointer wipe skips while short and vertical gestures do not', () => {
  const f = fixture();
  let prevented = false;

  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 7,
    button: 0,
    isPrimary: true,
    clientX: 280,
    clientY: 180
  });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 7,
    clientX: 170,
    clientY: 196,
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].source, 'wipe');
  assert.equal(f.commands[0].eventId, 'attack-1');

  f.setContext({
    eventId: 'attack-short',
    phase: 'attack',
    allowedInputs: ['skip']
  });
  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 8,
    button: 0,
    isPrimary: true,
    clientX: 100,
    clientY: 100
  });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 8,
    clientX: 150,
    clientY: 102
  });
  assert.equal(f.commands.length, 1);

  f.setContext({
    eventId: 'attack-vertical',
    phase: 'attack',
    allowedInputs: ['skip']
  });
  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 9,
    button: 0,
    isPrimary: true,
    clientX: 100,
    clientY: 100
  });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 9,
    clientX: 180,
    clientY: 230
  });
  assert.equal(f.commands.length, 1);
  assert.equal(JSON.stringify(f.authoritativeState), f.before);
});

test('blocked or missing skip authority hides the button and fails closed', () => {
  const f = fixture();

  f.setContext({
    eventId: 'attack-blocked',
    phase: 'attack',
    allowedInputs: ['public_info']
  });
  let refreshed = f.runtime.refresh();
  assert.equal(refreshed.skipAllowed, false);
  assert.equal(f.runtime.button.hidden, true);
  assert.equal(f.runtime.button.disabled, true);

  const blocked = f.runtime.skipByButton();
  assert.equal(blocked.consumed, false);
  assert.equal(blocked.reason, 'SKIP_NOT_ALLOWED');
  assert.equal(f.commands.length, 0);

  f.setContext({
    eventId: '',
    phase: 'attack',
    allowedInputs: ['skip']
  });
  refreshed = f.runtime.refresh();
  assert.equal(refreshed.skipAllowed, false);
  const missing = f.runtime.skipByButton();
  assert.equal(missing.consumed, false);
  assert.equal(missing.reason, 'EVENT_ID_UNAVAILABLE');
  assert.equal(f.commands.length, 0);
  assert.equal(JSON.stringify(f.authoritativeState), f.before);
});

test('pointer cancel clears the pending gesture and non-primary input is ignored', () => {
  const f = fixture();

  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 11,
    button: 0,
    isPrimary: true,
    clientX: 250,
    clientY: 100
  });
  f.phaseSurface.dispatch('pointercancel', { pointerId: 11 });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 11,
    clientX: 100,
    clientY: 100
  });
  assert.equal(f.commands.length, 0);

  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 12,
    button: 0,
    isPrimary: false,
    clientX: 250,
    clientY: 100
  });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 12,
    clientX: 100,
    clientY: 100
  });
  assert.equal(f.commands.length, 0);
});

test('detach removes listeners, attributes, and the button created by the adapter', () => {
  const f = fixture();
  const button = f.runtime.button;

  assert.equal(f.phaseSurface.children.includes(button), true);
  assert.equal(f.runtime.detach(), true);
  assert.equal(f.runtime.detach(), false);
  assert.equal(f.phaseSurface.children.includes(button), false);
  assert.equal(f.phaseSurface.getAttribute('data-battle-cinematic-skip-runtime'), null);

  button.dispatch('click');
  f.phaseSurface.dispatch('pointerdown', {
    pointerId: 13,
    button: 0,
    isPrimary: true,
    clientX: 260,
    clientY: 120
  });
  f.phaseSurface.dispatch('pointerup', {
    pointerId: 13,
    clientX: 100,
    clientY: 120
  });
  assert.equal(f.commands.length, 0);
  assert.equal(f.runtime.refresh().mounted, false);
});

test('contract remains presentation-only and explicitly does not own live screen mounting', () => {
  assert.equal(
    BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.schema,
    'gameroad.battle-cinematic-skip-runtime-control.v1'
  );
  assert.equal(BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.presentationOnly, true);
  assert.equal(BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.gameplayAuthority, false);
  assert.equal(BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.gameStateWrite, false);
  assert.equal(BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.resultMutation, false);
  assert.deepEqual(
    BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.inputs,
    ['button', 'horizontal_wipe']
  );
  assert.equal(
    BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.authoritativeStatePolicy,
    'READ_AND_PASS_THROUGH_SAME_REFERENCE_NO_MUTATION'
  );
  assert.equal(
    BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.duplicateEventPolicy,
    'ONE_SKIP_COMMAND_PER_EVENT_ID'
  );
  assert.equal(BATTLE_CINEMATIC_SKIP_RUNTIME_CONTROL.liveScreenMountOwnedHere, false);
});

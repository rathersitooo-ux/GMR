import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBattleSelfDeckDisclosureController,
  resolveBattleSelfDeckProjection,
} from '../browser/battle-self-deck-inspect-runtime-mount.mjs';
import { createAuthoritativeRemainingDeckSnapshot } from '../browser/battle-self-deck-inspect-core.mjs';

function localPacket(overrides = {}) {
  return {
    viewer: { id: 'P1', authenticated: true },
    snapshotInput: {
      matchId: 'M-current',
      ownerPlayerId: 'P1',
      revision: 4,
      remainingCardIds: ['CARD_B', 'CARD_A', 'CARD_B', 'CARD_C'],
    },
    ...overrides,
  };
}

test('local live source is reduced through the existing core to canonical owner-only counts', () => {
  const out = resolveBattleSelfDeckProjection(localPacket());
  assert.equal(out.ok, true);
  assert.equal(out.total, 4);
  assert.equal(out.typeCount, 3);
  assert.deepEqual(out.cardCounts, [
    { cardId: 'CARD_A', count: 1 },
    { cardId: 'CARD_B', count: 2 },
    { cardId: 'CARD_C', count: 1 },
  ]);
  assert.equal('remainingCardIds' in out, false);
  assert.equal('deckOrder' in out, false);
});

test('friend-room authoritative snapshot can be consumed without reconstructing deck order', () => {
  const snapshot = createAuthoritativeRemainingDeckSnapshot({
    matchId: 'M-host',
    ownerPlayerId: 'P2',
    revision: 7,
    remainingCardIds: ['Z', 'A', 'Z', 'M'],
  });
  const out = resolveBattleSelfDeckProjection({
    authoritativeSnapshot: snapshot,
    viewer: { id: 'P2', authenticated: true },
  });
  assert.equal(out.ok, true);
  assert.equal(out.total, 4);
  assert.deepEqual(out.cardCounts, [
    { cardId: 'A', count: 1 },
    { cardId: 'M', count: 1 },
    { cardId: 'Z', count: 2 },
  ]);
  assert.deepEqual(Object.keys(snapshot).sort(), ['cardCounts', 'matchId', 'ownerPlayerId', 'revision', 'schema', 'total']);
});

test('non-owner and unauthenticated viewer fail closed instead of exposing card types', () => {
  const snapshot = createAuthoritativeRemainingDeckSnapshot({
    matchId: 'M-host',
    ownerPlayerId: 'P2',
    revision: 7,
    remainingCardIds: ['PRIVATE_A', 'PRIVATE_B'],
  });
  const wrongViewer = resolveBattleSelfDeckProjection({
    authoritativeSnapshot: snapshot,
    viewer: { id: 'P1', authenticated: true },
  });
  assert.equal(wrongViewer.ok, false);
  assert.equal(wrongViewer.reason, 'OWNER_DETAIL_NOT_AUTHORIZED');
  assert.equal(JSON.stringify(wrongViewer).includes('PRIVATE_A'), false);

  const anonymous = resolveBattleSelfDeckProjection({
    authoritativeSnapshot: snapshot,
    viewer: { id: 'P2', authenticated: false },
  });
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.reason, 'VIEWER_UNAUTHENTICATED');
});

test('malformed authoritative snapshot and live source input fail closed', () => {
  const malformed = resolveBattleSelfDeckProjection({
    authoritativeSnapshot: { schema: 'wrong' },
    viewer: { id: 'P1', authenticated: true },
  });
  assert.equal(malformed.ok, false);

  const live = resolveBattleSelfDeckProjection(localPacket({
    snapshotInput: { matchId: 'M-current', ownerPlayerId: 'P1', revision: -1, remainingCardIds: [] },
  }));
  assert.equal(live.ok, false);
  assert.match(live.reason, /REVISION_INVALID/);
});

class FakeEventRoot {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { const rows = this.listeners.get(type) || new Set(); rows.add(fn); this.listeners.set(type, rows); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) fn(event); }
}

class FakeElement extends FakeEventRoot {
  constructor(name) {
    super();
    this.name = name;
    this.hidden = true;
    this.attrs = new Map();
    this.children = new Set();
    this.focused = false;
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  contains(target) { return target === this || this.children.has(target); }
  focus() { this.focused = true; }
}

test('disclosure opens from the button, light-dismisses outside, and Escape restores focus', () => {
  const root = new FakeEventRoot();
  const button = new FakeElement('button');
  const panel = new FakeElement('panel');
  const inside = new FakeElement('inside');
  panel.children.add(inside);
  const outside = new FakeElement('outside');
  let refreshes = 0;
  const disclosure = createBattleSelfDeckDisclosureController({
    button,
    panel,
    eventRoot: root,
    refresh: () => { refreshes += 1; button.hidden = false; },
  });

  assert.equal(panel.hidden, true);
  button.emit('click');
  assert.equal(panel.hidden, false);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(refreshes, 1);

  root.emit('pointerdown', { target: inside });
  assert.equal(panel.hidden, false);
  root.emit('pointerdown', { target: outside });
  assert.equal(panel.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.emit('click');
  let prevented = false;
  root.emit('keydown', { key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(panel.hidden, true);
  assert.equal(button.focused, true);
  assert.equal(prevented, true);
  assert.equal(disclosure.destroy(), true);
  assert.equal(disclosure.destroy(), false);
});

test('disclosure does not open when refresh marks the source unavailable', () => {
  const root = new FakeEventRoot();
  const button = new FakeElement('button');
  const panel = new FakeElement('panel');
  const disclosure = createBattleSelfDeckDisclosureController({
    button,
    panel,
    eventRoot: root,
    refresh: () => { button.hidden = true; },
  });
  button.emit('click');
  assert.equal(disclosure.isOpen(), false);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

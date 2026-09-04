import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceHomeSlotRollSession,
  createHomeSlotRollSession,
  deriveHomeSlotRollDetentPx,
  normalizeHomeSlotRollChoices,
  projectHomeSlotRollSession,
  resolveHomeSlotRollRelease,
} from '../browser/home-slidepad-slot-roll-adapter.mjs';

const choices = Object.freeze([
  Object.freeze({ id: 'route:battle', kind: 'route', control: 'battle-control' }),
  Object.freeze({ id: 'route:cards', kind: 'route', control: 'cards-control' }),
  Object.freeze({ id: 'utility:profile', kind: 'utility', control: 'profile-control' }),
  Object.freeze({ id: 'utility:settings', kind: 'utility', control: 'settings-control' }),
]);

function session(anchorId = 'route:battle', clientX = 0, sourceChoices = choices) {
  return createHomeSlotRollSession({
    choices: sourceChoices,
    anchorId,
    detentPx: 50,
    clientX,
  });
}

test('normalizes and de-duplicates route and utility choices without replacing control authority', () => {
  const control = { click() {} };
  const normalized = normalizeHomeSlotRollChoices([
    { id: 'route:battle', kind: 'route', control },
    { id: 'route:battle', kind: 'duplicate', control: { click() {} } },
    { id: 'utility:profile', kind: 'utility', control: 'profile' },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'route:battle');
  assert.equal(normalized[0].control, control);
  assert.equal(normalized[1].id, 'utility:profile');
});

test('starts at the ray-selected anchor and projects circular neighbours', () => {
  const current = session('route:cards');
  assert.equal(current.state.itemId, 'route:cards');
  assert.equal(current.engaged, false);
  const window = projectHomeSlotRollSession(current, { radius: 1 });
  assert.deepEqual(window.map((entry) => entry.itemId), [
    'route:battle',
    'route:cards',
    'utility:profile',
  ]);
});

test('ray target can re-anchor before the first detent and resets horizontal carry', () => {
  let current = session('route:battle', 100);
  let advanced = advanceHomeSlotRollSession(current, { anchorId: 'route:battle', clientX: 125 });
  assert.equal(advanced.engaged, false);
  assert.equal(advanced.session.state.itemId, 'route:battle');
  current = advanced.session;

  advanced = advanceHomeSlotRollSession(current, { anchorId: 'route:cards', clientX: 130 });
  assert.equal(advanced.reanchored, true);
  assert.equal(advanced.session.state.itemId, 'route:cards');
  assert.equal(advanced.session.state.carryPx, 0);

  advanced = advanceHomeSlotRollSession(advanced.session, { anchorId: 'route:cards', clientX: 179 });
  assert.equal(advanced.engaged, false);
  assert.equal(advanced.session.state.itemId, 'route:cards');
});

test('right detents advance and wrap circularly', () => {
  let current = session('utility:settings', 0);
  const advanced = advanceHomeSlotRollSession(current, { anchorId: 'utility:settings', clientX: 50 });
  current = advanced.session;
  assert.equal(advanced.detents.length, 1);
  assert.equal(advanced.detents[0].direction, 1);
  assert.equal(advanced.detents[0].wrapped, true);
  assert.equal(current.state.itemId, 'route:battle');
  assert.equal(current.engaged, true);
});

test('left detents advance and wrap circularly', () => {
  const advanced = advanceHomeSlotRollSession(session('route:battle', 0), {
    anchorId: 'route:battle',
    clientX: -50,
  });
  assert.equal(advanced.detents.length, 1);
  assert.equal(advanced.detents[0].direction, -1);
  assert.equal(advanced.detents[0].wrapped, true);
  assert.equal(advanced.session.state.itemId, 'utility:settings');
});

test('same-stroke reverse walks back through the same sequence', () => {
  let advanced = advanceHomeSlotRollSession(session('route:battle', 0), {
    anchorId: 'route:battle',
    clientX: 100,
  });
  assert.equal(advanced.session.state.itemId, 'utility:profile');
  assert.equal(advanced.detents.length, 2);

  advanced = advanceHomeSlotRollSession(advanced.session, {
    anchorId: 'utility:profile',
    clientX: 50,
  });
  assert.equal(advanced.detents.length, 1);
  assert.equal(advanced.detents[0].direction, -1);
  assert.equal(advanced.session.state.itemId, 'route:cards');
});

test('sub-detent movement never engages the roll and therefore does not own release', () => {
  const advanced = advanceHomeSlotRollSession(session('route:battle', 0), {
    anchorId: 'route:battle',
    clientX: 49.9,
  });
  assert.equal(advanced.detents.length, 0);
  assert.equal(advanced.engaged, false);
  assert.equal(resolveHomeSlotRollRelease(advanced.session), null);
});

test('single-item branch emits no meaningless detents and never engages', () => {
  const one = [{ id: 'only', control: 'only-control' }];
  const advanced = advanceHomeSlotRollSession(session('only', 0, one), {
    anchorId: 'only',
    clientX: 500,
  });
  assert.equal(advanced.detents.length, 0);
  assert.equal(advanced.engaged, false);
  assert.equal(advanced.session.state.itemId, 'only');
  assert.equal(resolveHomeSlotRollRelease(advanced.session), null);
});

test('release returns the existing focused control and final detent direction only after engagement', () => {
  let advanced = advanceHomeSlotRollSession(session('route:battle', 0), {
    anchorId: 'route:battle',
    clientX: 50,
  });
  let commit = resolveHomeSlotRollRelease(advanced.session);
  assert.equal(commit.itemId, 'route:cards');
  assert.equal(commit.control, 'cards-control');
  assert.equal(commit.lastDirection, 1);

  advanced = advanceHomeSlotRollSession(advanced.session, {
    anchorId: 'route:cards',
    clientX: 0,
  });
  commit = resolveHomeSlotRollRelease(advanced.session);
  assert.equal(commit.itemId, 'route:battle');
  assert.equal(commit.control, 'battle-control');
  assert.equal(commit.lastDirection, -1);
});

test('detent distance is derived from actual anchor span and existing touch minimum', () => {
  assert.equal(deriveHomeSlotRollDetentPx({ anchorSpanPx: 72, touchTargetMinPx: 44 }), 72);
  assert.equal(deriveHomeSlotRollDetentPx({ anchorSpanPx: 36, touchTargetMinPx: 44 }), 44);
  assert.throws(() => deriveHomeSlotRollDetentPx({ anchorSpanPx: 0, touchTargetMinPx: 44 }), /greater than 0/);
  assert.throws(() => deriveHomeSlotRollDetentPx({ anchorSpanPx: 60, touchTargetMinPx: NaN }), /finite/);
});

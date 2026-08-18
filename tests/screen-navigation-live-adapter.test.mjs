import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_NAVIGATION_BRIDGE_KEY,
  createScreenNavigationBridge,
  installScreenNavigationBridge
} from '../browser/screen-navigation-live-adapter.mjs';
import { resolveScreenNavigation } from '../browser/screen-navigation-core.mjs';

test('bridge exposes the exact navigation resolver', () => {
  const bridge = createScreenNavigationBridge();
  assert.equal(bridge.resolve, resolveScreenNavigation);
  assert.equal(Object.isFrozen(bridge), true);
});

test('install publishes one immutable compatible bridge', () => {
  const target = {};
  const first = installScreenNavigationBridge(target);
  const second = installScreenNavigationBridge(target);
  assert.equal(first, second);
  assert.equal(target[SCREEN_NAVIGATION_BRIDGE_KEY].resolve, resolveScreenNavigation);
  const descriptor = Object.getOwnPropertyDescriptor(target, SCREEN_NAVIGATION_BRIDGE_KEY);
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.enumerable, false);
});

test('install fails closed on an incompatible pre-existing bridge', () => {
  const target = { [SCREEN_NAVIGATION_BRIDGE_KEY]: { resolve() {} } };
  assert.throws(
    () => installScreenNavigationBridge(target),
    /already occupied by an incompatible bridge/
  );
});

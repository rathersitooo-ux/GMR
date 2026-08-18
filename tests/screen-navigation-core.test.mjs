import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_NAVIGATION_FALLBACK_PARENT,
  SCREEN_NAVIGATION_REASON,
  createScreenNavigationRuntimeBridge,
  resolveScreenBackTarget,
  resolveScreenNavigation
} from '../browser/screen-navigation-core.mjs';

test('falsy requested targets preserve the current screen as a no-op', () => {
  for (const target of [undefined, null, '', 0, false, Number.NaN]) {
    assert.deepEqual(resolveScreenNavigation('home', target), {
      ok: false,
      from: 'home',
      to: 'home',
      reason: SCREEN_NAVIGATION_REASON.EMPTY_TARGET
    });
  }
});

test('strictly identical current and requested screens are a no-op', () => {
  assert.deepEqual(resolveScreenNavigation('battle', 'battle'), {
    ok: false,
    from: 'battle',
    to: 'battle',
    reason: SCREEN_NAVIGATION_REASON.CURRENT_SCREEN
  });
});

test('a different truthy target produces a navigation decision without mutation', () => {
  const current = 'home';
  const target = 'deck';
  assert.deepEqual(resolveScreenNavigation(current, target), {
    ok: true,
    from: current,
    to: target,
    reason: SCREEN_NAVIGATION_REASON.NAVIGATE
  });
});

test('unknown truthy targets are not rejected or normalized', () => {
  for (const target of ['future-screen', '   ', '1']) {
    const decision = resolveScreenNavigation('home', target);
    assert.equal(decision.ok, true);
    assert.equal(decision.to, target);
    assert.equal(decision.reason, SCREEN_NAVIGATION_REASON.NAVIGATE);
  }
});

test('target comparison uses strict equality and does not coerce values', () => {
  assert.deepEqual(resolveScreenNavigation('1', 1), {
    ok: true,
    from: '1',
    to: 1,
    reason: SCREEN_NAVIGATION_REASON.NAVIGATE
  });
});

test('back target prefers the popped history entry over fallback parents', () => {
  assert.equal(resolveScreenBackTarget('gacha', { screen: 'battle' }), 'battle');
  assert.equal(resolveScreenBackTarget('cards', { screen: 'shop' }), 'shop');
});

test('gacha falls back to shop when no usable history entry exists', () => {
  for (const entry of [undefined, null, {}, { screen: '' }, { screen: false }, { screen: 0 }]) {
    assert.equal(resolveScreenBackTarget('gacha', entry), 'shop');
  }
});

test('known detail screens fall back to home exactly as the legacy host map does', () => {
  for (const screen of ['cards', 'characters', 'setup', 'missions', 'profile', 'shop', 'records', 'settings']) {
    assert.equal(SCREEN_NAVIGATION_FALLBACK_PARENT[screen], 'home');
    assert.equal(resolveScreenBackTarget(screen, undefined), 'home');
  }
});

test('unknown or root screens fall back to home', () => {
  for (const screen of ['home', 'battle', 'result', 'future-screen', undefined, null]) {
    assert.equal(resolveScreenBackTarget(screen, undefined), 'home');
  }
});

test('runtime bridge is frozen and delegates forward navigation without semantic drift', () => {
  const bridge = createScreenNavigationRuntimeBridge();
  assert.equal(Object.isFrozen(bridge), true);
  assert.deepEqual(bridge.resolve('home', ''), resolveScreenNavigation('home', ''));
  assert.deepEqual(bridge.resolve('home', 'future-screen'), resolveScreenNavigation('home', 'future-screen'));
});

test('runtime bridge delegates back-target resolution without mutating history input', () => {
  const bridge = createScreenNavigationRuntimeBridge();
  const historyEntry = { screen: 'battle', marker: 7 };
  const before = structuredClone(historyEntry);
  assert.equal(bridge.resolveBackTarget('gacha', historyEntry), resolveScreenBackTarget('gacha', historyEntry));
  assert.deepEqual(historyEntry, before);
  assert.equal(bridge.resolveBackTarget('gacha', undefined), 'shop');
});

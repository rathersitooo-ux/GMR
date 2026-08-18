import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_NAVIGATION_REASON,
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

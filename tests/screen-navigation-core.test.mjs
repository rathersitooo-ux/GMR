import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_NAVIGATION_COMMON_BUTTON_SFX,
  SCREEN_NAVIGATION_FALLBACK_PARENT,
  SCREEN_NAVIGATION_REASON,
  createScreenNavigationRuntimeBridge,
  resolveScreenBackTarget,
  resolveScreenNavigation
} from '../browser/screen-navigation-core.mjs';

function setUserActivation(isActive) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { userActivation: { isActive } },
    configurable: true
  });
  return () => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
  };
}

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

test('accepted forward navigation with active user gesture attempts the exact formal common-button sound once', async () => {
  const originalAudio = globalThis.Audio;
  const restoreNavigator = setUserActivation(true);
  const created = [];
  globalThis.Audio = class FakeAudio {
    constructor(src) {
      this.src = src;
      this.playCalls = 0;
      created.push(this);
    }
    play() {
      this.playCalls += 1;
      return Promise.resolve();
    }
  };

  try {
    const decision = resolveScreenNavigation('home', 'setup');
    assert.equal(decision.ok, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].playCalls, 1);
    assert.match(created[0].src, /\/assets\/audio\/sfx\/click_002\.ogg$/);
    assert.deepEqual(SCREEN_NAVIGATION_COMMON_BUTTON_SFX, {
      filename: 'click_002.ogg',
      formalRole: 'shared-button',
      playbackAuthority: 'HUMAN_ACCEPTED_FORMAL_ASSET'
    });
  } finally {
    restoreNavigator();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('accepted programmatic navigation without active user gesture stays silent', () => {
  const originalAudio = globalThis.Audio;
  const restoreNavigator = setUserActivation(false);
  let constructed = 0;
  globalThis.Audio = class FakeAudio {
    constructor() { constructed += 1; }
    play() { return Promise.resolve(); }
  };

  try {
    assert.deepEqual(resolveScreenNavigation('home', 'setup'), {
      ok: true,
      from: 'home',
      to: 'setup',
      reason: SCREEN_NAVIGATION_REASON.NAVIGATE
    });
    assert.equal(constructed, 0);
  } finally {
    restoreNavigator();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('accepted navigation stays silent when user-activation API is unavailable', () => {
  const originalAudio = globalThis.Audio;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  delete globalThis.navigator;
  let constructed = 0;
  globalThis.Audio = class FakeAudio {
    constructor() { constructed += 1; }
    play() { return Promise.resolve(); }
  };

  try {
    assert.equal(resolveScreenNavigation('home', 'shop').ok, true);
    assert.equal(constructed, 0);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('rejected navigation decisions never attempt common-button playback', () => {
  const originalAudio = globalThis.Audio;
  const restoreNavigator = setUserActivation(true);
  let constructed = 0;
  globalThis.Audio = class FakeAudio {
    constructor() { constructed += 1; }
    play() { return Promise.resolve(); }
  };

  try {
    assert.equal(resolveScreenNavigation('home', '').ok, false);
    assert.equal(resolveScreenNavigation('home', 'home').ok, false);
    assert.equal(constructed, 0);
  } finally {
    restoreNavigator();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('audio constructor failure is fail-soft and cannot block accepted navigation', () => {
  const originalAudio = globalThis.Audio;
  const restoreNavigator = setUserActivation(true);
  globalThis.Audio = class BrokenAudio {
    constructor() { throw new Error('AUDIO_UNAVAILABLE'); }
  };

  try {
    assert.deepEqual(resolveScreenNavigation('home', 'cards'), {
      ok: true,
      from: 'home',
      to: 'cards',
      reason: SCREEN_NAVIGATION_REASON.NAVIGATE
    });
  } finally {
    restoreNavigator();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
});

test('audio play rejection is absorbed without changing the navigation result', async () => {
  const originalAudio = globalThis.Audio;
  const restoreNavigator = setUserActivation(true);
  globalThis.Audio = class RejectingAudio {
    play() { return Promise.reject(new Error('AUTOPLAY_BLOCKED')); }
  };

  try {
    const decision = resolveScreenNavigation('home', 'shop');
    assert.equal(decision.ok, true);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    restoreNavigator();
    if (originalAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = originalAudio;
  }
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

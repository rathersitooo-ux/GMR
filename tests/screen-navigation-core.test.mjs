import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_TRANSITION_MOTION_PROFILE,
  SCREEN_NAVIGATION_COMMON_BUTTON_SFX,
  SCREEN_NAVIGATION_FALLBACK_PARENT,
  SCREEN_NAVIGATION_REASON,
  SCREEN_MOTION_PRESENTATION_SPEC,
  createScreenNavigationRuntimeBridge,
  createScreenMotionPresentationDriver,
  createScreenTransitionRuntimeAdapter,
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

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return {promise, resolve};
};
const turn = () => new Promise((resolve) => setImmediate(resolve));

function fakeMotionDocument() {
  const makeControl = () => ({animations: [], animate(frames, options) {
    const animation = {finished: Promise.resolve(), cancel() {}};
    this.animations.push({frames, options, animation});
    return animation;
  }});
  const makeSurface = (screen) => {
    const controls = [];
    return {
      dataset: {screen},
      animations: [],
      controls,
      contains(node) { return controls.includes(node); },
      animate(frames, options) {
        const animation = {finished: Promise.resolve(), cancel() {}};
        this.animations.push({frames, options, animation});
        return animation;
      }
    };
  };
  const home = makeSurface('home');
  const cards = makeSurface('cards');
  const shop = makeSurface('shop');
  const homeControl = makeControl();
  const cardsControl = makeControl();
  const shopControl = makeControl();
  home.controls.push(homeControl);
  cards.controls.push(cardsControl);
  shop.controls.push(shopControl);
  return {
    documentElement: {clientWidth: 1280, clientHeight: 720},
    activeElement: homeControl,
    querySelectorAll(selector) {
      assert.equal(selector, '.screen[data-screen]');
      return [home, cards, shop];
    },
    surfaces: {home, cards, shop},
    controls: {home: homeControl, cards: cardsControl, shop: shopControl}
  };
}

test('screen transition runtime delegates PREPARE/EXIT/SWAP/ENTER/SETTLE and swaps exactly once', async () => {
  let screen = 'home';
  let swaps = 0;
  const phases = [];
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps += 1; screen = next; },
    runVisualPhase: async (phase, context) => phases.push([phase, context.from, context.to, context.motionProfile])
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(result.swapped, true);
  assert.equal(swaps, 1);
  assert.equal(screen, 'cards');
  assert.deepEqual(phases.map(([phase]) => phase), ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.ok(phases.every(([, from, to, profile]) => from === 'home' && to === 'cards' && profile === MENU_TRANSITION_MOTION_PROFILE.NORMAL));
});

test('presentation driver animates the actual outgoing and incoming screen surfaces without owning semantic state', async () => {
  const documentSource = fakeMotionDocument();
  let screen = 'home';
  const driver = createScreenMotionPresentationDriver({document: documentSource});
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => {
      screen = next;
      documentSource.activeElement = documentSource.controls[next];
    },
    presentationDriver: driver
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'cards');
  assert.equal(documentSource.controls.home.animations.length, 1);
  assert.equal(documentSource.surfaces.home.animations.length, 1);
  assert.equal(documentSource.surfaces.cards.animations.length, 1);
  assert.equal(documentSource.controls.cards.animations.length, 1);
  assert.equal(documentSource.surfaces.home.animations[0].options.duration, SCREEN_MOTION_PRESENTATION_SPEC.normal.exitMs);
  assert.match(documentSource.surfaces.home.animations[0].frames[1].transform, /translate3d\(0,-18px,0\)/);
  assert.equal(documentSource.surfaces.cards.animations[0].options.duration, SCREEN_MOTION_PRESENTATION_SPEC.normal.enterMs);
  assert.deepEqual(runtime.getPresentationState().activeRevisions, []);
  assert.equal(documentSource.surfaces.home.dataset.screenMotionRevision, undefined);
  assert.equal(documentSource.surfaces.cards.dataset.screenMotionRevision, undefined);
  assert.ok(runtime.getPresentationState().events.some((event) => event.kind === 'surface_swap_observed' && event.status === 'completed'));
});

test('reduced-motion makes screen presentation effect-free while low-perf uses opacity-only timing', async () => {
  const reducedDocument = fakeMotionDocument();
  let reducedScreen = 'home';
  const reducedRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => reducedScreen,
    applyScreen: (next) => { reducedScreen = next; },
    reducedMotion: true,
    presentationDriver: createScreenMotionPresentationDriver({document: reducedDocument})
  });
  assert.equal((await reducedRuntime.navigate('cards')).status, 'completed');
  assert.equal(reducedDocument.surfaces.home.animations.length, 0);
  assert.equal(reducedDocument.surfaces.cards.animations.length, 0);

  const lowDocument = fakeMotionDocument();
  let lowScreen = 'home';
  const lowRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => lowScreen,
    applyScreen: (next) => { lowScreen = next; },
    lowPerf: true,
    presentationDriver: createScreenMotionPresentationDriver({document: lowDocument})
  });
  assert.equal((await lowRuntime.navigate('cards')).status, 'completed');
  const exit = lowDocument.surfaces.home.animations[0];
  const enter = lowDocument.surfaces.cards.animations[0];
  assert.equal(exit.options.duration, SCREEN_MOTION_PRESENTATION_SPEC.reduced.exitMs);
  assert.equal(enter.options.duration, SCREEN_MOTION_PRESENTATION_SPEC.reduced.enterMs);
  assert.ok(exit.frames.every((frame) => !('transform' in frame)));
  assert.ok(enter.frames.every((frame) => !('transform' in frame)));
});

test('latest presentation revision survives stale cleanup and its detector rejects unconditional legacy cleanup', async () => {
  const documentSource = fakeMotionDocument();
  const gates = new Map();
  documentSource.surfaces.home.animate = function animate(frames, options) {
    const revision = this.dataset.screenMotionRevision;
    const gate = deferred();
    const animation = {finished: gate.promise, cancel: gate.resolve};
    gates.set(revision, gate);
    this.animations.push({frames, options, animation});
    return animation;
  };
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: createScreenMotionPresentationDriver({document: documentSource})
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(documentSource.surfaces.home.dataset.screenMotionRevision, '1');
  const second = runtime.navigate('shop');
  await turn();
  assert.equal(documentSource.surfaces.home.dataset.screenMotionRevision, '2');

  const brokenLegacyMarker = {screenMotionRevision: '2'};
  const unconditionalLegacyCleanup = (dataset) => { delete dataset.screenMotionRevision; };
  unconditionalLegacyCleanup(brokenLegacyMarker);
  assert.equal(brokenLegacyMarker.screenMotionRevision, undefined, 'negative control must expose stale cleanup damage');

  gates.get('2').resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 'superseded');
  assert.equal(secondResult.status, 'completed');
  assert.equal(screen, 'shop');
  assert.equal(documentSource.surfaces.home.dataset.screenMotionRevision, undefined);
  assert.deepEqual(runtime.getPresentationState().activeRevisions, []);
});

test('screen transition runtime ignores same-screen requests without visual phases or mutation', async () => {
  let phases = 0;
  let swaps = 0;
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => 'home',
    applyScreen: () => { swaps += 1; },
    runVisualPhase: async () => { phases += 1; }
  });

  const result = await runtime.navigate('home');
  assert.equal(result.status, 'ignored');
  assert.equal(result.swapped, false);
  assert.equal(phases, 0);
  assert.equal(swaps, 0);
});

test('same-screen intent cancels an active pre-swap transition so stale work cannot move away later', async () => {
  let screen = 'home';
  const swaps = [];
  const gate = deferred();
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps.push(next); screen = next; },
    runVisualPhase: async (phase, context) => {
      if (context.to === 'cards' && phase === 'EXIT') await gate.promise;
    }
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(runtime.getState().phase, 'EXIT');
  assert.equal(runtime.getState().activeRevision !== null, true);

  const stayResult = await runtime.navigate('home');
  assert.equal(stayResult.status, 'ignored');
  assert.equal(stayResult.reason, SCREEN_NAVIGATION_REASON.CURRENT_SCREEN);
  assert.equal(stayResult.swapped, false);
  assert.equal(screen, 'home');
  assert.deepEqual(swaps, []);
  assert.equal(runtime.getState().phase, 'IDLE');
  assert.equal(runtime.getState().activeRevision, null);

  gate.resolve();
  const firstResult = await first;
  assert.equal(firstResult.status, 'superseded');
  assert.equal(firstResult.swapped, false);
  assert.equal(screen, 'home');
  assert.deepEqual(swaps, []);
});

test('rapid A to B supersedes stale pre-swap transition and stale work cannot roll back current screen', async () => {
  let screen = 'home';
  const swaps = [];
  const gate = deferred();
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps.push(next); screen = next; },
    runVisualPhase: async (phase, context) => {
      if (context.to === 'cards' && phase === 'EXIT') await gate.promise;
    }
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(runtime.getState().phase, 'EXIT');
  const secondResult = await runtime.navigate('shop');
  assert.equal(secondResult.status, 'completed');
  assert.equal(screen, 'shop');
  assert.deepEqual(swaps, ['shop']);

  gate.resolve();
  const firstResult = await first;
  assert.equal(firstResult.status, 'superseded');
  assert.equal(firstResult.swapped, false);
  assert.equal(screen, 'shop');
  assert.deepEqual(swaps, ['shop']);
});

test('reduced-motion and low-perf change effect profile without changing semantic phase lifecycle', async () => {
  let screen = 'home';
  let reduce = true;
  let low = true;
  const phases = [];
  const profiles = [];
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    reducedMotion: () => reduce,
    lowPerf: () => low,
    runVisualPhase: async (phase, context) => { phases.push(phase); profiles.push(context.motionProfile); }
  });

  assert.equal((await runtime.navigate('cards')).status, 'completed');
  assert.deepEqual(phases, ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.ok(profiles.every((profile) => profile === MENU_TRANSITION_MOTION_PROFILE.NONE));

  phases.length = 0;
  profiles.length = 0;
  reduce = false;
  assert.equal((await runtime.navigate('home')).status, 'completed');
  assert.deepEqual(phases, ['PREPARE', 'EXIT', 'SWAP', 'ENTER', 'SETTLE']);
  assert.ok(profiles.every((profile) => profile === MENU_TRANSITION_MOTION_PROFILE.REDUCED));
});

test('screen transition back path uses the existing navigation fallback and commits once', async () => {
  let screen = 'missions';
  let swaps = 0;
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { swaps += 1; screen = next; }
  });

  const result = await runtime.back(null);
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'home');
  assert.equal(swaps, 1);
});

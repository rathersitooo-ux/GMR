import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_TRANSITION_MOTION_PROFILE,
  TEMPORARY_ACTION_SFX_CATALOG,
  TEMPORARY_ACTION_SFX_ASSIGNMENTS,
  createTemporarySfxPlayer,
  installTemporaryActionSfxRuntime,
  resolveTemporaryActionSfxCue,
  resolveTemporaryEmptyTapCue,
  SCREEN_NAVIGATION_COMMON_BUTTON_SFX,
  SCREEN_NAVIGATION_FALLBACK_PARENT,
  SCREEN_NAVIGATION_REASON,
  SCREEN_MOTION_PRESENTATION_SPEC,
  SCREEN_TRANSITION_EDGE_SHIMMER_ASSET,
  SCREEN_TRANSITION_EDGE_SHIMMER_CSS,
  SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES,
  ensureScreenTransitionEdgeShimmer,
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

test('screen transition edge shimmer is an effect-only four-frame asset with explicit accessibility fallbacks', () => {
  assert.deepEqual(SCREEN_TRANSITION_EDGE_SHIMMER_ASSET, {
    id: 'screen-transition-edge-shimmer-sprite-v1',
    sourcePath: 'assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png',
    runtimePath: '../assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png',
    formal: true,
    readOnly: true,
    frameCount: 4,
    frameLayout: 'horizontal-4-up',
  });
  assert.match(SCREEN_TRANSITION_EDGE_SHIMMER_CSS, /background-size:400% 100%/);
  assert.match(SCREEN_TRANSITION_EDGE_SHIMMER_CSS, /pointer-events:none/);
  assert.match(SCREEN_TRANSITION_EDGE_SHIMMER_CSS, /prefers-reduced-motion/);
  assert.match(SCREEN_TRANSITION_EDGE_SHIMMER_CSS, /r10LowPerf/);
  assert.equal(SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES.exit[1].backgroundPosition, '66.667% 50%');
  assert.equal(SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES.enter[1].backgroundPosition, '33.333% 50%');
});

test('screen transition shimmer helper creates only a non-semantic overlay on a supplied real surface', () => {
  const nodes = [];
  const head = {append(node) { nodes.push(node); }};
  const documentSource = {
    head,
    createElement(tagName) {
      return {tagName, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }};
    },
    getElementById() { return null; },
  };
  const surface = {
    children: [],
    append(node) { this.children.push(node); },
    querySelector() { return null; },
  };
  const overlay = ensureScreenTransitionEdgeShimmer(documentSource, surface);
  assert.equal(nodes.length, 1);
  assert.equal(surface.children.length, 1);
  assert.equal(overlay.className, 'gameroadScreenTransitionEdgeShimmer');
  assert.equal(overlay.dataset.screenTransitionEdgeShimmer, 'true');
  assert.equal(overlay.attributes['aria-hidden'], 'true');
  assert.equal(overlay.attributes['data-presentation-only'], 'true');
});

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

test('outgoing EXIT overlaps the incoming ENTER window and SETTLE waits for both', async () => {
  const documentSource = fakeMotionDocument();
  const exitGate = deferred();
  let exitCancelled = false;
  documentSource.surfaces.home.animate = function animate(frames, options) {
    const animation = {
      finished: exitGate.promise,
      cancel() { exitCancelled = true; exitGate.resolve(); }
    };
    this.animations.push({frames, options, animation});
    return animation;
  };

  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; documentSource.activeElement = documentSource.controls[next]; },
    presentationDriver: createScreenMotionPresentationDriver({document: documentSource})
  });

  let settled = false;
  const navigation = runtime.navigate('cards').then((result) => { settled = true; return result; });
  await turn();

  assert.equal(screen, 'cards', 'SWAP must not wait for outgoing EXIT to finish');
  assert.equal(documentSource.surfaces.home.animations.length, 1);
  assert.equal(documentSource.surfaces.cards.animations.length, 1, 'incoming ENTER must start while outgoing EXIT is unresolved');
  assert.equal(settled, false, 'SETTLE must wait for the pending outgoing EXIT');

  exitGate.resolve();
  const result = await navigation;
  assert.equal(result.status, 'completed');
  assert.equal(settled, true);
  assert.equal(exitCancelled, true);
  assert.deepEqual(runtime.getPresentationState().activeRevisions, []);
});

test('press feedback never delays the screen swap or the next actionable surface', async () => {
  const documentSource = fakeMotionDocument();
  const pressGate = deferred();
  let pressCancelled = false;
  documentSource.controls.home.animate = function animate(frames, options) {
    const animation = {
      finished: pressGate.promise,
      cancel() { pressCancelled = true; pressGate.resolve(); }
    };
    this.animations.push({frames, options, animation});
    return animation;
  };
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: createScreenMotionPresentationDriver({document: documentSource})
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'cards');
  assert.equal(pressCancelled, true);
  assert.deepEqual(runtime.getPresentationState().activeRevisions, []);
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
  const gateExit = (surface) => {
    surface.animate = function animate(frames, options) {
      if (this.dataset.screenMotionPhase !== 'exit') {
        const animation = {finished: Promise.resolve(), cancel() {}};
        this.animations.push({frames, options, animation});
        return animation;
      }
      const revision = this.dataset.screenMotionRevision;
      const gate = deferred();
      const animation = {finished: gate.promise, cancel: gate.resolve};
      gates.set(revision, gate);
      this.animations.push({frames, options, animation});
      return animation;
    };
  };
  gateExit(documentSource.surfaces.home);
  gateExit(documentSource.surfaces.cards);

  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: createScreenMotionPresentationDriver({document: documentSource})
  });

  const first = runtime.navigate('cards');
  await turn();
  assert.equal(screen, 'cards', 'the overlapped first transition has already committed its semantic SWAP');
  assert.equal(documentSource.surfaces.home.dataset.screenMotionRevision, '1');
  const second = runtime.navigate('shop');
  await turn();
  assert.equal(screen, 'shop', 'the latest transition commits its SWAP without waiting for the prior exit');
  assert.equal(documentSource.surfaces.cards.dataset.screenMotionRevision, '2');

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
  assert.equal(documentSource.surfaces.cards.dataset.screenMotionRevision, undefined);
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

const {resolveHomeRouteMotionVector: resolveHomeRouteMotionVectorForTakeover} = await import('../browser/screen-navigation-core.mjs');

function homeTakeoverApprox(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ~= ${expected}`);
}

function homeTakeoverNode(rect = null) {
  return {
    animations: [],
    getBoundingClientRect: rect ? () => ({...rect}) : undefined,
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
}

function homeTakeoverTranslate(transform) {
  const match = /translate3d\(([-+\d.eE]+)px,([-+\d.eE]+)px,0\)/.exec(String(transform || ''));
  assert.ok(match, `expected translate3d in ${transform}`);
  return {x: Number(match[1]), y: Number(match[2])};
}

function fakeHomeTakeoverDocument({withGeometry = true} = {}) {
  const pivot = homeTakeoverNode({left: 90, top: 90, width: 20, height: 20});
  const cardsRoute = homeTakeoverNode({left: 30, top: 170, width: 20, height: 20});
  cardsRoute.dataset = {homeTarget: 'cards'};
  const homeVisual = homeTakeoverNode();
  const homeControl = homeTakeoverNode();
  const cardsControl = homeTakeoverNode();
  const home = {
    dataset: {screen: 'home'}, animations: [],
    contains(node) { return node === homeControl; },
    querySelector(selector) {
      if (selector === '.codexHomeVisualLayer') return homeVisual;
      if (withGeometry && selector === '#homePadCenter') return pivot;
      return null;
    },
    querySelectorAll(selector) {
      if (withGeometry && selector === '.homePadChoice[data-home-target]') return [cardsRoute];
      return [];
    },
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
  const cards = {
    dataset: {screen: 'cards'}, animations: [],
    contains(node) { return node === cardsControl; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
  const documentSource = {
    documentElement: {clientWidth: 1280, clientHeight: 720},
    activeElement: homeControl,
    querySelectorAll(selector) {
      assert.equal(selector, '.screen[data-screen]');
      return [home, cards];
    }
  };
  return {documentSource, home, cards, homeVisual, pivot, cardsRoute, homeControl, cardsControl};
}

test('Home route vector comes from the actual SlidePad pivot-to-lobe geometry', () => {
  const pivot = homeTakeoverNode({left: 90, top: 90, width: 20, height: 20});
  const battle = homeTakeoverNode({left: 170, top: 30, width: 20, height: 20});
  battle.dataset = {homeTarget: 'setup'};
  const surface = {
    querySelector(selector) { return selector === '#homePadCenter' ? pivot : null; },
    querySelectorAll(selector) { return selector === '.homePadChoice[data-home-target]' ? [battle] : []; }
  };
  const vector = resolveHomeRouteMotionVectorForTakeover(surface, 'setup');
  assert.ok(vector);
  assert.equal(Object.isFrozen(vector), true);
  assert.equal(vector.target, 'setup');
  homeTakeoverApprox(vector.x, .8);
  homeTakeoverApprox(vector.y, -.6);
});

test('Home route takeover keeps SlidePad fixed while scene exits toward lobe and destination enters behind', async () => {
  const fixture = fakeHomeTakeoverDocument();
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; fixture.documentSource.activeElement = fixture.cardsControl; },
    presentationDriver: createScreenMotionPresentationDriver({document: fixture.documentSource})
  });
  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'cards');
  assert.equal(fixture.home.animations.length, 0);
  assert.equal(fixture.pivot.animations.length, 0);
  assert.equal(fixture.homeVisual.animations.length, 1);
  assert.equal(fixture.cards.animations.length, 1);
  const exitVector = homeTakeoverTranslate(fixture.homeVisual.animations[0].frames[1].transform);
  const enterVector = homeTakeoverTranslate(fixture.cards.animations[0].frames[0].transform);
  homeTakeoverApprox(exitVector.x, -10.8);
  homeTakeoverApprox(exitVector.y, 14.4);
  homeTakeoverApprox(enterVector.x, 10.8);
  homeTakeoverApprox(enterVector.y, -14.4);
});

test('Home route takeover falls back to existing family motion when geometry is unavailable', async () => {
  const fixture = fakeHomeTakeoverDocument({withGeometry: false});
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: createScreenMotionPresentationDriver({document: fixture.documentSource})
  });
  assert.equal((await runtime.navigate('cards')).status, 'completed');
  assert.equal(fixture.home.animations.length, 0);
  assert.equal(fixture.homeVisual.animations.length, 1);
  assert.match(fixture.homeVisual.animations[0].frames[1].transform, /translate3d\(0,-18px,0\)/);
});

test('Home route takeover preserves low-perf and reduced-motion spatial suppression', async () => {
  const low = fakeHomeTakeoverDocument();
  let lowScreen = 'home';
  const lowRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => lowScreen,
    applyScreen: (next) => { lowScreen = next; },
    lowPerf: true,
    presentationDriver: createScreenMotionPresentationDriver({document: low.documentSource})
  });
  assert.equal((await lowRuntime.navigate('cards')).status, 'completed');
  assert.equal(low.homeVisual.animations.length, 1);
  assert.equal(low.cards.animations.length, 1);
  assert.ok(low.homeVisual.animations[0].frames.every((frame) => !('transform' in frame)));
  assert.ok(low.cards.animations[0].frames.every((frame) => !('transform' in frame)));

  const reduced = fakeHomeTakeoverDocument();
  let reducedScreen = 'home';
  const reducedRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => reducedScreen,
    applyScreen: (next) => { reducedScreen = next; },
    reducedMotion: true,
    presentationDriver: createScreenMotionPresentationDriver({document: reduced.documentSource})
  });
  assert.equal((await reducedRuntime.navigate('cards')).status, 'completed');
  assert.equal(reduced.homeVisual.animations.length, 0);
  assert.equal(reduced.cards.animations.length, 0);
});


test('successful Gacha navigation adds one truthful preview-only notice and never stacks it', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const byId = new Map();
  const controls = {
    children: [],
    insertBefore(node, before) {
      const index = this.children.indexOf(before);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
      byId.set(node.id, node);
    }
  };
  const openButton = {id: 'openPack', parentNode: controls};
  controls.children.push(openButton);
  const gachaScreen = {
    id: 'gachaScreen', children: [],
    prepend(node) { this.children.unshift(node); byId.set(node.id, node); },
    appendChild(node) { this.children.push(node); byId.set(node.id, node); }
  };
  byId.set('openPack', openButton);
  byId.set('gachaScreen', gachaScreen);
  const fakeDocument = {
    getElementById(id) { return byId.get(id) || null; },
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(), style: {}, attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; }
      };
    }
  };
  Object.defineProperty(globalThis, 'document', {value: fakeDocument, configurable: true});

  let currentScreen = 'shop';
  const presentationDriver = {
    async runPhase() {},
    finishRevision() {},
    getState() { return Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])}); }
  };
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => currentScreen,
    applyScreen: (next) => { currentScreen = next; },
    presentationDriver
  });

  try {
    const first = await runtime.navigate('gacha');
    assert.equal(first.status, 'completed');
    assert.equal(currentScreen, 'gacha');
    const note = byId.get('gachaPreviewAuthorityNotice');
    assert.ok(note);
    assert.equal(note.textContent, '※ 現在は演出プレビューです。表示されたカードは所持・保存には反映されません。');
    assert.equal(note.attributes.role, 'note');
    assert.equal(note.attributes['data-gacha-authority'], 'preview-only');
    assert.deepEqual(controls.children, [note, openButton]);

    currentScreen = 'shop';
    const second = await runtime.navigate('gacha');
    assert.equal(second.status, 'completed');
    assert.equal(controls.children.filter((node) => node.id === 'gachaPreviewAuthorityNotice').length, 1);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  }
});

test('Gacha preview disclosure fails soft when the Gacha surface is absent', async () => {
  const {ensureGachaPreviewDisclosure} = await import('../browser/screen-navigation-core.mjs');
  assert.equal(ensureGachaPreviewDisclosure(undefined), null);
  assert.equal(ensureGachaPreviewDisclosure({}), null);
  assert.equal(ensureGachaPreviewDisclosure({getElementById: () => null, createElement: () => ({})}), null);
});


test('P5X cross-screen source uses existing Profile and Partner piece motion without broad Battle takeover', async () => {
  const {SCREEN_MOTION_PIECE_SELECTORS} = await import('../browser/screen-navigation-core.mjs');
  assert.deepEqual(SCREEN_MOTION_PIECE_SELECTORS.profile, [
    '.profileStats > .profileIdentitySummary',
    '.profileStats > .profileRecordsNote',
    '.profileStats > .profileActions'
  ]);
  assert.deepEqual(SCREEN_MOTION_PIECE_SELECTORS.partner, [
    '.partner-shell-runtime > .partner-shell-title',
    '.partner-shell-runtime > .partner-shell-active',
    '.partner-shell-runtime > .partner-shell-idle-readable',
    '.partner-shell-runtime > .partner-shell-menu',
    '.partner-shell-runtime > .partner-shell-roster',
    '.partner-shell-runtime > .partner-shell-detail',
    '.partner-shell-runtime > .partner-shell-formation',
    '.partner-shell-runtime > .partner-shell-strategy',
    '.partner-shell-runtime > .partner-dialogue-feedback',
    '.partner-shell-runtime > .partner-costume-shell-host',
    '.partner-shell-runtime > .partner-shell-navigation'
  ]);
  assert.equal(SCREEN_MOTION_PIECE_SELECTORS.battle, undefined);
});

function temporaryCueTarget(options = {}) {
  const {
    screen = 'cards', textContent = 'Continue', id = '', tagName = 'BUTTON', type = '',
    role = '', ariaChecked = null, ariaPressed = null, checked = undefined,
    disabled = false, ariaDisabled = false, interactive = true, card = false, battleTarget = false,
    focusable = false, dataBattleAction = false, warnRailButton = false,
  } = options;
  const surface = {dataset: {screen}};
  let node;
  node = {
    id, tagName, type, textContent, checked, disabled,
    dataset: {action: '', sfxRole: '', ...(dataBattleAction ? {battleAction: 'true'} : {})},
    closest(selector) {
      if (selector === '.screen.active[data-screen]') return surface;
      if (card && selector.includes('.handCard')) return node;
      if (battleTarget && (selector.includes('.node.reachable') || selector.includes('.boardPlayerToken'))) return node;
      if (focusable && selector.startsWith('input:not')) return node;
      if (selector === 'form') return null;
      return interactive && /button|a\[href\]|input|select|textarea|\[role=/.test(selector) ? node : null;
    },
    getAttribute(name) {
      return ({role, type, 'aria-checked': ariaChecked, 'aria-pressed': ariaPressed, 'aria-disabled': ariaDisabled ? 'true' : null, 'aria-label': textContent, title: ''})[name] ?? null;
    },
    matches(selector) {
      const candidates = selector.split(',');
      return candidates.some((candidate) => {
        if (candidate === ':disabled') return disabled;
        if (candidate === '[role="tab"]') return role === 'tab';
        if (candidate === '[role="switch"]') return role === 'switch';
        if (candidate === '[aria-pressed]') return ariaPressed !== null;
        if (candidate === '[data-tab]') return false;
        if (candidate === '#readyPlan') return id === 'readyPlan';
        if (candidate === '[data-battle-action]') return dataBattleAction;
        if (candidate === '.railBtn.warn') return warnRailButton;
        return false;
      });
    }
  };
  return node;
}

test('temporary action SFX catalog groups common interactions and keeps navigation on its existing click', () => {
  assert.equal(TEMPORARY_ACTION_SFX_ASSIGNMENTS.acceptedNavigation, 'formal:click_002.ogg');
  assert.equal(TEMPORARY_ACTION_SFX_ASSIGNMENTS.genericButton, 'ui_button');
  assert.equal(Object.isFrozen(TEMPORARY_ACTION_SFX_CATALOG), true);
  assert.deepEqual(Object.fromEntries(Object.entries(TEMPORARY_ACTION_SFX_CATALOG).map(([key, cue]) => [key, cue.filename])), {
    ui_button: 'click_001.ogg', ui_confirm: 'confirmation_001.ogg', ui_select: 'select_001.ogg',
    ui_tab: 'switch_001.ogg', ui_toggle_on: 'toggle_001.ogg', ui_toggle_off: 'toggle_002.ogg',
    ui_open: 'open_001.ogg', ui_close: 'close_001.ogg', ui_slider: 'tick_001.ogg',
    ui_invalid: 'error_001.ogg', ui_empty_tap: 'click_005.ogg',
    battle_card_select: 'bookFlip1.ogg', battle_target: 'metalClick.ogg', battle_action: 'sword.1.ogg',
    battle_turn: 'bookClose.ogg', battle_button: 'click_003.ogg', battle_empty_tap: 'click_005.ogg',
  });
  assert.ok(Object.values(TEMPORARY_ACTION_SFX_CATALOG).every((cue) =>
    Object.isFrozen(cue) && cue.filename.endsWith('.ogg') && cue.gain > 0 && cue.gain <= 0.52));
});
test('temporary action SFX resolves shared UI controls and Battle-specific actions', () => {
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({textContent: 'Buy now'})}), 'ui_confirm');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({textContent: '\u6c7a\u5b9a'})}), 'ui_confirm');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({textContent: 'Back'})}), 'ui_close');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({textContent: '\u623b\u308b'})}), 'ui_close');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({role: 'tab'})}), 'ui_tab');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({type: 'checkbox', checked: true}), interaction: 'change'}), 'ui_toggle_on');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({type: 'range'}), interaction: 'input'}), 'ui_slider');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({type: 'text'}), interaction: 'click'}), null);
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({type: 'text'}), interaction: 'change'}), null);
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({disabled: true})}), 'ui_invalid');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({screen: 'battle', card: true}), screenName: 'battle'}), 'battle_card_select');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({screen: 'battle', battleTarget: true}), screenName: 'battle'}), 'battle_target');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({screen: 'battle', id: 'readyPlan'}), screenName: 'battle'}), 'battle_action');
  assert.equal(resolveTemporaryActionSfxCue({target: temporaryCueTarget({screen: 'battle', textContent: 'End Turn'}), screenName: 'battle'}), 'battle_turn');
});

test('temporary action SFX gives blank taps a quiet screen-family cue and ignores controls', () => {
  assert.equal(resolveTemporaryEmptyTapCue(temporaryCueTarget({screen: 'shop', interactive: false})), 'ui_empty_tap');
  assert.equal(resolveTemporaryEmptyTapCue(temporaryCueTarget({screen: 'battle', interactive: false})), 'battle_empty_tap');
  assert.equal(resolveTemporaryEmptyTapCue(temporaryCueTarget({screen: 'battle'})), null);
  assert.equal(resolveTemporaryEmptyTapCue(temporaryCueTarget({screen: null, interactive: false})), null);
});
function fakeTemporaryAudioFactory() {
  const audios = [];
  return {
    audios,
    create(url) {
      const audio = {
        src: url, volume: 1, currentTime: 2, preload: '', playCount: 0,
        play() { this.playCount += 1; return Promise.resolve(); },
      };
      audios.push(audio);
      return audio;
    },
  };
}

test('temporary SFX player uses packaged OGGs and honors gesture, mute and clamped SFX volume', () => {
  const audio = fakeTemporaryAudioFactory();
  const player = createTemporarySfxPlayer({
    audioFactory: (url) => audio.create(url),
    readSettings: () => ({muted: false, volume: 0.4}),
    hasUserGesture: () => true,
  });
  assert.equal(player.play('ui_button', {isTrusted: true}), true);
  assert.equal(audio.audios.length, 1);
  assert.match(audio.audios[0].src, /\/assets\/audio\/sfx\/temp-action-sfx-r2\/click_001\.ogg$/);
  assert.equal(audio.audios[0].volume, TEMPORARY_ACTION_SFX_CATALOG.ui_button.gain * 0.4);
  assert.equal(audio.audios[0].currentTime, 0);
  assert.equal(audio.audios[0].preload, 'auto');
  assert.equal(audio.audios[0].playCount, 1);
  player.dispose();
  const mutedAudio = fakeTemporaryAudioFactory();
  const muted = createTemporarySfxPlayer({
    audioFactory: (url) => mutedAudio.create(url),
    readSettings: () => ({muted: true, volume: 1}),
    hasUserGesture: () => true,
  });
  assert.equal(muted.play('ui_button', {}), false);
  assert.equal(mutedAudio.audios.length, 0);
  const blockedAudio = fakeTemporaryAudioFactory();
  const blocked = createTemporarySfxPlayer({
    audioFactory: (url) => blockedAudio.create(url),
    readSettings: () => ({muted: false, volume: 1}),
    hasUserGesture: () => false,
  });
  assert.equal(blocked.play('ui_button', {}), false);
  assert.equal(blockedAudio.audios.length, 0);
});
test('delegated SFX runtime is idempotent, plays blank taps and preserves one formal navigation sound', () => {
  const handlers = new Map();
  const settings = {mute: {textContent: 'SFX OFF'}, volume: {value: '80'}};
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener(type, handler) {
      handlers.set(type, (handlers.get(type) || []).filter((entry) => entry.handler !== handler));
    },
    querySelector(selector) { return selector === '#sfxMute' ? settings.mute : settings.volume; },
  };
  const audio = fakeTemporaryAudioFactory();
  const options = {documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true};
  const runtime = installTemporaryActionSfxRuntime(options);
  assert.equal(installTemporaryActionSfxRuntime(options), runtime);
  const blank = temporaryCueTarget({screen: 'shop', interactive: false});
  handlers.get('pointerdown').find((entry) => entry.options === true).handler({
    target: blank, pointerId: 1, isPrimary: true, button: 0, clientX: 12, clientY: 15, timeStamp: 1, isTrusted: true,
  });
  handlers.get('pointerup').find((entry) => entry.options !== true).handler({
    target: blank, pointerId: 1, isPrimary: true, button: 0, clientX: 12, clientY: 15, timeStamp: 30, isTrusted: true,
  });
  assert.equal(audio.audios.length, 1);
  assert.match(audio.audios[0].src, /click_005\.ogg$/);
  assert.equal(audio.audios[0].volume, TEMPORARY_ACTION_SFX_CATALOG.ui_empty_tap.gain * 0.8);
  const disabled = temporaryCueTarget({screen: 'shop', disabled: true});
  handlers.get('pointerdown').find((entry) => entry.options === true).handler({
    target: disabled, pointerId: 2, isPrimary: true, button: 0, clientX: 8, clientY: 8, timeStamp: 40, isTrusted: true,
  });
  handlers.get('pointerup').find((entry) => entry.options !== true).handler({
    target: disabled, pointerId: 2, isPrimary: true, button: 0, clientX: 8, clientY: 8, timeStamp: 50, isTrusted: true,
  });
  const disabledClick = {target: disabled, detail: 1, isTrusted: true};
  handlers.get('click').find((entry) => entry.options === true).handler(disabledClick);
  handlers.get('click').find((entry) => entry.options !== true).handler(disabledClick);
  assert.equal(audio.audios.length, 2);
  assert.match(audio.audios[1].src, /error_001\.ogg$/);
  assert.equal(runtime.installed, true);
  runtime.dispose();
  assert.equal([...handlers.values()].flat().length, 0);
});
test('accepted navigation click is excluded from delegated generic SFX', () => {
  const handlers = new Map();
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener() {},
    querySelector() { return {textContent: 'SFX OFF', value: '80'}; },
  };
  const audio = fakeTemporaryAudioFactory();
  const runtime = installTemporaryActionSfxRuntime({
    documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true,
  });
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const restoreActivation = setUserActivation(true);
  let formalPlayCount = 0;
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    value: class { play() { formalPlayCount += 1; return Promise.resolve(); } },
  });
  try {
    const event = {target: temporaryCueTarget({screen: 'home', textContent: 'Cards'}), isTrusted: true};
    handlers.get('click').find((entry) => entry.options === true).handler(event);
    assert.equal(resolveScreenNavigation('home', 'cards').ok, true);
    handlers.get('click').find((entry) => entry.options !== true).handler(event);
    assert.equal(formalPlayCount, 1);
    assert.equal(audio.audios.length, 0);
  } finally {
    runtime.dispose();
    restoreActivation();
    if (oldAudio) Object.defineProperty(globalThis, 'Audio', oldAudio);
    else delete globalThis.Audio;
  }
});

test('same-screen and empty navigation attempts get one dud cue without a navigation click', () => {
  const handlers = new Map();
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener() {},
    querySelector() { return {textContent: 'SFX OFF', value: '80'}; },
  };
  const audio = fakeTemporaryAudioFactory();
  const runtime = installTemporaryActionSfxRuntime({
    documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true,
  });
  const sameScreen = {target: temporaryCueTarget({screen: 'cards', textContent: 'Cards'}), detail: 1, isTrusted: true};
  handlers.get('click').find((entry) => entry.options === true).handler(sameScreen);
  assert.equal(resolveScreenNavigation('cards', 'cards').reason, SCREEN_NAVIGATION_REASON.CURRENT_SCREEN);
  handlers.get('click').find((entry) => entry.options !== true).handler(sameScreen);
  assert.equal(audio.audios.length, 1);
  assert.match(audio.audios[0].src, /error_001\.ogg$/);

  const missingTarget = {target: temporaryCueTarget({screen: 'cards', textContent: 'Cards'}), detail: 1, isTrusted: true};
  handlers.get('click').find((entry) => entry.options === true).handler(missingTarget);
  assert.equal(resolveScreenNavigation('cards', '').reason, SCREEN_NAVIGATION_REASON.EMPTY_TARGET);
  handlers.get('click').find((entry) => entry.options !== true).handler(missingTarget);
  assert.equal(audio.audios.length, 2);
  assert.match(audio.audios[1].src, /error_001\.ogg$/);
  runtime.dispose();
});

test('one click can resolve navigation repeatedly without layering its formal sound', () => {
  const handlers = new Map();
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener() {},
    querySelector() { return {textContent: 'SFX OFF', value: '80'}; },
  };
  const audio = fakeTemporaryAudioFactory();
  const runtime = installTemporaryActionSfxRuntime({
    documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true,
  });
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const restoreActivation = setUserActivation(true);
  let formalPlayCount = 0;
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    value: class { play() { formalPlayCount += 1; return Promise.resolve(); } },
  });
  try {
    const event = {target: temporaryCueTarget({screen: 'home', textContent: 'Cards'}), detail: 1, isTrusted: true};
    handlers.get('click').find((entry) => entry.options === true).handler(event);
    assert.equal(resolveScreenNavigation('home', 'cards').ok, true);
    assert.equal(resolveScreenNavigation('home', 'cards').ok, true);
    handlers.get('click').find((entry) => entry.options !== true).handler(event);
    assert.equal(formalPlayCount, 1);
    assert.equal(audio.audios.length, 0);
  } finally {
    runtime.dispose();
    restoreActivation();
    if (oldAudio) Object.defineProperty(globalThis, 'Audio', oldAudio);
    else delete globalThis.Audio;
  }
});

test('Battle drag and drop emits one action cue and suppresses the follow-up click cue', () => {
  const handlers = new Map();
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener() {},
    querySelector() { return {textContent: 'SFX OFF', value: '80'}; },
  };
  const audio = fakeTemporaryAudioFactory();
  const runtime = installTemporaryActionSfxRuntime({
    documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true,
  });
  const battleSurface = {dataset: {screen: 'battle'}};
  const card = temporaryCueTarget({screen: 'battle', card: true});
  const target = temporaryCueTarget({screen: 'battle', battleTarget: true});
  for (const element of [card, target]) {
    const originalClosest = element.closest.bind(element);
    element.closest = (selector) => selector === '.screen.active[data-screen]' ? battleSurface : originalClosest(selector);
  }
  handlers.get('pointerdown').find((entry) => entry.options === true).handler({
    target: card, pointerId: 7, isPrimary: true, button: 0, clientX: 10, clientY: 10, timeStamp: 1, isTrusted: true,
  });
  handlers.get('pointerup').find((entry) => entry.options !== true).handler({
    target, pointerId: 7, isPrimary: true, button: 0, clientX: 64, clientY: 40, timeStamp: 90, isTrusted: true,
  });
  const dropClick = {target, detail: 1, isTrusted: true};
  handlers.get('click').find((entry) => entry.options === true).handler(dropClick);
  handlers.get('click').find((entry) => entry.options !== true).handler(dropClick);
  assert.equal(audio.audios.length, 1);
  assert.match(audio.audios[0].src, /sword\.1\.ogg$/);
  runtime.dispose();
});

test('keyboard attempt on an aria-disabled button gets one dud across keydown and synthetic click', () => {
  const handlers = new Map();
  const fakeDocument = {
    defaultView: {},
    addEventListener(type, handler, options) {
      const list = handlers.get(type) || [];
      list.push({handler, options});
      handlers.set(type, list);
    },
    removeEventListener() {},
    querySelector() { return {textContent: 'SFX OFF', value: '80'}; },
  };
  const audio = fakeTemporaryAudioFactory();
  const runtime = installTemporaryActionSfxRuntime({
    documentSource: fakeDocument, audioFactory: (url) => audio.create(url), hasUserGesture: () => true,
  });
  const disabled = temporaryCueTarget({screen: 'shop', ariaDisabled: true});
  handlers.get('keydown').find((entry) => entry.options === true).handler({target: disabled, key: 'Enter', repeat: false, isTrusted: true});
  const click = {target: disabled, detail: 0, isTrusted: true};
  handlers.get('click').find((entry) => entry.options === true).handler(click);
  handlers.get('click').find((entry) => entry.options !== true).handler(click);
  assert.equal(audio.audios.length, 1);
  assert.match(audio.audios[0].src, /error_001\.ogg$/);
  runtime.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_MOTION_PRESENTATION_SPEC,
  createScreenMotionPresentationDriver,
  createScreenTransitionRuntimeAdapter,
  resolveHomeRouteMotionVector,
} from '../browser/screen-navigation-core.mjs';

function approx(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ~= ${expected}`);
}

function makeAnimatedNode(rect = null) {
  return {
    animations: [],
    getBoundingClientRect: rect ? () => ({...rect}) : undefined,
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    },
  };
}

function parseTranslate3d(transform) {
  const match = /translate3d\(([-+\d.eE]+)px,([-+\d.eE]+)px,0\)/.exec(String(transform || ''));
  assert.ok(match, `expected translate3d in ${transform}`);
  return {x: Number(match[1]), y: Number(match[2])};
}

function fakeRouteDocument({withGeometry = true} = {}) {
  const pivot = makeAnimatedNode({left: 90, top: 90, width: 20, height: 20});
  const cardsRoute = makeAnimatedNode({left: 30, top: 170, width: 20, height: 20});
  cardsRoute.dataset = {homeTarget: 'cards'};
  const homeVisual = makeAnimatedNode();
  const homeControl = makeAnimatedNode();
  const cardsControl = makeAnimatedNode();

  const home = {
    dataset: {screen: 'home'},
    animations: [],
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
    },
  };
  const cards = {
    dataset: {screen: 'cards'},
    animations: [],
    contains(node) { return node === cardsControl; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    },
  };
  const documentSource = {
    documentElement: {clientWidth: 1280, clientHeight: 720},
    activeElement: homeControl,
    querySelectorAll(selector) {
      assert.equal(selector, '.screen[data-screen]');
      return [home, cards];
    },
  };
  return {documentSource, home, cards, homeVisual, pivot, cardsRoute, homeControl, cardsControl};
}

test('Home route vector comes from the actual SlidePad pivot-to-lobe geometry', () => {
  const pivot = makeAnimatedNode({left: 90, top: 90, width: 20, height: 20});
  const battle = makeAnimatedNode({left: 170, top: 30, width: 20, height: 20});
  battle.dataset = {homeTarget: 'setup'};
  const surface = {
    querySelector(selector) { return selector === '#homePadCenter' ? pivot : null; },
    querySelectorAll(selector) {
      return selector === '.homePadChoice[data-home-target]' ? [battle] : [];
    },
  };

  const vector = resolveHomeRouteMotionVector(surface, 'setup');
  assert.ok(vector);
  assert.equal(Object.isFrozen(vector), true);
  assert.equal(vector.target, 'setup');
  approx(vector.x, 0.8);
  approx(vector.y, -0.6);
});

test('Home route commit moves only the visual scene toward the selected lobe and brings destination from behind', async () => {
  const fixture = fakeRouteDocument();
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => {
      screen = next;
      fixture.documentSource.activeElement = fixture.cardsControl;
    },
    presentationDriver: createScreenMotionPresentationDriver({document: fixture.documentSource}),
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'cards');
  assert.equal(fixture.home.animations.length, 0, 'Home surface/SlidePad shell must stay put');
  assert.equal(fixture.pivot.animations.length, 0, 'SlidePad pivot must not be animated by screen takeover');
  assert.equal(fixture.homeVisual.animations.length, 1, 'only Home visual scene exits');
  assert.equal(fixture.cards.animations.length, 1, 'destination enters continuously');

  const exit = fixture.homeVisual.animations[0];
  const enter = fixture.cards.animations[0];
  assert.equal(exit.options.duration, SCREEN_MOTION_PRESENTATION_SPEC.normal.exitMs);
  assert.equal(enter.options.duration, SCREEN_MOTION_PRESENTATION_SPEC.normal.enterMs);
  const exitVector = parseTranslate3d(exit.frames[1].transform);
  const enterVector = parseTranslate3d(enter.frames[0].transform);
  approx(exitVector.x, -10.8);
  approx(exitVector.y, 14.4);
  approx(enterVector.x, 10.8);
  approx(enterVector.y, -14.4);
});

test('Home route geometry falls back to the existing family motion when the lobe cannot be resolved', async () => {
  const fixture = fakeRouteDocument({withGeometry: false});
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: createScreenMotionPresentationDriver({document: fixture.documentSource}),
  });

  assert.equal((await runtime.navigate('cards')).status, 'completed');
  assert.equal(fixture.home.animations.length, 0, 'Home visual scene remains the takeover target even on geometry fallback');
  assert.equal(fixture.homeVisual.animations.length, 1);
  assert.match(fixture.homeVisual.animations[0].frames[1].transform, /translate3d\(0,-18px,0\)/);
});

test('low-perf and reduced-motion preserve semantics without spatial Home takeover motion', async () => {
  const low = fakeRouteDocument();
  let lowScreen = 'home';
  const lowRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => lowScreen,
    applyScreen: (next) => { lowScreen = next; },
    lowPerf: true,
    presentationDriver: createScreenMotionPresentationDriver({document: low.documentSource}),
  });
  assert.equal((await lowRuntime.navigate('cards')).status, 'completed');
  assert.equal(low.homeVisual.animations.length, 1);
  assert.equal(low.cards.animations.length, 1);
  assert.ok(low.homeVisual.animations[0].frames.every((frame) => !('transform' in frame)));
  assert.ok(low.cards.animations[0].frames.every((frame) => !('transform' in frame)));

  const reduced = fakeRouteDocument();
  let reducedScreen = 'home';
  const reducedRuntime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => reducedScreen,
    applyScreen: (next) => { reducedScreen = next; },
    reducedMotion: true,
    presentationDriver: createScreenMotionPresentationDriver({document: reduced.documentSource}),
  });
  assert.equal((await reducedRuntime.navigate('cards')).status, 'completed');
  assert.equal(reduced.homeVisual.animations.length, 0);
  assert.equal(reduced.cards.animations.length, 0);
});

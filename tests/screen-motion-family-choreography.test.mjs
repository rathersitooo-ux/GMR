import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_TRANSITION_MOTION_PROFILE,
  SCREEN_MOTION_FAMILIES,
  classifyScreenMotionFamily,
  createScreenMotionPresentationDriver,
  createScreenTransitionRuntimeAdapter,
  resolveScreenMotionChoreography
} from '../browser/screen-navigation-core.mjs';

const EXPECTED = Object.freeze({
  home: SCREEN_MOTION_FAMILIES.HOME,
  cards: SCREEN_MOTION_FAMILIES.CARDS,
  characters: SCREEN_MOTION_FAMILIES.PARTNER,
  profile: SCREEN_MOTION_FAMILIES.PARTNER,
  setup: SCREEN_MOTION_FAMILIES.SETUP,
  friendroom: SCREEN_MOTION_FAMILIES.SETUP,
  battle: SCREEN_MOTION_FAMILIES.BATTLE,
  result: SCREEN_MOTION_FAMILIES.RESULT,
  shop: SCREEN_MOTION_FAMILIES.COMMERCE,
  gacha: SCREEN_MOTION_FAMILIES.COMMERCE,
  missions: SCREEN_MOTION_FAMILIES.UTILITY,
  records: SCREEN_MOTION_FAMILIES.UTILITY,
  settings: SCREEN_MOTION_FAMILIES.UTILITY
});

function animatedNode() {
  return {
    animations: [],
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
}

function surface(screen, selectorMap = {}) {
  const node = animatedNode();
  return Object.assign(node, {
    dataset: {screen},
    contains() { return false; },
    querySelectorAll(selector) { return selectorMap[selector] || []; }
  });
}

function familyDocument() {
  const homeLayer = animatedNode();
  const cardsLayer = animatedNode();
  const battleLayer = animatedNode();
  const home = surface('home', {'.homeSlidePad': [homeLayer]});
  const cards = surface('cards', {'.collection': [cardsLayer]});
  const battle = surface('battle', {'.board': [battleLayer]});
  return {
    documentElement: {clientWidth: 1280, clientHeight: 720},
    activeElement: null,
    querySelectorAll(selector) {
      assert.equal(selector, '.screen[data-screen]');
      return [home, cards, battle];
    },
    surfaces: {home, cards, battle},
    layers: {home: homeLayer, cards: cardsLayer, battle: battleLayer}
  };
}

test('every current Browser screen maps to an explicit GAMEROAD motion family', () => {
  assert.deepEqual(
    Object.fromEntries(Object.keys(EXPECTED).map((screen) => [screen, classifyScreenMotionFamily(screen)])),
    EXPECTED
  );
  assert.equal(classifyScreenMotionFamily('future-screen'), SCREEN_MOTION_FAMILIES.UTILITY);
});

test('normal motion families retain distinct choreography signatures instead of one generic slide', () => {
  const representative = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop', 'settings'];
  const signatures = representative.map((screen) => {
    const spec = resolveScreenMotionChoreography(screen, MENU_TRANSITION_MOTION_PROFILE.NORMAL);
    assert.ok(spec.selectors.length > 0);
    assert.ok(spec.layerLimit > 0);
    return `${spec.family}:${spec.axis}:${spec.distancePx}:${spec.rotateDeg}:${spec.scale}:${spec.staggerMs}`;
  });
  assert.equal(new Set(signatures).size, representative.length);
});

test('reduced and none profiles preserve semantics while removing spatial choreography', () => {
  const reduced = resolveScreenMotionChoreography('cards', MENU_TRANSITION_MOTION_PROFILE.REDUCED);
  assert.equal(reduced.family, SCREEN_MOTION_FAMILIES.CARDS);
  assert.equal(reduced.distancePx, 0);
  assert.equal(reduced.rotateDeg, 0);
  assert.equal(reduced.scale, 1);
  assert.equal(reduced.staggerMs, 0);
  assert.equal(reduced.layerLimit, 2);

  const none = resolveScreenMotionChoreography('cards', MENU_TRANSITION_MOTION_PROFILE.NONE);
  assert.equal(none.family, SCREEN_MOTION_FAMILIES.CARDS);
  assert.equal(none.layerLimit, 0);
  assert.deepEqual(none.selectors, []);
});

test('real family layers animate with family-specific transforms on navigation', async () => {
  const documentSource = familyDocument();
  let screen = 'home';
  const driver = createScreenMotionPresentationDriver({document: documentSource});
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    presentationDriver: driver
  });

  const result = await runtime.navigate('cards');
  assert.equal(result.status, 'completed');
  assert.equal(screen, 'cards');
  assert.equal(documentSource.layers.home.animations.length, 1);
  assert.equal(documentSource.layers.cards.animations.length, 1);
  const enter = documentSource.layers.cards.animations[0];
  assert.match(enter.frames[0].transform, /translate3d\(36px,0,0\)/);
  assert.match(enter.frames[0].transform, /rotate\(-0\.8deg\)/);
  assert.match(enter.frames[0].transform, /scale\(0\.988\)/);
  assert.equal(enter.options.delay, 0);
  assert.equal(enter.options.duration, 154);
  assert.ok(runtime.getPresentationState().events.some((event) => event.kind === 'family_layer' && event.family === SCREEN_MOTION_FAMILIES.CARDS && event.status === 'completed'));
});

test('low-performance family layers stay opacity-only and do not introduce spatial transforms', async () => {
  const documentSource = familyDocument();
  let screen = 'home';
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => screen,
    applyScreen: (next) => { screen = next; },
    lowPerf: true,
    presentationDriver: createScreenMotionPresentationDriver({document: documentSource})
  });
  assert.equal((await runtime.navigate('cards')).status, 'completed');
  const enter = documentSource.layers.cards.animations[0];
  assert.ok(enter.frames.every((frame) => !('transform' in frame)));
  assert.equal(enter.options.delay, 0);
});

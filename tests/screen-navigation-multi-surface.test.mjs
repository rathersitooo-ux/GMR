import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENU_TRANSITION_MOTION_PROFILE,
  createScreenMotionPresentationDriver
} from '../browser/screen-navigation-core.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return {promise, resolve};
}

function piece(rect) {
  const gate = deferred();
  return {
    animations: [],
    gate,
    getBoundingClientRect() { return rect; },
    animate(frames, options) {
      const animation = {finished: gate.promise, cancelled: false, cancel() { this.cancelled = true; }};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
}

function surface(screen, selectorMap = {}) {
  return {
    dataset: {screen},
    animations: [],
    contains() { return false; },
    querySelectorAll(selector) { return selectorMap[selector] || []; },
    animate(frames, options) {
      const animation = {finished: Promise.resolve(), cancel() {}};
      this.animations.push({frames, options, animation});
      return animation;
    }
  };
}

function context(signal, profile = MENU_TRANSITION_MOTION_PROFILE.NORMAL) {
  return Object.freeze({
    revision: 1,
    from: 'home',
    to: 'setup',
    reason: 'navigation',
    reducedMotion: false,
    lowPerf: false,
    signal,
    motionProfile: profile
  });
}

test('setup enters two independent UI pieces from viewport edges in the same ENTER window', async () => {
  const hero = piece({left: 90, top: 20, right: 1190, bottom: 220, width: 1100, height: 200});
  const box = piece({left: 260, top: 330, right: 1020, bottom: 650, width: 760, height: 320});
  const home = surface('home');
  const setup = surface('setup', {'.setupHero': [hero], '.setupBox': [box]});
  const documentSource = {
    documentElement: {clientWidth: 1280, clientHeight: 720},
    activeElement: null,
    querySelectorAll(selector) {
      assert.equal(selector, '.screen[data-screen]');
      return [home, setup];
    }
  };
  const controller = new AbortController();
  const driver = createScreenMotionPresentationDriver({document: documentSource});
  const ctx = context(controller.signal);
  await driver.runPhase('SWAP', ctx);
  const entering = driver.runPhase('ENTER', ctx);

  assert.equal(hero.animations.length, 1);
  assert.equal(box.animations.length, 1);
  assert.equal(setup.animations.length, 0, 'multi-surface path must not flatten the destination into one moving board');
  assert.equal(hero.animations[0].options.duration, 120);
  assert.equal(box.animations[0].options.duration, 120);
  assert.equal(hero.animations[0].frames[0].translate, '0px -232px');
  assert.equal(box.animations[0].frames[0].translate, '0px 402px');
  assert.equal(hero.animations[0].frames[1].translate, '0px 0px');
  assert.equal(box.animations[0].frames[1].translate, '0px 0px');

  const started = driver.getState().events.find((event) => event.kind === 'multi_surface_enter');
  assert.equal(started?.pieceCount, 2);
  assert.equal(started?.status, 'started');

  hero.gate.resolve();
  box.gate.resolve();
  await entering;
});

test('low-perf keeps the existing opacity-only whole-surface fallback instead of offscreen piece travel', async () => {
  const hero = piece({left: 90, top: 20, right: 1190, bottom: 220, width: 1100, height: 200});
  const box = piece({left: 260, top: 330, right: 1020, bottom: 650, width: 760, height: 320});
  const home = surface('home');
  const setup = surface('setup', {'.setupHero': [hero], '.setupBox': [box]});
  const documentSource = {
    documentElement: {clientWidth: 1280, clientHeight: 720}, activeElement: null,
    querySelectorAll() { return [home, setup]; }
  };
  const controller = new AbortController();
  const driver = createScreenMotionPresentationDriver({document: documentSource});
  const ctx = context(controller.signal, MENU_TRANSITION_MOTION_PROFILE.REDUCED);
  await driver.runPhase('SWAP', ctx);
  await driver.runPhase('ENTER', ctx);
  assert.equal(hero.animations.length, 0);
  assert.equal(box.animations.length, 0);
  assert.equal(setup.animations.length, 1);
  assert.ok(setup.animations[0].frames.every((frame) => !('translate' in frame) && !('transform' in frame)));
});

test('aborting a multi-surface ENTER cancels both in-flight piece animations', async () => {
  const hero = piece({left: 90, top: 20, right: 1190, bottom: 220, width: 1100, height: 200});
  const box = piece({left: 260, top: 330, right: 1020, bottom: 650, width: 760, height: 320});
  const home = surface('home');
  const setup = surface('setup', {'.setupHero': [hero], '.setupBox': [box]});
  const documentSource = {
    documentElement: {clientWidth: 1280, clientHeight: 720}, activeElement: null,
    querySelectorAll() { return [home, setup]; }
  };
  const controller = new AbortController();
  const driver = createScreenMotionPresentationDriver({document: documentSource});
  const ctx = context(controller.signal);
  await driver.runPhase('SWAP', ctx);
  const entering = driver.runPhase('ENTER', ctx);
  assert.equal(hero.animations.length, 1);
  assert.equal(box.animations.length, 1);
  controller.abort();
  hero.gate.resolve();
  box.gate.resolve();
  await entering;
  assert.equal(hero.animations[0].animation.cancelled, true);
  assert.equal(box.animations[0].animation.cancelled, true);
  assert.deepEqual(driver.getState().activeRevisions, []);
});

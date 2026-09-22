import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS,
  captureBattleCardReleaseFlightEffect,
  playBattleCardReleaseFlightEffect,
} from '../browser/battle-card-release-flight-runtime-effect.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeAnimatedNode(ownerDocument = null, tagName = 'span') {
  const finish = deferred();
  return {
    ownerDocument,
    tagName,
    style: {},
    dataset: {},
    attributes: {},
    children: [],
    removed: false,
    animationCalls: [],
    parentNode: null,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    animate(frames, options) {
      this.animationCalls.push({ frames, options });
      return { finished: finish.promise };
    },
    remove() {
      this.removed = true;
      if (this.parentNode?.children) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
      this.parentNode = null;
    },
    finish,
  };
}

function fixture({ animateClone = true, animateCue = true, svg = true, distinctVisual = false } = {}) {
  const created = [];
  const createdNs = [];
  const documentRef = {
    createElement(tagName) {
      const node = fakeAnimatedNode(documentRef, tagName);
      if (!animateCue && tagName === 'span') delete node.animate;
      created.push(node);
      return node;
    },
    createElementNS(_ns, tagName) {
      if (!svg) return null;
      const node = fakeAnimatedNode(documentRef, tagName);
      createdNs.push(node);
      return node;
    },
  };

  const clone = fakeAnimatedNode(documentRef, 'article');
  if (!animateClone) delete clone.animate;
  const source = {
    disabled: true,
    dataset: { armed: 'true', untouched: 'source' },
    attributes: {},
    getBoundingClientRect() {
      return { left: 100, top: 240, width: 72, height: 96 };
    },
    cloneNode() {
      return distinctVisual ? null : clone;
    },
  };
  const visualClone = distinctVisual ? clone : null;
  const visual = distinctVisual
    ? {
      dataset: {
        cardId: 'card-1',
        releaseVfxHeroFrameSrc: '/assets/card-1-hero-frame.png',
        releaseVfxImpactSrc: '/assets/card-1-impact.png',
        releaseVfxReceiptSrc: '/assets/card-1-receipt.png',
      },
      getBoundingClientRect() {
        return { left: 22, top: 420, width: 96, height: 132 };
      },
      cloneNode() {
        return visualClone;
      },
    }
    : source;

  const host = fakeAnimatedNode(documentRef, 'aside');
  return { source, visual, clone, visualClone, host, created, createdNs, documentRef };
}

function capture(source, overrides = {}) {
  return captureBattleCardReleaseFlightEffect({
    sourceNode: source,
    start: { x: 136, y: 288 },
    target: { x: 420, y: 180 },
    role: 'middle',
    ...overrides,
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test('capture can use the physical card visual while preserving the release origin geometry', () => {
  const { source, visual, visualClone } = fixture({ distinctVisual: true });
  const flight = capture(source, {
    visualNode: visual,
    cardId: 'card-1',
  });

  assert.ok(flight);
  assert.equal(flight.clone, visualClone);
  assert.deepEqual(flight.sourceRect, { left: 100, top: 240, width: 72, height: 96 });
  assert.deepEqual(flight.visualRect, { left: 22, top: 420, width: 96, height: 132 });
  assert.deepEqual(flight.start, { x: 136, y: 288 });
  assert.deepEqual(flight.target, { x: 420, y: 180 });
  assert.equal(flight.cardId, 'card-1');
  assert.deepEqual(flight.assets, {
    heroFrameUrl: '/assets/card-1-hero-frame.png',
    impactSpriteUrl: '/assets/card-1-impact.png',
    receiptGlowUrl: '/assets/card-1-receipt.png',
  });
  assert.deepEqual(source.dataset, { armed: 'true', untouched: 'source' });
});

test('explicit per-card material hooks override DOM hooks without becoming required', () => {
  const { source, visual } = fixture({ distinctVisual: true });
  const flight = capture(source, {
    visualNode: visual,
    cardId: 'card-1',
    assets: {
      heroFrameUrl: '/formal/hero.webp',
      impactSpriteUrl: '/formal/impact.webp',
      receiptGlowUrl: '/formal/receipt.webp',
    },
  });
  assert.deepEqual(flight.assets, {
    heroFrameUrl: '/formal/hero.webp',
    impactSpriteUrl: '/formal/impact.webp',
    receiptGlowUrl: '/formal/receipt.webp',
  });

  const { source: plainSource } = fixture();
  const plain = capture(plainSource);
  assert.deepEqual(plain.assets, {
    heroFrameUrl: null,
    impactSpriteUrl: null,
    receiptGlowUrl: null,
  });
});

test('full release builds procedural SVG trail and center hero layer without raster assets', () => {
  const { source, clone, host, createdNs, created, documentRef } = fixture();
  const flight = capture(source, { role: 'top' });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(host.children.includes(clone), true);
  assert.equal(clone.dataset.battleCardHeroShot, '1');
  assert.equal(clone.style.left, '100px');
  assert.equal(clone.style.top, '240px');
  assert.equal(clone.animationCalls.length, 1);
  const { frames, options } = clone.animationCalls[0];
  assert.equal(options.duration, 560);
  assert.match(frames.at(-1).transform, /translate3d\(284\.00px,-108\.00px,0\) rotate\(0\.00deg\) scale\(1\.040\)/);
  assert.equal(frames.at(-1).opacity, 0);

  const svg = createdNs.find((node) => node.tagName === 'svg');
  const paths = createdNs.filter((node) => node.tagName === 'path');
  assert.ok(svg, 'normal mode creates a vector overlay');
  assert.equal(svg.attributes['data-battle-card-release-trail'], '1');
  assert.equal(paths.length, 2, 'broad glow and white core share one cubic path');
  assert.equal(paths.every((path) => path.attributes.pathLength === '1'), true);
  assert.equal(paths.every((path) => path.animationCalls.length === 1), true);

  const hero = created.find((node) => node.dataset.battleCardReleaseHero === '1');
  assert.ok(hero, 'normal mode creates a center hero cue');
  assert.equal(hero.children.some((node) => node.tagName === 'img'), false, 'procedural hero works without material assets');
});

test('material hooks mount only as optional center layers and do not replace the physical card clone', () => {
  const { source, visual, clone, host, created, documentRef } = fixture({ distinctVisual: true });
  const flight = capture(source, { visualNode: visual, cardId: 'card-1' });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(host.children.includes(clone), true);
  const hero = created.find((node) => node.dataset.battleCardReleaseHero === '1');
  assert.ok(hero);
  const imageSources = hero.children.filter((node) => node.tagName === 'img').map((node) => node.src);
  assert.deepEqual(imageSources.sort(), ['/assets/card-1-hero-frame.png', '/assets/card-1-impact.png'].sort());
});

test('presentation-settled callback fires exactly once after the center hero shot finishes', async () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { cardId: 'card-settle' });
  const calls = [];

  assert.equal(playBattleCardReleaseFlightEffect({
    host,
    flight,
    documentRef,
    onPresentationSettled: (payload) => calls.push(payload),
  }), true);
  assert.equal(calls.length, 0);
  clone.finish.resolve();
  await flushMicrotasks();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].cardId, 'card-settle');
  assert.deepEqual(calls[0].target, { x: 420, y: 180 });
  assert.equal(clone.removed, true);
});

test('cancelled full presentation cleans up without falsely emitting a receipt boundary', async () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { cardId: 'card-cancelled' });
  const calls = [];
  assert.equal(playBattleCardReleaseFlightEffect({
    host,
    flight,
    documentRef,
    onPresentationSettled: (payload) => calls.push(payload),
  }), true);
  clone.finish.reject(new Error('cancelled'));
  await flushMicrotasks();
  assert.equal(calls.length, 0);
  assert.equal(clone.removed, true);
});

test('low-performance mode keeps center motion but skips procedural SVG and filter work', () => {
  const { source, clone, host, createdNs, documentRef } = fixture();
  const flight = capture(source, { role: 'top', lowPerf: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const frames = clone.animationCalls[0].frames;
  assert.ok(frames.some((frame) => frame.transform.includes('translate3d(284.00px,-108.00px,0)')));
  assert.ok(frames.every((frame) => frame.filter === 'none'));
  assert.equal(createdNs.length, 0, 'LowPerf does not allocate the SVG trail');
});

test('reduced motion snaps the card presentation to center and exposes a destination pulse', () => {
  const { source, clone, host, created, documentRef } = fixture();
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const { frames, options } = clone.animationCalls[0];
  assert.ok(frames.every((frame) => frame.transform.includes('translate3d(284.00px,-108.00px,0)')));
  assert.ok(frames.every((frame) => frame.transform.includes('rotate(0.00deg)')));
  assert.ok(options.duration <= 180);
  const cue = created.find((node) => node.dataset.jankenFlightDestination === '1');
  assert.ok(cue);
  assert.equal(cue.style.left, '420px');
  assert.equal(cue.style.top, '180px');
  assert.equal(cue.animationCalls[0].options.duration, BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS);
});

test('reduced motion keeps destination causality when the flight clone cannot animate', () => {
  const { source, clone, host, created, documentRef } = fixture({ animateClone: false });
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(clone.removed, true);
  const cue = created.find((node) => node.dataset.jankenFlightDestination === '1');
  assert.ok(cue);
  assert.equal(host.children.includes(cue), true);
});

test('reduced motion destination cue remains visibly static when the cue itself cannot animate', () => {
  const { source, host, created, documentRef } = fixture({ animateCue: false });
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const cue = created.find((node) => node.dataset.jankenFlightDestination === '1');
  assert.ok(cue);
  assert.equal(cue.dataset.jankenFlightDestinationFallback, 'static');
  assert.equal(cue.style.opacity, '0.72');
  assert.equal(cue.style.transform, 'translate(-50%,-50%) scale(1)');
});

test('full-motion effect still fails closed when the cloned visual cannot animate', () => {
  const { source, clone, host, documentRef } = fixture({ animateClone: false });
  const flight = capture(source);

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), false);
  assert.equal(host.children.includes(clone), false);
  assert.equal(clone.removed, true);
});

test('capture fails closed for invalid caller geometry instead of inventing a target', () => {
  const { source } = fixture();
  assert.equal(capture(source, { target: { x: Number.NaN, y: 180 } }), null);
  assert.equal(captureBattleCardReleaseFlightEffect({ sourceNode: source }), null);
});

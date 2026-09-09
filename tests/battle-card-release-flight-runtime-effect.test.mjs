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

function fakeAnimatedNode() {
  const finish = deferred();
  return {
    style: {},
    dataset: {},
    attributes: {},
    removed: false,
    animationCalls: [],
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    animate(frames, options) {
      this.animationCalls.push({ frames, options });
      return { finished: finish.promise };
    },
    remove() {
      this.removed = true;
    },
    finish,
  };
}

function fixture({ animateClone = true } = {}) {
  const clone = fakeAnimatedNode();
  if (!animateClone) delete clone.animate;
  const source = {
    disabled: true,
    dataset: { armed: 'true', untouched: 'source' },
    attributes: {},
    getBoundingClientRect() {
      return { left: 100, top: 240, width: 72, height: 96 };
    },
    cloneNode() {
      return clone;
    },
  };
  const host = {
    appended: [],
    appendChild(node) {
      this.appended.push(node);
      return node;
    },
  };
  const cues = [];
  const documentRef = {
    createElement() {
      const cue = fakeAnimatedNode();
      cues.push(cue);
      return cue;
    },
  };
  return { source, clone, host, cues, documentRef };
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

test('capture snapshots geometry without mutating the authoritative source node', () => {
  const { source, clone } = fixture();
  const flight = capture(source, { role: 'top' });

  assert.ok(flight);
  assert.equal(flight.clone, clone);
  assert.deepEqual(flight.sourceRect, { left: 100, top: 240, width: 72, height: 96 });
  assert.deepEqual(flight.start, { x: 136, y: 288 });
  assert.deepEqual(flight.target, { x: 420, y: 180 });
  assert.equal(flight.role, 'top');
  assert.equal(source.disabled, true);
  assert.deepEqual(source.dataset, { armed: 'true', untouched: 'source' });
});

test('full top flight consumes the merged core trajectory and counter-clockwise spin', () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { role: 'top' });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(host.appended[0], clone);
  assert.equal(clone.animationCalls.length, 1);
  const { frames, options } = clone.animationCalls[0];
  assert.match(frames.at(-1).transform, /rotate\(-720\.00deg\)/);
  assert.match(frames.at(-1).transform, /scale\(0\.340\)/);
  assert.equal(options.duration, 560);
  assert.equal(clone.dataset.jankenFlight, '1');
  assert.equal(clone.style.pointerEvents, 'none');
});

test('full bottom flight mirrors the rotational direction', () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { role: 'bottom' });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const frames = clone.animationCalls[0].frames;
  assert.match(frames.at(-1).transform, /rotate\(720\.00deg\)/);
});

test('low-performance flight keeps motion but removes filter work', () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { role: 'top', lowPerf: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const frames = clone.animationCalls[0].frames;
  assert.ok(frames.some((frame) => !frame.transform.includes('translate3d(0.00px,0.00px,0)')));
  assert.ok(frames.every((frame) => frame.filter === 'none'));
});

test('reduced motion avoids large travel and exposes a destination pulse', () => {
  const { source, clone, host, cues, documentRef } = fixture();
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const { frames, options } = clone.animationCalls[0];
  assert.ok(frames.every((frame) => frame.transform.includes('translate3d(0.00px,0.00px,0)')));
  assert.ok(frames.every((frame) => frame.transform.includes('rotate(0.00deg)')));
  assert.ok(options.duration <= 180);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].dataset.jankenFlightDestination, '1');
  assert.equal(cues[0].style.left, '420px');
  assert.equal(cues[0].style.top, '180px');
  assert.equal(cues[0].animationCalls[0].options.duration, BATTLE_CARD_RELEASE_DESTINATION_PULSE_DURATION_MS);
});

test('flight clone and reduced-motion cue are removed after completion', async () => {
  const { source, clone, host, cues, documentRef } = fixture();
  const flight = capture(source, { reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(clone.removed, false);
  assert.equal(cues[0].removed, false);
  clone.finish.resolve();
  await flushMicrotasks();
  assert.equal(clone.removed, true);
  assert.equal(cues[0].removed, true);
});

test('flight clone is removed when Web Animations rejects', async () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source);

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  clone.finish.reject(new Error('animation cancelled'));
  await flushMicrotasks();
  assert.equal(clone.removed, true);
});

test('effect fails closed when the cloned visual cannot animate', () => {
  const { source, clone, host, documentRef } = fixture({ animateClone: false });
  const flight = capture(source);

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), false);
  assert.equal(host.appended.length, 0);
  assert.equal(clone.removed, true);
});

test('capture fails closed for invalid caller geometry instead of inventing a target', () => {
  const { source } = fixture();
  assert.equal(capture(source, { target: { x: Number.NaN, y: 180 } }), null);
  assert.equal(captureBattleCardReleaseFlightEffect({ sourceNode: source }), null);
});

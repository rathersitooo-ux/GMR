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

function fixture({ animateClone = true, animateCue = true } = {}) {
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
      if (!animateCue) delete cue.animate;
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

test('full top flight preserves trajectory and waits for arrival before playing the impact atlas', async () => {
  const { source, clone, host, cues, documentRef } = fixture();
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
  assert.equal(cues.length, 1);
  const trail = cues.find(node => node.dataset.jankenFlightTrail === '1');
  assert.ok(trail);
  assert.match(trail.style.backgroundImage, /throw-thin\.png/);
  assert.equal(trail.animationCalls[0].options.duration, options.duration);
  assert.equal(cues.some(node => node.dataset.jankenFlightImpact), false);
  clone.finish.resolve();
  await flushMicrotasks();
  const impact = cues.find(node => node.dataset.jankenFlightImpact === '1');
  assert.ok(impact);
  assert.match(impact.style.backgroundImage, /impact-cyan\.png/);
  assert.equal(new Set(impact.animationCalls[0].frames.map(frame => frame.backgroundPosition)).size, 8);
  assert.equal(impact.animationCalls[0].frames.at(-2).offset, 7 / 8);
  assert.equal(impact.animationCalls[0].frames.at(-1).backgroundPosition, '100% 0%');
  assert.equal(impact.style.left, '420px');
  assert.equal(impact.style.top, '180px');
  assert.equal(impact.animationCalls[0].options.duration, 240);
  assert.equal(impact.animationCalls[0].options.easing, 'linear');
  assert.ok(impact.animationCalls[0].frames.every(frame => frame.easing === 'steps(1, end)'));
});

test('full bottom flight mirrors the rotational direction', () => {
  const { source, clone, host, documentRef } = fixture();
  const flight = capture(source, { role: 'bottom' });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const frames = clone.animationCalls[0].frames;
  assert.match(frames.at(-1).transform, /rotate\(720\.00deg\)/);
});

test('low-performance flight keeps motion but removes filter work and extra trail layers', () => {
  const { source, clone, host, cues, documentRef } = fixture();
  const flight = capture(source, { role: 'top', lowPerf: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const frames = clone.animationCalls[0].frames;
  assert.ok(frames.some((frame) => !frame.transform.includes('translate3d(0.00px,0.00px,0)')));
  assert.ok(frames.every((frame) => frame.filter === 'none'));
  assert.equal(cues.length, 0);
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

test('reduced motion keeps destination causality when the flight clone cannot animate', () => {
  const { source, clone, host, cues, documentRef } = fixture({ animateClone: false });
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(clone.removed, true);
  assert.equal(host.appended.includes(clone), false);
  assert.equal(cues.length, 1);
  assert.equal(host.appended.includes(cues[0]), true);
  assert.equal(cues[0].dataset.jankenFlightDestination, '1');
  assert.equal(cues[0].style.left, '420px');
  assert.equal(cues[0].style.top, '180px');
});

test('reduced motion destination cue remains visibly static when the cue itself cannot animate', () => {
  const { source, host, cues, documentRef } = fixture({ animateCue: false });
  const flight = capture(source, { role: 'top', reducedMotion: true });

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  assert.equal(cues.length, 1);
  assert.equal(cues[0].dataset.jankenFlightDestination, '1');
  assert.equal(cues[0].dataset.jankenFlightDestinationFallback, 'static');
  assert.equal(cues[0].style.opacity, '0.72');
  assert.equal(cues[0].style.transform, 'translate(-50%,-50%) scale(1)');
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

test('arrival removes travel layers but lets impact finish independently', async () => {
  const { source, clone, host, cues, documentRef } = fixture();
  const flight = capture(source, { role: 'bottom' });
  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  const trail = cues.find(node => node.dataset.jankenFlightTrail === '1');
  assert.ok(trail);
  clone.finish.resolve();
  await flushMicrotasks();
  const impact = cues.find(node => node.dataset.jankenFlightImpact === '1');
  assert.ok(impact);
  assert.equal(clone.removed, true);
  assert.equal(trail.removed, true);
  assert.equal(impact.removed, false);
  impact.finish.resolve();
  await flushMicrotasks();
  assert.equal(impact.removed, true);
});

test('flight clone is removed when Web Animations rejects', async () => {
  const { source, clone, host, cues, documentRef } = fixture();
  const flight = capture(source);

  assert.equal(playBattleCardReleaseFlightEffect({ host, flight, documentRef }), true);
  clone.finish.reject(new Error('animation cancelled'));
  await flushMicrotasks();
  assert.equal(clone.removed, true);
  assert.equal(cues.some(node => node.dataset.jankenFlightImpact === '1'), false);
  assert.ok(cues.every(node => node.removed));
});

test('full-motion effect still fails closed when the cloned visual cannot animate', () => {
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

test('launcher return is released on arrival, cancellation, and reduced static fallback', async () => {
  for (const mode of ['arrive', 'cancel', 'static']) {
    const {source,clone,host,documentRef}=fixture({animateClone:mode!=='static'});
    let count=0;host.__gameroadLauncherFlightSettled=()=>{count+=1;};
    assert.equal(playBattleCardReleaseFlightEffect({host,documentRef,flight:capture(source,{reducedMotion:mode==='static'})}),true);
    if(mode==='arrive')clone.finish.resolve();
    if(mode==='cancel')clone.finish.reject(new Error('cancelled'));
    await flushMicrotasks();assert.equal(count,1,mode);
  }
});

test('draft clear cancels the canonical flight and settles it once', async()=>{
 const {cancelBattleCardReleaseFlightEffect}=await import('../browser/battle-card-release-flight-runtime-effect.mjs');
 assert.equal(typeof cancelBattleCardReleaseFlightEffect,'function');
 const {source,clone,host,documentRef}=fixture();let settled=0,cancelled=0;
 clone.animate=()=>({finished:clone.finish.promise,cancel(){cancelled++;clone.finish.reject(new Error('cancelled'));}});
 host.__gameroadLauncherFlightSettled=()=>settled++;
 assert.equal(playBattleCardReleaseFlightEffect({host,documentRef,flight:capture(source)}),true);
 assert.equal(cancelBattleCardReleaseFlightEffect(host),true);
 assert.equal(clone.removed,true);
 assert.equal(cancelBattleCardReleaseFlightEffect(host),false);
 await flushMicrotasks();assert.equal(settled,1);assert.equal(cancelled,1);
});

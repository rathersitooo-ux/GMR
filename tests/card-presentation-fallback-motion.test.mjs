import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBattleReplayCardPresentationBridge,
  renderBattleReplayCardPresentationPlan
} from '../browser/battle-replay-live-adapter.mjs';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) { this.values.add(name); return true; }
    if (force === false) { this.values.delete(name); return false; }
    if (this.values.has(name)) { this.values.delete(name); return false; }
    this.values.add(name); return true;
  }
  contains(name) { return this.values.has(name); }
}

function fakeDocument() {
  const styles = new Map();
  const box = { dataset: {}, classList: new FakeClassList() };
  const elements = new Map([['battleResolution', box]]);
  const document = {
    head: {
      appendChild(node) {
        styles.set(node.id, node);
        elements.set(node.id, node);
      }
    },
    createElement(tag) { return { tagName: tag.toUpperCase(), id: '', textContent: '' }; },
    getElementById(id) { return elements.get(id) || null; }
  };
  return { document, box, styles };
}

const adapterSource = readFileSync(
  new URL('../browser/battle-replay-live-adapter.mjs', import.meta.url),
  'utf8'
);

test('generic fallback probe is one readable local 0.35s peak with no transform travel', () => {
  assert.match(adapterSource, /CARD_PRESENTATION_HOLD_MS = 400;/);
  assert.match(
    adapterSource,
    /animation:grCardPresentationFallbackPulse \.35s ease-out/
  );
  const keyframes = adapterSource.match(
    /@keyframes grCardPresentationFallbackPulse\{([^\n]+)\}/
  )?.[1];
  assert.ok(keyframes, 'fallback keyframes must exist');
  assert.match(keyframes, /^0%\{opacity:1;/);
  assert.match(keyframes, /36%\{opacity:1;/);
  assert.match(keyframes, /100%\{opacity:1;/);
  assert.doesNotMatch(keyframes, /transform:/);
  assert.doesNotMatch(keyframes, /opacity:\./);
  assert.doesNotMatch(keyframes, /animation-iteration-count|infinite|alternate/);
});

test('renderer applies the motion probe once, keeps it local, and cleans at 400ms', () => {
  const fake = fakeDocument();
  const timers = [];
  const plan = Object.freeze({
    presentationOnly: true,
    eventId: 'battle-resolution:9',
    visual: Object.freeze({ source: 'fallback', motion: 'allowed' })
  });
  assert.equal(renderBattleReplayCardPresentationPlan(plan, {
    document: fake.document,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return 1; }
  }), true);
  assert.equal(fake.styles.size, 1);
  const style = [...fake.styles.values()][0].textContent;
  assert.match(style, /\.35s ease-out/);
  assert.doesNotMatch(style, /position:fixed|100vw|100vh|translate[XY]?\(/i);
  assert.equal(fake.box.classList.contains('grCardPresentationFallback'), true);
  assert.equal(fake.box.classList.contains('grCardPresentationMotion'), true);
  assert.deepEqual(timers.map(timer => timer.delay), [400]);
  timers[0].callback();
  assert.equal(fake.box.classList.contains('grCardPresentationFallback'), false);
  assert.equal(fake.box.classList.contains('grCardPresentationMotion'), false);
});

test('static-only fallback keeps the same result event without motion class', () => {
  const fake = fakeDocument();
  const plan = Object.freeze({
    presentationOnly: true,
    eventId: 'battle-resolution:10',
    visual: Object.freeze({ source: 'fallback', motion: 'static_only' })
  });
  renderBattleReplayCardPresentationPlan(plan, {
    document: fake.document,
    setTimeout: () => 1
  });
  assert.equal(fake.box.dataset.cardPresentationEvent, 'battle-resolution:10');
  assert.equal(fake.box.classList.contains('grCardPresentationFallback'), true);
  assert.equal(fake.box.classList.contains('grCardPresentationMotion'), false);
});

test('accepted public serial renders once, duplicate renders zero additional plans, render failure stays fail-soft', () => {
  const plans = [];
  const bridge = createBattleReplayCardPresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderPlan: plan => plans.push(plan)
  });
  bridge.begin('M-R7');
  const first = bridge.acceptAcceptedResolution({ matchId: 'M-R7', serial: 1 });
  const duplicate = bridge.acceptAcceptedResolution({ matchId: 'M-R7', serial: 1 });
  assert.equal(first.accepted, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.plan.presentationOnly, true);
  assert.equal(first.plan.eventId, 'battle-resolution:1');
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(plans.length, 1);

  const failSoft = createBattleReplayCardPresentationBridge({
    document: null,
    matchMedia: () => ({ matches: false }),
    renderPlan: () => { throw new Error('render unavailable'); }
  });
  failSoft.begin('M-R7-FAIL');
  assert.doesNotThrow(() => {
    const result = failSoft.acceptAcceptedResolution({ matchId: 'M-R7-FAIL', serial: 1 });
    assert.equal(result.accepted, true);
  });
});

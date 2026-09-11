import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMEROAD_GAUGE_PRESENTATION,
  mountGameroadGauge,
  projectGameroadGauge
} from '../browser/gameroad-gauge-presentation.mjs';

class FakeNode {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.id = '';
    this.style = {};
  }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
    return node;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function makeGlobal() {
  const head = new FakeNode('head');
  const document = {
    head,
    createElement(tag) { return new FakeNode(tag); },
    getElementById(id) { return head.children.find(node => node.id === id) ?? null; }
  };
  return { document };
}

test('bar and ring resolve ratios only from explicit caller min/max/value', () => {
  const bar = projectGameroadGauge({ kind: 'bar', label: '進行', min: 0, max: 40, value: 10 });
  assert.equal(bar.resolved, true);
  assert.equal(bar.ratio, 0.25);
  assert.equal(bar.rangeText, '10 / 40');

  const ring = projectGameroadGauge({ kind: 'ring', min: 0, max: 1000, value: 250 });
  assert.equal(ring.resolved, true);
  assert.equal(ring.ratio, 0.25);
});

test('missing or invalid maximum fails closed without inventing a percentage', () => {
  for (const input of [
    { kind: 'bar', value: 8 },
    { kind: 'ring', min: 0, max: 0, value: 0 },
    { kind: 'bar', min: 0, max: Number.NaN, value: 2 }
  ]) {
    const model = projectGameroadGauge(input);
    assert.equal(model.resolved, false);
    assert.equal(model.ratio, null);
    assert.equal(model.rangeText, '—');
  }
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.infersUnknownMaximum, false);
});

test('range visuals clamp presentation ratio without rewriting caller value', () => {
  const over = projectGameroadGauge({ kind: 'bar', min: 0, max: 10, value: 14 });
  const under = projectGameroadGauge({ kind: 'bar', min: 0, max: 10, value: -4 });
  assert.equal(over.value, 14);
  assert.equal(over.ratio, 1);
  assert.equal(under.value, -4);
  assert.equal(under.ratio, 0);
});

test('segments require explicit total and count and preserve zero as valid', () => {
  const zero = projectGameroadGauge({ kind: 'segments', count: 0, total: 7 });
  assert.equal(zero.resolved, true);
  assert.equal(zero.segments.length, 7);
  assert.equal(zero.segments.filter(item => item.filled).length, 0);

  const partial = projectGameroadGauge({ kind: 'segments', count: 3, total: 7 });
  assert.equal(partial.ratio, 3 / 7);
  assert.equal(partial.segments.filter(item => item.filled).length, 3);

  assert.equal(projectGameroadGauge({ kind: 'segments', count: 3 }).resolved, false);
  assert.equal(projectGameroadGauge({ kind: 'segments', count: 8, total: 7 }).resolved, false);
});

test('open-ended value supports caller delta without requiring or inventing a maximum', () => {
  const model = projectGameroadGauge({ kind: 'value', label: 'ハニー', value: 24, delta: 3, deltaSource: '順位' });
  assert.equal(model.resolved, true);
  assert.equal(model.valueText, '24');
  assert.equal(model.deltaText, '+3・順位');
  assert.equal('max' in model, false);
});

test('steps and milestones preserve explicit caller state instead of deriving progression', () => {
  const steps = projectGameroadGauge({
    kind: 'steps',
    items: [
      { id: 'a', label: '開始', state: 'done' },
      { id: 'b', label: '現在', state: 'current' },
      { id: 'c', label: '次', state: 'future' }
    ]
  });
  assert.equal(steps.resolved, true);
  assert.deepEqual(steps.items.map(item => item.state), ['done', 'current', 'future']);

  const milestones = projectGameroadGauge({
    kind: 'milestones',
    items: [
      { label: 'I', state: 'done', position: 0 },
      { label: 'II', state: 'locked', position: 0.7 }
    ]
  });
  assert.equal(milestones.resolved, true);
  assert.deepEqual(milestones.items.map(item => item.position), [0, 0.7]);
  assert.equal(projectGameroadGauge({ kind: 'steps', items: [{ label: '不明', state: 'guessed' }] }).resolved, false);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.infersStepState, false);
});

test('loading supports indeterminate mode without fake percentage', () => {
  const model = projectGameroadGauge({ kind: 'loading', label: '更新', indeterminate: true });
  assert.equal(model.resolved, true);
  assert.equal(model.determinate, false);
  assert.equal(model.ratio, null);
  assert.equal(model.value, null);
});

test('projected models are deeply frozen and authority metadata stays presentation-only', () => {
  const model = projectGameroadGauge({ kind: 'segments', count: 2, total: 3 });
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.segments), true);
  assert.equal(Object.isFrozen(model.segments[0]), true);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.gameplayAuthority, false);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.gameStateWrite, false);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.resourceCalculationOwnedHere, false);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.progressionCalculationOwnedHere, false);
  assert.equal(GAMEROAD_GAUGE_PRESENTATION.imageAssetRequired, false);
});

test('runtime mounts, syncs all major shapes and does not emit aria value for unresolved range', () => {
  const global = makeGlobal();
  const host = new FakeNode('div');
  const runtime = mountGameroadGauge(global, {
    host,
    gauge: { kind: 'bar', label: 'デッキ', min: 0, max: 40, value: 20 }
  });

  assert.equal(host.children.length, 1);
  assert.equal(runtime.root.dataset.presentationOnly, 'true');
  assert.equal(runtime.root.dataset.authority, 'caller_only');
  assert.equal(runtime.root.getAttribute('role'), 'progressbar');
  assert.equal(runtime.root.getAttribute('aria-valuenow'), '20');
  assert.equal(runtime.refs().fill.style.width, '50.000%');

  runtime.sync({ kind: 'ring', label: '待機', min: 0, max: 1000, value: 500 });
  assert.match(runtime.refs().ring.style.background, /180\.000deg/);

  runtime.sync({ kind: 'bar', label: '未確定', value: 5 });
  assert.equal(runtime.root.dataset.resolved, 'false');
  assert.equal(runtime.root.getAttribute('aria-valuenow'), null);

  runtime.sync({ kind: 'loading', label: '更新', indeterminate: true, lowPerf: true });
  assert.equal(runtime.root.getAttribute('aria-busy'), 'true');
  assert.equal(runtime.root.dataset.lowPerf, 'true');
});

test('runtime injects one shared style and destroy is idempotent', () => {
  const global = makeGlobal();
  const hostA = new FakeNode('div');
  const hostB = new FakeNode('div');
  const a = mountGameroadGauge(global, { host: hostA, gauge: { kind: 'value', value: 1 } });
  const b = mountGameroadGauge(global, { host: hostB, gauge: { kind: 'value', value: 2 } });
  assert.equal(global.document.head.children.length, 1);
  assert.equal(a.destroy(), true);
  assert.equal(a.destroy(), false);
  assert.throws(() => a.sync({ kind: 'value', value: 3 }), /GAMEROAD_GAUGE_DESTROYED/);
  assert.equal(b.destroy(), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_ARCADE_CABINET_STATE,
  gachaRarityLevel,
  gachaRarityOf,
  planGachaArcadeRitual,
  ensureGachaArcadeCabinet,
  applyGachaArcadeRitualPlan,
  markGachaArcadeResultPresentation,
  settleGachaArcadeResultPresentation,
} from '../browser/gacha-opening-ritual.mjs';

test('current seven-result bundle drives presentation without mutation or reordering', () => {
  const bundle = [
    {id: 'A', rarity: 'common'},
    {id: 'B', rarity: 'rare'},
    {id: 'C', rarity: 'sr'},
    {id: 'D', rarity: 'common'},
    {id: 'E', rarity: 'ultimate'},
    {id: 'F', rarity: 'rare'},
    {id: 'G', rarity: 'common'},
  ];
  const before = structuredClone(bundle);
  const plan = planGachaArcadeRitual(bundle);

  assert.equal(plan.resultCount, 7);
  assert.equal(plan.peakRarity, 'ultimate');
  assert.equal(plan.peakIndex, 4);
  assert.equal(plan.cabinetState, GACHA_ARCADE_CABINET_STATE.RAINBOW);
  assert.equal(plan.motionMode, 'interactive');
  assert.equal(plan.interactionSteps, 4);
  assert.deepEqual(plan.stagedIndices, [2, 4]);
  assert.deepEqual(bundle, before);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.stagedIndices));
});

test('cabinet state never implies a rarity above the confirmed bundle', () => {
  assert.equal(planGachaArcadeRitual([{rarity: 'common'}, {rarity: 'rare'}]).cabinetState, 'blue');
  assert.equal(planGachaArcadeRitual([{rarity: 'common'}, {rarity: 'sr'}]).cabinetState, 'gold');
  assert.equal(planGachaArcadeRitual([{rarity: 'ultimate'}]).cabinetState, 'rainbow');
  assert.equal(planGachaArcadeRitual([{ticket: true, rarity: 'common'}]).cabinetState, 'rainbow');
});

test('reduced motion and low performance settle immediately without staged concealment', () => {
  const bundle = [{rarity: 'ultimate'}, {rarity: 'sr'}];
  const reduced = planGachaArcadeRitual(bundle, {reducedMotion: true});
  const lowPerf = planGachaArcadeRitual(bundle, {lowPerf: true});

  assert.equal(reduced.motionMode, 'still');
  assert.equal(reduced.interactionSteps, 0);
  assert.deepEqual(reduced.stagedIndices, []);
  assert.equal(lowPerf.motionMode, 'short_fade');
  assert.equal(lowPerf.interactionSteps, 0);
  assert.deepEqual(lowPerf.stagedIndices, []);
});

test('rarity parsing is presentation-only and unknown values fail soft to common', () => {
  const ticket = {ticket: true, rarity: 'common'};
  assert.equal(gachaRarityOf(ticket), 'ticket');
  assert.equal(gachaRarityLevel(ticket), 4);
  assert.equal(gachaRarityOf({rarity: 'mystery'}), 'common');
  assert.equal(gachaRarityLevel('mystery'), 0);
  assert.throws(() => planGachaArcadeRitual([]), /non-empty ordered array/);
  assert.throws(() => planGachaArcadeRitual(null), /non-empty ordered array/);
});

function fakeNode(tagName = 'div') {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    className: '',
    children: [],
    attributes: {},
    dataset: {},
    style: { values: {}, setProperty(key, value) { this.values[key] = value; } },
    classList: {
      values: new Set(),
      add(...names) { for (const name of names) this.values.add(name); },
      contains(name) { return this.values.has(name); },
    },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    prepend(child) { this.children.unshift(child); return child; },
  };
  return node;
}

function fakeGachaDocument() {
  const byId = new Map();
  const stage = fakeNode('div');
  stage.className = 'gachaStage';
  const screen = fakeNode('section');
  screen.id = 'gachaScreen';
  screen.querySelector = (selector) => selector === '.gachaStage' ? stage : null;
  const head = fakeNode('head');

  const register = (node) => {
    if (node?.id) byId.set(node.id, node);
    return node;
  };
  const wrapInsert = (owner, method) => {
    const original = owner[method].bind(owner);
    owner[method] = (...nodes) => {
      const result = original(...nodes);
      for (const node of nodes.flat()) register(node);
      return result;
    };
  };
  wrapInsert(stage, 'prepend');
  wrapInsert(stage, 'appendChild');
  wrapInsert(head, 'appendChild');
  byId.set(screen.id, screen);

  const documentSource = {
    head,
    getElementById(id) { return byId.get(id) ?? null; },
    createElement(tagName) { return fakeNode(tagName); },
  };
  return {documentSource, screen, stage, head, byId};
}

test('arcade cabinet shell mounts once and stays idle before a confirmed result bundle', () => {
  const {documentSource, stage} = fakeGachaDocument();
  const first = ensureGachaArcadeCabinet(documentSource);
  const second = ensureGachaArcadeCabinet(documentSource);

  assert.ok(first);
  assert.equal(first, second);
  assert.equal(first.id, 'gachaArcadeCabinetR2');
  assert.equal(first.attributes['data-presentation-only'], 'true');
  assert.equal(stage.attributes['data-gacha-cabinet-state'], 'idle');
  assert.equal(stage.children.filter((child) => child.id === 'gachaArcadeCabinetR2').length, 1);
});

test('confirmed result plan updates presentation attributes without creating a result', () => {
  const {documentSource, stage} = fakeGachaDocument();
  ensureGachaArcadeCabinet(documentSource);
  const bundle = [
    {id:'A', rarity:'common'}, {id:'B', rarity:'rare'}, {id:'C', rarity:'sr'},
    {id:'D', rarity:'common'}, {id:'E', rarity:'ultimate'}, {id:'F', rarity:'rare'}, {id:'G', rarity:'common'},
  ];
  const before = structuredClone(bundle);
  const plan = applyGachaArcadeRitualPlan(stage, bundle);

  assert.equal(plan.cabinetState, 'rainbow');
  assert.equal(stage.attributes['data-gacha-cabinet-state'], 'rainbow');
  assert.equal(stage.attributes['data-gacha-result-count'], '7');
  assert.equal(stage.attributes['data-gacha-motion-mode'], 'interactive');
  assert.deepEqual(bundle, before);
});

test('ordered result cards are marked in place and never reordered', () => {
  const root = fakeNode('div');
  const cards = Array.from({length: 7}, (_, index) => {
    const card = fakeNode('article');
    card.id = `card-${index}`;
    return card;
  });
  root.children.push(...cards);
  const bundle = [
    {rarity:'common'}, {rarity:'rare'}, {rarity:'sr'}, {rarity:'common'},
    {rarity:'ultimate'}, {rarity:'rare'}, {rarity:'common'},
  ];
  const before = root.children.slice();
  const result = markGachaArcadeResultPresentation(root, bundle);

  assert.deepEqual(root.children, before);
  assert.equal(result.markedCount, 7);
  assert.equal(cards[0].attributes['data-gacha-result-order'], '1');
  assert.equal(cards[6].attributes['data-gacha-result-order'], '7');
  assert.equal(cards[2].attributes['data-gacha-staged'], 'true');
  assert.equal(cards[4].attributes['data-gacha-staged'], 'true');
  assert.equal(cards[0].attributes['data-gacha-staged'], 'false');
});

test('reduced and low-perf result marking never leaves staged cards', () => {
  for (const options of [{reducedMotion:true}, {lowPerf:true}]) {
    const root = fakeNode('div');
    const cards = [fakeNode('article'), fakeNode('article')];
    root.children.push(...cards);
    markGachaArcadeResultPresentation(root, [{rarity:'ultimate'}, {rarity:'sr'}], options);
    assert.deepEqual(cards.map((card) => card.attributes['data-gacha-staged']), ['false', 'false']);
  }
});

test('skip settles presentation immediately without changing card order', () => {
  const root = fakeNode('div');
  const cards = [fakeNode('article'), fakeNode('article'), fakeNode('article')];
  root.children.push(...cards);
  cards[0].setAttribute('data-gacha-staged', 'true');
  cards[1].setAttribute('data-gacha-staged', 'false');
  cards[2].setAttribute('data-gacha-staged', 'true');
  const before = root.children.slice();

  const settled = settleGachaArcadeResultPresentation(root);

  assert.equal(settled.settledCount, 3);
  assert.deepEqual(root.children, before);
  assert.deepEqual(cards.map((card) => card.attributes['data-gacha-staged']), ['false', 'false', 'false']);
  assert.equal(root.attributes['data-gacha-presentation-state'], 'settled');
});

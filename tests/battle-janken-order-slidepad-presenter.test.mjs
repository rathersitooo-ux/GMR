import test from 'node:test';
import assert from 'node:assert/strict';

import { projectBattleJankenOrderSnapshot } from '../browser/battle-janken-order-live-adapter.mjs';
import {
  BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA,
  presentBattleJankenOrderMotionToSlidePad,
  projectBattleJankenOrderSlidePadPresentation,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

function authoritativeSnapshot() {
  return {
    publicCards: [
      { playerId: 'P1', cardId: 'C1', displayNumber: 1, hand: 'ROCK' },
      { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'SCISSORS' },
      { playerId: 'P3', cardId: 'C3', displayNumber: 3, hand: 'PAPER' },
    ],
    resolution: {
      processingOrder: ['P1', 'P2', 'P3'],
      steps: [
        { processedPlayerId: 'P1', resolvedWinner: true, winningHand: 'ROCK', invalidated: ['P2'] },
        { processedPlayerId: 'P3', resolvedWinner: false, winningHand: null, invalidated: [] },
      ],
      resolvedWinners: ['P1'],
      unresolvedSurvivors: ['P3'],
      invalidated: ['P2'],
    },
  };
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.animations = [];
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  animate(keyframes, options) {
    this.animations.push({ keyframes, options });
    return { finished: Promise.resolve() };
  }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(this, tagName); }
}

function makeHost() {
  const documentRef = new FakeDocument();
  return new FakeElement(documentRef, 'div');
}

test('projects exact authoritative order without sorting or gameplay recalculation', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const model = projectBattleJankenOrderSlidePadPresentation(projected.motion, { chain: projected.chain });

  assert.equal(model.schema, BATTLE_JANKEN_ORDER_SLIDEPAD_PRESENTER_SCHEMA);
  assert.deepEqual(model.processingOrder, ['P1', 'P2', 'P3']);
  assert.deepEqual(model.slots.map((slot) => slot.displayNumber), [1, 2, 3]);
  assert.deepEqual(model.slots.map((slot) => slot.symbol), ['✊', '✌', '✋']);
  assert.deepEqual(model.slots.map((slot) => slot.finalState), ['resolved-win', 'invalidated', 'unresolved-final']);
  assert.equal(model.presentationOnly, true);
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.gameStateWrite, false);
  assert.equal(model.orderCalculation, false);
  assert.equal(model.comparisonCalculation, false);
  assert.equal(model.winnerCalculation, false);
  assert.equal(model.targetCalculation, false);
  assert.equal(model.physicalTimingAuthority, false);
});

test('full mode renders order links and non-blocking motion cues from the supplied actions', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const host = makeHost();
  const accepted = presentBattleJankenOrderMotionToSlidePad(host, projected.motion, { chain: projected.chain });

  assert.equal(accepted, true);
  assert.equal(host.hidden, false);
  assert.equal(host.dataset.motionMode, 'full');
  assert.equal(host.dataset.gameStateWrite, 'false');
  assert.equal(host.children.length, 1);
  const rail = host.children[0];
  const items = rail.children.filter((node) => node.className === 'grJankenOrderItem');
  const arrows = rail.children.filter((node) => node.className === 'grJankenOrderArrow');
  assert.equal(items.length, 3);
  assert.equal(arrows.length, 2);
  assert.equal(items[0].dataset.finalState, 'resolved-win');
  assert.equal(items[1].dataset.finalState, 'invalidated');
  assert.match(items[0].dataset.stepActions, /0:current-pop/);
  assert.ok(items.some((item) => item.animations.length > 0));
});

test('ReducedMotion and LowPerf retain the same order and states without animated cues', () => {
  for (const options of [{ reducedMotion: true }, { lowPerf: true }]) {
    const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot(), options);
    const host = makeHost();
    const accepted = presentBattleJankenOrderMotionToSlidePad(host, projected.motion, { chain: projected.chain });
    assert.equal(accepted, true);
    assert.equal(host.dataset.motionMode, 'semantic-only');
    const items = host.children[0].children.filter((node) => node.className === 'grJankenOrderItem');
    assert.deepEqual(items.map((item) => item.dataset.finalState), ['resolved-win', 'invalidated', 'unresolved-final']);
    assert.equal(items.reduce((sum, item) => sum + item.animations.length, 0), 0);
  }
});

test('fails closed when chain order does not match the supplied motion order', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const badChain = { ...projected.chain, processingOrder: ['P2', 'P1', 'P3'] };
  assert.equal(projectBattleJankenOrderSlidePadPresentation(projected.motion, { chain: badChain }), null);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeHost(), projected.motion, { chain: badChain }), false);
});

test('presentation leaves authoritative projection untouched', () => {
  const projected = projectBattleJankenOrderSnapshot(authoritativeSnapshot());
  const beforeMotion = structuredClone(projected.motion);
  const beforeChain = structuredClone(projected.chain);
  assert.equal(presentBattleJankenOrderMotionToSlidePad(makeHost(), projected.motion, { chain: projected.chain }), true);
  assert.deepEqual(projected.motion, beforeMotion);
  assert.deepEqual(projected.chain, beforeChain);
});

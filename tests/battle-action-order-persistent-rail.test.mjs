import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_ACTION_ORDER_PERSISTENT_RAIL_CONTRACT,
  mountPersistentActionOrderRail,
  resolvePersistentRailCardArt,
} from '../browser/battle-action-order-persistent-rail.mjs';
import { createBattleActionOrderLiveBridge } from '../browser/battle-action-order-live-bridge.mjs';
import { buildBattleJankenProcessingOrderAuthoritySnapshot } from '../browser/battle-janken-processing-order-authority-adapter.mjs';
import {
  auditBattleScreenModel,
  createBattleScreenModel,
} from '../browser/battle-screen-presentation-core.mjs';

// Mirrors the live chain in GAMEROAD.html resolveBattle (F1-115): bridge,
// compare4 screen model, then the persistent rail. The HTML itself is not
// importable, so these tests prove the chain composes with live-like data.

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.src = '';
    this.alt = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  querySelector(selector) {
    if (selector === '[data-role="fanart-local-skin-overlay"]') return this.overlay ?? null;
    return null;
  }
}

function createFakeDocument(artByCardId = {}) {
  const collectionCards = Object.entries(artByCardId).map(([cardId, src]) => {
    const node = new FakeElement('div');
    node.dataset = { id: cardId };
    node.overlay = { src };
    return node;
  });
  return {
    createElement(tagName) { return new FakeElement(tagName); },
    querySelectorAll(selector) {
      return selector === '#collectionGrid [data-id]' ? collectionCards : [];
    },
  };
}

function publicCards(handForP3 = 'PAPER') {
  return [
    { playerId: 'P1', cardId: 'C1', hand: 'PAPER', printedNumber: 5, displayNumber: 5 },
    { playerId: 'P2', cardId: 'C2', hand: 'ROCK', printedNumber: 2, displayNumber: 2 },
    { playerId: 'P3', cardId: 'C3', hand: handForP3, printedNumber: 9, displayNumber: 9 },
    { playerId: 'P4', cardId: 'C4', hand: 'SCISSORS', printedNumber: 7, displayNumber: 7 },
  ];
}

function buildScreenModel(cards, winningPlayerIds = ['P2'], round = 1) {
  const snapshot = buildBattleJankenProcessingOrderAuthoritySnapshot({ publicCards: cards });
  if (!snapshot || snapshot.status !== 'RESOLVED') return null;
  const orderedCards = snapshot.processingOrder.map((id) => {
    const card = cards.find((candidate) => candidate.playerId === id);
    return {
      participantId: id,
      cardId: card.cardId,
      printedNumber: card.printedNumber,
      jankenHand: card.hand,
    };
  });
  let model = null;
  const bridge = createBattleActionOrderLiveBridge({
    readActionOrderInput: async () => ({ orderedCards, resolution: snapshot.resolution, reducedMotion: false, lowPerf: false }),
    presentActionOrder: async (presented) => { model = presented; return 'stored'; },
  });
  return bridge.sync().then((result) => {
    assert.equal(result.ok, true);
    const participants = [
      { id: 'P1', label: 'P1' },
      { id: 'P2', label: 'P2' },
      { id: 'P3', label: 'P3' },
      { id: 'P4', label: 'P4' },
    ];
    const screenModel = createBattleScreenModel({
      participants,
      plan: {
        presentationOnly: true,
        authorityBoundary: 'accepted_public_event_only',
        kind: 'compare4',
        eventId: `battle:M1:r${round}:action-order`,
        publicData: {
          playerIds: ['P1', 'P2', 'P3', 'P4'],
          winnerIds: [...winningPlayerIds],
          publicCards: cards.map((card) => ({
            playerId: card.playerId,
            cardId: card.cardId,
            displayNumber: card.displayNumber ?? null,
            hand: card.hand,
          })),
        },
      },
      actionOrder: model,
      reducedMotion: false,
      lowPerf: false,
    });
    const audit = auditBattleScreenModel(screenModel);
    assert.equal(audit.ok, true, audit.defects.join(','));
    return screenModel;
  });
}

test('snapshot draws four slots in processing order with art, number and hand', async () => {
  const document = createFakeDocument({ C2: 'https://assets.example/c2.webp' });
  const host = new FakeElement('div');
  const rail = mountPersistentActionOrderRail(document, host);
  assert.equal(rail.element.hidden, true);
  assert.equal(host.children.length, 1);
  assert.equal(rail.status().shown, false);

  const screenModel = await buildScreenModel(publicCards());
  const result = rail.sync(screenModel, 1);
  assert.equal(result.ok, true);
  assert.equal(result.shown, true);
  assert.equal(result.round, 1);
  assert.equal(rail.element.hidden, false);
  assert.equal(rail.status().shown, true);
  assert.equal(rail.status().eventId, 'battle:M1:r1:action-order');
  const chips = rail.element.children;
  assert.equal(chips.length, 4);
  // Printed-number ascending is the authoritative order.
  assert.deepEqual(chips.map((chip) => chip.dataset.playerId), ['P2', 'P1', 'P4', 'P3']);
  assert.deepEqual(chips.map((chip) => chip.dataset.cardId), ['C2', 'C1', 'C4', 'C3']);
  assert.deepEqual(chips.map((chip) => chip.dataset.sequenceIndex), ['0', '1', '2', '3']);
  assert.deepEqual(chips.map((chip) => chip.dataset.finalState), ['resolved-win', 'unresolved-final', 'invalidated', 'unresolved-final']);
  // The first chip carries the local art; the others fall back.
  const firstArt = chips[0].children.find((child) => child.className === 'grPersistentActionOrderChipArt');
  assert.equal(firstArt?.src, 'https://assets.example/c2.webp');
  assert.equal(chips[0].dataset.artSource, 'viewer_local');
  const fallback = chips[1].children.find((child) => child.className === 'grPersistentActionOrderChipFallback');
  assert.ok(fallback);
  // Meta row: order badge, number, hand label.
  const meta = chips[0].children.find((child) => child.className === 'grPersistentActionOrderChipMeta');
  assert.deepEqual(meta.children.map((child) => child.textContent), ['1', '2', 'グー']);
  const player = chips[0].children.find((child) => child.className === 'grPersistentActionOrderChipPlayer');
  assert.equal(player.textContent, 'P2');
});

test('a played card without a janken hand is not shown', () => {
  const document = createFakeDocument();
  const host = new FakeElement('div');
  const rail = mountPersistentActionOrderRail(document, host);
  // The authority adapter refuses a null hand upstream, so a snapshot with a
  // handless slot can only arrive unaudited. Hand-build that shape: the rail
  // must hide it instead of showing a partial order.
  const screenModel = {
    eventId: 'battle:M1:r1:action-order',
    lanes: [
      { id: 'P1', label: 'P1' },
      { id: 'P2', label: 'P2' },
      { id: 'P3', label: 'P3' },
      { id: 'P4', label: 'P4' },
    ],
    actionOrderChain: {
      processingOrder: ['P2', 'P1', 'P4', 'P3'],
      processedOrder: ['P2', 'P1', 'P3'],
      finalSlots: [
        { playerId: 'P2', cardId: 'C2', displayNumber: 2, hand: 'ROCK', visualState: 'resolved-win' },
        { playerId: 'P1', cardId: 'C1', displayNumber: 5, hand: 'PAPER', visualState: 'unresolved-final' },
        { playerId: 'P4', cardId: 'C4', displayNumber: 7, hand: 'SCISSORS', visualState: 'invalidated' },
        { playerId: 'P3', cardId: 'C3', displayNumber: 9, hand: null, visualState: 'unresolved-final' },
      ],
    },
  };
  const result = rail.sync(screenModel, 1);
  assert.equal(result.ok, true);
  assert.equal(result.shown, false);
  assert.equal(result.reason, 'HIDDEN_INVALID_CHAIN');
  assert.equal(rail.element.hidden, true);
  assert.equal(rail.element.children.length, 0);
});

test('a snapshot from another round is hidden, and sync(null) hides on a new round', async () => {
  const document = createFakeDocument();
  const host = new FakeElement('div');
  const rail = mountPersistentActionOrderRail(document, host);
  const screenModel = await buildScreenModel(publicCards());
  assert.equal(rail.sync(screenModel, 1).shown, true);
  const mismatch = rail.sync(screenModel, 2);
  assert.equal(mismatch.shown, false);
  assert.equal(mismatch.reason, 'HIDDEN_ROUND_MISMATCH');
  assert.equal(rail.element.hidden, true);
  assert.equal(rail.sync(screenModel, 1).shown, true);
  const hidden = rail.sync(null);
  assert.equal(hidden.shown, false);
  assert.equal(hidden.reason, 'HIDDEN_NO_SNAPSHOT');
  assert.equal(rail.element.hidden, true);
  assert.equal(rail.status().shown, false);
});

test('a screen model without an order chain is hidden', () => {
  const document = createFakeDocument();
  const host = new FakeElement('div');
  const rail = mountPersistentActionOrderRail(document, host);
  const result = rail.sync({ eventId: 'battle:M1:r1:action-order', lanes: [] }, 1);
  assert.equal(result.shown, false);
  assert.equal(result.reason, 'HIDDEN_INVALID_CHAIN');
  assert.equal(rail.element.hidden, true);
});

test('art lookup follows the mount band: local skin overlay by card id, null otherwise', () => {
  const document = createFakeDocument({ C1: 'https://assets.example/c1.webp' });
  assert.deepEqual(resolvePersistentRailCardArt(document, 'C1'), { src: 'https://assets.example/c1.webp', source: 'viewer_local' });
  assert.equal(resolvePersistentRailCardArt(document, 'C9'), null);
  assert.equal(resolvePersistentRailCardArt(document, ''), null);
  assert.equal(BATTLE_ACTION_ORDER_PERSISTENT_RAIL_CONTRACT.schema, 'gameroad.battle-action-order-persistent-rail.v1');
  assert.equal(BATTLE_ACTION_ORDER_PERSISTENT_RAIL_CONTRACT.gameStateWrite, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeckHiddenHandRegistrationSnapshot,
  withDeckHiddenHandRegistration,
} from '../browser/deck-hidden-hand-registration-core.mjs';
import {
  createNewBaseHiddenHandRuntime,
} from '../browser/new-base-hidden-hand-runtime-core.mjs';
import {
  BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA,
  mountBattleHiddenRoadJankenSlidePadIntegration,
  projectBattleHiddenRoadJankenSlidePadContext,
} from '../browser/battle-hidden-road-janken-slidepad-integration.mjs';

class FakeNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.disabled = false;
    this.textContent = '';
    this.type = '';
    this.id = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

function fakeDocument() {
  const head = new FakeNode('head');
  return {
    head,
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    getElementById(id) {
      return head.children.find((child) => child.id === id) ?? null;
    },
  };
}

function hiddenRuntime(cardId = 'HT_2') {
  const deck = withDeckHiddenHandRegistration({
    main: ['SP_A', cardId, 'DI_3'],
    ex: [],
  }, cardId);
  return createNewBaseHiddenHandRuntime(
    createDeckHiddenHandRegistrationSnapshot(deck),
  );
}

const isRoadCard = (card) => card?.kind === 'ROAD';

test('projection composes hidden authority with current Road Janken membership only', () => {
  const runtime = hiddenRuntime();
  const projected = projectBattleHiddenRoadJankenSlidePadContext({
    hiddenRuntime: runtime,
    roadJankenCards: [
      { id: 'A', kind: 'BATTLE' },
      { id: 'B', kind: 'BATTLE' },
      { id: 'C', kind: 'BATTLE' },
    ],
    isRoadCard,
    stageAvailable: true,
  });

  assert.deepEqual(projected, {
    reservedCardId: 'HT_2',
    hiddenPrivilegeAvailable: true,
    roadJankenCardPresent: false,
    stageAvailable: true,
  });
  assert.equal(Object.isFrozen(projected), true);
  assert.equal('jankenHand' in projected, false);
  assert.equal('fourthHand' in projected, false);
  assert.equal('cardClone' in projected, false);
});

test('projection sees an existing Road card and leaves disable semantics to the existing add control', () => {
  const projected = projectBattleHiddenRoadJankenSlidePadContext({
    hiddenRuntime: hiddenRuntime(),
    roadJankenCards: [
      { id: 'A', kind: 'BATTLE' },
      { id: 'ROAD_1', kind: 'ROAD' },
      { id: 'C', kind: 'BATTLE' },
    ],
    isRoadCard,
  });

  assert.equal(projected.roadJankenCardPresent, true);
});

test('mounted bridge delegates the exact reserved physical card and re-derives gray state from existing membership', async () => {
  const document = fakeDocument();
  const host = new FakeNode('div');
  const runtime = hiddenRuntime();
  const cards = [
    { id: 'A', kind: 'BATTLE' },
    { id: 'B', kind: 'BATTLE' },
    { id: 'C', kind: 'BATTLE' },
  ];
  const staged = [];

  const integration = mountBattleHiddenRoadJankenSlidePadIntegration({
    document,
    host,
    readHiddenRuntime: () => runtime,
    readRoadJankenCards: () => cards,
    isRoadCard,
    stageReservedRoad: async (cardId) => {
      staged.push(cardId);
      cards.push({ id: cardId, kind: 'ROAD' });
      return true;
    },
  });

  assert.equal(integration.schema, BATTLE_HIDDEN_ROAD_JANKEN_SLIDEPAD_INTEGRATION_SCHEMA);
  assert.equal(integration.snapshot().enabled, true);
  assert.equal(integration.control.button.dataset.visualState, 'deep-lemon-gummy-gold');

  const accepted = await integration.control.activate({ preventDefault() {} });
  assert.equal(accepted, true);
  assert.deepEqual(staged, ['HT_2']);
  assert.equal(integration.snapshot().enabled, false);
  assert.equal(integration.snapshot().disabledReason, 'road-card-already-present');
  assert.equal(integration.control.button.dataset.visualState, 'gray');
  assert.equal(runtime.hiddenPrivilegeAvailable, true, 'staging must not consume hidden privilege');
  assert.equal(cards.filter((card) => card.id === 'HT_2').length, 1, 'bridge must not clone the reserved card itself');
});

test('rejected existing stage does not invent local membership or consume privilege', async () => {
  const document = fakeDocument();
  const host = new FakeNode('div');
  const runtime = hiddenRuntime();
  const cards = [
    { id: 'A', kind: 'BATTLE' },
    { id: 'B', kind: 'BATTLE' },
    { id: 'C', kind: 'BATTLE' },
  ];

  const integration = mountBattleHiddenRoadJankenSlidePadIntegration({
    document,
    host,
    readHiddenRuntime: () => runtime,
    readRoadJankenCards: () => cards,
    isRoadCard,
    stageReservedRoad: async () => false,
  });

  assert.equal(await integration.control.activate({ preventDefault() {} }), false);
  assert.equal(integration.snapshot().enabled, true);
  assert.equal(integration.snapshot().cardId, 'HT_2');
  assert.equal(runtime.hiddenPrivilegeAvailable, true);
  assert.equal(cards.length, 3);
});

test('stage availability and malformed authority fail closed instead of creating fallback state', () => {
  const document = fakeDocument();
  const host = new FakeNode('div');
  let runtime = hiddenRuntime();
  let stageAvailable = false;

  const integration = mountBattleHiddenRoadJankenSlidePadIntegration({
    document,
    host,
    readHiddenRuntime: () => runtime,
    readRoadJankenCards: () => [],
    isRoadCard,
    stageReservedRoad: async () => true,
    readStageAvailable: () => stageAvailable,
  });

  assert.equal(integration.snapshot().enabled, false);
  assert.equal(integration.snapshot().disabledReason, 'road-stage-unavailable');

  stageAvailable = true;
  integration.sync();
  assert.equal(integration.snapshot().enabled, true);

  runtime = null;
  integration.sync();
  assert.equal(integration.snapshot().enabled, false);
  assert.equal(integration.snapshot().disabledReason, 'hidden-privilege-unavailable');
});

test('destroy removes only the mounted control and owns no external state', () => {
  const document = fakeDocument();
  const host = new FakeNode('div');
  const integration = mountBattleHiddenRoadJankenSlidePadIntegration({
    document,
    host,
    readHiddenRuntime: () => hiddenRuntime(),
    readRoadJankenCards: () => [],
    isRoadCard,
    stageReservedRoad: async () => true,
  });

  assert.equal(host.children.length, 1);
  integration.destroy();
  assert.equal(host.children.length, 0);
});

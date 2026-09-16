import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_CARD_ZONE_LIVE_CONSUMER,
  BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
  mountBattleCardZoneLiveConsumer,
} from '../browser/battle-card-zone-live-consumer.mjs';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.type = '';
    this.textContent = '';
    this.onclick = null;
    this.attributes = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function fullSnapshot(overrides = {}) {
  return {
    viewerSafe: true,
    zoneId: 'battle-zone:self:graveyard',
    generation: 'match-21:turn-4:rev-1',
    permissions: { count: true, recent: true, list: true, detail: true },
    count: 3,
    recentCardId: 'CARD-C',
    cardIds: ['CARD-A', 'CARD-B', 'CARD-C'],
    ...overrides,
  };
}

function createConsumer(provider, overrides = {}) {
  const document = new FakeDocument();
  const host = document.createElement('div');
  const details = [];
  const consumer = mountBattleCardZoneLiveConsumer({
    document,
    host,
    getAuthorizedSnapshot: provider,
    onCardDetailRequest: (cardId) => details.push(cardId),
    ...overrides,
  });
  return { document, host, consumer, details };
}

test('contract is presentation-only and explicitly refuses raw live-state derivation', () => {
  assert.equal(BATTLE_CARD_ZONE_LIVE_CONSUMER.schema, BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA);
  assert.equal(BATTLE_CARD_ZONE_LIVE_CONSUMER.rawStateDerivation, false);
  assert.equal(BATTLE_CARD_ZONE_LIVE_CONSUMER.zoneStateWrite, false);
  assert.equal(BATTLE_CARD_ZONE_LIVE_CONSUMER.gameplayAuthority, false);
  assert.equal(BATTLE_CARD_ZONE_LIVE_CONSUMER.gameStateWrite, false);

  const { consumer } = createConsumer(() => fullSnapshot());
  assert.equal(consumer.presentationOnly, true);
  assert.equal(consumer.gameplayAuthority, false);
  assert.equal(consumer.gameStateWrite, false);
  assert.equal(consumer.rawStateDerivation, false);
});

test('authorized snapshot renders count/recent/list and exact authorized detail handoff', () => {
  const context = { revision: 'live-r4', opaqueState: { shouldNotBeRead: true } };
  let receivedContext = null;
  const { consumer, details } = createConsumer((input) => {
    receivedContext = input;
    return fullSnapshot();
  });

  const receipt = consumer.sync(context);
  assert.equal(receivedContext, context);
  assert.deepEqual(receipt, {
    ok: true,
    status: 'rendered',
    schema: BATTLE_CARD_ZONE_LIVE_CONSUMER_SCHEMA,
    zoneId: 'battle-zone:self:graveyard',
    generation: 'match-21:turn-4:rev-1',
    countVisible: true,
    recentVisible: true,
    listVisible: true,
    detailEnabled: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
  assert.equal(consumer.surface.entryButton.textContent, '墓地 3');
  assert.equal(consumer.surface.recent.textContent, '直近 CARD-C');
  assert.deepEqual(
    consumer.surface.list.children.map((item) => item.textContent),
    ['CARD-A', 'CARD-B', 'CARD-C'],
  );
  assert.equal(consumer.surface.list.children[1].onclick(), true);
  assert.deepEqual(details, ['CARD-B']);
});

test('count-only authorization cannot escalate into list, recent, or detail access', () => {
  const { consumer, details } = createConsumer(() => fullSnapshot({
    permissions: { count: true, recent: false, list: false, detail: false },
    count: 7,
    recentCardId: 'PRIVATE-RECENT',
    cardIds: ['PRIVATE-A', 'PRIVATE-B'],
  }));

  const receipt = consumer.sync({});
  assert.equal(receipt.ok, true);
  assert.equal(receipt.countVisible, true);
  assert.equal(receipt.recentVisible, false);
  assert.equal(receipt.listVisible, false);
  assert.equal(receipt.detailEnabled, false);
  assert.equal(consumer.surface.entryButton.textContent, '墓地 7');
  assert.equal(consumer.surface.recent.hidden, true);
  assert.equal(consumer.surface.recent.textContent, '');
  assert.equal(consumer.surface.list.children.length, 0);
  assert.deepEqual(details, []);
});

test('provider error fails closed and clears previously visible card-zone content', () => {
  let fail = false;
  const { consumer } = createConsumer(() => {
    if (fail) throw new Error('upstream unavailable');
    return fullSnapshot();
  });

  assert.equal(consumer.sync({}).ok, true);
  consumer.surface.entryButton.onclick();
  assert.equal(consumer.surface.panel.hidden, false);
  assert.equal(consumer.surface.list.children.length, 3);

  fail = true;
  const receipt = consumer.sync({});
  assert.equal(receipt.ok, false);
  assert.equal(receipt.reason, 'AUTHORIZED_SNAPSHOT_PROVIDER_ERROR');
  assert.equal(consumer.surface.root.hidden, true);
  assert.equal(consumer.surface.panel.hidden, true);
  assert.equal(consumer.surface.list.children.length, 0);
  assert.equal(consumer.surface.recent.textContent, '');
});

test('unsafe snapshot and raw live player state are not interpreted as a graveyard', () => {
  const rawLiveState = {
    match: {
      players: [{
        id: 'P1',
        deck: ['DECK-A'],
        hand: ['HAND-A'],
        shields: ['S1'],
        chip: ['CHIP-A'],
        lanes: [[], [], []],
        graveyard: ['DO-NOT-INFER-THIS'],
      }],
    },
  };
  let supplied = rawLiveState;
  const { consumer } = createConsumer(() => supplied);

  const rawReceipt = consumer.sync(rawLiveState);
  assert.equal(rawReceipt.ok, false);
  assert.equal(rawReceipt.reason, 'AUTHORIZED_VIEWER_SAFE_SNAPSHOT_UNAVAILABLE');
  assert.equal(consumer.surface.root.hidden, true);
  assert.equal(consumer.surface.list.children.length, 0);

  supplied = fullSnapshot({ viewerSafe: false });
  const unsafeReceipt = consumer.sync(rawLiveState);
  assert.equal(unsafeReceipt.ok, false);
  assert.equal(unsafeReceipt.reason, 'AUTHORIZED_VIEWER_SAFE_SNAPSHOT_UNAVAILABLE');
  assert.equal(consumer.surface.root.hidden, true);
  assert.equal(consumer.surface.list.children.length, 0);
});

test('new authorized generation replaces prior visible snapshot without retaining stale cards', () => {
  let snapshot = fullSnapshot();
  const { consumer } = createConsumer(() => snapshot);

  assert.equal(consumer.sync({}).generation, 'match-21:turn-4:rev-1');
  assert.deepEqual(
    consumer.surface.list.children.map((item) => item.textContent),
    ['CARD-A', 'CARD-B', 'CARD-C'],
  );

  snapshot = fullSnapshot({
    generation: 'match-21:turn-5:rev-1',
    count: 1,
    recentCardId: 'CARD-Z',
    cardIds: ['CARD-Z'],
  });
  const receipt = consumer.sync({});
  assert.equal(receipt.generation, 'match-21:turn-5:rev-1');
  assert.equal(consumer.surface.entryButton.textContent, '墓地 1');
  assert.equal(consumer.surface.recent.textContent, '直近 CARD-Z');
  assert.deepEqual(
    consumer.surface.list.children.map((item) => item.textContent),
    ['CARD-Z'],
  );
});

test('destroy removes the surface and later sync remains inert and hidden', () => {
  const { host, consumer } = createConsumer(() => fullSnapshot());
  assert.equal(consumer.sync({}).ok, true);
  assert.equal(host.children.length, 1);
  consumer.destroy();
  assert.equal(host.children.length, 0);
  const receipt = consumer.sync({});
  assert.equal(receipt.ok, false);
  assert.equal(receipt.reason, 'CONSUMER_DESTROYED');
});

test('snapshot provider is mandatory so no implicit live-state inference path exists', () => {
  const document = new FakeDocument();
  const host = document.createElement('div');
  assert.throws(
    () => mountBattleCardZoneLiveConsumer({ document, host }),
    /getAuthorizedSnapshot must be a function/,
  );
});

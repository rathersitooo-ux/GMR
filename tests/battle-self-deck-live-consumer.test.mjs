import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_SELF_DECK_LIVE_CONSUMER,
  renderOwnerSelfRemainingDeckFromLiveState
} from '../browser/battle-self-deck-live-consumer.mjs';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.textContent = '';
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  querySelector(selector) {
    if (selector !== '[data-battle-remaining-deck]') return null;
    return this.children.find(child => child.attributes?.has('data-battle-remaining-deck')) || null;
  }
}

function fakeDocument({ includeHost = true } = {}) {
  const host = includeHost ? new FakeElement('div') : null;
  return {
    host,
    createElement(tagName) { return new FakeElement(tagName); },
    getElementById(id) { return id === 'battleLog' ? host : null; }
  };
}

function stateWithOwnerDeck(deck, opponent = { id: 'P2', human: false, deck: ['OPPONENT-SECRET'] }) {
  return {
    match: {
      id: 'MATCH-LIVE-CONSUMER-1',
      players: [
        { id: 'P1', human: true, deck: [...deck] },
        opponent,
        { id: 'P3', human: false, deck: [] },
        { id: 'P4', human: false, deck: [] }
      ]
    }
  };
}

const ownerViewer = Object.freeze({ authenticated: true, id: 'P1' });

test('explicit invocation renders local owner remaining composition into existing battleLog presentation', () => {
  const document = fakeDocument();
  const state = stateWithOwnerDeck(['CARD-B', 'CARD-A', 'CARD-A']);
  const before = JSON.stringify(state);

  const result = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 12,
    document,
    cardLabel: cardId => ({ 'CARD-A': '森の札', 'CARD-B': '音の札' }[cardId] || cardId)
  });

  assert.deepEqual(result, {
    ok: true,
    status: 'rendered',
    schema: 'gameroad.battle-self-deck-live-consumer.v1',
    authority: 'EXISTING_LOCAL_OWNER_MATCH_PLAYER_DECK',
    orderHidden: true,
    opponentDeckRead: true,
    gameStateWrite: true,
    total: 3,
    knownCount: 3,
    unknownCount: 0,
    revision: 12
  });
  assert.equal(JSON.stringify(state), before);

  const root = document.host.querySelector('[data-battle-remaining-deck]');
  assert.ok(root);
  assert.equal(root.attributes.get('data-battle-remaining-deck-total'), '3');
  assert.equal(root.attributes.get('data-battle-remaining-deck-unknown'), '0');
  assert.equal(root.attributes.get('data-battle-remaining-deck-revision'), '12');
  assert.deepEqual(root.children.map(child => child.textContent), [
    '残りデッキ 3枚',
    '判明: 森の札×2 / 音の札×1',
    '不明: 0枚'
  ]);
});

test('consumer never reads opponent deck and hides gameplay deck order', () => {
  const opponent = { id: 'P2', human: false };
  Object.defineProperty(opponent, 'deck', {
    enumerable: true,
    get() { throw new Error('OPPONENT_DECK_MUST_NOT_BE_READ'); }
  });

  const firstDocument = fakeDocument();
  const secondDocument = fakeDocument();
  const first = renderOwnerSelfRemainingDeckFromLiveState({
    state: stateWithOwnerDeck(['CARD-C', 'CARD-A', 'CARD-B', 'CARD-A'], opponent),
    viewer: ownerViewer,
    revision: 4,
    document: firstDocument
  });
  const second = renderOwnerSelfRemainingDeckFromLiveState({
    state: stateWithOwnerDeck(['CARD-A', 'CARD-B', 'CARD-A', 'CARD-C'], opponent),
    viewer: ownerViewer,
    revision: 4,
    document: secondDocument
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const firstRoot = firstDocument.host.querySelector('[data-battle-remaining-deck]');
  const secondRoot = secondDocument.host.querySelector('[data-battle-remaining-deck]');
  assert.deepEqual(firstRoot.children.map(child => child.textContent), secondRoot.children.map(child => child.textContent));
});

test('non-owner viewer fails closed without touching the Battle host', () => {
  const document = fakeDocument();
  const result = renderOwnerSelfRemainingDeckFromLiveState({
    state: stateWithOwnerDeck(['SELF-SECRET-A', 'SELF-SECRET-B']),
    viewer: { authenticated: true, id: 'P2' },
    revision: 3,
    document
  });

  assert.deepEqual(result, {
    ok: false,
    status: 'unavailable',
    reason: 'VIEWER_NOT_LOCAL_OWNER'
  });
  assert.equal(document.host.children.length, 0);
  assert.equal(JSON.stringify(result).includes('SELF-SECRET'), false);
});

test('missing existing Battle render host fails closed instead of creating a second surface', () => {
  const result = renderOwnerSelfRemainingDeckFromLiveState({
    state: stateWithOwnerDeck(['CARD-A']),
    viewer: ownerViewer,
    revision: 1,
    document: fakeDocument({ includeHost: false })
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'REMAINING_DECK_RENDER_TARGET_UNAVAILABLE');
});

test('published consumer contract is on-demand composition with zero new gameplay authority', () => {
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.invocation, 'explicit_on_demand_only');
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.defaultHostId, 'battleLog');
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.orderHidden, true);
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.opponentDeckRead, false);
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.gameStateWrite, false);
});

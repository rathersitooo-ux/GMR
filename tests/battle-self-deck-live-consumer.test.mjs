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
    this.hidden = false;
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

function rootTexts(document) {
  const root = document.host?.querySelector('[data-battle-remaining-deck]');
  return root ? root.children.map(child => child.textContent) : null;
}

test('renders owner-only remaining composition through the existing Battle log surface', () => {
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
    opponentDeckRead: false,
    gameStateWrite: false,
    total: 3,
    knownCount: 3,
    unknownCount: 0,
    revision: 12
  });
  assert.equal(JSON.stringify(state), before);

  const root = document.host.querySelector('[data-battle-remaining-deck]');
  assert.ok(root);
  assert.equal(root.hidden, false);
  assert.equal(root.attributes.get('aria-hidden'), 'false');
  assert.equal(root.attributes.get('data-battle-remaining-deck-total'), '3');
  assert.equal(root.attributes.get('data-battle-remaining-deck-unknown'), '0');
  assert.equal(root.attributes.get('data-battle-remaining-deck-revision'), '12');
  assert.deepEqual(rootTexts(document), [
    '残りデッキ 3枚',
    '判明: 森の札×2 / 音の札×1',
    '不明: 0枚'
  ]);
});

test('same multiset in a different gameplay deck order renders identically and never reads opponent deck', () => {
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
  assert.equal(first.opponentDeckRead, false);
  assert.equal(second.opponentDeckRead, false);
  assert.deepEqual(rootTexts(firstDocument), rootTexts(secondDocument));
});

test('unauthenticated and non-owner viewers fail closed without leaking self-deck identities', () => {
  for (const viewer of [
    { authenticated: false, id: 'P1' },
    { authenticated: true, id: 'P2' }
  ]) {
    const document = fakeDocument();
    const result = renderOwnerSelfRemainingDeckFromLiveState({
      state: stateWithOwnerDeck(['SELF-SECRET-A', 'SELF-SECRET-B']),
      viewer,
      revision: 3,
      document
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'unavailable');
    assert.equal(document.host.children.length, 0);
    assert.equal(JSON.stringify(result).includes('SELF-SECRET'), false);
  }
});

test('authorization failure conceals stale owner presentation and a later valid read can reveal current state again', () => {
  const document = fakeDocument();
  const state = stateWithOwnerDeck(['CARD-A', 'CARD-B']);

  assert.equal(renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 1,
    document
  }).ok, true);

  const root = document.host.querySelector('[data-battle-remaining-deck]');
  assert.equal(root.hidden, false);
  assert.equal(root.children.length, 3);

  const denied = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: { authenticated: true, id: 'P2' },
    revision: 2,
    document
  });
  assert.equal(denied.ok, false);
  assert.equal(root.hidden, true);
  assert.equal(root.attributes.get('aria-hidden'), 'true');
  assert.equal(root.children.length, 0);

  state.match.players[0].deck = ['CARD-C'];
  const restored = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 3,
    document
  });
  assert.equal(restored.ok, true);
  assert.equal(root.hidden, false);
  assert.equal(root.attributes.get('aria-hidden'), 'false');
  assert.deepEqual(rootTexts(document), [
    '残りデッキ 1枚',
    '判明: CARD-C×1',
    '不明: 0枚'
  ]);
});

test('each invocation re-reads the current live deck instead of freezing a second deck store', () => {
  const document = fakeDocument();
  const state = stateWithOwnerDeck(['CARD-A', 'CARD-A', 'CARD-B']);

  const first = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 10,
    document
  });
  assert.equal(first.total, 3);
  assert.deepEqual(rootTexts(document), [
    '残りデッキ 3枚',
    '判明: CARD-A×2 / CARD-B×1',
    '不明: 0枚'
  ]);

  state.match.players[0].deck.splice(0, 2, 'CARD-C');
  const second = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 11,
    document
  });
  assert.equal(second.total, 2);
  assert.equal(second.revision, 11);
  assert.deepEqual(rootTexts(document), [
    '残りデッキ 2枚',
    '判明: CARD-B×1 / CARD-C×1',
    '不明: 0枚'
  ]);
});

test('empty owner deck is a valid current state and renders zero without inventing refill semantics', () => {
  const document = fakeDocument();
  const result = renderOwnerSelfRemainingDeckFromLiveState({
    state: stateWithOwnerDeck([]),
    viewer: ownerViewer,
    revision: 20,
    document
  });

  assert.equal(result.ok, true);
  assert.equal(result.total, 0);
  assert.equal(result.knownCount, 0);
  assert.equal(result.unknownCount, 0);
  assert.deepEqual(rootTexts(document), [
    '残りデッキ 0枚',
    '判明: 0枚',
    '不明: 0枚'
  ]);
});

test('missing render host and renderer exceptions fail closed without game-state writes', () => {
  const state = stateWithOwnerDeck(['CARD-A']);
  const before = JSON.stringify(state);
  const missingHost = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 1,
    document: fakeDocument({ includeHost: false })
  });
  assert.deepEqual(missingHost, {
    ok: false,
    status: 'unavailable',
    reason: 'REMAINING_DECK_RENDER_TARGET_UNAVAILABLE'
  });

  const document = fakeDocument();
  const renderError = renderOwnerSelfRemainingDeckFromLiveState({
    state,
    viewer: ownerViewer,
    revision: 2,
    document,
    cardLabel() { throw new Error('LABEL_RENDER_FAIL'); }
  });
  assert.deepEqual(renderError, {
    ok: false,
    status: 'unavailable',
    reason: 'REMAINING_DECK_RENDER_ERROR'
  });
  const root = document.host.querySelector('[data-battle-remaining-deck]');
  assert.ok(root);
  assert.equal(root.hidden, true);
  assert.equal(root.children.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test('published consumer contract remains explicit, owner-safe and authority-free', () => {
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.invocation, 'explicit_on_demand_only');
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.defaultHostId, 'battleLog');
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.stalePresentationPolicy, 'conceal_on_unavailable');
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.orderHidden, true);
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.opponentDeckRead, false);
  assert.equal(BATTLE_SELF_DECK_LIVE_CONSUMER.gameStateWrite, false);
});

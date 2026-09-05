import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CARDS_DECK_FINDABILITY_CONTRACT,
  applyCardsDeckFindability,
  shouldOfferCardsDeckFindabilityReset,
} from '../browser/cards-deck-presentation.mjs';

function card(id, label, inDeck = false) {
  return {
    dataset: { id },
    textContent: label,
    hidden: false,
    classList: { contains: (name) => name === 'inDeck' && inDeck },
    getAttribute: () => label,
  };
}

test('zero-result escape stays inside current findability presentation authority', () => {
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.zeroResultEscape, 'clear-current-findability-only');
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.persistence, 'none');
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.mutatesDeck, false);
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.mutatesOwnership, false);
});

test('reset is offered only when existing cards are hidden by an active restriction', () => {
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 2, visible: 0, query: 'zzz' }), true);
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 2, visible: 0, deckFilter: 'in-deck' }), true);
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 2, visible: 0, favoriteOnly: true }), true);
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 2, visible: 1, query: 'spade' }), false);
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 0, visible: 0, query: 'spade' }), false);
  assert.equal(shouldOfferCardsDeckFindabilityReset({ total: 2, visible: 0 }), false);
});

test('clearing current restrictions restores the existing Collection projection', () => {
  const cards = [card('SP_A', 'Spade A', true), card('HT_A', 'ハートA', false)];
  const doc = { querySelectorAll: (selector) => selector === '#collectionGrid [data-id]' ? cards : [] };

  const blocked = applyCardsDeckFindability({
    document: doc,
    query: '存在しないカード',
    deckFilter: 'in-deck',
    favoriteOnly: true,
    favoriteIds: ['SP_A'],
  });
  assert.equal(blocked.visible, 0);
  assert.equal(shouldOfferCardsDeckFindabilityReset(blocked), true);

  const restored = applyCardsDeckFindability({
    document: doc,
    query: '',
    deckFilter: 'all',
    favoriteOnly: false,
    favoriteIds: ['SP_A'],
  });
  assert.deepEqual(restored, {
    total: 2,
    visible: 2,
    query: '',
    deckFilter: 'all',
    favoriteOnly: false,
  });
  assert.equal(cards.every((entry) => entry.hidden === false), true);
});

test('live reset handler clears only query and filter toggles, preserving favorite data and selection', async () => {
  const source = await readFile(new URL('../browser/cards-deck-presentation.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('const onReset = () => {');
  const end = source.indexOf('const onCollectionSelect =', start);
  const handler = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.ok(source.includes("resetButton.dataset.role = 'cards-deck-findability-reset'"));
  assert.ok(source.includes('resetButton.hidden = !shouldOfferCardsDeckFindabilityReset(result)'));
  assert.ok(handler.includes("input.value = '';"));
  assert.ok(handler.includes("deckFilter = 'all';"));
  assert.ok(handler.includes('favoriteOnly = false;'));
  assert.equal(handler.includes('favoriteIds ='), false);
  assert.equal(handler.includes('selectedCardId ='), false);
  assert.equal(handler.includes('writeCardsFavoriteIdsToStorage'), false);
});

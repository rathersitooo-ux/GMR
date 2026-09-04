import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS_DECK_FINDABILITY_CONTRACT,
  normalizeCardsDeckSearchQuery,
  matchCardsDeckFindabilityCard,
  applyCardsDeckFindability,
  installCardsDeckFindability,
} from '../browser/cards-deck-presentation.mjs';

test('findability contract stays minimal and does not own card/deck/ownership state', () => {
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.schema, 'gameroad.cards-deck-findability.v1');
  assert.deepEqual(CARDS_DECK_FINDABILITY_CONTRACT.searchFields, ['cardId', 'accessible-visible-text']);
  assert.deepEqual(CARDS_DECK_FINDABILITY_CONTRACT.quickFilters, ['in-deck', 'not-in-deck']);
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.quickFilterCount, 2);
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.persistence, 'none');
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.ownsCardData, false);
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.mutatesDeck, false);
  assert.equal(CARDS_DECK_FINDABILITY_CONTRACT.mutatesOwnership, false);
});

test('search normalizes width/case and matches current visible text or canonical card id', () => {
  assert.equal(normalizeCardsDeckSearchQuery('  ＳＰ＿Ａ  '), 'sp_a');
  assert.equal(matchCardsDeckFindabilityCard(
    { cardId: 'SP_A', text: 'Spade A 詳細を開く', inDeck: false },
    { query: 'ｓｐ＿ａ', deckFilter: 'all' },
  ), true);
  assert.equal(matchCardsDeckFindabilityCard(
    { cardId: 'DCG_SAASUNA', text: 'サースナー 詳細を開く', inDeck: true },
    { query: 'サースナー', deckFilter: 'all' },
  ), true);
  assert.equal(matchCardsDeckFindabilityCard(
    { cardId: 'HT_7', text: 'ハート7', inDeck: false },
    { query: 'サースナー', deckFilter: 'all' },
  ), false);
});

test('two quick filters are exclusive deck-membership views and unknown state fails open to all', () => {
  const inDeck = { cardId: 'SP_A', text: 'Spade A', inDeck: true };
  const outDeck = { cardId: 'HT_A', text: 'ハートA', inDeck: false };
  assert.equal(matchCardsDeckFindabilityCard(inDeck, { deckFilter: 'in-deck' }), true);
  assert.equal(matchCardsDeckFindabilityCard(outDeck, { deckFilter: 'in-deck' }), false);
  assert.equal(matchCardsDeckFindabilityCard(inDeck, { deckFilter: 'not-in-deck' }), false);
  assert.equal(matchCardsDeckFindabilityCard(outDeck, { deckFilter: 'not-in-deck' }), true);
  assert.equal(matchCardsDeckFindabilityCard(inDeck, { deckFilter: 'corrupt-state' }), true);
  assert.equal(matchCardsDeckFindabilityCard(outDeck, { deckFilter: 'corrupt-state' }), true);
});

test('search/filter application changes only collection visibility', () => {
  const cards = [
    { dataset: { id: 'SP_A' }, textContent: 'Spade A', hidden: false, classList: { contains: () => true }, getAttribute: () => 'Spade A 札組登録済み' },
    { dataset: { id: 'HT_A' }, textContent: 'ハートA', hidden: false, classList: { contains: () => false }, getAttribute: () => 'ハートA 詳細を開く' },
  ];
  const doc = { querySelectorAll: (selector) => selector === '#collectionGrid [data-id]' ? cards : [] };
  const result = applyCardsDeckFindability({ document: doc, query: 'spade', deckFilter: 'in-deck' });
  assert.deepEqual(result, { total: 2, visible: 1, query: 'spade', deckFilter: 'in-deck' });
  assert.equal(cards[0].hidden, false);
  assert.equal(cards[1].hidden, true);
});

test('findability mount fails closed when Cards screen is unavailable', () => {
  const installation = installCardsDeckFindability({ document: null, window: null });
  assert.equal(typeof installation.destroy, 'function');
  assert.doesNotThrow(() => installation.destroy());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARDS_DECK_PRESENTATION,
  deriveCardsDeckPresentation,
} from '../browser/cards-deck-presentation.mjs';

function derive(overrides = {}) {
  return deriveCardsDeckPresentation({
    surface: 'collection',
    viewport: { width: 1280, height: 720 },
    preferences: {},
    selectedCardId: 'CARD-1',
    deck: {
      deckId: 'DECK-1',
      label: 'Deck 1',
      total: 40,
      typeCount: 40,
      dirty: false,
      saveStatus: 'idle',
      revision: 7,
    },
    ...overrides,
  });
}

test('schema exposes only presentation surfaces and known save display states', () => {
  assert.equal(CARDS_DECK_PRESENTATION.schema, 'gameroad.cards-deck-presentation.v1');
  assert.deepEqual(CARDS_DECK_PRESENTATION.surfaces, [
    'collection',
    'deck_editor',
    'card_detail',
    'rare_viewer',
  ]);
  assert.deepEqual(CARDS_DECK_PRESENTATION.saveStatuses, [
    'idle',
    'dirty',
    'pending',
    'acknowledged',
    'rejected',
    'timeout',
  ]);
});

test('collection and deck editor adapt across landscape, short landscape, and portrait', () => {
  const landscape = derive().presentation;
  const short = derive({ viewport: { width: 667, height: 375 } }).presentation;
  const portrait = derive({ viewport: { width: 390, height: 844 } }).presentation;

  assert.equal(landscape.layout.mode, 'split_landscape');
  assert.equal(landscape.layout.collectionFraction, 0.74);
  assert.equal(landscape.layout.deckRailFraction, 0.26);
  assert.equal(short.layout.mode, 'split_short_landscape');
  assert.equal(short.layout.collectionFraction, 0.66);
  assert.equal(short.layout.deckRailFraction, 0.34);
  assert.equal(portrait.layout.mode, 'stacked');
  assert.equal(portrait.viewport.mode, 'portrait');
});

test('detail and rare viewer are dismissible reading states that restore selection context', () => {
  for (const surface of ['card_detail', 'rare_viewer']) {
    const value = derive({ surface }).presentation;
    assert.equal(value.interaction.preserveSelectionOnClose, true);
    assert.equal(value.interaction.outsideDismiss, true);
    assert.equal(value.interaction.rightFlickAddOwnedByRuntime, false);
    assert.equal(value.interaction.saveOwnedByRuntime, false);
    assert.equal(value.motion, 'settled_static_after_entry');
  }
});

test('right-flick add and save are declared as external runtime responsibilities, not executed here', () => {
  const collection = derive({ surface: 'collection' }).presentation;
  const editor = derive({ surface: 'deck_editor' }).presentation;

  assert.equal(collection.interaction.rightFlickAddOwnedByRuntime, true);
  assert.equal(collection.interaction.saveOwnedByRuntime, false);
  assert.equal(editor.interaction.rightFlickAddOwnedByRuntime, true);
  assert.equal(editor.interaction.saveOwnedByRuntime, true);

  for (const value of [collection, editor]) {
    assert.equal(value.presentationOnly, true);
    assert.deepEqual(value.authority, {
      deckRules: 'external',
      saveAck: 'external',
      ownership: 'external',
      cardRules: 'external',
      formalAssetAcceptance: 'external',
    });
  }
});

test('only formally accepted assets are projected as formal visuals', () => {
  const formal = derive({ cardAsset: { status: 'formal', assetId: 'ASSET-1' } }).presentation.cardVisual;
  const candidate = derive({ cardAsset: { status: 'candidate', assetId: 'ASSET-2' } }).presentation.cardVisual;
  const malformed = derive({ cardAsset: { status: 'formal', assetId: '' } }).presentation.cardVisual;

  assert.deepEqual(formal, { source: 'formal', assetId: 'ASSET-1' });
  assert.deepEqual(candidate, { source: 'fallback' });
  assert.deepEqual(malformed, { source: 'fallback' });
});

test('reduced motion and low performance preserve semantic presentation while removing motion', () => {
  const reduced = derive({ preferences: { reducedMotion: true } }).presentation;
  const lowPerf = derive({ preferences: { lowPerf: true } }).presentation;
  const full = derive({ preferences: {} }).presentation;

  assert.equal(reduced.motion, 'static');
  assert.equal(lowPerf.motion, 'static');
  assert.equal(full.motion, 'local_selection_feedback');
  assert.deepEqual(reduced.deck, full.deck);
  assert.equal(reduced.selectedCardId, full.selectedCardId);
});

test('invalid surface, viewport, selected card, or deck display summary fail closed', () => {
  assert.equal(derive({ surface: 'battle' }).reason, 'SURFACE_INVALID');
  assert.equal(derive({ viewport: { width: 0, height: 720 } }).reason, 'VIEWPORT_INVALID');
  assert.equal(derive({ selectedCardId: ' CARD-1' }).reason, 'SELECTED_CARD_INVALID');
  assert.equal(derive({ deck: { deckId: 'DECK-1', total: 2, typeCount: 3 } }).reason, 'DECK_SUMMARY_INVALID');
  assert.equal(derive({ deck: { deckId: 'DECK-1', total: 40, typeCount: 40, saveStatus: 'saved' } }).reason, 'DECK_SUMMARY_INVALID');
});

test('deck summary is display state only and does not invent legality, ownership, or server acknowledgement', () => {
  const value = derive({
    deck: {
      deckId: 'DECK-3',
      label: 'Third',
      total: 40,
      typeCount: 38,
      dirty: true,
      saveStatus: 'pending',
      revision: 12,
      legal: true,
      owned: true,
      serverAcknowledged: true,
    },
  }).presentation;

  assert.deepEqual(value.deck, {
    deckId: 'DECK-3',
    label: 'Third',
    total: 40,
    typeCount: 38,
    dirty: true,
    saveStatus: 'pending',
    revision: 12,
  });
  assert.equal('legal' in value.deck, false);
  assert.equal('owned' in value.deck, false);
  assert.equal('serverAcknowledged' in value.deck, false);
});

test('presentation output is deeply frozen', () => {
  const value = derive();
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.presentation), true);
  assert.equal(Object.isFrozen(value.presentation.viewport), true);
  assert.equal(Object.isFrozen(value.presentation.layout), true);
  assert.equal(Object.isFrozen(value.presentation.deck), true);
  assert.equal(Object.isFrozen(value.presentation.interaction), true);
  assert.equal(Object.isFrozen(value.presentation.authority), true);
});

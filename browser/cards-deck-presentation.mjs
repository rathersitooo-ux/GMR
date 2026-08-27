const SCHEMA = 'gameroad.cards-deck-presentation.v1';
const SURFACES = Object.freeze(['collection', 'deck_editor', 'card_detail', 'rare_viewer']);
const SAVE_STATUSES = Object.freeze(['idle', 'dirty', 'pending', 'acknowledged', 'rejected', 'timeout']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeViewport(viewport) {
  if (!plainObject(viewport) || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
      viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);
  const ratio = width / height;
  const mode = width < height
    ? 'portrait'
    : height <= 430 && ratio >= 1.75
      ? 'short_landscape'
      : 'landscape';
  return deepFreeze({ width, height, mode });
}

function normalizePreferences(preferences) {
  const source = plainObject(preferences) ? preferences : {};
  return deepFreeze({
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
  });
}

function normalizeFormalAsset(asset) {
  if (!plainObject(asset) || asset.status !== 'formal' || !nonEmptyString(asset.assetId)) {
    return deepFreeze({ source: 'fallback' });
  }
  return deepFreeze({ source: 'formal', assetId: asset.assetId });
}

function normalizeDeckSummary(deck) {
  if (deck === null || deck === undefined) return null;
  if (!plainObject(deck) || !nonEmptyString(deck.deckId)) return null;
  if (!Number.isSafeInteger(deck.total) || deck.total < 0 ||
      !Number.isSafeInteger(deck.typeCount) || deck.typeCount < 0 || deck.typeCount > deck.total) {
    return null;
  }
  if (deck.saveStatus !== undefined && !SAVE_STATUSES.includes(deck.saveStatus)) return null;
  return deepFreeze({
    deckId: deck.deckId,
    label: typeof deck.label === 'string' ? deck.label : null,
    total: deck.total,
    typeCount: deck.typeCount,
    dirty: deck.dirty === true,
    saveStatus: deck.saveStatus ?? 'idle',
    revision: Number.isSafeInteger(deck.revision) && deck.revision >= 0 ? deck.revision : null,
  });
}

function layoutFor(surface, viewport) {
  if (surface === 'card_detail' || surface === 'rare_viewer') {
    return viewport.mode === 'portrait'
      ? { mode: 'stacked_focus', heroFraction: 1, railFraction: 0 }
      : { mode: 'focused_landscape', heroFraction: 0.72, railFraction: 0.28 };
  }
  if (viewport.mode === 'portrait') {
    return { mode: 'stacked', collectionFraction: 1, deckRailFraction: 1 };
  }
  if (viewport.mode === 'short_landscape') {
    return { mode: 'split_short_landscape', collectionFraction: 0.66, deckRailFraction: 0.34 };
  }
  return { mode: 'split_landscape', collectionFraction: 0.74, deckRailFraction: 0.26 };
}

export function deriveCardsDeckPresentation({
  surface,
  viewport,
  preferences,
  selectedCardId = null,
  deck = null,
  cardAsset = null,
} = {}) {
  if (!SURFACES.includes(surface)) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'SURFACE_INVALID', presentation: null });
  }
  const normalizedViewport = normalizeViewport(viewport);
  if (!normalizedViewport) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'VIEWPORT_INVALID', presentation: null });
  }
  if (selectedCardId !== null && !nonEmptyString(selectedCardId)) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'SELECTED_CARD_INVALID', presentation: null });
  }
  const normalizedDeck = normalizeDeckSummary(deck);
  if (deck !== null && deck !== undefined && !normalizedDeck) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'DECK_SUMMARY_INVALID', presentation: null });
  }

  const prefs = normalizePreferences(preferences);
  const visualAsset = normalizeFormalAsset(cardAsset);
  const quietReadingState = surface === 'card_detail' || surface === 'rare_viewer';

  return deepFreeze({
    ok: true,
    schema: SCHEMA,
    reason: 'OK',
    presentation: {
      presentationOnly: true,
      surface,
      viewport: normalizedViewport,
      layout: layoutFor(surface, normalizedViewport),
      selectedCardId,
      deck: normalizedDeck,
      cardVisual: visualAsset,
      interaction: {
        preserveSelectionOnClose: surface === 'card_detail' || surface === 'rare_viewer',
        outsideDismiss: surface === 'card_detail' || surface === 'rare_viewer',
        rightFlickAddOwnedByRuntime: surface === 'collection' || surface === 'deck_editor',
        saveOwnedByRuntime: surface === 'deck_editor',
      },
      motion: prefs.reducedMotion || prefs.lowPerf
        ? 'static'
        : quietReadingState
          ? 'settled_static_after_entry'
          : 'local_selection_feedback',
      accessibility: {
        reducedMotion: prefs.reducedMotion,
        lowPerf: prefs.lowPerf,
      },
      authority: {
        deckRules: 'external',
        saveAck: 'external',
        ownership: 'external',
        cardRules: 'external',
        formalAssetAcceptance: 'external',
      },
    },
  });
}

export const CARDS_DECK_PRESENTATION = Object.freeze({
  schema: SCHEMA,
  surfaces: SURFACES,
  saveStatuses: SAVE_STATUSES,
});

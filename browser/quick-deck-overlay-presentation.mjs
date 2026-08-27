const SCHEMA = 'gameroad.quick-deck-overlay.v1';
const BATTLE_SOURCE_SCHEMA = 'GAMEROAD_BATTLE_SELF_DECK_INSPECT_V1';
const MODES = Object.freeze(['build', 'battle_remaining']);

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

function unavailable(mode, reason) {
  return deepFreeze({
    schema: SCHEMA,
    ok: false,
    mode,
    status: 'unavailable',
    reason,
    cards: [],
    presentationOnly: true,
  });
}

function compareCardIds(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeCounts(cardIds) {
  if (!Array.isArray(cardIds)) return null;
  const counts = new Map();
  for (const cardId of cardIds) {
    if (!nonEmptyString(cardId)) return null;
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => compareCardIds(left, right))
    .map(([cardId, count]) => ({ cardId, count }));
}

function normalizePreferences(preferences) {
  const source = plainObject(preferences) ? preferences : {};
  return deepFreeze({
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
  });
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

// Presentation projection only. This does not validate legality, ownership, save state or match-start eligibility.
export function projectBuildQuickDeck({ deckId, cardIds, label = null, revision = null } = {}) {
  if (!nonEmptyString(deckId)) return unavailable('build', 'DECK_ID_INVALID');
  const cards = normalizeCounts(cardIds);
  if (!cards) return unavailable('build', 'CARD_IDS_INVALID');
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 0)) {
    return unavailable('build', 'REVISION_INVALID');
  }

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    mode: 'build',
    status: 'ready',
    deckId,
    label: typeof label === 'string' ? label : null,
    revision,
    total: cardIds.length,
    typeCount: cards.length,
    cards,
    editableHint: true,
    presentationOnly: true,
  });
}

// Consumes the existing owner-safe Battle projection. It never reconstructs hidden card counts or source order.
export function projectBattleQuickDeck(ownerProjection) {
  if (!plainObject(ownerProjection)) return unavailable('battle_remaining', 'PROJECTION_REQUIRED');
  if (ownerProjection.ok !== true || ownerProjection.status !== 'ready') {
    return unavailable('battle_remaining', ownerProjection.reason || 'PROJECTION_UNAVAILABLE');
  }
  if (ownerProjection.schema !== BATTLE_SOURCE_SCHEMA) {
    return unavailable('battle_remaining', 'SCHEMA_UNKNOWN');
  }
  if (!nonEmptyString(ownerProjection.matchId) || !nonEmptyString(ownerProjection.ownerPlayerId)) {
    return unavailable('battle_remaining', 'IDENTITY_INVALID');
  }
  if (!Number.isSafeInteger(ownerProjection.revision) || ownerProjection.revision < 0 ||
      !Number.isSafeInteger(ownerProjection.total) || ownerProjection.total < 0) {
    return unavailable('battle_remaining', 'REVISION_OR_TOTAL_INVALID');
  }

  // Public/opponent/spectator projections intentionally omit cardCounts. Do not infer them.
  if (!Array.isArray(ownerProjection.cardCounts)) {
    return unavailable('battle_remaining', 'OWNER_COUNTS_UNAVAILABLE');
  }

  const cards = ownerProjection.cardCounts.map(entry => ({ cardId: entry?.cardId, count: entry?.count }));
  let sum = 0;
  let previousCardId = null;
  for (const entry of cards) {
    if (!nonEmptyString(entry.cardId) || !Number.isSafeInteger(entry.count) || entry.count < 1) {
      return unavailable('battle_remaining', 'CARD_COUNT_INVALID');
    }
    if (previousCardId !== null && compareCardIds(previousCardId, entry.cardId) >= 0) {
      return unavailable('battle_remaining', 'CARD_COUNTS_NOT_CANONICAL');
    }
    previousCardId = entry.cardId;
    sum += entry.count;
  }
  if (sum !== ownerProjection.total) return unavailable('battle_remaining', 'TOTAL_MISMATCH');
  if (Number.isSafeInteger(ownerProjection.typeCount) && ownerProjection.typeCount !== cards.length) {
    return unavailable('battle_remaining', 'TYPE_COUNT_MISMATCH');
  }

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    mode: 'battle_remaining',
    status: 'ready',
    matchId: ownerProjection.matchId,
    ownerPlayerId: ownerProjection.ownerPlayerId,
    revision: ownerProjection.revision,
    total: ownerProjection.total,
    typeCount: cards.length,
    cards,
    editableHint: false,
    presentationOnly: true,
  });
}

export function deriveQuickDeckOverlayPresentation({
  projection,
  viewport,
  preferences,
  allowEdit = false,
} = {}) {
  if (!plainObject(projection) || projection.schema !== SCHEMA || projection.ok !== true ||
      !MODES.includes(projection.mode)) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'PROJECTION_INVALID', presentation: null });
  }
  const normalizedViewport = normalizeViewport(viewport);
  if (!normalizedViewport) {
    return deepFreeze({ ok: false, schema: SCHEMA, reason: 'VIEWPORT_INVALID', presentation: null });
  }
  const prefs = normalizePreferences(preferences);
  const editable = projection.mode === 'build' && projection.editableHint === true && allowEdit === true;
  const compact = normalizedViewport.mode === 'short_landscape';

  return deepFreeze({
    ok: true,
    schema: SCHEMA,
    reason: 'OK',
    presentation: {
      presentationOnly: true,
      mode: projection.mode,
      viewport: normalizedViewport,
      dimBackground: true,
      restoreContextOnClose: true,
      dismiss: {
        closeButton: true,
        outsideTap: true,
        back: true,
      },
      actions: {
        edit: editable,
        mutateDeck: false,
      },
      layout: {
        summaryBand: compact ? 'compact' : 'standard',
        cardMatrix: compact ? 'dense_short_landscape' : normalizedViewport.mode === 'portrait' ? 'stacked' : 'dense_landscape',
        multiplicity: 'badge_xN',
      },
      motion: prefs.reducedMotion || prefs.lowPerf ? 'static' : 'local_open_close_only',
      total: projection.total,
      typeCount: projection.typeCount,
      cards: projection.cards,
    },
  });
}

export const QUICK_DECK_OVERLAY_PRESENTATION = Object.freeze({
  schema: SCHEMA,
  battleSourceSchema: BATTLE_SOURCE_SCHEMA,
  modes: MODES,
});

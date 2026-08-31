const VISUAL_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  COMPATIBLE: 'COMPATIBLE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

export const ROAD_CARD_VISUAL_STATE = VISUAL_STATE;
export const ROAD_CARD_COMPATIBLE_CLASS = 'gr-road-card--compatible';

function requireUniqueIds(label, value) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }

  const seen = new Set();
  const result = [];
  for (const rawId of value) {
    if (typeof rawId !== 'string' || rawId.length === 0) {
      throw new TypeError(`${label} must contain non-empty string identities`);
    }
    if (seen.has(rawId)) {
      throw new Error(`${label} contains duplicate identity: ${rawId}`);
    }
    seen.add(rawId);
    result.push(rawId);
  }
  return result;
}

function requireOptionalKnownId(label, value, knownIds) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be null or a non-empty string identity`);
  }
  if (!knownIds.has(value)) {
    throw new Error(`${label} is not present in roadCardIds: ${value}`);
  }
  return value;
}

function buildCompatibleGlow({ reducedMotion, lowPerf }) {
  // Static presentation tokens only. Card lift/translate is intentionally not
  // represented here; that belongs to the separate COMPATIBLE-lift consumer.
  return Object.freeze({
    edgeEmphasis: 'strong',
    outlineStyle: 'solid',
    outlineWidthPx: lowPerf ? 2 : 3,
    outlineOffsetPx: 2,
    brightnessMultiplier: lowPerf ? 1.06 : 1.12,
    haloLayerCount: lowPerf ? 1 : 2,
    haloBlurPx: lowPerf ? 6 : 16,
    haloOpacity: lowPerf ? 0.58 : 0.82,
    transitionMs: reducedMotion ? 0 : 90,
    animated: false,
    lowPerf: Boolean(lowPerf),
  });
}

function buildNormalPresentation({ reducedMotion, lowPerf }) {
  return Object.freeze({
    edgeEmphasis: 'normal',
    outlineStyle: 'none',
    outlineWidthPx: 0,
    outlineOffsetPx: 0,
    brightnessMultiplier: 1,
    haloLayerCount: 0,
    haloBlurPx: 0,
    haloOpacity: 0,
    transitionMs: reducedMotion ? 0 : 90,
    animated: false,
    lowPerf: Boolean(lowPerf),
  });
}

/**
 * Presentation-only projection for Road-card COMPATIBLE glow.
 *
 * `compatibleRoadCardIds` must already be derived by the current movement/card
 * compatibility authority. This module deliberately does not inspect path
 * length, Road value, board adjacency, reachability, or stoppability.
 */
export function projectRoadCardCompatibleGlow({
  roadCardIds,
  compatibleRoadCardIds,
  focusedRoadCardId = null,
  invalidFocusedRoadCardId = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const cards = requireUniqueIds('roadCardIds', roadCardIds);
  const compatible = requireUniqueIds('compatibleRoadCardIds', compatibleRoadCardIds);
  const cardSet = new Set(cards);
  const compatibleSet = new Set(compatible);

  for (const cardId of compatible) {
    if (!cardSet.has(cardId)) {
      throw new Error(`compatibleRoadCardIds contains unknown road card: ${cardId}`);
    }
  }

  const focusedId = requireOptionalKnownId('focusedRoadCardId', focusedRoadCardId, cardSet);
  const invalidFocusedId = requireOptionalKnownId(
    'invalidFocusedRoadCardId',
    invalidFocusedRoadCardId,
    cardSet,
  );

  if (focusedId != null && focusedId === invalidFocusedId) {
    throw new Error('focusedRoadCardId and invalidFocusedRoadCardId must not identify the same card');
  }
  if (invalidFocusedId != null && compatibleSet.has(invalidFocusedId)) {
    throw new Error('INVALID_FOCUS cannot simultaneously be COMPATIBLE');
  }

  const compatibleGlow = buildCompatibleGlow({ reducedMotion, lowPerf });
  const normalPresentation = buildNormalPresentation({ reducedMotion, lowPerf });

  return cards.map((cardId) => {
    const isCompatible = compatibleSet.has(cardId);
    let visualState = VISUAL_STATE.NORMAL;

    if (cardId === invalidFocusedId) {
      visualState = VISUAL_STATE.INVALID_FOCUS;
    } else if (cardId === focusedId) {
      visualState = VISUAL_STATE.FOCUSED;
    } else if (isCompatible) {
      visualState = VISUAL_STATE.COMPATIBLE;
    }

    const applyCompatibleGlow = visualState === VISUAL_STATE.COMPATIBLE;

    return Object.freeze({
      cardId,
      compatible: isCompatible,
      visualState,
      applyCompatibleGlow,
      classNames: Object.freeze(applyCompatibleGlow ? [ROAD_CARD_COMPATIBLE_CLASS] : []),
      dataAttributes: Object.freeze({
        'data-road-card-compatible': isCompatible ? 'true' : 'false',
        'data-road-card-visual-state': visualState,
      }),
      presentation: applyCompatibleGlow ? compatibleGlow : normalPresentation,
    });
  });
}

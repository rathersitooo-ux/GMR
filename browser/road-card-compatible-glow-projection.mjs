const VISUAL_STATE = Object.freeze({
  NORMAL: 'NORMAL',
  COMPATIBLE: 'COMPATIBLE',
  FOCUSED: 'FOCUSED',
  INVALID_FOCUS: 'INVALID_FOCUS',
});

export const ROAD_CARD_VISUAL_STATE = VISUAL_STATE;
export const ROAD_CARD_COMPATIBLE_CLASS = 'gr-road-card--compatible';
export const ROAD_CARD_FOCUSED_CLASS = 'gr-road-card--focused';
export const ROAD_CARD_INVALID_FOCUS_CLASS = 'gr-road-card--invalid-focus';

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

function buildCompatiblePresentation({ reducedMotion, lowPerf }) {
  // Preserve the existing COMPATIBLE presentation. Kana て only adds the
  // stronger focus/invalid channels; candidate appearance is not redesigned.
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

function buildFocusedPresentation({ reducedMotion, lowPerf }) {
  // Explicit focus is the primary Road-card channel. Keep it stronger than
  // COMPATIBLE without adding transform/lift that could double the hand's
  // existing selected-card movement.
  return Object.freeze({
    edgeEmphasis: 'primary',
    outlineStyle: 'solid',
    outlineWidthPx: lowPerf ? 3 : 4,
    outlineOffsetPx: 1,
    brightnessMultiplier: lowPerf ? 1.1 : 1.18,
    haloLayerCount: lowPerf ? 1 : 2,
    haloBlurPx: lowPerf ? 6 : 12,
    haloOpacity: lowPerf ? 0.62 : 0.86,
    transitionMs: reducedMotion ? 0 : 90,
    animated: false,
    lowPerf: Boolean(lowPerf),
  });
}

function buildInvalidFocusPresentation({ reducedMotion, lowPerf }) {
  // Dashed edge is deliberately non-colour-only. Invalid focus must remain
  // legible without becoming a second glow or hiding valid compatible cards.
  return Object.freeze({
    edgeEmphasis: 'invalid',
    outlineStyle: 'dashed',
    outlineWidthPx: lowPerf ? 2 : 3,
    outlineOffsetPx: 1,
    brightnessMultiplier: lowPerf ? 0.98 : 0.96,
    haloLayerCount: 0,
    haloBlurPx: 0,
    haloOpacity: 0,
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
 * Presentation-only projection for Road-card visible state.
 *
 * `compatibleRoadCardIds` must already be derived by the current movement/card
 * compatibility authority. This module deliberately does not inspect path
 * length, Road value, board adjacency, reachability, or stoppability.
 *
 * Per-card priority is INVALID_FOCUS / FOCUSED / COMPATIBLE / NORMAL. The
 * invalid state is mutually exclusive with compatibility, while an explicitly
 * focused compatible card keeps compatibility observable in data but renders
 * only the stronger FOCUSED presentation.
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

  const presentationByState = Object.freeze({
    [VISUAL_STATE.NORMAL]: buildNormalPresentation({ reducedMotion, lowPerf }),
    [VISUAL_STATE.COMPATIBLE]: buildCompatiblePresentation({ reducedMotion, lowPerf }),
    [VISUAL_STATE.FOCUSED]: buildFocusedPresentation({ reducedMotion, lowPerf }),
    [VISUAL_STATE.INVALID_FOCUS]: buildInvalidFocusPresentation({ reducedMotion, lowPerf }),
  });
  const classByState = Object.freeze({
    [VISUAL_STATE.NORMAL]: null,
    [VISUAL_STATE.COMPATIBLE]: ROAD_CARD_COMPATIBLE_CLASS,
    [VISUAL_STATE.FOCUSED]: ROAD_CARD_FOCUSED_CLASS,
    [VISUAL_STATE.INVALID_FOCUS]: ROAD_CARD_INVALID_FOCUS_CLASS,
  });

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
    const applyFocusedEmphasis = visualState === VISUAL_STATE.FOCUSED;
    const applyInvalidFocusEmphasis = visualState === VISUAL_STATE.INVALID_FOCUS;
    const stateClass = classByState[visualState];

    return Object.freeze({
      cardId,
      compatible: isCompatible,
      visualState,
      applyCompatibleGlow,
      applyFocusedEmphasis,
      applyInvalidFocusEmphasis,
      classNames: Object.freeze(stateClass == null ? [] : [stateClass]),
      dataAttributes: Object.freeze({
        'data-road-card-compatible': isCompatible ? 'true' : 'false',
        'data-road-card-visual-state': visualState,
      }),
      presentation: presentationByState[visualState],
    });
  });
}

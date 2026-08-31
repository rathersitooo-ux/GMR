export const ROAD_CARD_FOCUSED_EMPHASIS = Object.freeze({
  liftDeltaPx: -6,
  scaleMultiplier: 1.02,
  outlineBoostPx: 1,
  brightnessMultiplier: 1.06,
  contrastMultiplier: 1.04,
  transitionDurationMs: 120,
});

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Adds only the explicit FOCUSED visual delta to an already-derived Road-card
 * presentation. Semantic focus, compatibility, path state and submission remain
 * owned by their existing producers/consumers.
 */
export function applyRoadCardFocusedEmphasis(basePresentation = {}, options = {}) {
  if (!basePresentation || typeof basePresentation !== 'object') {
    throw new TypeError('ROAD_CARD_PRESENTATION_REQUIRED');
  }
  if (basePresentation.state !== 'FOCUSED') {
    throw new TypeError('FOCUSED_ROAD_CARD_PRESENTATION_REQUIRED');
  }

  const reducedMotion = options?.reducedMotion === true;

  return Object.freeze({
    ...basePresentation,
    visualEmphasis: 'FOCUSED',
    liftPx: finiteNumber(basePresentation.liftPx, 0) + ROAD_CARD_FOCUSED_EMPHASIS.liftDeltaPx,
    scale: finiteNumber(basePresentation.scale, 1) * ROAD_CARD_FOCUSED_EMPHASIS.scaleMultiplier,
    outlineWidthPx:
      finiteNumber(basePresentation.outlineWidthPx, 0) + ROAD_CARD_FOCUSED_EMPHASIS.outlineBoostPx,
    brightness:
      finiteNumber(basePresentation.brightness, 1) * ROAD_CARD_FOCUSED_EMPHASIS.brightnessMultiplier,
    contrast:
      finiteNumber(basePresentation.contrast, 1) * ROAD_CARD_FOCUSED_EMPHASIS.contrastMultiplier,
    transitionDurationMs: reducedMotion
      ? 0
      : ROAD_CARD_FOCUSED_EMPHASIS.transitionDurationMs,
  });
}

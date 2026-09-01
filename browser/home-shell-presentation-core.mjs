const SCHEMA = 'gameroad.home-shell-presentation.v1';
const VIEWPORT_VARIANTS = Object.freeze({
  WIDE_LANDSCAPE: 'wide-landscape',
  SHORT_LANDSCAPE: 'short-landscape',
  PORTRAIT: 'portrait',
});
const TOUCH_TARGET_MIN_PX = 44;

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function viewport(input = {}) {
  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || width <= 0) throw new Error('viewport.width must be a finite positive number');
  if (!Number.isFinite(height) || height <= 0) throw new Error('viewport.height must be a finite positive number');
  return Object.freeze({ width, height });
}

function uniqueRouteIds(routeIds) {
  if (!Array.isArray(routeIds)) throw new Error('routeIds must be an array');
  const ids = routeIds.map((value, index) => nonEmpty(value, `routeIds[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error('routeIds must be unique');
  return Object.freeze(ids);
}

function freezeObject(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = freezeObject(item);
  return Object.freeze(out);
}

export function classifyHomeViewport(input = {}) {
  const { width, height } = viewport(input);
  if (height > width) return VIEWPORT_VARIANTS.PORTRAIT;
  if (height < 480) return VIEWPORT_VARIANTS.SHORT_LANDSCAPE;
  return VIEWPORT_VARIANTS.WIDE_LANDSCAPE;
}

export function createHomeShellState({ expanded = true, selectedRouteId = null, routeIds = [] } = {}) {
  const ids = uniqueRouteIds(routeIds);
  const selected = selectedRouteId == null ? null : nonEmpty(selectedRouteId, 'selectedRouteId');
  if (selected !== null && !ids.includes(selected)) throw new Error('selectedRouteId must exist in routeIds');
  return Object.freeze({
    schema: SCHEMA,
    route: 'Home',
    expanded: Boolean(expanded),
    selectedRouteId: selected,
    routeIds: ids,
  });
}

function regionMap(variant, expanded) {
  if (variant === VIEWPORT_VARIANTS.PORTRAIT) {
    return freezeObject({
      hero: { x: 0, y: 0, width: 1, height: expanded ? 0.57 : 0.62 },
      navigation: { x: 0, y: expanded ? 0.57 : 0.62, width: 1, height: expanded ? 0.43 : 0.38 },
    });
  }
  if (variant === VIEWPORT_VARIANTS.SHORT_LANDSCAPE) {
    return freezeObject({
      navigation: { x: 0, y: 0, width: expanded ? 0.42 : 0.38, height: 1 },
      hero: { x: expanded ? 0.42 : 0.38, y: 0, width: expanded ? 0.58 : 0.62, height: 1 },
    });
  }
  return freezeObject({
    navigation: { x: 0, y: 0, width: expanded ? 0.34 : 0.30, height: 1 },
    hero: { x: expanded ? 0.34 : 0.30, y: 0, width: expanded ? 0.66 : 0.70, height: 1 },
  });
}

function presentationProfile({ reducedMotion, lowPerf }) {
  if (lowPerf) return 'lowperf-static';
  if (reducedMotion) return 'reduced';
  return 'full';
}

function validateHomeProjection(projection) {
  if (!projection || typeof projection !== 'object') throw new Error('homeProjection is required');
  nonEmpty(projection.projectionKey, 'homeProjection.projectionKey');
  if (projection.orientation !== 'landscape' && projection.orientation !== 'portrait') {
    throw new Error('homeProjection.orientation must be landscape or portrait');
  }
  return projection;
}

export function projectHomeShell({
  viewport: viewportInput,
  homeProjection,
  state,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const v = viewport(viewportInput);
  const projection = validateHomeProjection(homeProjection);
  if (!state || state.schema !== SCHEMA || state.route !== 'Home') throw new Error('valid Home shell state is required');
  const variant = classifyHomeViewport(v);
  const expectedOrientation = variant === VIEWPORT_VARIANTS.PORTRAIT ? 'portrait' : 'landscape';
  if (projection.orientation !== expectedOrientation) throw new Error('homeProjection orientation does not match viewport');

  return Object.freeze({
    schema: SCHEMA,
    route: 'Home',
    viewport: v,
    viewportVariant: variant,
    orientation: expectedOrientation,
    expanded: state.expanded,
    selectedRouteId: state.selectedRouteId,
    routeIds: state.routeIds,
    touchTargetMinPx: TOUCH_TARGET_MIN_PX,
    presentationProfile: presentationProfile({ reducedMotion: Boolean(reducedMotion), lowPerf: Boolean(lowPerf) }),
    regions: regionMap(variant, state.expanded),
    scene: freezeObject({
      projectionKey: projection.projectionKey,
      sceneAsset: projection.sceneAsset ?? null,
      focalAnchor: projection.focalAnchor ?? null,
      safeComposition: projection.safeComposition ?? {},
      bleed: projection.bleed ?? {},
      compositionStatus: projection.compositionStatus ?? 'ready',
      needsPortraitComposition: Boolean(projection.needsPortraitComposition),
      fallbackSceneAsset: projection.fallbackSceneAsset ?? null,
      fallbackPolicy: projection.fallbackPolicy ?? 'none',
    }),
    liveSlots: Object.freeze(['routeIds', 'selectedRouteId']),
  });
}

export const HOME_SHELL_PRESENTATION_SCHEMA = SCHEMA;
export const HOME_VIEWPORT_VARIANTS = VIEWPORT_VARIANTS;
export const HOME_TOUCH_TARGET_MIN_PX = TOUCH_TARGET_MIN_PX;

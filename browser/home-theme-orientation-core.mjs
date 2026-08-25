const SCHEMA = 'gameroad.home-theme.v1';
const ORIENTATIONS = new Set(['landscape', 'portrait']);

export const HOME_TRANSITION_REASONS = Object.freeze({
  ORIENTATION_CHANGE: 'ORIENTATION_CHANGE',
  HOME_THEME_CHANGE: 'HOME_THEME_CHANGE',
});

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value, label) {
  if (value == null) return null;
  return nonEmpty(value, label);
}

function finite01(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be between 0 and 1`);
  return value;
}

function cloneFrozen(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFrozen));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneFrozen(item);
  return Object.freeze(out);
}

function anchor(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`${label} is required`);
  return Object.freeze({x: finite01(value.x, `${label}.x`), y: finite01(value.y, `${label}.y`)});
}

function orientation(value) {
  if (!ORIENTATIONS.has(value)) throw new Error('orientation must be landscape or portrait');
  return value;
}

export function classifyHomeOrientation({width, height} = {}) {
  for (const [label, value] of [['width', width], ['height', height]]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number`);
  }
  return width >= height ? 'landscape' : 'portrait';
}

export function createHomeThemeProfile(input = {}) {
  if (!input || typeof input !== 'object') throw new Error('theme profile is required');
  const profile = {
    schema: SCHEMA,
    themeId: nonEmpty(input.themeId, 'themeId'),
    displayNameToken: optionalString(input.displayNameToken, 'displayNameToken'),
    worldStyleId: nonEmpty(input.worldStyleId, 'worldStyleId'),
    landscapeSceneAsset: nonEmpty(input.landscapeSceneAsset, 'landscapeSceneAsset'),
    portraitSceneAsset: optionalString(input.portraitSceneAsset, 'portraitSceneAsset'),
    landscapeFocalAnchor: anchor(input.landscapeFocalAnchor, 'landscapeFocalAnchor'),
    portraitFocalAnchor: anchor(input.portraitFocalAnchor, 'portraitFocalAnchor'),
    safeComposition: cloneFrozen(input.safeComposition ?? {}),
    bleed: cloneFrozen(input.bleed ?? {}),
    motionProfileId: optionalString(input.motionProfileId, 'motionProfileId'),
    ambientLayerIds: Object.freeze((input.ambientLayerIds ?? []).map((v, i) => nonEmpty(v, `ambientLayerIds[${i}]`))),
    transitionBridgeProfileId: optionalString(input.transitionBridgeProfileId, 'transitionBridgeProfileId'),
    reducedMotionFallback: cloneFrozen(input.reducedMotionFallback ?? {}),
    lowPerfFallback: cloneFrozen(input.lowPerfFallback ?? {}),
    availabilityRef: optionalString(input.availabilityRef, 'availabilityRef'),
  };
  return Object.freeze(profile);
}

export function createHomeThemeCatalog(profiles = []) {
  if (!Array.isArray(profiles) || profiles.length === 0) throw new Error('profiles must be a non-empty array');
  const byId = {};
  for (const source of profiles) {
    const profile = source?.schema === SCHEMA ? source : createHomeThemeProfile(source);
    if (byId[profile.themeId]) throw new Error(`duplicate themeId: ${profile.themeId}`);
    byId[profile.themeId] = profile;
  }
  return Object.freeze({schema: SCHEMA, byId: Object.freeze(byId), themeIds: Object.freeze(Object.keys(byId))});
}

export function getHomeThemeProfile(catalog, themeId) {
  if (!catalog || catalog.schema !== SCHEMA || !catalog.byId) throw new Error('unsupported catalog');
  const id = nonEmpty(themeId, 'themeId');
  const profile = catalog.byId[id];
  if (!profile) throw new Error(`unknown themeId: ${id}`);
  return profile;
}

export function resolveHomeProjection(profile, targetOrientation) {
  if (!profile || profile.schema !== SCHEMA) throw new Error('unsupported theme profile');
  const o = orientation(targetOrientation);
  const portrait = o === 'portrait';
  const sceneAsset = portrait ? profile.portraitSceneAsset : profile.landscapeSceneAsset;
  return Object.freeze({
    schema: SCHEMA,
    themeId: profile.themeId,
    orientation: o,
    projectionKey: `Home:${profile.themeId}:${o}`,
    sceneAsset,
    focalAnchor: portrait ? profile.portraitFocalAnchor : profile.landscapeFocalAnchor,
    safeComposition: profile.safeComposition,
    bleed: profile.bleed,
    motionProfileId: profile.motionProfileId,
    ambientLayerIds: profile.ambientLayerIds,
    transitionBridgeProfileId: profile.transitionBridgeProfileId,
    compositionStatus: portrait && sceneAsset === null ? 'missing_portrait_asset' : 'ready',
    needsPortraitComposition: portrait && sceneAsset === null,
    fallbackSceneAsset: portrait && sceneAsset === null ? profile.landscapeSceneAsset : null,
    fallbackPolicy: portrait && sceneAsset === null ? 'caller_safe_hold_or_letterbox_only' : 'none',
  });
}

export function createHomePresentationState({themeId, orientation: currentOrientation} = {}) {
  return Object.freeze({
    schema: SCHEMA,
    route: 'Home',
    themeId: nonEmpty(themeId, 'themeId'),
    orientation: orientation(currentOrientation),
  });
}

export function planHomePresentationChange({
  catalog,
  current,
  targetThemeId = current?.themeId,
  targetOrientation = current?.orientation,
  reducedMotion = false,
  lowPerf = false,
  commitPresentation,
} = {}) {
  if (!current || current.schema !== SCHEMA || current.route !== 'Home') throw new Error('current Home presentation state is required');
  if (typeof commitPresentation !== 'function') throw new Error('commitPresentation must be a function');

  const targetTheme = getHomeThemeProfile(catalog, targetThemeId);
  const nextOrientation = orientation(targetOrientation);
  const themeChanged = targetTheme.themeId !== current.themeId;
  const orientationChanged = nextOrientation !== current.orientation;

  if (!themeChanged && !orientationChanged) {
    return Object.freeze({kind: 'NO_CHANGE', current, target: current, projection: resolveHomeProjection(targetTheme, nextOrientation), directorRequest: null});
  }

  const target = createHomePresentationState({themeId: targetTheme.themeId, orientation: nextOrientation});
  const projection = resolveHomeProjection(targetTheme, nextOrientation);
  const reason = themeChanged ? HOME_TRANSITION_REASONS.HOME_THEME_CHANGE : HOME_TRANSITION_REASONS.ORIENTATION_CHANGE;
  const fromProjection = resolveHomeProjection(getHomeThemeProfile(catalog, current.themeId), current.orientation);

  const directorRequest = Object.freeze({
    from: fromProjection.projectionKey,
    to: projection.projectionKey,
    reason,
    reducedMotion: Boolean(reducedMotion),
    lowPerf: Boolean(lowPerf),
    applySwap: () => commitPresentation(Object.freeze({reason, current, target, projection})),
  });

  return Object.freeze({kind: 'TRANSITION', reason, current, target, projection, directorRequest});
}

export const HOME_THEME_SCHEMA = SCHEMA;

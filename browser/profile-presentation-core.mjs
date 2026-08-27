const SCHEMA = 'GAMEROAD_PROFILE_PRESENTATION_V1';
const SOURCE_KEYS = Object.freeze(['records', 'title', 'partner', 'appearance', 'collection']);
const VIEWER_SCOPES = Object.freeze(['self', 'public']);

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== 'object' || Array.isArray(viewport)) {
    throw new TypeError('VIEWPORT_REQUIRED');
  }
  const { width, height } = viewport;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new TypeError('VIEWPORT_INVALID');
  }
  return { width, height };
}

function layoutForViewport(viewport) {
  const { width, height } = normalizeViewport(viewport);
  const landscape = width > height;
  if (landscape && width <= 900 && height <= 420) {
    return {
      mode: 'short-landscape',
      identityPercent: 36,
      contentPercent: 64,
      routeColumns: 2
    };
  }
  if (landscape) {
    return {
      mode: 'landscape',
      identityPercent: 42,
      contentPercent: 58,
      routeColumns: 4
    };
  }
  return {
    mode: 'portrait-stacked',
    identityPercent: 100,
    contentPercent: 100,
    routeColumns: 2
  };
}

function normalizeIdentity(identity) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
    throw new TypeError('IDENTITY_REQUIRED');
  }
  if (!nonEmptyString(identity.identityId)) throw new TypeError('IDENTITY_ID_REQUIRED');
  return {
    identityId: identity.identityId,
    displayName: nonEmptyString(identity.displayName) ? identity.displayName : null,
    formalAssetState: identity.formalAssetAvailable === true ? 'available' : 'fallback'
  };
}

function unknownSource() {
  return {
    status: 'unknown',
    visible: false,
    valuePresent: false,
    sourceId: null,
    reason: 'SOURCE_UNAVAILABLE'
  };
}

function normalizeSource(entry, viewerScope) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return unknownSource();
  if (entry.status !== 'known' || !nonEmptyString(entry.sourceId) || !hasOwn(entry, 'value')) {
    return unknownSource();
  }

  const visible = viewerScope === 'self' || entry.publicAllowed === true;
  const out = {
    status: 'known',
    visible,
    valuePresent: visible,
    sourceId: entry.sourceId,
    reason: visible ? 'OK' : 'PRIVACY_NOT_AUTHORIZED'
  };
  if (visible) out.value = cloneJson(entry.value);
  return out;
}

function normalizeSources(sources, viewerScope) {
  const source = sources && typeof sources === 'object' && !Array.isArray(sources) ? sources : {};
  const out = {};
  for (const key of SOURCE_KEYS) out[key] = normalizeSource(source[key], viewerScope);
  return out;
}

function normalizeRoutes(routes) {
  if (routes === undefined || routes === null) return [];
  if (!Array.isArray(routes)) throw new TypeError('ROUTES_INVALID');
  const seen = new Set();
  return routes.map((route) => {
    if (!route || typeof route !== 'object' || Array.isArray(route) || !nonEmptyString(route.routeId)) {
      throw new TypeError('ROUTE_INVALID');
    }
    if (seen.has(route.routeId)) throw new TypeError('DUPLICATE_ROUTE_ID');
    seen.add(route.routeId);
    return {
      routeId: route.routeId,
      enabled: route.enabled === true,
      label: nonEmptyString(route.label) ? route.label : null
    };
  });
}

function presentationEffects({ reducedMotion, lowPerf }) {
  const staticMotion = reducedMotion === true || lowPerf === true;
  return {
    motion: staticMotion ? 'instant' : 'enabled',
    optionalDecoration: lowPerf === true ? 'minimal' : 'normal'
  };
}

export function createProfilePresentation(input = {}) {
  if (!nonEmptyString(input.profileId)) throw new TypeError('PROFILE_ID_REQUIRED');
  const viewerScope = input.viewerScope ?? 'self';
  if (!VIEWER_SCOPES.includes(viewerScope)) throw new TypeError('VIEWER_SCOPE_INVALID');

  const state = {
    schema: SCHEMA,
    profileId: input.profileId,
    viewerScope,
    identity: normalizeIdentity(input.identity),
    sources: normalizeSources(input.sources, viewerScope),
    routes: normalizeRoutes(input.routes),
    accessibility: {
      reducedMotion: input.reducedMotion === true,
      lowPerf: input.lowPerf === true
    },
    effects: presentationEffects(input),
    layout: layoutForViewport(input.viewport)
  };
  return deepFreeze(state);
}

export function projectProfilePresentation(state) {
  if (!state || state.schema !== SCHEMA) return deepFreeze({ ok: false, reason: 'STATE_INVALID' });
  return deepFreeze({
    ok: true,
    profileId: state.profileId,
    viewerScope: state.viewerScope,
    identity: cloneJson(state.identity),
    sources: cloneJson(state.sources),
    routes: cloneJson(state.routes),
    accessibility: cloneJson(state.accessibility),
    effects: cloneJson(state.effects),
    layout: cloneJson(state.layout)
  });
}

export const PROFILE_PRESENTATION_CORE = Object.freeze({
  schema: SCHEMA,
  sourceKeys: SOURCE_KEYS,
  viewerScopes: VIEWER_SCOPES
});

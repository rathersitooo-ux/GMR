const SCHEMA = 'gameroad.gacha-presentation.v1';
const QUALITY_SCHEMA = 'gameroad.gacha-presentation-quality.v1';

const STAGES = Object.freeze(['idle', 'pre_shot', 'reveal', 'paused', 'completed']);
const VIEW_SOURCES = Object.freeze(['tap', 'swipe']);
const RESULT_REVIEW_STAGES = Object.freeze(['reveal', 'paused', 'completed']);

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function cloneJson(value, label = 'value') {
  if (value === undefined) throw new Error(`${label} must be JSON-safe`);
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('not serializable');
    return JSON.parse(encoded);
  } catch {
    throw new Error(`${label} must be JSON-safe`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeBundle(resultBundle) {
  if (!Array.isArray(resultBundle) || resultBundle.length === 0) {
    throw new Error('resultBundle must be a non-empty ordered array');
  }
  return cloneJson(resultBundle, 'resultBundle');
}

function presentationEffects({ reducedMotion = false, lowPerf = false, videoAsset = 'fallback' } = {}) {
  const reduced = Boolean(reducedMotion);
  const low = Boolean(lowPerf);
  if (reduced) return Object.freeze({ motion: 'still', video: 'disabled' });
  if (low) return Object.freeze({ motion: 'short_fade', video: 'disabled' });
  return Object.freeze({ motion: 'full', video: videoAsset === 'formal' ? 'enabled' : 'fallback' });
}

function normalizeAssets(assets = {}) {
  return Object.freeze({
    character: assets.character === 'formal' ? 'formal' : 'fallback',
    video: assets.video === 'formal' ? 'formal' : 'fallback',
  });
}

function normalizeViewport(viewport = {}) {
  const width = Number(viewport.width);
  const height = Number(viewport.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('viewport width/height must be positive finite numbers');
  }
  return { width, height };
}

function presentationViewportClass({ width, height }) {
  if (height <= 400 && width > height) return 'short_landscape';
  if (width < height) return 'portrait';
  return 'wide';
}

function qualityLayout(viewportClass, reviewingResults) {
  if (!reviewingResults) {
    return Object.freeze({
      composition: viewportClass === 'portrait' ? 'preview_over_pack' : 'preview_beside_pack',
      resultsRegion: 'inactive',
      packMeta: 'primary',
    });
  }
  if (viewportClass === 'portrait') {
    return Object.freeze({
      composition: 'result_focus_then_collection_then_controls',
      resultsRegion: 'dominant_vertical',
      packMeta: 'collapsed_support',
    });
  }
  if (viewportClass === 'short_landscape') {
    return Object.freeze({
      composition: 'result_focus_left_collection_right_controls_edge',
      resultsRegion: 'dominant_horizontal',
      packMeta: 'collapsed_support',
    });
  }
  return Object.freeze({
    composition: 'result_focus_center_collection_adjacent_controls_below',
    resultsRegion: 'dominant_wide',
    packMeta: 'collapsed_support',
  });
}

function qualityMotion(state, reviewingResults) {
  if (!reviewingResults) {
    return Object.freeze({
      transition: state.accessibility.reducedMotion
        ? 'none'
        : state.accessibility.lowPerf ? 'short_fade' : 'preview_idle',
      semanticFeedback: Object.freeze(['focus', 'label']),
    });
  }
  return Object.freeze({
    transition: state.accessibility.reducedMotion
      ? 'none'
      : state.accessibility.lowPerf ? 'short_fade' : 'focus_shift',
    semanticFeedback: Object.freeze(['outline', 'position', 'label']),
  });
}

function assertInteger(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
}

function assertState(state) {
  if (!state || typeof state !== 'object') throw new Error('state must be an object');
  if (state.schema !== SCHEMA) throw new Error('unsupported gacha presentation schema');
  requireNonEmptyString(state.presentationId, 'presentationId');
  requireNonEmptyString(state.resultIdentity, 'resultIdentity');
  if (!STAGES.includes(state.stage)) throw new Error(`invalid stage: ${state.stage}`);
  if (!Array.isArray(state.resultBundle) || state.resultBundle.length === 0) {
    throw new Error('state resultBundle must be non-empty');
  }
  if (state.resultCanonical !== canonicalJson(state.resultBundle)) {
    throw new Error('state result bundle integrity mismatch');
  }
  const lastIndex = state.resultBundle.length - 1;
  assertInteger(state.revealIndex, 'revealIndex', { min: -1, max: lastIndex });
  assertInteger(state.viewIndex, 'viewIndex', { min: -1, max: lastIndex });
  assertInteger(state.sequence, 'sequence', { min: 0 });
  if (!Array.isArray(state.seenEventIds) || state.seenEventIds.some(id => typeof id !== 'string' || id === '')) {
    throw new Error('seenEventIds must contain non-empty strings');
  }
  if (new Set(state.seenEventIds).size !== state.seenEventIds.length) {
    throw new Error('seenEventIds must be unique');
  }
  if (state.stage === 'idle' || state.stage === 'pre_shot') {
    if (state.revealIndex !== -1 || state.viewIndex !== -1) {
      throw new Error(`${state.stage} cannot expose result items`);
    }
  }
  if (state.stage === 'reveal' || state.stage === 'paused') {
    if (state.revealIndex < 0 || state.viewIndex < 0 || state.viewIndex > state.revealIndex) {
      throw new Error(`${state.stage} requires an already-revealed view index`);
    }
  }
  if (state.stage === 'paused' && state.pausedFrom !== 'reveal') {
    throw new Error('paused state must resume to reveal');
  }
  if (state.stage !== 'paused' && state.pausedFrom !== null) {
    throw new Error('pausedFrom must be null outside paused stage');
  }
  if (state.stage === 'completed' && state.revealIndex !== lastIndex) {
    throw new Error('completed state must mark the full result bundle revealed');
  }
  return state;
}

function nextState(state, patch, eventId) {
  return deepFreeze(assertState({
    ...state,
    ...patch,
    sequence: state.sequence + 1,
    seenEventIds: [...state.seenEventIds, eventId],
  }));
}

export function createGachaPresentation({
  presentationId,
  resultIdentity,
  resultBundle,
  reducedMotion = false,
  lowPerf = false,
  assets = {},
} = {}) {
  requireNonEmptyString(presentationId, 'presentationId');
  requireNonEmptyString(resultIdentity, 'resultIdentity');
  const bundle = normalizeBundle(resultBundle);
  const normalizedAssets = normalizeAssets(assets);
  const state = {
    schema: SCHEMA,
    presentationId,
    resultIdentity,
    resultBundle: bundle,
    resultCanonical: canonicalJson(bundle),
    stage: 'idle',
    revealIndex: -1,
    viewIndex: -1,
    pausedFrom: null,
    sequence: 0,
    seenEventIds: [],
    accessibility: {
      reducedMotion: Boolean(reducedMotion),
      lowPerf: Boolean(lowPerf),
    },
    assets: normalizedAssets,
    effects: presentationEffects({
      reducedMotion,
      lowPerf,
      videoAsset: normalizedAssets.video,
    }),
  };
  return deepFreeze(assertState(state));
}

export function applyGachaPresentationEvent(state, event = {}) {
  assertState(state);
  requireNonEmptyString(event.eventId, 'eventId');
  if (event.presentationId !== state.presentationId) throw new Error('presentationId mismatch');
  if (event.resultIdentity !== state.resultIdentity) throw new Error('resultIdentity mismatch');
  if (state.seenEventIds.includes(event.eventId)) return state;
  assertInteger(event.sequence, 'event sequence', { min: 1 });
  const expected = state.sequence + 1;
  if (event.sequence !== expected) {
    throw new Error(event.sequence < expected ? 'stale event sequence' : 'event sequence gap');
  }

  const lastIndex = state.resultBundle.length - 1;
  switch (event.type) {
    case 'START': {
      if (state.stage !== 'idle') throw new Error(`START invalid from ${state.stage}`);
      return nextState(state, { stage: 'pre_shot' }, event.eventId);
    }
    case 'REVEAL_NEXT': {
      if (state.stage !== 'pre_shot' && state.stage !== 'reveal') {
        throw new Error(`REVEAL_NEXT invalid from ${state.stage}`);
      }
      const revealIndex = state.stage === 'pre_shot' ? 0 : state.revealIndex + 1;
      if (revealIndex > lastIndex) throw new Error('all result items are already revealed');
      return nextState(state, {
        stage: 'reveal',
        revealIndex,
        viewIndex: revealIndex,
        pausedFrom: null,
      }, event.eventId);
    }
    case 'PAUSE': {
      if (state.stage !== 'reveal') throw new Error(`PAUSE invalid from ${state.stage}`);
      return nextState(state, { stage: 'paused', pausedFrom: 'reveal' }, event.eventId);
    }
    case 'RESUME': {
      if (state.stage !== 'paused' || state.pausedFrom !== 'reveal') {
        throw new Error(`RESUME invalid from ${state.stage}`);
      }
      return nextState(state, { stage: 'reveal', pausedFrom: null }, event.eventId);
    }
    case 'VIEW': {
      if (!['reveal', 'paused', 'completed'].includes(state.stage)) {
        throw new Error(`VIEW invalid from ${state.stage}`);
      }
      if (!VIEW_SOURCES.includes(event.source)) throw new Error('VIEW source must be tap or swipe');
      assertInteger(event.targetIndex, 'targetIndex', { min: 0, max: lastIndex });
      const visibleMax = state.stage === 'completed' ? lastIndex : state.revealIndex;
      if (event.targetIndex > visibleMax) throw new Error('cannot view an unrevealed result item');
      return nextState(state, { viewIndex: event.targetIndex }, event.eventId);
    }
    case 'SKIP': {
      if (!['pre_shot', 'reveal', 'paused'].includes(state.stage)) {
        throw new Error(`SKIP invalid from ${state.stage}`);
      }
      return nextState(state, {
        stage: 'completed',
        revealIndex: lastIndex,
        viewIndex: lastIndex,
        pausedFrom: null,
      }, event.eventId);
    }
    case 'COMPLETE': {
      if (state.stage !== 'reveal' || state.revealIndex !== lastIndex) {
        throw new Error('COMPLETE requires the final result item to be revealed');
      }
      return nextState(state, {
        stage: 'completed',
        revealIndex: lastIndex,
        viewIndex: state.viewIndex,
        pausedFrom: null,
      }, event.eventId);
    }
    default:
      throw new Error(`unsupported gacha presentation event: ${event.type}`);
  }
}

export function projectGachaPresentation(state) {
  assertState(state);
  const currentResult = state.viewIndex >= 0 ? cloneJson(state.resultBundle[state.viewIndex]) : null;
  return deepFreeze({
    schema: state.schema,
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    stage: state.stage,
    revealIndex: state.revealIndex,
    viewIndex: state.viewIndex,
    currentResult,
    revealedResults: state.revealIndex >= 0
      ? cloneJson(state.resultBundle.slice(0, state.revealIndex + 1))
      : [],
    resultCount: state.resultBundle.length,
    accessibility: cloneJson(state.accessibility),
    assets: cloneJson(state.assets),
    effects: cloneJson(state.effects),
  });
}

export function projectGachaPresentationQuality(state, { viewport } = {}) {
  assertState(state);
  const vp = normalizeViewport(viewport);
  const viewportClass = presentationViewportClass(vp);
  const reviewingResults = RESULT_REVIEW_STAGES.includes(state.stage);
  const selectedResult = reviewingResults && state.viewIndex >= 0
    ? cloneJson(state.resultBundle[state.viewIndex])
    : null;
  const visibleResults = state.revealIndex >= 0
    ? cloneJson(state.resultBundle.slice(0, state.revealIndex + 1))
    : [];
  const priorityOrder = reviewingResults
    ? ['selected_result', 'confirmed_result_collection', 'result_navigation', 'open_again', 'pack_odds']
    : ['pack_preview', 'open_pack', 'pack_odds'];

  return deepFreeze({
    schema: QUALITY_SCHEMA,
    presentationSchema: state.schema,
    presentationId: state.presentationId,
    resultIdentity: state.resultIdentity,
    stage: state.stage,
    reviewingResults,
    viewport: { ...vp, class: viewportClass },
    resultCount: state.resultBundle.length,
    visibleResults,
    viewIndex: state.viewIndex,
    selectedResult,
    hierarchy: {
      priorityOrder,
      selectedResult: reviewingResults ? 'primary' : 'hidden',
      confirmedResultCollection: reviewingResults ? 'secondary' : 'hidden',
      resultNavigation: reviewingResults ? 'tertiary' : 'hidden',
      openAgain: reviewingResults ? 'secondary_action' : 'primary_action',
      packOdds: reviewingResults ? 'collapsed_support' : 'support',
    },
    channels: {
      selection: reviewingResults ? ['outline', 'position', 'label'] : [],
      rarity: reviewingResults ? ['text', 'frame_weight'] : [],
      disabled: ['opacity', 'label_state'],
    },
    layout: qualityLayout(viewportClass, reviewingResults),
    motion: qualityMotion(state, reviewingResults),
    accessibility: {
      ...cloneJson(state.accessibility),
      resultMeaningPreservedWithoutMotion: true,
      selectionMeaningPreservedWithoutColor: true,
      rarityMeaningPreservedWithoutColor: true,
    },
    invariants: {
      resultTruthMutable: false,
      resultOrderMutable: false,
      rngAuthority: 'upstream_only',
      saveAuthority: 'upstream_only',
      identityAuthority: 'upstream_only',
      inventedResultSignalsAllowed: false,
      unrevealedResultsExposed: false,
    },
  });
}

export function snapshotGachaPresentation(state) {
  assertState(state);
  return deepFreeze(cloneJson(state));
}

export function restoreGachaPresentation(snapshot, {
  presentationId,
  resultIdentity,
  resultBundle,
} = {}) {
  requireNonEmptyString(presentationId, 'presentationId');
  requireNonEmptyString(resultIdentity, 'resultIdentity');
  const expectedBundle = normalizeBundle(resultBundle);
  const restored = cloneJson(snapshot, 'snapshot');
  assertState(restored);
  if (restored.presentationId !== presentationId) throw new Error('snapshot presentationId mismatch');
  if (restored.resultIdentity !== resultIdentity) throw new Error('snapshot resultIdentity mismatch');
  const expectedCanonical = canonicalJson(expectedBundle);
  if (restored.resultCanonical !== expectedCanonical || canonicalJson(restored.resultBundle) !== expectedCanonical) {
    throw new Error('snapshot result bundle mismatch');
  }
  return deepFreeze(restored);
}

export const GACHA_PRESENTATION_SCHEMA = SCHEMA;
export const GACHA_PRESENTATION_QUALITY_SCHEMA = QUALITY_SCHEMA;
export const GACHA_PRESENTATION_STAGES = STAGES;

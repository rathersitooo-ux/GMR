import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
  HOME_VIEWPORT_VARIANTS,
  projectHomeShell,
} from '../browser/home-shell-presentation-core.mjs';
import {
  HOME_VISUAL_AUTHORITY,
  createHomeVisualAuthorityCss,
  resolveHomePrimaryAuthority,
} from '../browser/home-boot-runtime-mount.mjs';
import {
  BOOT_LOADING_PHASES,
  createBootLoadingState,
  projectBootLoadingPresentation,
} from '../browser/boot-loading-presentation-core.mjs';

const landscapeProjection = Object.freeze({
  projectionKey: 'Home:HOME_INITIAL_DEFAULT:landscape',
  orientation: 'landscape',
  sceneAsset: 'asset:home-landscape',
  focalAnchor: { x: 0.58, y: 0.50 },
  safeComposition: { landscape: 'center_16_9' },
  bleed: { landscape: '21_9' },
  compositionStatus: 'ready',
  needsPortraitComposition: false,
  fallbackSceneAsset: null,
  fallbackPolicy: 'none',
});

const missingPortraitProjection = Object.freeze({
  projectionKey: 'Home:HOME_INITIAL_DEFAULT:portrait',
  orientation: 'portrait',
  sceneAsset: null,
  focalAnchor: { x: 0.62, y: 0.48 },
  safeComposition: { portrait: 'dedicated' },
  bleed: {},
  compositionStatus: 'missing_portrait_asset',
  needsPortraitComposition: true,
  fallbackSceneAsset: 'asset:home-landscape',
  fallbackPolicy: 'caller_safe_hold_or_letterbox_only',
});

const state = () => createHomeShellState({
  expanded: false,
  selectedRouteId: 'cards',
  routeIds: ['battle', 'cards', 'partner', 'shop'],
});

test('Home viewport classifier distinguishes wide, short landscape, and portrait', () => {
  assert.equal(classifyHomeViewport({ width: 1920, height: 1080 }), HOME_VIEWPORT_VARIANTS.WIDE_LANDSCAPE);
  assert.equal(classifyHomeViewport({ width: 1280, height: 720 }), HOME_VIEWPORT_VARIANTS.WIDE_LANDSCAPE);
  assert.equal(classifyHomeViewport({ width: 844, height: 390 }), HOME_VIEWPORT_VARIANTS.SHORT_LANDSCAPE);
  assert.equal(classifyHomeViewport({ width: 390, height: 844 }), HOME_VIEWPORT_VARIANTS.PORTRAIT);
});

test('Home projection preserves routes and selected route across viewport profiles', () => {
  const s = state();
  const wide = projectHomeShell({ viewport: { width: 1280, height: 720 }, homeProjection: landscapeProjection, state: s });
  const short = projectHomeShell({ viewport: { width: 844, height: 390 }, homeProjection: landscapeProjection, state: s });
  assert.deepEqual(wide.routeIds, s.routeIds);
  assert.deepEqual(short.routeIds, s.routeIds);
  assert.equal(wide.selectedRouteId, 'cards');
  assert.equal(short.selectedRouteId, 'cards');
  assert.equal(wide.touchTargetMinPx, HOME_TOUCH_TARGET_MIN_PX);
  assert.equal(HOME_TOUCH_TARGET_MIN_PX, 44);
});

test('Home reduced/lowPerf profiles preserve semantic state rather than invent routes', () => {
  const s = state();
  const normal = projectHomeShell({ viewport: { width: 1280, height: 720 }, homeProjection: landscapeProjection, state: s });
  const reduced = projectHomeShell({ viewport: { width: 1280, height: 720 }, homeProjection: landscapeProjection, state: s, reducedMotion: true });
  const lowPerf = projectHomeShell({ viewport: { width: 1280, height: 720 }, homeProjection: landscapeProjection, state: s, reducedMotion: true, lowPerf: true });
  assert.equal(normal.presentationProfile, 'full');
  assert.equal(reduced.presentationProfile, 'reduced');
  assert.equal(lowPerf.presentationProfile, 'lowperf-static');
  assert.deepEqual(normal.routeIds, reduced.routeIds);
  assert.deepEqual(normal.routeIds, lowPerf.routeIds);
  assert.equal(normal.selectedRouteId, reduced.selectedRouteId);
  assert.equal(normal.selectedRouteId, lowPerf.selectedRouteId);
});

test('Home visual authority is subtractive only when the canonical slidepad exists', () => {
  assert.equal(resolveHomePrimaryAuthority({ hasSlidePad: true }), HOME_VISUAL_AUTHORITY.canonical);
  assert.equal(resolveHomePrimaryAuthority({ hasSlidePad: false }), HOME_VISUAL_AUTHORITY.fallback);
  assert.equal(resolveHomePrimaryAuthority(), HOME_VISUAL_AUTHORITY.fallback);
  assert.ok(HOME_VISUAL_AUTHORITY.suppressedSelectors.includes('#codexHomeVisualLayer'));
  assert.ok(HOME_VISUAL_AUTHORITY.suppressedSelectors.includes('.codexPartnerChip'));
  assert.ok(HOME_VISUAL_AUTHORITY.suppressedSelectors.includes('.codexBattleCta'));
  const css = createHomeVisualAuthorityCss();
  assert.match(css, /data-home-primary-authority="slidepad"/);
  assert.match(css, /#codexHomeVisualLayer/);
  assert.match(css, /\.codexPartnerChip/);
  assert.match(css, /\.codexBattleCta/);
  assert.match(css, /data-home-shell-variant="portrait"/);
  assert.match(css, /grid-template-columns:1fr!important/);
  assert.match(css, /border-color:transparent!important/);
  assert.match(css, /background:transparent!important/);
  assert.match(css, /box-shadow:none!important/);
  assert.match(css, /backdrop-filter:none!important/);
  assert.doesNotMatch(css, /background:rgba\(8,17,45,\.68\)!important/);
  assert.doesNotMatch(css, /backdrop-filter:blur\(8px\)!important/);
  assert.match(css, /data-home-shell-variant="short-landscape"/);
});

test('missing portrait art is propagated exactly and never silently fabricated or cropped', () => {
  const projection = projectHomeShell({ viewport: { width: 390, height: 844 }, homeProjection: missingPortraitProjection, state: state() });
  assert.equal(projection.scene.sceneAsset, null);
  assert.equal(projection.scene.needsPortraitComposition, true);
  assert.equal(projection.scene.compositionStatus, 'missing_portrait_asset');
  assert.equal(projection.scene.fallbackSceneAsset, 'asset:home-landscape');
  assert.equal(projection.scene.fallbackPolicy, 'caller_safe_hold_or_letterbox_only');
});

test('Home state rejects duplicate or unknown selected routes', () => {
  assert.throws(() => createHomeShellState({ routeIds: ['cards', 'cards'] }), /unique/);
  assert.throws(() => createHomeShellState({ routeIds: ['cards'], selectedRouteId: 'battle' }), /must exist/);
});

test('Home projection rejects orientation mismatch so the wrong scene cannot be selected', () => {
  assert.throws(() => projectHomeShell({ viewport: { width: 390, height: 844 }, homeProjection: landscapeProjection, state: state() }), /orientation does not match/);
});

test('Boot READY cannot exist without an explicit continue capability', () => {
  assert.throws(() => createBootLoadingState({ phase: BOOT_LOADING_PHASES.READY }), /canContinue=true/);
  const ready = createBootLoadingState({ phase: BOOT_LOADING_PHASES.READY, canContinue: true });
  assert.deepEqual(projectBootLoadingPresentation({ state: ready }).actionIds, ['CONTINUE']);
});

test('Boot progress is validated and remains live data', () => {
  assert.throws(() => createBootLoadingState({ phase: BOOT_LOADING_PHASES.LOADING, progress: 1.1 }), /between 0 and 1/);
  const loading = createBootLoadingState({ phase: BOOT_LOADING_PHASES.LOADING, progress: 0.42, statusCode: 'CONTENT' });
  const view = projectBootLoadingPresentation({ state: loading });
  assert.equal(view.progress, 0.42);
  assert.equal(view.statusCode, 'CONTENT');
  assert.ok(view.liveSlots.includes('progress'));
  assert.deepEqual(view.actionIds, []);
});

test('Boot actions are never inferred beyond explicit capability flags', () => {
  const error = createBootLoadingState({
    phase: BOOT_LOADING_PHASES.ERROR,
    canRetry: true,
    canGoBack: true,
    errorCode: 'LOAD_FAILED',
  });
  const view = projectBootLoadingPresentation({ state: error });
  assert.deepEqual(view.actionIds, ['RETRY', 'BACK']);
  assert.equal(view.actionIds.includes('CONTINUE'), false);
});

test('Boot normal/reduced/lowPerf variants keep the same semantic state and actions', () => {
  const source = createBootLoadingState({
    phase: BOOT_LOADING_PHASES.RECOVERY,
    progress: 0.3,
    canRetry: true,
    statusCode: 'RECONNECTING',
  });
  const normal = projectBootLoadingPresentation({ state: source });
  const reduced = projectBootLoadingPresentation({ state: source, reducedMotion: true });
  const lowPerf = projectBootLoadingPresentation({ state: source, lowPerf: true });
  assert.equal(normal.semanticKey, reduced.semanticKey);
  assert.equal(normal.semanticKey, lowPerf.semanticKey);
  assert.deepEqual(normal.actionIds, reduced.actionIds);
  assert.deepEqual(normal.actionIds, lowPerf.actionIds);
  assert.equal(reduced.presentationProfile, 'reduced');
  assert.equal(lowPerf.presentationProfile, 'lowperf-static');
});

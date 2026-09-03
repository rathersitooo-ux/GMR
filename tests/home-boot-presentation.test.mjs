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
  BOOT_LOADING_PHASES,
  createBootLoadingState,
  projectBootLoadingPresentation,
} from '../browser/boot-loading-presentation-core.mjs';
import {
  removeLegacyHomeNodes,
  resolveHomeSlidepadFeedbackTranslation,
  resolveHomeSlidepadRayTarget,
  resolveHomeSlidepadRelease,
  resolveHomeSlidepadRole,
  resolveHomeSlidepadRouteId,
  resolveHomeSlidepadTargetTranslation,
} from '../browser/home-boot-runtime-mount.mjs';

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

test('Home SlidePad shell defaults to expanded and remains explicitly collapsible', () => {
  const expanded = createHomeShellState({ routeIds: ['battle', 'cards', 'partner', 'shop'] });
  const collapsed = createHomeShellState({ expanded: false, routeIds: ['battle', 'cards', 'partner', 'shop'] });
  assert.equal(expanded.expanded, true);
  assert.equal(collapsed.expanded, false);
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

const liveSlidepadRoutes = ['setup', 'shop', 'partner', 'characters', 'cards'];

test('Home runtime preserves the current visual layer while removing duplicate legacy controls', () => {
  const removed = [];
  const liveVisualLayer = { remove: () => removed.push('visual') };
  const battleCta = { remove: () => removed.push('battle') };
  const partnerChip = { remove: () => removed.push('partner') };
  const home = {
    querySelectorAll(selector) {
      if (selector === '#codexHomeVisualLayer' || selector === '.codexHomeVisualLayer') return [liveVisualLayer];
      if (selector === '#codexHomeBattleCta' || selector === '.codexBattleCta') return [battleCta];
      if (selector === '#codexHomePartnerChip' || selector === '.codexPartnerChip') return [partnerChip];
      return [];
    },
  };
  assert.equal(removeLegacyHomeNodes(home), 2);
  assert.deepEqual(removed.sort(), ['battle', 'partner']);
});

test('Home compatibility direction map keeps the four fixed responsibilities for non-pointer input', () => {
  assert.equal(resolveHomeSlidepadRole({ dx: 0, dy: -48 }), 'battle');
  assert.equal(resolveHomeSlidepadRole({ dx: 48, dy: 0 }), 'shop');
  assert.equal(resolveHomeSlidepadRole({ dx: -42, dy: -34 }), 'partner');
  assert.equal(resolveHomeSlidepadRole({ dx: -42, dy: 20 }), 'cards');
});

test('Home pointer targeting follows the straight drag ray and actual target geometry, not a quadrant label', () => {
  const target = resolveHomeSlidepadRayTarget({
    originX: 100,
    originY: 100,
    pointerX: 180,
    pointerY: 84,
    targets: [
      { routeId: 'setup', rect: { left: 110, top: -100, width: 60, height: 60 } },
      { routeId: 'shop', rect: { left: 280, top: 40, width: 80, height: 60 } },
      { routeId: 'characters', rect: { left: -80, top: -80, width: 70, height: 70 } },
      { routeId: 'cards', rect: { left: -80, top: 130, width: 70, height: 70 } },
    ],
  });
  assert.equal(resolveHomeSlidepadRole({ dx: 80, dy: -16 }), 'battle');
  assert.equal(target?.routeId, 'shop');
  assert.ok(target?.forward > 0);
});

test('Home pointer ray keeps DOWN and center dead-zone unassigned', () => {
  const targets = [
    { routeId: 'setup', rect: { left: 80, top: -100, width: 60, height: 60 } },
    { routeId: 'shop', rect: { left: 220, top: 70, width: 70, height: 70 } },
  ];
  assert.equal(resolveHomeSlidepadRayTarget({ originX: 100, originY: 100, pointerX: 106, pointerY: 105, targets }), null);
  assert.equal(resolveHomeSlidepadRayTarget({ originX: 100, originY: 100, pointerX: 100, pointerY: 160, targets }), null);
});

test('Home pointer ray retains the attached target through small aim jitter', () => {
  const targets = [
    { routeId: 'shop', rect: { left: 280, top: 40, width: 80, height: 60 } },
    { routeId: 'setup', rect: { left: 260, top: -70, width: 80, height: 60 } },
  ];
  const first = resolveHomeSlidepadRayTarget({
    originX: 100, originY: 100, pointerX: 180, pointerY: 82, targets,
  });
  assert.equal(first?.routeId, 'shop');
  const jitter = resolveHomeSlidepadRayTarget({
    originX: 100, originY: 100, pointerX: 180, pointerY: 76, targets, currentRouteId: first?.routeId,
  });
  assert.equal(jitter?.routeId, 'shop');
});

test('Home legacy target translation remains available as geometry evidence but is not pointer target authority', () => {
  const translation = resolveHomeSlidepadTargetTranslation({
    originX: 100,
    originY: 100,
    targetRect: { left: 300, top: 40, width: 80, height: 60 },
  });
  assert.deepEqual(translation, { x: 240, y: -30 });
  assert.ok(Math.hypot(translation.x, translation.y) > 22);
  assert.equal(resolveHomeSlidepadTargetTranslation({ originX: 100, originY: 100, targetRect: { left: 0, top: 0, width: 0, height: 20 } }), null);
});

test('Home SlidePad keeps DOWN and the center dead-zone unassigned in the compatibility map', () => {
  assert.equal(resolveHomeSlidepadRole({ dx: 0, dy: 48 }), null);
  assert.equal(resolveHomeSlidepadRole({ dx: 8, dy: -7 }), null);
  assert.equal(resolveHomeSlidepadRole({ dx: 10, dy: 20 }), null);
});

test('Home SlidePad resolves only routes that already exist in the current Home consumer', () => {
  assert.equal(resolveHomeSlidepadRouteId(liveSlidepadRoutes, 'battle'), 'setup');
  assert.equal(resolveHomeSlidepadRouteId(liveSlidepadRoutes, 'shop'), 'shop');
  assert.equal(resolveHomeSlidepadRouteId(liveSlidepadRoutes, 'partner'), 'partner');
  assert.equal(resolveHomeSlidepadRouteId(['setup', 'shop', 'characters', 'cards'], 'partner'), 'characters');
  assert.equal(resolveHomeSlidepadRouteId(liveSlidepadRoutes, 'cards'), 'cards');
  assert.equal(resolveHomeSlidepadRouteId(['shop', 'cards'], 'battle'), null);
  assert.equal(resolveHomeSlidepadRouteId(liveSlidepadRoutes, 'down'), null);
});

test('Home SlidePad compatibility release fail-closes instead of inventing a destination', () => {
  assert.deepEqual(
    resolveHomeSlidepadRelease({ dx: 0, dy: -50, routeIds: liveSlidepadRoutes }),
    { role: 'battle', routeId: 'setup', commit: true },
  );
  assert.deepEqual(
    resolveHomeSlidepadRelease({ dx: 0, dy: 50, routeIds: liveSlidepadRoutes }),
    { role: null, routeId: null, commit: false },
  );
  assert.deepEqual(
    resolveHomeSlidepadRelease({ dx: 0, dy: -50, routeIds: ['shop', 'cards'] }),
    { role: 'battle', routeId: null, commit: false },
  );
});

test('Home SlidePad visual feedback stays responsive while bounded to the current reach envelope', () => {
  const far = resolveHomeSlidepadFeedbackTranslation({ dx: 320, dy: -180 });
  assert.ok(far);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 144) < 1e-9);
  assert.ok(far.x > 0 && far.y < 0);
  assert.deepEqual(resolveHomeSlidepadFeedbackTranslation({ dx: 48, dy: -24 }), { x: 48, y: -24 });
  assert.equal(resolveHomeSlidepadFeedbackTranslation({ dx: Number.POSITIVE_INFINITY, dy: 0 }), null);
});

import {
  SETUP_FOREST_STAGE_CONTRACT,
  projectSetupForestStage,
  validateSetupForestStageContract,
} from './setup-forest-stage-layout-core.mjs';

const STAGE_ID = 'gameroadSetupForestStage';
const GLOBAL_KEY = 'GAMEROAD_SETUP_FOREST_STAGE';
const SETUP_SELECTOR = 'section[data-screen="setup"]';
const FOREST_MEDIA_BINDINGS = Object.freeze({
  'sun-patch': Object.freeze({
    src: '/assets/visual/effects/setup-forest-sun-patch-4x4-v1.png',
    columns: 4,
    rows: 4,
    frames: 16,
    duration: '18s',
    animationName: 'gameroadSetupForestSunPatch',
  }),
});
const FOREST_ANIMATION_CSS = `@keyframes gameroadSetupForestSunPatch {\n  0% { background-position: 0% 0%; }\n  6.6667% { background-position: 33.3333% 0%; }\n  13.3333% { background-position: 66.6667% 0%; }\n  20% { background-position: 100% 0%; }\n  26.6667% { background-position: 0% 33.3333%; }\n  33.3333% { background-position: 33.3333% 33.3333%; }\n  40% { background-position: 66.6667% 33.3333%; }\n  46.6667% { background-position: 100% 33.3333%; }\n  53.3333% { background-position: 0% 66.6667%; }\n  60% { background-position: 33.3333% 66.6667%; }\n  66.6667% { background-position: 66.6667% 66.6667%; }\n  73.3333% { background-position: 100% 66.6667%; }\n  80% { background-position: 0% 100%; }\n  86.6667% { background-position: 33.3333% 100%; }\n  93.3333% { background-position: 66.6667% 100%; }\n  100% { background-position: 100% 100%; }\n}\n@media (prefers-reduced-motion: reduce) {\n  #gameroadSetupForestStage .gameroadSetupForestLayerSlot[data-layer-id=\"sun-patch\"] {\n    animation: none !important;\n    background-position: 0% 0% !important;\n  }\n}`;

const runtime = {
  mounted: false,
  setup: null,
  stage: null,
  viewportKey: null,
  resizeHandler: null,
  refreshCount: 0,
  lastError: null,
};

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function dimensionsFromWindow(windowSource = globalThis.window) {
  return Object.freeze({
    width: finitePositive(windowSource?.innerWidth, 1280),
    height: finitePositive(windowSource?.innerHeight, 720),
  });
}

export function classifySetupForestViewport(input = {}) {
  const width = finitePositive(input.width, 1280);
  const height = finitePositive(input.height, 720);
  if (height > width) return 'portrait';
  if (height <= 430 || width < 900) return 'shortLandscape';
  return 'wide';
}

function zoneProjection(zone) {
  return Object.freeze({
    id: zone.id,
    rect: Object.freeze({ ...zone.rect }),
    maxDetailDensity: zone.maxDetailDensity,
    maxContrast: zone.maxContrast,
    purpose: zone.purpose,
  });
}

function layerProjection(layer) {
  return Object.freeze({
    id: layer.id,
    kind: layer.kind,
    zOrder: layer.zOrder,
    rect: Object.freeze({ ...layer.rect }),
    densityBudget: layer.densityBudget,
    contrastBudget: layer.contrastBudget,
    detailScale: layer.detailScale,
    purpose: layer.purpose,
  });
}

export function projectSetupForestRuntime(input = {}) {
  validateSetupForestStageContract();
  const viewportKey = classifySetupForestViewport(input);
  const composition = projectSetupForestStage(viewportKey);
  return Object.freeze({
    schema: 'gameroad.setup-forest-stage-runtime.v1',
    layoutSchema: SETUP_FOREST_STAGE_CONTRACT.schema,
    viewportKey,
    generationState: 'CANDIDATE',
    mediaState: 'PARTIAL',
    viewport: Object.freeze({ ...composition.viewport }),
    stageIntent: composition.stageIntent,
    safeZones: Object.freeze({
      character: zoneProjection(composition.safeZones.character),
      centralBreathing: zoneProjection(composition.safeZones.centralBreathing),
      uiReading: zoneProjection(composition.safeZones.uiReading),
    }),
    layers: Object.freeze(composition.layers.map(layerProjection)),
  });
}

export function setupForestLayerStyleEntries(layer) {
  const rect = layer?.rect || {};
  return Object.freeze({
    left: `${Number(rect.x)}%`,
    top: `${Number(rect.y)}%`,
    width: `${Number(rect.width)}%`,
    height: `${Number(rect.height)}%`,
    zIndex: String(Number(layer?.zOrder)),
    '--gr-setup-forest-density': String(Number(layer?.densityBudget)),
    '--gr-setup-forest-contrast': String(Number(layer?.contrastBudget)),
  });
}

function safeZonePrefix(name) {
  return `--gr-setup-forest-${String(name).replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

export function setupForestSafeZoneStyleEntries(projection) {
  const entries = {};
  for (const [name, zone] of Object.entries(projection?.safeZones || {})) {
    const prefix = safeZonePrefix(name);
    entries[`${prefix}-x`] = `${zone.rect.x}%`;
    entries[`${prefix}-y`] = `${zone.rect.y}%`;
    entries[`${prefix}-width`] = `${zone.rect.width}%`;
    entries[`${prefix}-height`] = `${zone.rect.height}%`;
    entries[`${prefix}-max-detail-density`] = String(zone.maxDetailDensity);
    entries[`${prefix}-max-contrast`] = String(zone.maxContrast);
  }
  return Object.freeze(entries);
}

function applyStyleEntries(style, entries) {
  if (!style) return;
  for (const [key, value] of Object.entries(entries)) {
    if (key.startsWith('--')) style.setProperty?.(key, value);
    else style[key] = value;
  }
}

function createLayerSlot(documentSource, layer) {
  const node = documentSource.createElement('div');
  node.className = 'gameroadSetupForestLayerSlot';
  node.dataset.layerId = layer.id;
  node.dataset.layerKind = layer.kind;
  node.dataset.detailScale = layer.detailScale;
  node.dataset.densityBudget = String(layer.densityBudget);
  node.dataset.contrastBudget = String(layer.contrastBudget);
  const media = FOREST_MEDIA_BINDINGS[layer.id] || null;
  node.dataset.mediaState = media ? 'bound' : 'unbound';
  node.setAttribute('aria-hidden', 'true');
  node.style.position = 'absolute';
  node.style.pointerEvents = 'none';
  node.style.background = 'none';
  node.style.border = '0';
  node.style.boxShadow = 'none';
  applyStyleEntries(node.style, setupForestLayerStyleEntries(layer));
  if (media) {
    node.dataset.animationState = 'enabled';
    node.style.backgroundImage = `url(\"${media.src}\")`;
    node.style.backgroundSize = `${media.columns * 100}% ${media.rows * 100}%`;
    node.style.backgroundPosition = '0% 0%';
    node.style.backgroundRepeat = 'no-repeat';
    node.style.opacity = '0.24';
    node.style.mixBlendMode = 'screen';
    node.style.animation = `${media.animationName} ${media.duration} steps(1, end) infinite alternate`;
  }
  return node;
}

function ensureStage(documentSource, setup) {
  let stage = setup.querySelector?.(`#${STAGE_ID}`);
  if (stage) return stage;
  stage = documentSource.createElement('div');
  stage.id = STAGE_ID;
  stage.className = 'gameroadSetupForestStage';
  stage.setAttribute('aria-hidden', 'true');
  stage.style.position = 'absolute';
  stage.style.inset = '0';
  stage.style.overflow = 'hidden';
  stage.style.pointerEvents = 'none';
  stage.style.zIndex = '0';
  stage.style.contain = 'layout paint style';
  stage.style.isolation = 'isolate';
  if (typeof setup.prepend === 'function') setup.prepend(stage);
  else setup.insertBefore?.(stage, setup.firstChild || null);
  return stage;
}

function createAnimationStyle(documentSource) {
  const style = documentSource.createElement('style');
  style.dataset.runtimeAnimationStyles = 'setup-forest';
  style.textContent = FOREST_ANIMATION_CSS;
  return style;
}

function renderProjection(documentSource, setup, stage, projection) {
  setup.dataset.setupForestMounted = 'true';
  setup.dataset.setupForestViewport = projection.viewportKey;
  setup.dataset.setupForestGeneration = 'candidate';
  setup.dataset.setupForestMedia = 'partial';
  applyStyleEntries(setup.style, setupForestSafeZoneStyleEntries(projection));

  stage.dataset.layoutSchema = projection.layoutSchema;
  stage.dataset.runtimeSchema = projection.schema;
  stage.dataset.viewportKey = projection.viewportKey;
  stage.dataset.generationState = 'candidate';
  stage.dataset.mediaState = 'partial';
  stage.dataset.layerCount = String(projection.layers.length);

  const slots = projection.layers.map((layer) => createLayerSlot(documentSource, layer));
  const animationStyle = createAnimationStyle(documentSource);
  if (typeof stage.replaceChildren === 'function') stage.replaceChildren(animationStyle, ...slots);
  else {
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    stage.appendChild(animationStyle);
    for (const slot of slots) stage.appendChild(slot);
  }
}

export function refreshSetupForestStageRuntime({
  documentSource = globalThis.document,
  windowSource = globalThis.window,
} = {}) {
  try {
    const setup = documentSource?.querySelector?.(SETUP_SELECTOR);
    if (!setup || !documentSource?.createElement) {
      runtime.lastError = 'SETUP_NOT_AVAILABLE';
      return snapshotSetupForestStageRuntime();
    }
    const projection = projectSetupForestRuntime(dimensionsFromWindow(windowSource));
    const stage = ensureStage(documentSource, setup);
    renderProjection(documentSource, setup, stage, projection);
    runtime.setup = setup;
    runtime.stage = stage;
    runtime.viewportKey = projection.viewportKey;
    runtime.refreshCount += 1;
    runtime.lastError = null;
    return snapshotSetupForestStageRuntime();
  } catch (error) {
    runtime.lastError = String(error?.message || error || 'SETUP_FOREST_RUNTIME_ERROR');
    return snapshotSetupForestStageRuntime();
  }
}

export function mountSetupForestStageRuntime({
  documentSource = globalThis.document,
  windowSource = globalThis.window,
} = {}) {
  if (runtime.mounted) return refreshSetupForestStageRuntime({ documentSource, windowSource });
  runtime.mounted = true;
  runtime.resizeHandler = () => refreshSetupForestStageRuntime({ documentSource, windowSource });
  windowSource?.addEventListener?.('resize', runtime.resizeHandler, { passive: true });
  return refreshSetupForestStageRuntime({ documentSource, windowSource });
}

export function unmountSetupForestStageRuntime({
  windowSource = globalThis.window,
} = {}) {
  if (runtime.resizeHandler) windowSource?.removeEventListener?.('resize', runtime.resizeHandler);
  runtime.stage?.remove?.();
  if (runtime.setup?.dataset) {
    delete runtime.setup.dataset.setupForestMounted;
    delete runtime.setup.dataset.setupForestViewport;
    delete runtime.setup.dataset.setupForestGeneration;
    delete runtime.setup.dataset.setupForestMedia;
  }
  runtime.mounted = false;
  runtime.setup = null;
  runtime.stage = null;
  runtime.viewportKey = null;
  runtime.resizeHandler = null;
  return snapshotSetupForestStageRuntime();
}

export function snapshotSetupForestStageRuntime() {
  return Object.freeze({
    mounted: runtime.mounted,
    viewportKey: runtime.viewportKey,
    layerCount: Number(runtime.stage?.dataset?.layerCount || 0),
    generationState: runtime.stage?.dataset?.generationState || 'candidate',
    mediaState: runtime.stage?.dataset?.mediaState || 'partial',
    refreshCount: runtime.refreshCount,
    lastError: runtime.lastError,
  });
}

function autoMount() {
  if (typeof document === 'undefined') return;
  const mount = () => mountSetupForestStageRuntime({ documentSource: document, windowSource: globalThis.window });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  globalThis[GLOBAL_KEY] = Object.freeze({
    refresh: () => refreshSetupForestStageRuntime({ documentSource: document, windowSource: globalThis.window }),
    snapshot: snapshotSetupForestStageRuntime,
  });
}

autoMount();

export const SETUP_FOREST_RUNTIME_STAGE_ID = STAGE_ID;

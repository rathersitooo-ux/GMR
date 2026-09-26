const SCHEMA = 'gameroad.setup-forest-stage-layout.v1';
const MEDIA_FIELD_RE = /(asset|image|url|uri|src)/i;
const MAX_LAYER_DENSITY = 0.38;
const MAX_ATMOSPHERE_DENSITY = 0.12;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

const COMMON_FORBIDDEN = Object.freeze([
  'manicured-path',
  'fence',
  'bench',
  'lamppost',
  'building',
  'trimmed-hedge',
  'symmetrical-landscaping',
  'fantasy-glowing-flora',
  'particle-confetti',
  'dense-flower-carpet',
  'repeated-micro-leaf-noise',
  'decorative-object-spam',
  'insect',
  'beetle',
  'larva',
  'butterfly',
  'wing',
  'cocoon',
  'insect-silhouette',
  'bug-icon',
  'spider-like-form',
  'creature-focal-subject',
]);

function layer(id, zOrder, kind, rect, densityBudget, contrastBudget, detailScale, purpose, extraForbidden = []) {
  return {
    id,
    zOrder,
    kind,
    rect,
    densityBudget,
    contrastBudget,
    detailScale,
    purpose,
    forbiddenContent: [...COMMON_FORBIDDEN, ...extraForbidden],
  };
}

function zone(id, rect, maxDetailDensity, maxContrast, purpose) {
  return { id, rect, maxDetailDensity, maxContrast, purpose };
}

const WIDE_LAYERS = [
  layer('far-haze', 10, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.04, 0.05, 'macro',
    'Bind depth together with humid summer air; never turn haze into visible particle noise.'),
  layer('canopy-mass', 20, 'foliage', { x: 0, y: 0, width: 100, height: 42 }, 0.22, 0.20, 'large',
    'One broad dark-green crown mass with only a few readable breaks for sky light.'),
  layer('deep-trunk-mass', 30, 'wood', { x: 0, y: 6, width: 100, height: 72 }, 0.24, 0.28, 'large',
    'Large vertical trunks and root silhouettes establish scale before small vegetation.'),
  layer('forest-floor', 40, 'terrain', { x: 0, y: 44, width: 100, height: 56 }, 0.18, 0.26, 'large',
    'Warm soil, fallen leaf masses and roots read as one quiet ground plane.'),
  layer('midgrowth-left', 50, 'foliage', { x: 0, y: 30, width: 31, height: 65 }, 0.32, 0.34, 'medium',
    'Ferns and broad leaves concentrate left of the visual corridor instead of filling the whole screen.'),
  layer('midgrowth-right-subdued', 60, 'foliage', { x: 58, y: 22, width: 42, height: 72 }, 0.10, 0.12, 'large',
    'Sparse, low-contrast forest continuation behind the Setup control field.'),
  layer('foreground-root-frame', 70, 'wood', { x: 0, y: 57, width: 22, height: 43 }, 0.30, 0.36, 'large',
    'One strong root or trunk edge frames the scene without creating a tunnel or path.'),
  layer('foreground-leaf-frame', 80, 'foliage', { x: 0, y: 0, width: 16, height: 60 }, 0.28, 0.32, 'medium',
    'A limited edge cluster gives near-depth; never scatter foreground leaves across the UI half.'),
  layer('sun-patch', 90, 'light', { x: 17, y: 4, width: 33, height: 66 }, 0.07, 0.10, 'macro',
    'One broad warm summer light opening, not many god-rays or glitter points.'),
  layer('humid-air-veil', 100, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.04, 0.05, 'macro',
    'Very restrained foreground humidity softens transitions without whitening the forest.'),
];

const SHORT_LAYERS = [
  layer('far-haze', 10, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.035, 0.05, 'macro',
    'Keep depth readable at low height without particle detail.'),
  layer('canopy-mass', 20, 'foliage', { x: 0, y: 0, width: 100, height: 38 }, 0.18, 0.18, 'large',
    'Flatten the canopy into fewer, larger masses for the 667x375 crop.'),
  layer('deep-trunk-mass', 30, 'wood', { x: 0, y: 4, width: 100, height: 74 }, 0.20, 0.25, 'large',
    'Use two or three dominant trunk rhythms; no thin-branch lattice.'),
  layer('forest-floor', 40, 'terrain', { x: 0, y: 45, width: 100, height: 55 }, 0.15, 0.24, 'large',
    'Preserve a single warm floor plane even when vertical room is limited.'),
  layer('midgrowth-left', 50, 'foliage', { x: 0, y: 34, width: 25, height: 58 }, 0.25, 0.30, 'medium',
    'Keep vegetation clustered at the left edge so controls and the central opening stay clear.'),
  layer('midgrowth-right-subdued', 60, 'foliage', { x: 47, y: 18, width: 53, height: 78 }, 0.075, 0.10, 'large',
    'Right side is an intentionally quiet continuation beneath the compact control stack.'),
  layer('foreground-root-frame', 70, 'wood', { x: 0, y: 62, width: 17, height: 38 }, 0.22, 0.30, 'large',
    'One low root accent only; foreground obstruction is reduced versus wide landscape.'),
  layer('foreground-leaf-frame', 80, 'foliage', { x: 0, y: 0, width: 10, height: 52 }, 0.20, 0.27, 'medium',
    'Narrow edge foliage only; do not mask a short-landscape touch target.'),
  layer('sun-patch', 90, 'light', { x: 11, y: 2, width: 28, height: 64 }, 0.055, 0.09, 'macro',
    'Use one compressed light patch to retain summer warmth.'),
  layer('humid-air-veil', 100, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.035, 0.05, 'macro',
    'Very light humidity only.'),
];

const PORTRAIT_LAYERS = [
  layer('far-haze', 10, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.035, 0.05, 'macro',
    'Carry the same forest through the full portrait background with no separate mobile scene invention.'),
  layer('canopy-mass', 20, 'foliage', { x: 0, y: 0, width: 100, height: 23 }, 0.18, 0.18, 'large',
    'A compact upper canopy mass anchors the portrait scene.'),
  layer('deep-trunk-mass', 30, 'wood', { x: 0, y: 2, width: 100, height: 43 }, 0.20, 0.25, 'large',
    'Large trunks remain legible in the upper scene rather than being replaced by small foliage.'),
  layer('forest-floor', 40, 'terrain', { x: 0, y: 28, width: 100, height: 72 }, 0.09, 0.16, 'large',
    'The same floor extends behind lower controls at reduced contrast and detail.'),
  layer('midgrowth-left', 50, 'foliage', { x: 0, y: 19, width: 28, height: 27 }, 0.24, 0.29, 'medium',
    'A compact left plant mass frames the upper forest scene.'),
  layer('midgrowth-right-subdued', 60, 'foliage', { x: 54, y: 12, width: 46, height: 34 }, 0.08, 0.11, 'large',
    'Sparse leaves behind the character side; avoid noisy tangencies with face and silhouette.'),
  layer('foreground-root-frame', 70, 'wood', { x: 0, y: 28, width: 17, height: 20 }, 0.20, 0.28, 'large',
    'Short root framing ends before the lower interaction field.'),
  layer('foreground-leaf-frame', 80, 'foliage', { x: 0, y: 0, width: 11, height: 34 }, 0.19, 0.26, 'medium',
    'One near-leaf edge cluster only.'),
  layer('sun-patch', 90, 'light', { x: 12, y: 1, width: 33, height: 38 }, 0.055, 0.09, 'macro',
    'A broad upper summer highlight preserves the same light direction as landscape.'),
  layer('humid-air-veil', 100, 'atmosphere', { x: 0, y: 0, width: 100, height: 100 }, 0.035, 0.05, 'macro',
    'Subtle humidity unifies upper scene and lower quiet background.'),
];

export const SETUP_FOREST_STAGE_CONTRACT = deepFreeze({
  schema: SCHEMA,
  coordinateSystem: {
    origin: 'top-left',
    unit: 'percent',
    xAxis: 'right',
    yAxis: 'down',
    zAxis: 'higher-z-is-nearer-viewer',
    rectShape: '{x,y,width,height}',
  },
  generationGate: {
    state: 'DENY',
    unlock: 'explicit-user-start-after-layout-consumer-and-reference-study-readback',
    reason: 'Current slice fixes composition and production grammar only. It must not generate or embed media.',
  },
  productionPhases: [
    { id: 'reference-study', order: 1, generationAllowed: false, output: 'observed spatial grammar and anti-copy constraints' },
    { id: 'terrain-blockout', order: 2, generationAllowed: false, output: 'ground/opening/trunk mass rectangles' },
    { id: 'canopy-and-trunks', order: 3, generationAllowed: false, output: 'large-value silhouette plan' },
    { id: 'midground-vegetation', order: 4, generationAllowed: false, output: 'limited vegetation density map' },
    { id: 'foreground-frame', order: 5, generationAllowed: false, output: 'edge-only depth framing' },
    { id: 'light-and-atmosphere', order: 6, generationAllowed: false, output: 'single-source light and humidity budget' },
    { id: 'ui-composite', order: 7, generationAllowed: false, output: 'quiet zones and control/character safe areas' },
    { id: 'asset-generation-later', order: 8, generationAllowed: false, requiresExplicitUserStart: true, output: 'future original media produced from approved layout' },
  ],
  referencePrinciples: [
    'Use the observed old Mushiking forest-screen grammar only at an abstract composition level; do not reproduce branded characters, UI, logos, or a one-to-one background arrangement.',
    'Establish the scene with two to four dominant natural masses before any secondary vegetation.',
    'Read earth, trunk/root and leaf/canopy as broad value and color planes rather than many isolated objects.',
    'Use large trunks and roots to establish forest scale before ferns or small leaves.',
    'Compress distant forest into deep-green masses and let warm soil/wood provide a restrained complementary floor.',
    'Use one broad light opening or shaft family; avoid glitter, sparkles and many competing rays.',
    'Treat negative visual space as intentional scenery so character and Setup controls can breathe.',
    'Keep the forest ecologically plausible and free of creature focal subjects unless a later explicit user instruction authorizes them.',
    'Nostalgia comes from scale, shade, warmth, humidity and quietness, not from a vintage filter or copied game art.',
  ],
  summerNostalgiaConstraints: [
    'primeval-unmanaged-forest',
    'humid-japanese-summer-air',
    'child-eye-exploration-scale',
    'cool-green-shade-with-warm-sun-patches',
    'deep-forest-opening-that-invites-looking-further',
    'roots-soil-ferns-and-broad-leaf-masses',
    'no-human-landscaping',
    'no-park-furniture-or-built-path',
    'no-ai-information-overload',
  ],
  paletteLogic: {
    shadowMass: 'deep blue-green',
    livingGreen: 'deep-to-mid natural green',
    sunlight: 'restrained yellow-green and warm amber',
    groundWood: 'warm brown and muted ochre',
    saturationRule: 'reserve highest saturation for small focal areas; never saturate the full forest',
  },
  densityRules: {
    maxLayerDensity: MAX_LAYER_DENSITY,
    maxLightOrAtmosphereDensity: MAX_ATMOSPHERE_DENSITY,
    microDetail: 'forbidden-until-composition-reads-at-thumbnail-scale',
    dominantMassCount: { min: 2, max: 4 },
  },
  viewports: {
    wide: {
      viewport: { width: 1280, height: 720 },
      stageIntent: 'full-screen forest with left character/world staging and right Setup controls',
      safeZones: {
        character: zone('character', { x: 2.5, y: 9, width: 52, height: 86 }, 0.24, 0.34,
          'Matches the current wide Setup hero territory while keeping silhouette edges readable.'),
        centralBreathing: zone('central-breathing', { x: 32, y: 18, width: 24, height: 65 }, 0.10, 0.18,
          'Deliberate low-detail opening toward the deeper forest; no filler vegetation.'),
        uiReading: zone('ui-reading', { x: 56, y: 7, width: 42, height: 88 }, 0.12, 0.16,
          'Low-contrast forest behind the existing right-side Setup control stack.'),
      },
      layers: WIDE_LAYERS,
    },
    shortLandscape: {
      viewport: { width: 667, height: 375 },
      stageIntent: 'same forest compressed vertically; foreground occlusion reduced for touch and readability',
      safeZones: {
        character: zone('character', { x: 0, y: 8, width: 45, height: 90 }, 0.20, 0.30,
          'Keeps current short-landscape hero territory clear.'),
        centralBreathing: zone('central-breathing', { x: 29, y: 17, width: 16, height: 68 }, 0.08, 0.16,
          'Narrow but explicit visual passage between character/world mass and controls.'),
        uiReading: zone('ui-reading', { x: 46, y: 6, width: 52, height: 90 }, 0.10, 0.14,
          'Expanded quiet field matching the compact right-side Setup controls.'),
      },
      layers: SHORT_LAYERS,
    },
    portrait: {
      viewport: { width: 390, height: 844 },
      stageIntent: 'same forest, upper scene-first composition with lower controls over a deliberately subdued continuation',
      safeZones: {
        character: zone('character', { x: 52, y: 5, width: 46, height: 38 }, 0.20, 0.30,
          'Matches the current upper-right portrait character staging.'),
        centralBreathing: zone('central-breathing', { x: 5, y: 6, width: 45, height: 35 }, 0.09, 0.17,
          'Upper-left deep-forest opening; preserves wonder and depth rather than filling it with plants.'),
        uiReading: zone('ui-reading', { x: 3, y: 44, width: 94, height: 54 }, 0.10, 0.14,
          'Lower interaction field keeps the same forest underneath at low density and contrast.'),
      },
      layers: PORTRAIT_LAYERS,
    },
  },
});

function assertFinitePercent(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${label}_percent`);
}

function validateRect(rect, label) {
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) throw new Error(`${label}_rect`);
  for (const key of ['x', 'y', 'width', 'height']) assertFinitePercent(rect[key], `${label}_${key}`);
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`${label}_empty`);
  if (rect.x + rect.width > 100.000001 || rect.y + rect.height > 100.000001) {
    throw new Error(`${label}_out_of_bounds`);
  }
}

function rejectMediaFields(value, path = 'contract') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectMediaFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (MEDIA_FIELD_RE.test(key)) throw new Error(`premature_media_field:${path}.${key}`);
    rejectMediaFields(child, `${path}.${key}`);
  }
}

function validateZones(safeZones, viewportKey) {
  const ids = ['character', 'centralBreathing', 'uiReading'];
  for (const key of ids) {
    const entry = safeZones?.[key];
    if (!entry) throw new Error(`${viewportKey}_missing_zone:${key}`);
    validateRect(entry.rect, `${viewportKey}_zone_${key}`);
    if (!Number.isFinite(entry.maxDetailDensity) || entry.maxDetailDensity < 0 || entry.maxDetailDensity > 0.38) {
      throw new Error(`${viewportKey}_zone_density:${key}`);
    }
    if (!Number.isFinite(entry.maxContrast) || entry.maxContrast < 0 || entry.maxContrast > 1) {
      throw new Error(`${viewportKey}_zone_contrast:${key}`);
    }
  }
  if (safeZones.centralBreathing.maxDetailDensity > 0.10 || safeZones.centralBreathing.maxContrast > 0.18) {
    throw new Error(`${viewportKey}_central_breathing_not_quiet`);
  }
  if (safeZones.uiReading.maxDetailDensity > 0.12 || safeZones.uiReading.maxContrast > 0.16) {
    throw new Error(`${viewportKey}_ui_reading_not_quiet`);
  }
}

function validateLayers(layers, viewportKey, expectedIds = null) {
  if (!Array.isArray(layers) || layers.length < 6) throw new Error(`${viewportKey}_layers`);
  const ids = new Set();
  let previousZ = -Infinity;
  const actualIds = [];
  for (const entry of layers) {
    if (!entry || typeof entry !== 'object' || !entry.id) throw new Error(`${viewportKey}_layer_identity`);
    if (ids.has(entry.id)) throw new Error(`${viewportKey}_duplicate_layer:${entry.id}`);
    ids.add(entry.id);
    actualIds.push(entry.id);
    if (!Number.isInteger(entry.zOrder) || entry.zOrder <= previousZ) {
      throw new Error(`${viewportKey}_z_order:${entry.id}`);
    }
    previousZ = entry.zOrder;
    validateRect(entry.rect, `${viewportKey}_layer_${entry.id}`);
    if (!Number.isFinite(entry.densityBudget) || entry.densityBudget < 0 || entry.densityBudget > MAX_LAYER_DENSITY) {
      throw new Error(`${viewportKey}_density:${entry.id}`);
    }
    if (!Number.isFinite(entry.contrastBudget) || entry.contrastBudget < 0 || entry.contrastBudget > 1) {
      throw new Error(`${viewportKey}_contrast:${entry.id}`);
    }
    if ((entry.kind === 'light' || entry.kind === 'atmosphere') && entry.densityBudget > MAX_ATMOSPHERE_DENSITY) {
      throw new Error(`${viewportKey}_atmosphere_density:${entry.id}`);
    }
    if (!['macro', 'large', 'medium'].includes(entry.detailScale)) {
      throw new Error(`${viewportKey}_detail_scale:${entry.id}`);
    }
    if (!Array.isArray(entry.forbiddenContent) || entry.forbiddenContent.length < COMMON_FORBIDDEN.length) {
      throw new Error(`${viewportKey}_forbidden_content:${entry.id}`);
    }
  }
  if (expectedIds && JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`${viewportKey}_layer_family_drift`);
  }
  return actualIds;
}

export function validateSetupForestStageContract(contract = SETUP_FOREST_STAGE_CONTRACT) {
  if (!contract || contract.schema !== SCHEMA) throw new Error('schema');
  rejectMediaFields(contract);
  if (contract.generationGate?.state !== 'DENY') throw new Error('generation_gate');
  if (!Array.isArray(contract.productionPhases) || contract.productionPhases.length !== 8) throw new Error('production_phases');
  contract.productionPhases.forEach((phase, index) => {
    if (phase.order !== index + 1) throw new Error(`production_phase_order:${phase.id}`);
    if (phase.generationAllowed !== false) throw new Error(`generation_must_remain_disabled:${phase.id}`);
  });
  if (contract.productionPhases.at(-1)?.id !== 'asset-generation-later' ||
      contract.productionPhases.at(-1)?.requiresExplicitUserStart !== true) {
    throw new Error('future_generation_gate');
  }
  if (!Array.isArray(contract.referencePrinciples) || contract.referencePrinciples.length < 7) throw new Error('reference_principles');
  if (!Array.isArray(contract.summerNostalgiaConstraints) || contract.summerNostalgiaConstraints.length < 7) {
    throw new Error('summer_nostalgia_constraints');
  }
  const viewportKeys = ['wide', 'shortLandscape', 'portrait'];
  let expectedIds = null;
  for (const key of viewportKeys) {
    const composition = contract.viewports?.[key];
    if (!composition) throw new Error(`missing_viewport:${key}`);
    if (!Number.isFinite(composition.viewport?.width) || !Number.isFinite(composition.viewport?.height)) {
      throw new Error(`viewport_dimensions:${key}`);
    }
    validateZones(composition.safeZones, key);
    const ids = validateLayers(composition.layers, key, expectedIds);
    if (!expectedIds) expectedIds = ids;
  }
  return true;
}

export function projectSetupForestStage(viewportKey) {
  const composition = SETUP_FOREST_STAGE_CONTRACT.viewports[viewportKey];
  if (!composition) throw new Error(`unknown_setup_forest_viewport:${viewportKey}`);
  return composition;
}

validateSetupForestStageContract();

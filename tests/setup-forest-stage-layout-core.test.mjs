import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETUP_FOREST_STAGE_CONTRACT,
  projectSetupForestStage,
  validateSetupForestStageContract,
} from '../browser/setup-forest-stage-layout-core.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Setup forest contract keeps generation disabled until an explicit later user start', () => {
  assert.equal(SETUP_FOREST_STAGE_CONTRACT.generationGate.state, 'DENY');
  assert.equal(SETUP_FOREST_STAGE_CONTRACT.productionPhases.length, 8);
  assert.deepEqual(
    SETUP_FOREST_STAGE_CONTRACT.productionPhases.map((phase) => phase.id),
    [
      'reference-study',
      'terrain-blockout',
      'canopy-and-trunks',
      'midground-vegetation',
      'foreground-frame',
      'light-and-atmosphere',
      'ui-composite',
      'asset-generation-later',
    ],
  );
  assert.ok(SETUP_FOREST_STAGE_CONTRACT.productionPhases.every((phase) => phase.generationAllowed === false));
  assert.equal(SETUP_FOREST_STAGE_CONTRACT.productionPhases.at(-1).requiresExplicitUserStart, true);
  assert.equal(validateSetupForestStageContract(), true);
});

test('all three target viewports keep the same forest layer family and increasing Z order', () => {
  const keys = ['wide', 'shortLandscape', 'portrait'];
  const expectedIds = projectSetupForestStage('wide').layers.map((layer) => layer.id);
  for (const key of keys) {
    const composition = projectSetupForestStage(key);
    assert.ok(composition.viewport.width > 0);
    assert.ok(composition.viewport.height > 0);
    assert.deepEqual(composition.layers.map((layer) => layer.id), expectedIds);
    assert.ok(composition.layers.every((layer, index) => index === 0 || layer.zOrder > composition.layers[index - 1].zOrder));
  }
});

test('wide Setup composition reserves the current right-side control field and a calm central forest opening', () => {
  const wide = projectSetupForestStage('wide');
  assert.deepEqual(wide.viewport, { width: 1280, height: 720 });
  assert.ok(wide.safeZones.character.rect.x <= 3);
  assert.ok(wide.safeZones.character.rect.width >= 50);
  assert.ok(wide.safeZones.centralBreathing.rect.x >= 30);
  assert.ok(wide.safeZones.centralBreathing.rect.width >= 20);
  assert.ok(wide.safeZones.centralBreathing.maxDetailDensity <= 0.10);
  assert.ok(wide.safeZones.centralBreathing.maxContrast <= 0.18);
  assert.ok(wide.safeZones.uiReading.rect.x >= 55);
  assert.ok(wide.safeZones.uiReading.rect.width >= 40);
  assert.ok(wide.safeZones.uiReading.maxDetailDensity <= 0.12);
  assert.ok(wide.safeZones.uiReading.maxContrast <= 0.16);
  const rightGrowth = wide.layers.find((layer) => layer.id === 'midgrowth-right-subdued');
  assert.ok(rightGrowth.rect.x >= 56);
  assert.ok(rightGrowth.densityBudget <= 0.10);
  assert.ok(rightGrowth.contrastBudget <= 0.12);
});

test('short landscape reduces foreground obstruction and gives controls more horizontal territory', () => {
  const wide = projectSetupForestStage('wide');
  const short = projectSetupForestStage('shortLandscape');
  assert.deepEqual(short.viewport, { width: 667, height: 375 });
  assert.ok(short.safeZones.uiReading.rect.width > wide.safeZones.uiReading.rect.width);
  assert.ok(short.safeZones.uiReading.rect.x < wide.safeZones.uiReading.rect.x);
  const wideForeground = wide.layers
    .filter((layer) => layer.id.startsWith('foreground-'))
    .reduce((sum, layer) => sum + layer.densityBudget, 0);
  const shortForeground = short.layers
    .filter((layer) => layer.id.startsWith('foreground-'))
    .reduce((sum, layer) => sum + layer.densityBudget, 0);
  assert.ok(shortForeground < wideForeground);
  assert.ok(short.safeZones.centralBreathing.maxDetailDensity <= 0.08);
});

test('portrait keeps one forest identity while moving interaction into a quiet lower field', () => {
  const portrait = projectSetupForestStage('portrait');
  assert.deepEqual(portrait.viewport, { width: 390, height: 844 });
  assert.ok(portrait.safeZones.character.rect.y < 10);
  assert.ok(portrait.safeZones.character.rect.x >= 50);
  assert.ok(portrait.safeZones.uiReading.rect.y >= 44);
  assert.ok(portrait.safeZones.uiReading.rect.width >= 90);
  assert.ok(portrait.safeZones.uiReading.maxDetailDensity <= 0.10);
  const floor = portrait.layers.find((layer) => layer.id === 'forest-floor');
  assert.ok(floor.rect.y <= portrait.safeZones.uiReading.rect.y);
  assert.ok(floor.rect.height >= 65);
  assert.ok(floor.densityBudget <= 0.10);
});

test('information density is capped and light/atmosphere remain especially restrained', () => {
  for (const composition of Object.values(SETUP_FOREST_STAGE_CONTRACT.viewports)) {
    for (const layer of composition.layers) {
      assert.ok(layer.densityBudget <= 0.38, layer.id);
      if (layer.kind === 'light' || layer.kind === 'atmosphere') {
        assert.ok(layer.densityBudget <= 0.12, layer.id);
      }
      assert.notEqual(layer.detailScale, 'fine');
    }
  }
  assert.equal(SETUP_FOREST_STAGE_CONTRACT.densityRules.microDetail, 'forbidden-until-composition-reads-at-thumbnail-scale');
});

test('reference constraints explicitly reject manicured parks and common AI clutter patterns', () => {
  const constraints = new Set(SETUP_FOREST_STAGE_CONTRACT.summerNostalgiaConstraints);
  assert.ok(constraints.has('primeval-unmanaged-forest'));
  assert.ok(constraints.has('child-eye-exploration-scale'));
  assert.ok(constraints.has('no-human-landscaping'));
  assert.ok(constraints.has('no-park-furniture-or-built-path'));
  assert.ok(constraints.has('no-ai-information-overload'));

  for (const composition of Object.values(SETUP_FOREST_STAGE_CONTRACT.viewports)) {
    for (const layer of composition.layers) {
      const forbidden = new Set(layer.forbiddenContent);
      for (const item of [
        'manicured-path',
        'fence',
        'bench',
        'lamppost',
        'building',
        'fantasy-glowing-flora',
        'particle-confetti',
        'repeated-micro-leaf-noise',
        'decorative-object-spam',
      ]) {
        assert.ok(forbidden.has(item), `${layer.id} missing ${item}`);
      }
    }
  }
});

test('validator rejects out-of-bounds rectangles, excessive density, duplicate layers and broken Z order', () => {
  const outside = clone(SETUP_FOREST_STAGE_CONTRACT);
  outside.viewports.wide.layers[0].rect.x = 10;
  outside.viewports.wide.layers[0].rect.width = 95;
  assert.throws(() => validateSetupForestStageContract(outside), /out_of_bounds/);

  const dense = clone(SETUP_FOREST_STAGE_CONTRACT);
  dense.viewports.wide.layers[1].densityBudget = 0.55;
  assert.throws(() => validateSetupForestStageContract(dense), /density/);

  const duplicate = clone(SETUP_FOREST_STAGE_CONTRACT);
  duplicate.viewports.wide.layers[1].id = duplicate.viewports.wide.layers[0].id;
  assert.throws(() => validateSetupForestStageContract(duplicate), /duplicate_layer/);

  const zBroken = clone(SETUP_FOREST_STAGE_CONTRACT);
  zBroken.viewports.wide.layers[1].zOrder = zBroken.viewports.wide.layers[0].zOrder;
  assert.throws(() => validateSetupForestStageContract(zBroken), /z_order/);
});

test('validator rejects premature media fields so this slice cannot smuggle generated art into the contract', () => {
  for (const key of ['imagePath', 'backgroundUrl', 'assetId', 'src', 'uri']) {
    const modified = clone(SETUP_FOREST_STAGE_CONTRACT);
    modified.viewports.wide.layers[0][key] = 'forbidden';
    assert.throws(() => validateSetupForestStageContract(modified), /premature_media_field/);
  }
});

test('unknown viewport projection fails closed', () => {
  assert.throws(() => projectSetupForestStage('tablet-mystery'), /unknown_setup_forest_viewport/);
});

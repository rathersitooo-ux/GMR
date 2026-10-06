import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SETUP_FOREST_RUNTIME_STAGE_ID,
  classifySetupForestViewport,
  mountSetupForestStageRuntime,
  projectSetupForestRuntime,
  setupForestLayerStyleEntries,
  setupForestSafeZoneStyleEntries,
  snapshotSetupForestStageRuntime,
  unmountSetupForestStageRuntime,
} from '../browser/setup-forest-stage-runtime-mount.mjs';

function fakeStyle() {
  return {
    setProperty(key, value) { this[key] = String(value); },
  };
}

function fakeNode(tagName = 'div') {
  const node = {
    tagName: tagName.toUpperCase(),
    id: '',
    className: '',
    dataset: {},
    style: fakeStyle(),
    children: [],
    attributes: {},
    parentNode: null,
    firstChild: null,
    setAttribute(key, value) { this.attributes[key] = String(value); },
    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return this.children.find((child) => child.id === id) || null;
      }
      return null;
    },
    prepend(...items) {
      this.children.unshift(...items);
      for (const item of items) item.parentNode = this;
      this.firstChild = this.children[0] || null;
    },
    appendChild(item) {
      this.children.push(item);
      item.parentNode = this;
      this.firstChild = this.children[0] || null;
      return item;
    },
    insertBefore(item) {
      this.prepend(item);
      return item;
    },
    replaceChildren(...items) {
      this.children = items;
      for (const item of items) item.parentNode = this;
      this.firstChild = this.children[0] || null;
    },
    removeChild(item) {
      this.children = this.children.filter((child) => child !== item);
      this.firstChild = this.children[0] || null;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
  };
  return node;
}

function fakeRuntime(width = 1280, height = 720) {
  const setup = fakeNode('section');
  setup.dataset.screen = 'setup';
  const documentSource = {
    readyState: 'complete',
    querySelector(selector) {
      return selector === 'section[data-screen="setup"]' ? setup : null;
    },
    createElement(tagName) {
      return fakeNode(tagName);
    },
  };
  const listeners = new Map();
  const windowSource = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
  };
  return { setup, documentSource, windowSource, listeners };
}

test('viewport classifier maps the three adopted Setup compositions deterministically', () => {
  assert.equal(classifySetupForestViewport({ width: 1280, height: 720 }), 'wide');
  assert.equal(classifySetupForestViewport({ width: 667, height: 375 }), 'shortLandscape');
  assert.equal(classifySetupForestViewport({ width: 390, height: 844 }), 'portrait');
  assert.equal(classifySetupForestViewport({ width: 844, height: 390 }), 'shortLandscape');
});

test('runtime projection marks generated media as a candidate and reports partial binding', () => {
  for (const input of [
    { width: 1280, height: 720 },
    { width: 667, height: 375 },
    { width: 390, height: 844 },
  ]) {
    const projection = projectSetupForestRuntime(input);
    assert.equal(projection.generationState, 'CANDIDATE');
    assert.equal(projection.mediaState, 'PARTIAL');
    assert.equal(projection.layers.length, 10);
    assert.ok(projection.layers.every((layer, index) => index === 0 || layer.zOrder > projection.layers[index - 1].zOrder));
    assert.ok(projection.safeZones.centralBreathing.maxDetailDensity <= 0.10);
    assert.ok(projection.safeZones.uiReading.maxDetailDensity <= 0.12);
  }
});

test('layer and safe-zone geometry becomes explicit CSS custom-property coordinates', () => {
  const projection = projectSetupForestRuntime({ width: 1280, height: 720 });
  const floor = projection.layers.find((layer) => layer.id === 'forest-floor');
  const layerStyle = setupForestLayerStyleEntries(floor);
  assert.equal(layerStyle.left, '0%');
  assert.equal(layerStyle.top, '44%');
  assert.equal(layerStyle.width, '100%');
  assert.equal(layerStyle.height, '56%');
  assert.equal(layerStyle.zIndex, '40');

  const safe = setupForestSafeZoneStyleEntries(projection);
  assert.equal(safe['--gr-setup-forest-ui-reading-x'], '56%');
  assert.equal(safe['--gr-setup-forest-ui-reading-width'], '42%');
  assert.equal(safe['--gr-setup-forest-central-breathing-x'], '32%');
  assert.equal(safe['--gr-setup-forest-central-breathing-width'], '24%');
});

test('live mount binds the animated sun patch while retaining ten ordered layer slots', () => {
  const fake = fakeRuntime(1280, 720);
  const mounted = mountSetupForestStageRuntime(fake);
  assert.equal(mounted.mounted, true);
  assert.equal(mounted.viewportKey, 'wide');
  assert.equal(mounted.layerCount, 10);
  assert.equal(mounted.generationState, 'candidate');
  assert.equal(mounted.mediaState, 'partial');
  assert.equal(fake.setup.dataset.setupForestMounted, 'true');
  assert.equal(fake.setup.dataset.setupForestViewport, 'wide');
  assert.equal(fake.setup.dataset.setupForestGeneration, 'candidate');
  assert.equal(fake.setup.dataset.setupForestMedia, 'partial');
  assert.equal(fake.setup.children.length, 1);

  const stage = fake.setup.children[0];
  assert.equal(stage.id, SETUP_FOREST_RUNTIME_STAGE_ID);
  assert.equal(stage.dataset.layerCount, '10');
  const layers = stage.children.filter((child) => child.className === 'gameroadSetupForestLayerSlot');
  assert.equal(layers.length, 10);
  assert.ok(stage.children.some((child) => child.tagName === 'STYLE' && child.textContent.includes('@keyframes gameroadSetupForestSunPatch')));
  assert.deepEqual(
    layers.map((layer) => layer.dataset.layerId),
    projectSetupForestRuntime({ width: 1280, height: 720 }).layers.map((layer) => layer.id),
  );
  const sunPatch = layers.find((layer) => layer.dataset.layerId === 'sun-patch');
  assert.equal(sunPatch.dataset.mediaState, 'bound');
  assert.equal(sunPatch.dataset.animationState, 'enabled');
  assert.match(sunPatch.style.backgroundImage, /setup-forest-sun-patch-4x4-v1\.png/);
  assert.equal(sunPatch.style.backgroundSize, '400% 400%');
  assert.match(sunPatch.style.animation, /9s steps\(1, end\) infinite alternate/);
  assert.ok(layers.filter((layer) => layer !== sunPatch).every((layer) => layer.dataset.mediaState === 'unbound'));
  assert.ok(layers.every((layer) => layer.style.background === 'none'));
  assert.equal(fake.setup.style['--gr-setup-forest-ui-reading-x'], '56%');
  assert.equal(fake.setup.style['--gr-setup-forest-central-breathing-x'], '32%');

  fake.windowSource.innerWidth = 390;
  fake.windowSource.innerHeight = 844;
  fake.listeners.get('resize')?.();
  assert.equal(snapshotSetupForestStageRuntime().viewportKey, 'portrait');
  assert.equal(fake.setup.dataset.setupForestViewport, 'portrait');
  assert.equal(fake.setup.style['--gr-setup-forest-ui-reading-y'], '44%');

  const unmounted = unmountSetupForestStageRuntime({ windowSource: fake.windowSource });
  assert.equal(unmounted.mounted, false);
  assert.equal(fake.setup.children.length, 0);
});

test('production bootstrap mounts the forest stage through the already-loaded Home/Cards presentation module', () => {
  const source = fs.readFileSync(new URL('../browser/home-cards-2p5d-presentation.mjs', import.meta.url), 'utf8');
  assert.match(source, /import '\.\/home-boot-runtime-mount\.mjs';/);
  assert.match(source, /import '\.\/setup-forest-stage-runtime-mount\.mjs';/);
});

test('runtime binds only the approved generated ambient sprite and provides a reduced-motion fallback', () => {
  const source = fs.readFileSync(new URL('../browser/setup-forest-stage-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(source, /FOREST_MEDIA_BINDINGS/);
  assert.match(source, /backgroundImage\s*=/);
  assert.match(source, /url\(/i);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /dataset\.mediaState = media \? 'bound' : 'unbound'/);
  assert.match(source, /dataset\.generationState = 'candidate'/);
});

test('generated sprite exists as a portable transparent PNG', () => {
  const sprite = fs.readFileSync(new URL('../assets/visual/effects/setup-forest-sun-patch-4x4-v1.png', import.meta.url));
  assert.equal(sprite.toString('ascii', 1, 4), 'PNG');
  assert.equal(sprite.readUInt32BE(16), 1448);
  assert.equal(sprite.readUInt32BE(20), 1086);
  assert.ok(sprite.length < 2_000_000);
});

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

test('runtime projection carries the ordered layout contract without binding media', () => {
  for (const input of [
    { width: 1280, height: 720 },
    { width: 667, height: 375 },
    { width: 390, height: 844 },
  ]) {
    const projection = projectSetupForestRuntime(input);
    assert.equal(projection.generationState, 'DENY');
    assert.equal(projection.mediaState, 'UNBOUND');
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

test('live mount creates inert ordered slots, exposes axis metadata, and stays media-unbound', () => {
  const fake = fakeRuntime(1280, 720);
  const mounted = mountSetupForestStageRuntime(fake);
  assert.equal(mounted.mounted, true);
  assert.equal(mounted.viewportKey, 'wide');
  assert.equal(mounted.layerCount, 10);
  assert.equal(mounted.generationState, 'denied');
  assert.equal(mounted.mediaState, 'unbound');
  assert.equal(fake.setup.dataset.setupForestMounted, 'true');
  assert.equal(fake.setup.dataset.setupForestViewport, 'wide');
  assert.equal(fake.setup.dataset.setupForestGeneration, 'denied');
  assert.equal(fake.setup.dataset.setupForestMedia, 'unbound');
  assert.equal(fake.setup.children.length, 1);

  const stage = fake.setup.children[0];
  assert.equal(stage.id, SETUP_FOREST_RUNTIME_STAGE_ID);
  assert.equal(stage.dataset.layerCount, '10');
  assert.equal(stage.children.length, 10);
  assert.deepEqual(
    stage.children.map((layer) => layer.dataset.layerId),
    projectSetupForestRuntime({ width: 1280, height: 720 }).layers.map((layer) => layer.id),
  );
  assert.ok(stage.children.every((layer) => layer.dataset.mediaState === 'unbound'));
  assert.ok(stage.children.every((layer) => layer.style.background === 'none'));
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

test('runtime mount contains no media producer or generated-art binding in this slice', () => {
  const source = fs.readFileSync(new URL('../browser/setup-forest-stage-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /backgroundImage\s*=/);
  assert.doesNotMatch(source, /createElement\(['"]img['"]\)/);
  assert.doesNotMatch(source, /\.src\s*=/);
  assert.doesNotMatch(source, /url\(/i);
  assert.match(source, /dataset\.mediaState = 'unbound'/);
  assert.match(source, /dataset\.generationState = 'denied'/);
});

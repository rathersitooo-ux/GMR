import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_LOOK_SCHEMA,
  SHOP_LOOK_ASSETS,
  SHOP_LOOK_CSS,
  projectShopLook,
  ensureShopLookStyle,
  mountShopLookRuntime,
  ensureShopLookRuntime,
} from '../browser/shop-look-runtime.mjs';

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.classList = {
      values: new Set(),
      add: (name) => { this.classList.values.add(name); },
      contains: (name) => this.classList.values.has(name),
    };
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  querySelector() { return null; }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head', this);
    this.stylesById = new Map();
    this.screens = [];
  }
  createElement(tagName) {
    const node = new FakeNode(tagName, this);
    if (tagName === 'style') {
      const doc = this;
      Object.defineProperty(node, 'id', {
        get() { return this._id; },
        set(value) { this._id = value; doc.stylesById.set(value, this); },
      });
    }
    return node;
  }
  getElementById(id) { return this.stylesById.get(id) || null; }
  querySelectorAll(selector) {
    if (selector === '.screen[data-screen]') return this.screens;
    return [];
  }
}

function makeShopScreen(documentSource) {
  const screen = new FakeNode('section', documentSource);
  screen.dataset.screen = 'shop';
  screen.className = 'screen simple';
  return screen;
}

test('projection lists the six look parts and claims no purchase authority', () => {
  const projection = projectShopLook();
  assert.equal(projection.schema, SHOP_LOOK_SCHEMA);
  assert.equal(projection.purchaseAuthority, false);
  assert.equal(projection.ownershipMutationAllowed, false);
  assert.equal(projection.saveMutationAllowed, false);
  assert.equal(Object.keys(SHOP_LOOK_ASSETS).length, 6);
  for (const asset of Object.values(SHOP_LOOK_ASSETS)) {
    assert.match(asset, /^assets\/visual\/shop-look-/);
    assert.ok(SHOP_LOOK_CSS.includes(asset), `CSS references ${asset}`);
  }
  assert.deepEqual([...projection.targets], [
    'shop-screen-background',
    'shop-heading-band',
    'shop-branch-cards',
    'shop-branch-card-buttons',
    'shop-charge-balance',
    'shop-exchange-balance',
    'shop-charge-view',
    'shop-exchange-view',
    'shop-formal-catalog',
  ]);
});

test('CSS frames every part onto its own element and adds no screen text', () => {
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .surfaceHead.shopHead'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopGrid .shopCard'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopGrid .shopCard .btn'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopChargeBalance'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopExchangeBalance'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopChargeView'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopExchangeView'));
  assert.ok(SHOP_LOOK_CSS.includes('.shopLookApplied .shopFormalCatalogHost'));
  // Framing comes from the measured part boxes, not from a full-canvas stretch.
  assert.ok(SHOP_LOOK_CSS.includes('background-size:125% 124%'));
  assert.ok(SHOP_LOOK_CSS.includes('background-size:115% 422%'));
  assert.ok(SHOP_LOOK_CSS.includes('background-size:266% 519%'));
  assert.ok(SHOP_LOOK_CSS.includes('background-size:130% 249%'));
  assert.ok(SHOP_LOOK_CSS.includes('background-position:50% 85%'));
  // No words are painted into the look: text stays in the game, not the art.
  assert.ok(!SHOP_LOOK_CSS.includes('ショップ'));
  assert.ok(!/content\s*:/.test(SHOP_LOOK_CSS));
});

test('style is injected once and mounting marks the screen', () => {
  const documentSource = new FakeDocument();
  assert.equal(ensureShopLookStyle(documentSource), true);
  assert.equal(ensureShopLookStyle(documentSource), false);
  const screen = makeShopScreen(documentSource);
  const first = mountShopLookRuntime({screen, documentSource});
  assert.equal(first.mounted, true);
  assert.equal(first.schema, SHOP_LOOK_SCHEMA);
  assert.equal(screen.classList.contains('shopLookApplied'), true);
  assert.equal(mountShopLookRuntime({screen, documentSource}), first);
});

test('mounting without a screen node throws', () => {
  const documentSource = new FakeDocument();
  assert.throws(() => mountShopLookRuntime({screen: null, documentSource}), /shop look requires a shop screen node/);
});

test('ensure finds the shop screen and returns null without one', () => {
  const documentSource = new FakeDocument();
  assert.equal(ensureShopLookRuntime(documentSource), null);
  const screen = makeShopScreen(documentSource);
  documentSource.screens = [screen];
  const runtime = ensureShopLookRuntime(documentSource);
  assert.equal(runtime?.mounted, true);
  assert.equal(screen.classList.contains('shopLookApplied'), true);
  assert.equal(ensureShopLookRuntime(documentSource), runtime);
});

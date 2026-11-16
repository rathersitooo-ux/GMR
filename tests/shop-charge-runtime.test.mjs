import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_CHARGE_SCHEMA,
  SHOP_CHARGE_CSS,
  SHOP_CHARGE_VIEW_ID,
  SHOP_CHARGE_BALANCE_NOTE,
  SHOP_CHARGE_DISPLAY_ONLY_NOTE,
  SHOP_CHARGE_PRICE_BASIS_NOTE,
  SHOP_CHARGE_BUY_DISABLED_LABEL,
  SHOP_CHARGE_PASS_BUTTON_LABEL,
  SHOP_CHARGE_PASS_BUTTON_MISSING,
  SHOP_CHARGE_BALANCE,
  SHOP_CHARGE_CRYSTAL_PACKS,
  SHOP_CHARGE_BUNDLES,
  crystalPackLabel,
  crystalPackDetail,
  crystalPackPriceText,
  projectShopCharge,
  mountShopChargeRuntime,
  ensureShopChargeRuntime,
} from '../browser/shop-charge-runtime.mjs';

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.scrolledIntoView = 0;
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
  scrollIntoView() { this.scrolledIntoView += 1; }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head', this);
    this.stylesById = new Map();
    this.nodesById = new Map();
    this.screens = [];
    this.buttons = [];
  }
  createElement(tagName) { return new FakeNode(tagName, this); }
  createDocumentFragment() { return new FakeNode('#fragment', this); }
  getElementById(id) {
    if (id === 'gameroad-shop-charge-r1') return this.stylesById.get(id) || null;
    return this.nodesById.get(id) || null;
  }
  querySelectorAll(selector) {
    if (selector === '.screen[data-screen]') return this.screens;
    if (selector === 'button') return this.buttons;
    return [];
  }
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

test('charge projection lists crystal packs, bundles and the 500 yen pass', () => {
  const out = projectShopCharge();
  assert.equal(out.schema, SHOP_CHARGE_SCHEMA);
  assert.equal(out.battlePassPriceYen, 500);
  assert.deepEqual(out.balance, {paid: 0, free: 0});
  assert.equal(out.crystalPacks.length, 7);
  assert.deepEqual(out.crystalPacks.map((pack) => pack.total), [60, 240, 490, 990, 1500, 2600, 5500]);
  assert.deepEqual(out.bundles.map((bundle) => bundle.id), ['bundle-release']);
  assert.equal(out.purchaseAuthority, false);
  assert.equal(out.ownershipMutationAllowed, false);
  assert.equal(out.saveMutationAllowed, false);
});

test('every crystal pack splits paid and free crystals', () => {
  for (const pack of SHOP_CHARGE_CRYSTAL_PACKS) {
    assert.equal(pack.paid + pack.free, pack.total);
    assert.match(crystalPackDetail(pack), /有償 \d+個/);
    if (pack.free > 0) assert.match(crystalPackDetail(pack), /無償 \d+個/);
  }
  assert.equal(crystalPackLabel(SHOP_CHARGE_CRYSTAL_PACKS[1]), 'クリスタル240個');
  assert.equal(crystalPackDetail(SHOP_CHARGE_CRYSTAL_PACKS[1]), '有償 200個 ／ 無償 40個');
  assert.equal(crystalPackPriceText(SHOP_CHARGE_CRYSTAL_PACKS[1]), '500円');
  assert.equal(crystalPackDetail(SHOP_CHARGE_CRYSTAL_PACKS[0]), '有償 60個');
});

test('bundle shows its contents, price and one-set limit', () => {
  const bundle = SHOP_CHARGE_BUNDLES[0];
  assert.equal(bundle.title, 'リリース記念バンドル');
  assert.equal(bundle.priceYen, 5000);
  assert.equal(bundle.limitText, '1セット限定');
  assert.deepEqual(bundle.contents, [
    '有償クリスタル 2000個',
    '無償クリスタル 200個',
    'レジェンドパックチケット 3枚',
    'エーテル 3500個',
  ]);
});

test('charge view mounts hidden with balance, packs, bundle and pass entry', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopChargeRuntime({panel, documentSource});
  const again = mountShopChargeRuntime({panel, documentSource});
  assert.equal(again, runtime);

  const view = runtime.getChargeView();
  assert.equal(view.id, SHOP_CHARGE_VIEW_ID);
  assert.equal(view.hidden, true);
  assert.equal(view.getAttribute('data-shop-charge-view'), 'true');
  const nodes = flatten(view);
  assert.equal(nodes.find((node) => node.className === 'shopChargeTitle').textContent, '課金');
  assert.match(nodes.find((node) => node.className === 'shopChargeNote').textContent, /表示だけです/);
  assert.equal(nodes.filter((node) => node.className === 'shopChargeCard').length, 8);
  assert.equal(nodes.filter((node) => node.attributes.get('data-shop-charge-pack')).length, 7);
  assert.equal(nodes.filter((node) => node.attributes.get('data-shop-charge-bundle')).length, 1);
  const paid = nodes.find((node) => node.attributes.get('data-shop-charge-balance') === 'paid');
  const free = nodes.find((node) => node.attributes.get('data-shop-charge-balance') === 'free');
  assert.match(flatten(paid).find((node) => node.tagName === 'b').textContent, /有償クリスタル 0個/);
  assert.match(flatten(free).find((node) => node.tagName === 'b').textContent, /無償クリスタル 0個/);
  const passButton = nodes.find((node) => node.textContent === SHOP_CHARGE_PASS_BUTTON_LABEL);
  assert.ok(passButton);
  assert.match(nodes.find((node) => node.textContent === 'バトルパス 500円').textContent, /500円/);
  assert.equal(nodes.find((node) => node.textContent === SHOP_CHARGE_PRICE_BASIS_NOTE).textContent, SHOP_CHARGE_PRICE_BASIS_NOTE);
});

test('buy buttons are disabled: display only, no purchase authority', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopChargeRuntime({panel, documentSource});
  const nodes = flatten(runtime.getChargeView());
  const buyButtons = nodes.filter((node) => node.textContent === SHOP_CHARGE_BUY_DISABLED_LABEL);
  assert.equal(buyButtons.length, 8);
  assert.ok(buyButtons.every((button) => button.disabled === true));
  assert.equal(runtime.purchaseAuthority, false);
});

test('show and hide toggle the charge view', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopChargeRuntime({panel, documentSource});

  assert.deepEqual(runtime.showChargeView(), {ok: true, action: 'show-charge'});
  assert.equal(runtime.getChargeView().hidden, false);
  assert.equal(runtime.getChargeView().scrolledIntoView, 1);
  assert.deepEqual(runtime.hideChargeView(), {ok: true, action: 'hide-charge'});
  assert.equal(runtime.getChargeView().hidden, true);
});

test('pass button opens the battle pass screen through the home button', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const homePassButton = new FakeNode('button', documentSource);
  homePassButton.textContent = SHOP_CHARGE_PASS_BUTTON_LABEL;
  let homeClicked = 0;
  homePassButton.addEventListener('click', () => { homeClicked += 1; });
  documentSource.buttons.push(homePassButton);
  const runtime = mountShopChargeRuntime({panel, documentSource});

  assert.deepEqual(runtime.openBattlePass(), {ok: true, action: 'open-battle-pass'});
  assert.equal(homeClicked, 1);
  const passButton = flatten(runtime.getChargeView())
    .find((node) => node.textContent === SHOP_CHARGE_PASS_BUTTON_LABEL && node.tagName === 'button' && node !== homePassButton);
  passButton.click();
  assert.equal(homeClicked, 2);
});

test('pass button reports missing when the home button is absent', () => {
  const documentSource = new FakeDocument();
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopChargeRuntime({panel, documentSource});
  assert.deepEqual(runtime.openBattlePass(), {ok: false, reason: SHOP_CHARGE_PASS_BUTTON_MISSING});
});

test('hidden charge view is really hidden by the stylesheet rule', () => {
  assert.match(SHOP_CHARGE_CSS, /\.shopChargeView\[hidden\]\{display:none\}/);
});

test('ensure returns null without a usable document or shop screen', () => {
  assert.equal(ensureShopChargeRuntime(undefined), null);
  assert.equal(ensureShopChargeRuntime({}), null);
  assert.equal(ensureShopChargeRuntime(globalThis.document), null);
});

test('ensure mounts the charge view into the shop panel', () => {
  const documentSource = new FakeDocument();
  const shopScreen = new FakeNode('section', documentSource);
  shopScreen.dataset.screen = 'shop';
  shopScreen.querySelector = (selector) => {
    if (selector === '.shopPanel') return panel;
    return null;
  };
  const panel = new FakeNode('div', documentSource);
  documentSource.screens.push(shopScreen);
  const runtime = ensureShopChargeRuntime(documentSource);
  assert.ok(runtime);
  assert.equal(runtime.mounted, true);
  assert.equal(runtime.getChargeView().hidden, true);
  assert.equal(panel.children.includes(runtime.getChargeView()), true);
});

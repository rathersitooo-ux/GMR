import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_SUPPLY_CATEGORIES_SCHEMA,
  SHOP_SUPPLY_CATEGORIES_CSS,
  DEFAULT_SHOP_SUPPLY_CATEGORY_ID,
  SHOP_SUPPLY_CATEGORY_EMPTY_TEXT,
  SHOP_SUPPLY_CATEGORIES,
  projectShopSupplyCategories,
  supplyCategoriesForCatalogItem,
  mountShopSupplyCategoriesRuntime,
  ensureShopSupplyCategoriesRuntime,
} from '../browser/shop-supply-categories-runtime.mjs';

class FakeClassList {
  constructor(node) { this.node = node; this.items = new Set(); }
  add(name) { this.items.add(name); this.sync(); }
  remove(name) { this.items.delete(name); this.sync(); }
  contains(name) { return this.items.has(name); }
  sync() { this.node.className = [...this.items].join(' '); }
}

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.hidden = false;
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  insertBefore(node, before) {
    node.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index === -1) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }
  append(node) { return this.appendChild(node); }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const node of nodes) this.appendChild(node);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head', this);
    this.stylesById = new Map();
    this.nodesById = new Map();
    this.screens = [];
  }
  createElement(tagName) { return new FakeNode(tagName, this); }
  createDocumentFragment() { return new FakeNode('#fragment', this); }
  getElementById(id) {
    if (id === 'gameroad-shop-supply-categories-r1') return this.stylesById.get(id) || null;
    return this.nodesById.get(id) || null;
  }
  querySelectorAll(selector) {
    if (selector === '.screen[data-screen]') return this.screens;
    return [];
  }
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

function makeCatalogCard(documentSource, {identity, categories}) {
  const card = new FakeNode('article', documentSource);
  card.className = 'shopCard shopLiveCatalogCard';
  card.dataset.shopItemIdentity = identity;
  if (categories) card.dataset.shopSupplyCategories = categories;
  return card;
}

function makeCatalogHost(documentSource) {
  const host = new FakeNode('div', documentSource);
  host.id = 'shopFormalCatalog';
  host.className = 'shopFormalCatalogHost';
  const shell = new FakeNode('div', documentSource);
  shell.className = 'shopLiveCatalog';
  const section = new FakeNode('section', documentSource);
  section.className = 'shopLiveCatalogSection shopLiveCatalogSection-fanart';
  const title = new FakeNode('h2', documentSource);
  title.className = 'shopLiveCatalogSectionTitle';
  title.textContent = 'ファンアート';
  section.appendChild(title);
  const grid = new FakeNode('div', documentSource);
  grid.className = 'shopGrid shopLiveCatalogGrid';
  grid.appendChild(makeCatalogCard(documentSource, {identity: 'fanart:FANART-SAASUNA-SLEEVE-SNOW-BLUE-001@v1', categories: 'sleeve fanart'}));
  section.appendChild(grid);
  shell.appendChild(section);
  host.appendChild(shell);
  return {host, shell, section, grid};
}

test('supply divides into exactly the six decided categories', () => {
  const out = projectShopSupplyCategories();
  assert.equal(out.schema, SHOP_SUPPLY_CATEGORIES_SCHEMA);
  assert.deepEqual(out.categoryIds, ['all', 'sleeve', 'emblem', 'home-background', 'card-style', 'fanart']);
  assert.deepEqual(SHOP_SUPPLY_CATEGORIES.map((category) => category.title), ['すべて', 'スリーブ', 'エンブレム', 'ホーム背景', 'カードスタイル', 'ファンアート']);
  assert.equal(out.defaultCategoryId, DEFAULT_SHOP_SUPPLY_CATEGORY_ID);
  assert.equal(out.defaultCategoryId, 'all');
  assert.equal(out.emptyText, SHOP_SUPPLY_CATEGORY_EMPTY_TEXT);
  assert.equal(out.purchaseAuthority, false);
  assert.equal(out.ownershipMutationAllowed, false);
  assert.equal(out.saveMutationAllowed, false);
});

test('tab bar keeps buttons in one scrollable row', () => {
  assert.match(SHOP_SUPPLY_CATEGORIES_CSS, /\.shopSupplyCategoryBar\{display:flex;gap:8px;overflow-x:auto/);
  assert.match(SHOP_SUPPLY_CATEGORIES_CSS, /\.shopSupplyCategoryButton\[data-shop-supply-category-active="true"\]/);
});

test('hidden cards and sections are really hidden, not just flagged', () => {
  // The live catalog sets display:grid on cards and sections, which beats
  // the user-agent [hidden] rule, so this module must hide them explicitly.
  assert.match(SHOP_SUPPLY_CATEGORIES_CSS, /\.shopFormalCatalogHost \.shopLiveCatalogCard\[hidden\]\{display:none\}/);
  assert.match(SHOP_SUPPLY_CATEGORIES_CSS, /\.shopFormalCatalogHost \.shopLiveCatalogSection\[hidden\]\{display:none\}/);
});

test('the approved fan-art sleeve belongs to sleeve and fanart, nothing else is guessed', () => {
  assert.deepEqual(
    [...supplyCategoriesForCatalogItem({kind: 'FANART', targetUseSite: 'CARD_SLEEVE'})].sort(),
    ['fanart', 'sleeve'],
  );
  assert.deepEqual(supplyCategoriesForCatalogItem({kind: 'FANART'}), ['fanart']);
  assert.deepEqual(supplyCategoriesForCatalogItem({kind: 'SUPPLY', targetUseSite: 'CARD_SLEEVE'}), ['sleeve']);
  assert.deepEqual(supplyCategoriesForCatalogItem({kind: 'SUPPLY'}), []);
  assert.deepEqual(supplyCategoriesForCatalogItem({kind: 'STANDARD'}), []);
  assert.deepEqual(supplyCategoriesForCatalogItem(null), []);
});

test('mounting adds six tabs, defaults to all, and keeps the sleeve visible', () => {
  const documentSource = new FakeDocument();
  const {host, section} = makeCatalogHost(documentSource);
  const runtime = mountShopSupplyCategoriesRuntime({host, documentSource});

  assert.equal(runtime.mounted, true);
  assert.equal(runtime.getSelectedCategoryId(), 'all');
  assert.equal(runtime.getVisibleCount(), 1);
  const bar = runtime.getTabBar();
  assert.equal(bar.parentNode, host);
  assert.equal(host.children[0], bar);
  const buttons = flatten(bar).filter((node) => typeof node.dataset.shopSupplyCategory === 'string');
  assert.equal(buttons.length, 6);
  assert.deepEqual(buttons.map((button) => button.textContent), ['すべて', 'スリーブ', 'エンブレム', 'ホーム背景', 'カードスタイル', 'ファンアート']);
  assert.equal(buttons[0].dataset.shopSupplyCategoryActive, 'true');
  assert.equal(section.hidden, false);
});

test('selecting sleeve and fanart shows the sleeve; emblem shows the empty note', () => {
  const documentSource = new FakeDocument();
  const {host, section} = makeCatalogHost(documentSource);
  const runtime = mountShopSupplyCategoriesRuntime({host, documentSource});
  const bar = runtime.getTabBar();
  const buttons = flatten(bar).filter((node) => typeof node.dataset.shopSupplyCategory === 'string');
  const emptyNote = flatten(host).find((node) => node.className.includes('shopSupplyCategoryEmpty'));

  const sleeve = runtime.selectCategory('sleeve');
  assert.deepEqual(sleeve, {ok: true, category: 'sleeve', action: 'show-supply-category', visibleCount: 1});
  assert.equal(runtime.getVisibleCount(), 1);
  assert.equal(section.hidden, false);
  assert.equal(emptyNote.hidden, true);

  const fanart = runtime.selectCategory('fanart');
  assert.equal(fanart.ok, true);
  assert.equal(runtime.getVisibleCount(), 1);

  const emblem = runtime.selectCategory('emblem');
  assert.deepEqual(emblem, {ok: true, category: 'emblem', action: 'show-supply-category', visibleCount: 0});
  assert.equal(runtime.getVisibleCount(), 0);
  assert.equal(section.hidden, true);
  assert.equal(emptyNote.hidden, false);
  assert.equal(emptyNote.textContent, SHOP_SUPPLY_CATEGORY_EMPTY_TEXT);
  assert.equal(buttons.find((button) => button.dataset.shopSupplyCategory === 'emblem').dataset.shopSupplyCategoryActive, 'true');
  assert.equal('shopSupplyCategoryActive' in buttons.find((button) => button.dataset.shopSupplyCategory === 'all').dataset, false);
});

test('tab buttons wire clicks and unknown categories are rejected', () => {
  const documentSource = new FakeDocument();
  const {host} = makeCatalogHost(documentSource);
  const runtime = mountShopSupplyCategoriesRuntime({host, documentSource});
  const again = mountShopSupplyCategoriesRuntime({host, documentSource});
  assert.equal(again, runtime);

  const bar = runtime.getTabBar();
  const sleeveButton = flatten(bar).find((node) => node.dataset.shopSupplyCategory === 'sleeve');
  sleeveButton.click();
  assert.equal(runtime.getSelectedCategoryId(), 'sleeve');

  const unknown = runtime.selectCategory('plush');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unknown-category');
  assert.equal(runtime.getSelectedCategoryId(), 'sleeve');
});

test('rebuilding the catalog host remounts the tab bar instead of returning a detached one', () => {
  const documentSource = new FakeDocument();
  const {host} = makeCatalogHost(documentSource);
  const first = mountShopSupplyCategoriesRuntime({host, documentSource});
  const firstBar = first.getTabBar();
  assert.equal(firstBar.parentNode, host);

  // Visiting the shop again rebuilds the catalog inside the same host.
  const rebuilt = makeCatalogHost(documentSource);
  host.replaceChildren(...rebuilt.host.children);
  assert.equal(firstBar.parentNode, null);

  const second = mountShopSupplyCategoriesRuntime({host, documentSource});
  assert.notEqual(second, first);
  assert.equal(second.mounted, true);
  assert.equal(second.getTabBar().parentNode, host);
  assert.equal(second.getVisibleCount(), 1);
});

test('an empty catalog mounts nothing and reports the reason', () => {
  const documentSource = new FakeDocument();
  const host = new FakeNode('div', documentSource);
  host.id = 'shopFormalCatalog';
  const runtime = mountShopSupplyCategoriesRuntime({host, documentSource});
  assert.equal(runtime.mounted, false);
  assert.equal(runtime.reason, 'empty-catalog');
  assert.equal(host.children.length, 0);
});

test('real-DOM HTMLCollection children mount the same as arrays', () => {
  const documentSource = new FakeDocument();
  const {host} = makeCatalogHost(documentSource);
  const shell = host.children[0];
  const shellChildren = [...shell.children];
  // Real DOM exposes children as an HTMLCollection, not an Array.
  shell.children = {length: shellChildren.length};
  shellChildren.forEach((child, index) => { shell.children[index] = child; });
  assert.equal(Array.isArray(shell.children), false);
  const runtime = mountShopSupplyCategoriesRuntime({host, documentSource});
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.selectCategory('emblem'), {ok: true, category: 'emblem', action: 'show-supply-category', visibleCount: 0});
});

test('ensure returns null without a usable document or catalog host', () => {
  assert.equal(ensureShopSupplyCategoriesRuntime(undefined), null);
  assert.equal(ensureShopSupplyCategoriesRuntime({}), null);
  assert.equal(ensureShopSupplyCategoriesRuntime(globalThis.document), null);
});

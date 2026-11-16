import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_PACK_SETS_SCHEMA,
  SHOP_PACK_SETS_CSS,
  DEFAULT_SHOP_PACK_SET_ID,
  projectShopPackSets,
  mountShopPackSetsRuntime,
  ensureShopPackSetsRuntime,
} from '../browser/shop-pack-sets-runtime.mjs';

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
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
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
    if (id === 'gameroad-shop-pack-sets-r1') return this.stylesById.get(id) || null;
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

function makeSetButton(documentSource, setId) {
  const button = new FakeNode('button', documentSource);
  button.className = 'gachaSetButton';
  button.dataset.shopPackSet = setId;
  button.textContent = setId === 'set1' ? '第1弾' : '第2弾（恐竜）';
  return button;
}

function makePackSetList(documentSource) {
  const list = new FakeNode('nav', documentSource);
  list.className = 'gachaSetList';
  list.appendChild(makeSetButton(documentSource, 'set1'));
  list.appendChild(makeSetButton(documentSource, 'set2'));
  return list;
}

function makeDetail(documentSource) {
  const title = new FakeNode('div', documentSource);
  const description = new FakeNode('p', documentSource);
  const price = new FakeNode('div', documentSource);
  const guaranteed = new FakeNode('div', documentSource);
  return {titleNode: title, descriptionNode: description, priceNode: price, guaranteedNode: guaranteed};
}

test('packs divide into exactly the two decided sets with price and guaranteed slot', () => {
  const out = projectShopPackSets();
  assert.equal(out.schema, SHOP_PACK_SETS_SCHEMA);
  assert.deepEqual(out.setIds, ['set1', 'set2']);
  assert.deepEqual(out.sets.map((set) => set.title), ['第1弾', '第2弾（恐竜）']);
  assert.equal(out.defaultSetId, DEFAULT_SHOP_PACK_SET_ID);
  assert.equal(out.defaultSetId, 'set1');
  for (const set of out.sets) {
    assert.match(set.priceText, /500ルピ/);
    assert.match(set.guaranteedText, /7枠目：希少以上確定/);
  }
  assert.equal(out.purchaseAuthority, false);
  assert.equal(out.ownershipMutationAllowed, false);
  assert.equal(out.saveMutationAllowed, false);
});

test('left column keeps three columns and stacks on portrait', () => {
  assert.match(SHOP_PACK_SETS_CSS, /\.gachaLayout\.gachaLayoutWithPackSets\{grid-template-columns:minmax\(150px,\.42fr\) minmax\(0,1\.72fr\) minmax\(280px,\.68fr\)\}/);
  assert.match(SHOP_PACK_SETS_CSS, /@media\(max-width:540px\) and \(orientation:portrait\)\{\.gachaLayout\.gachaLayoutWithPackSets\{grid-template-columns:1fr\}/);
  assert.match(SHOP_PACK_SETS_CSS, /\.gachaSetButton\[data-shop-pack-set-active="true"\]/);
});

test('selecting a set updates the detail and marks the active button', () => {
  const documentSource = new FakeDocument();
  const list = makePackSetList(documentSource);
  const layout = new FakeNode('div', documentSource);
  layout.className = 'gachaLayout';
  const detail = makeDetail(documentSource);
  const runtime = mountShopPackSetsRuntime({list, layout, ...detail, documentSource});

  assert.equal(runtime.getSelectedSetId(), 'set1');
  assert.equal(detail.titleNode.textContent, '第1弾');
  assert.equal(detail.priceNode.textContent, '1パック 500ルピ');
  assert.equal(detail.guaranteedNode.textContent, '7枠目：希少以上確定');
  assert.equal(layout.classList.contains('gachaLayoutWithPackSets'), true);

  const result = runtime.selectSet('set2');
  assert.deepEqual(result, {ok: true, set: 'set2', action: 'show-pack-set'});
  assert.equal(runtime.getSelectedSetId(), 'set2');
  assert.equal(detail.titleNode.textContent, '第2弾（恐竜）');
  assert.match(detail.descriptionNode.textContent, /恐竜/);
  assert.equal(detail.priceNode.textContent, '1パック 500ルピ');
  const buttons = flatten(list).filter((node) => typeof node.dataset.shopPackSet === 'string');
  assert.equal(buttons.find((node) => node.dataset.shopPackSet === 'set2').dataset.shopPackSetActive, 'true');
  assert.equal('shopPackSetActive' in buttons.find((node) => node.dataset.shopPackSet === 'set1').dataset, false);
  assert.equal(runtime.purchaseAuthority, false);
});

test('set buttons wire clicks and unknown sets are rejected', () => {
  const documentSource = new FakeDocument();
  const list = makePackSetList(documentSource);
  const detail = makeDetail(documentSource);
  const runtime = mountShopPackSetsRuntime({list, ...detail, documentSource});
  const again = mountShopPackSetsRuntime({list, ...detail, documentSource});
  assert.equal(again, runtime);

  const set2Button = flatten(list).find((node) => node.dataset.shopPackSet === 'set2');
  set2Button.click();
  assert.equal(runtime.getSelectedSetId(), 'set2');
  assert.equal(detail.titleNode.textContent, '第2弾（恐竜）');

  const unknown = runtime.selectSet('set3');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unknown-set');
  assert.equal(runtime.getSelectedSetId(), 'set2');
  assert.equal(detail.titleNode.textContent, '第2弾（恐竜）');
});

test('real-DOM HTMLCollection children mount the same as arrays', () => {
  const documentSource = new FakeDocument();
  const list = makePackSetList(documentSource);
  const buttons = [...list.children];
  // Real DOM exposes children as an HTMLCollection, not an Array.
  list.children = {length: buttons.length};
  buttons.forEach((button, index) => { list.children[index] = button; });
  assert.equal(Array.isArray(list.children), false);
  const detail = makeDetail(documentSource);
  const runtime = mountShopPackSetsRuntime({list, ...detail, documentSource});
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.selectSet('set2'), {ok: true, set: 'set2', action: 'show-pack-set'});
  assert.equal(detail.titleNode.textContent, '第2弾（恐竜）');
});

test('ensure returns null without a usable document or pack set list', () => {
  assert.equal(ensureShopPackSetsRuntime(undefined), null);
  assert.equal(ensureShopPackSetsRuntime({}), null);
  assert.equal(ensureShopPackSetsRuntime(globalThis.document), null);
});

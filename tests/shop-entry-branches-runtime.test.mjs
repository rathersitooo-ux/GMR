import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_ENTRY_BRANCHES_SCHEMA,
  SHOP_ENTRY_BRANCHES_CSS,
  SHOP_ENTRY_BRANCH_PENDING_NOTE,
  SHOP_ENTRY_BRANCH_BACK_LABEL,
  projectShopEntryBranches,
  mountShopEntryBranchesRuntime,
  ensureShopEntryBranchesRuntime,
} from '../browser/shop-entry-branches-runtime.mjs';

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.scrolledIntoView = 0;
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
  scrollIntoView() { this.scrolledIntoView += 1; }
}

class FakeDocument {
  constructor() {
    this.head = new FakeNode('head', this);
    this.stylesById = new Map();
  }
  createElement(tagName) { return new FakeNode(tagName, this); }
  createDocumentFragment() { return new FakeNode('#fragment', this); }
  getElementById(id) { return this.stylesById.get(id) || null; }
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

function makeBranchCard(documentSource, branchId, withButton) {
  const card = new FakeNode('article', documentSource);
  card.className = 'shopCard shopBranchCard';
  card.dataset.shopBranch = branchId;
  if (withButton) {
    const button = new FakeNode('button', documentSource);
    button.className = 'btn';
    button.dataset.shopBranchOpen = branchId;
    card.appendChild(button);
  }
  return card;
}

function makeShopGrid(documentSource) {
  const grid = new FakeNode('div', documentSource);
  grid.className = 'shopGrid shopEntryBranches';
  grid.appendChild(makeBranchCard(documentSource, 'pack', false));
  grid.appendChild(makeBranchCard(documentSource, 'supply', true));
  grid.appendChild(makeBranchCard(documentSource, 'charge', true));
  grid.appendChild(makeBranchCard(documentSource, 'exchange', true));
  return grid;
}

test('entry divides into exactly the four decided branches', () => {
  const out = projectShopEntryBranches();
  assert.equal(out.schema, SHOP_ENTRY_BRANCHES_SCHEMA);
  assert.deepEqual(out.branches.map((branch)=>branch.id), ['pack', 'supply', 'charge', 'exchange']);
  assert.deepEqual(out.branches.map((branch)=>branch.title), ['カードパック', 'サプライ', '課金', '交換']);
  assert.deepEqual(out.readyBranchIds, ['pack', 'supply', 'charge', 'exchange']);
  assert.deepEqual(out.pendingBranchIds, []);
  assert.equal(out.purchaseAuthority, false);
  assert.equal(out.ownershipMutationAllowed, false);
  assert.equal(out.saveMutationAllowed, false);
});

test('branch grid keeps two equal columns and stacks on portrait', () => {
  assert.match(SHOP_ENTRY_BRANCHES_CSS, /\.shopGrid\.shopEntryBranches\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(SHOP_ENTRY_BRANCHES_CSS, /@media\(max-width:540px\) and \(orientation:portrait\)\{\.shopGrid\.shopEntryBranches\{grid-template-columns:1fr/);
  assert.match(SHOP_ENTRY_BRANCHES_CSS, /\.shopGrid\.shopEntryBranches \.shopCardPack\{grid-row:auto\}/);
});

test('supply branch reveals the mounted catalog without inventing a purchase', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const catalogHost = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, catalogHost, documentSource});

  const result = runtime.openBranch('supply');
  assert.deepEqual(result, {ok:true, branch:'supply', action:'show-catalog'});
  assert.equal(runtime.getActiveBranch(), 'supply');
  assert.equal(catalogHost.scrolledIntoView, 1);
  assert.equal(runtime.getBranchView().hidden, true);
  assert.equal(runtime.purchaseAuthority, false);
});

test('charge branch reveals the mounted charge place', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const chargeHost = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, chargeHost, documentSource});

  const charge = runtime.openBranch('charge');
  assert.deepEqual(charge, {ok:true, branch:'charge', action:'show-charge'});
  assert.equal(runtime.getActiveBranch(), 'charge');
  assert.equal(chargeHost.hidden, false);
  assert.equal(chargeHost.scrolledIntoView, 1);
  assert.equal(runtime.getBranchView().hidden, true);

  const back = runtime.closeBranch();
  assert.deepEqual(back, {ok:true, branch:null, action:'back-to-entry'});
  assert.equal(chargeHost.hidden, true);
  assert.equal(runtime.getActiveBranch(), null);
});

test('charge branch falls back to the preparation note without a mounted charge place', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, documentSource});

  const charge = runtime.openBranch('charge');
  assert.deepEqual(charge, {ok:true, branch:'charge', action:'show-pending-note'});
  const view = runtime.getBranchView();
  assert.equal(view.hidden, false);
  const nodes = flatten(view);
  assert.equal(nodes.find((node)=>node.className === 'shopBranchViewTitle').textContent, '課金');
  assert.match(nodes.find((node)=>node.className === 'shopBranchViewNote').textContent, new RegExp(SHOP_ENTRY_BRANCH_PENDING_NOTE));
});

test('exchange branch reveals the mounted exchange place', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const exchangeHost = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, exchangeHost, documentSource});

  const exchange = runtime.openBranch('exchange');
  assert.deepEqual(exchange, {ok:true, branch:'exchange', action:'show-exchange'});
  assert.equal(runtime.getActiveBranch(), 'exchange');
  assert.equal(exchangeHost.hidden, false);
  assert.equal(exchangeHost.scrolledIntoView, 1);
  assert.equal(runtime.getBranchView().hidden, true);

  const back = runtime.closeBranch();
  assert.deepEqual(back, {ok:true, branch:null, action:'back-to-entry'});
  assert.equal(exchangeHost.hidden, true);
  assert.equal(runtime.getActiveBranch(), null);
});

test('exchange branch falls back to the preparation note without a mounted exchange place', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, documentSource});

  const exchange = runtime.openBranch('exchange');
  assert.deepEqual(exchange, {ok:true, branch:'exchange', action:'show-pending-note'});
  const view = runtime.getBranchView();
  assert.equal(view.hidden, false);
  const nodes = flatten(view);
  assert.equal(nodes.find((node)=>node.className === 'shopBranchViewTitle').textContent, '交換');
  assert.match(nodes.find((node)=>node.className === 'shopBranchViewNote').textContent, new RegExp(SHOP_ENTRY_BRANCH_PENDING_NOTE));
  assert.equal(nodes.find((node)=>node.className.includes('shopBranchViewBack')).textContent, SHOP_ENTRY_BRANCH_BACK_LABEL);

  const back = runtime.closeBranch();
  assert.deepEqual(back, {ok:true, branch:null, action:'back-to-entry'});
  assert.equal(view.hidden, true);
  assert.equal(runtime.getActiveBranch(), null);
});

test('pack branch keeps the existing gacha route and mounts only once', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, documentSource});
  const again = mountShopEntryBranchesRuntime({grid, panel, documentSource});
  assert.equal(again, runtime);

  const result = runtime.openBranch('pack');
  assert.deepEqual(result, {ok:true, branch:'pack', action:'navigate-gacha'});
  assert.equal(runtime.getBranchView().hidden, true);

  const unknown = runtime.openBranch('missions');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unknown-branch');
});

test('branch buttons wire clicks and mark the active card', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const panel = new FakeNode('div', documentSource);
  const chargeHost = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, chargeHost, documentSource});

  const chargeButton = flatten(grid).find((node)=>node.dataset.shopBranchOpen === 'charge');
  assert.ok(chargeButton);
  chargeButton.click();
  assert.equal(runtime.getActiveBranch(), 'charge');
  assert.equal(chargeHost.hidden, false);
  const cards = flatten(grid).filter((node)=>typeof node.dataset.shopBranch === 'string');
  assert.equal(cards.find((node)=>node.dataset.shopBranch === 'charge').dataset.shopBranchActive, 'true');
  assert.equal('shopBranchActive' in cards.find((node)=>node.dataset.shopBranch === 'pack').dataset, false);

  const backButton = flatten(runtime.getBranchView()).find((node)=>node.className.includes('shopBranchViewBack'));
  backButton.click();
  assert.equal(runtime.getActiveBranch(), null);
  assert.equal(runtime.getBranchView().hidden, true);
  assert.equal(chargeHost.hidden, true);
});

test('real-DOM HTMLCollection children mount the same as arrays', () => {
  const documentSource = new FakeDocument();
  const grid = makeShopGrid(documentSource);
  const cards = [...grid.children];
  // Real DOM exposes children as an HTMLCollection, not an Array.
  grid.children = {length: cards.length};
  cards.forEach((card, index) => { grid.children[index] = card; });
  assert.equal(Array.isArray(grid.children), false);
  const panel = new FakeNode('div', documentSource);
  const runtime = mountShopEntryBranchesRuntime({grid, panel, documentSource});
  assert.equal(runtime.mounted, true);
  assert.deepEqual(runtime.openBranch('exchange'), {ok:true, branch:'exchange', action:'show-pending-note'});
  assert.equal(runtime.getBranchView().hidden, false);
});

test('ensure returns null without a usable document or shop grid', () => {
  assert.equal(ensureShopEntryBranchesRuntime(undefined), null);
  assert.equal(ensureShopEntryBranchesRuntime({}), null);
  assert.equal(ensureShopEntryBranchesRuntime(globalThis.document), null);
});

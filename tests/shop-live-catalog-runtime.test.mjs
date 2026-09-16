import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_LIVE_CATALOG_SCHEMA,
  projectShopLiveCatalog,
  mountShopLiveCatalogRuntime,
} from '../browser/shop-live-catalog-runtime.mjs';

function approvedFanArt(overrides = {}) {
  return {
    workId:'FANART-WORK-0001',
    workVersion:'v1',
    title:'承認作品',
    creatorDisplayName:'作者A',
    creatorUserId:'user-a',
    submissionRecordId:'submission-a',
    approvalRecordId:'approval-a',
    targetCardId:'SP_A',
    imageAssetId:'asset-a',
    formalApprovalState:'APPROVED',
    approvedBy:'HUMAN',
    imageReviewState:'APPROVED',
    gameUseApproved:true,
    shopUseApproved:true,
    acquisition:{state:'READY', productId:'fanart:1:v1', currency:'MANII', price:500},
    ...overrides,
  };
}

function formalItem(overrides = {}) {
  return {
    productId:'shop:coin:001',
    title:'通常商品',
    kind:'STANDARD',
    currency:'COIN',
    price:100,
    acquisitionState:'READY',
    ...overrides,
  };
}

test('empty authoritative input stays empty and invents no products', () => {
  const out = projectShopLiveCatalog();
  assert.equal(out.schema, SHOP_LIVE_CATALOG_SCHEMA);
  assert.equal(out.visible, false);
  assert.equal(out.empty, true);
  assert.deepEqual(out.sections.flatMap((section)=>section.items), []);
  assert.equal(out.navigationMerchandiseAllowed, false);
  assert.equal(out.purchaseAuthority, false);
});

test('normal Shop items preserve COIN and cosmetics use MANII display', () => {
  const out = projectShopLiveCatalog({formalCatalogItems:[
    formalItem(),
    formalItem({productId:'cosmetic:001', title:'外観A', kind:'COSMETIC', currency:'MANII', price:250}),
  ]});
  const standard = out.sections.find((section)=>section.id === 'standard').items[0];
  const cosmetic = out.sections.find((section)=>section.id === 'cosmetics').items[0];
  assert.equal(standard.currency, 'COIN');
  assert.equal(standard.currencyDisplayName, 'コイン');
  assert.equal(cosmetic.currency, 'MANII');
  assert.equal(cosmetic.currencyDisplayName, 'マニィ');
});

test('deck or navigation-shaped catalog rows fail closed instead of becoming merchandise', () => {
  const out = projectShopLiveCatalog({formalCatalogItems:[
    formalItem({productId:'deck:route', title:'デッキ', kind:'NAVIGATION'}),
  ]});
  assert.equal(out.visible, false);
  assert.equal(out.empty, true);
  assert.ok(out.reasons.some((reason)=>reason.includes('kind-invalid')));
});

test('currency mismatches fail closed without fallback', () => {
  const standardWrong = projectShopLiveCatalog({formalCatalogItems:[formalItem({currency:'MANII'})]});
  assert.equal(standardWrong.visible, false);
  assert.ok(standardWrong.reasons.some((reason)=>reason.includes('standard-currency-must-be-coin')));

  const cosmeticWrong = projectShopLiveCatalog({formalCatalogItems:[
    formalItem({productId:'cosmetic:wrong', kind:'COSMETIC', currency:'COIN'}),
  ]});
  assert.equal(cosmeticWrong.visible, false);
  assert.ok(cosmeticWrong.reasons.some((reason)=>reason.includes('cosmetic-currency-must-be-manii')));
});

test('only formally approved FanArt reaches Shop and stays MANII', () => {
  const out = projectShopLiveCatalog({approvedFanArtWorks:[approvedFanArt()]});
  const section = out.sections.find((entry)=>entry.id === 'fanart');
  assert.equal(section.visible, true);
  assert.equal(section.items.length, 1);
  assert.equal(section.items[0].currency, 'MANII');
  assert.equal(section.items[0].currencyDisplayName, 'マニィ');

  const invalid = projectShopLiveCatalog({approvedFanArtWorks:[approvedFanArt({approvedBy:'AI'})]});
  assert.equal(invalid.sections.find((entry)=>entry.id === 'fanart').visible, false);
  assert.equal(invalid.visible, false);
});

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.listeners = new Map();
  }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
}

class FakeDocument {
  createElement(tagName) { return new FakeNode(tagName, this); }
  createDocumentFragment() { return new FakeNode('#fragment', this); }
}

function flatten(node) {
  return [node, ...node.children.flatMap(flatten)];
}

test('runtime emits identity-only acquire intent and never claims purchase authority', () => {
  const documentSource = new FakeDocument();
  const host = new FakeNode('div', documentSource);
  const requests = [];
  const runtime = mountShopLiveCatalogRuntime({
    host,
    formalCatalogItems:[formalItem()],
    onAcquireRequest:(request)=>requests.push(request),
  });
  const button = flatten(host).find((node)=>node.className === 'shopLiveCatalogAcquire');
  assert.ok(button);
  button.click();
  assert.deepEqual(requests, [{productId:'shop:coin:001', source:'FORMAL_CATALOG', itemIdentity:'product:shop:coin:001'}]);
  assert.equal('price' in requests[0], false);
  assert.equal('currency' in requests[0], false);
  assert.equal(runtime.purchaseAuthority, false);
  assert.equal(runtime.ownershipMutationAllowed, false);
  assert.equal(runtime.saveMutationAllowed, false);
});

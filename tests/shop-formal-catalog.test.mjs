import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHOP_FORMAL_CATALOG_SCHEMA,
  SAASUNA_FANART_SLEEVE_WORK,
  APPROVED_FAN_ART_SHOP_WORKS,
  FORMAL_SHOP_CATALOG_ITEMS,
} from '../browser/shop-formal-catalog.mjs';

test('the supplied art is a formally approved Saasuna sleeve catalog record at 50 MANII', () => {
  assert.equal(SHOP_FORMAL_CATALOG_SCHEMA, 'gameroad.shop-formal-catalog.v1');
  assert.equal(APPROVED_FAN_ART_SHOP_WORKS.length, 1);
  const work = SAASUNA_FANART_SLEEVE_WORK;
  assert.equal(work.targetUseSite, 'CARD_SLEEVE');
  assert.equal(work.targetPartnerId, 'partner.saasuna');
  assert.equal(work.formalApprovalState, 'APPROVED');
  assert.equal(work.approvedBy, 'HUMAN');
  assert.equal(work.imageReviewState, 'APPROVED');
  assert.equal(work.gameUseApproved, true);
  assert.equal(work.shopUseApproved, true);
  assert.equal(work.acquisition.currency, 'MANII');
  assert.equal(work.acquisition.price, 50);
  assert.equal(work.acquisition.productId, 'fanart:saasuna-sleeve-snow-blue:v1');
  assert.equal(FORMAL_SHOP_CATALOG_ITEMS.length, 0);
});

test('Shop removes navigation-shaped card/deck/person entries but keeps their dedicated screens', async () => {
  const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  const start = html.indexOf('<section class="screen simple" data-screen="shop"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const shop = html.slice(start, end);
  for (const forbidden of ['カードパック', '人物・見た目', 'カード・札組', 'data-go="gacha"', 'data-go="characters"', 'data-go="cards"']) {
    assert.equal(shop.includes(forbidden), false, forbidden);
  }
  assert.equal(shop.includes('shopLiveCatalogHost'), true);
  assert.equal(shop.includes('shopEconomySummary'), true);
  assert.equal(html.includes('data-screen="characters"'), true);
  assert.equal(html.includes('data-screen="cards"'), true);
  assert.equal(html.includes("import './shop-commerce-runtime.mjs';"), true);
  assert.equal(html.includes('id="shopSleeveUseSite"'), true);
});

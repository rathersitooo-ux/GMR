import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  SHOP_FORMAL_CATALOG_SCHEMA,
  SAASUNA_FANART_SLEEVE_WORK,
  APPROVED_FAN_ART_SHOP_WORKS,
  FORMAL_SHOP_CATALOG_ITEMS,
  SHOP_FORMAL_CATALOG,
} from '../browser/shop-formal-catalog.mjs';

test('the approved Saasuna sleeve is catalogued at exactly 50 MANII', () => {
  assert.equal(SHOP_FORMAL_CATALOG_SCHEMA, 'gameroad.shop-formal-catalog.v1');
  assert.equal(APPROVED_FAN_ART_SHOP_WORKS.length, 1);
  const work = SAASUNA_FANART_SLEEVE_WORK;
  assert.equal(work.workId, 'FANART-SAASUNA-SLEEVE-SNOW-BLUE-001');
  assert.equal(work.targetUseSite, 'CARD_SLEEVE');
  assert.equal(work.targetPartnerId, 'partner.saasuna');
  assert.equal(work.imageUrl, '../assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg');
  assert.equal(work.imageAssetId, 'asset:sha256:392309e2fe04e1096b2caf19bed072fe57db2895d369dda1f7488c0fd3e322c6');
  assert.equal(work.formalApprovalState, 'APPROVED');
  assert.equal(work.approvedBy, 'HUMAN');
  assert.equal(work.imageReviewState, 'APPROVED');
  assert.equal(work.gameUseApproved, true);
  assert.equal(work.shopUseApproved, true);
  assert.equal(work.acquisition.state, 'READY');
  assert.equal(work.acquisition.currency, 'MANII');
  assert.equal(work.acquisition.price, 50);
  assert.equal(work.acquisition.productId, 'fanart:saasuna-sleeve-snow-blue:v1');
});

test('the formal catalog does not invent standard or supply merchandise', () => {
  assert.deepEqual(FORMAL_SHOP_CATALOG_ITEMS, []);
  assert.equal(SHOP_FORMAL_CATALOG.items.length, 0);
  assert.equal(SHOP_FORMAL_CATALOG.approvedFanArtWorks.length, 1);
});

test('the Saasuna sleeve repository asset matches the approved JPEG bytes', async () => {
  const bytes = await readFile(new URL('../assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg', import.meta.url));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(bytes[2], 0xff);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '392309e2fe04e1096b2caf19bed072fe57db2895d369dda1f7488c0fd3e322c6');
  assert.ok(bytes.length > 1000);
});

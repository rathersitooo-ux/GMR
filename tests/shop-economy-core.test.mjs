import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOP_MANII_CURRENCY,
  SHOP_MANII_DISPLAY_NAME,
  SHOP_SAASUNA_PARTNER_ID,
  createShopEconomyAuthority,
} from '../browser/shop-economy-core.mjs';

class FakeStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

const sleeve = Object.freeze({
  productId:'fanart:saasuna-sleeve-snow-blue:v1',
  title:'サースナー用ファンアートスリーブ',
  kind:'FANART',
  currency:'MANII',
  price:50,
  imageUrl:'../assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg',
  targetUseSite:'CARD_SLEEVE',
  targetPartnerId:SHOP_SAASUNA_PARTNER_ID,
});
const coinItem = Object.freeze({
  productId:'shop:coin:001',
  title:'コイン商品',
  kind:'STANDARD',
  currency:'COIN',
  price:10,
});
const honeyItem = Object.freeze({
  productId:'battle:honey:001',
  title:'バトルハニー',
  kind:'BATTLE',
  currency:'HONEY',
  price:1,
});

test('MANII has explicit display value and a single-authority debit path', () => {
  assert.equal(SHOP_MANII_CURRENCY, 'MANII');
  assert.equal(SHOP_MANII_DISPLAY_NAME, 'マニィ');
  const storage = new FakeStorage();
  const authority = createShopEconomyAuthority({storage, catalogItems:[sleeve], initialBalance:100});
  const result = authority.purchase({
    productId:sleeve.productId,
    requestId:'shop:test:one',
    price:1,
    currency:'HONEY',
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.price, 50);
  assert.equal(result.receipt.currency, 'MANII');
  assert.equal(result.snapshot.wallet.MANII, 50);
  assert.equal(result.snapshot.owned[sleeve.productId].productId, sleeve.productId);

  const duplicate = authority.purchase({productId:sleeve.productId, requestId:'shop:test:one', price:999});
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.status, 'ALREADY_PROCESSED');
  assert.equal(duplicate.snapshot.wallet.MANII, 50);
});

test('ownership, durable reload, use-site equip and unequip survive the same storage', () => {
  const storage = new FakeStorage();
  const first = createShopEconomyAuthority({storage, catalogItems:[sleeve], initialBalance:100});
  first.purchase({productId:sleeve.productId, requestId:'shop:test:reload'});
  const reloaded = createShopEconomyAuthority({storage, catalogItems:[sleeve], initialBalance:0});
  assert.equal(reloaded.snapshot().wallet.MANII, 50);
  assert.equal(reloaded.snapshot().owned[sleeve.productId].productId, sleeve.productId);
  const equipped = reloaded.equipSleeve({productId:sleeve.productId, targetPartnerId:SHOP_SAASUNA_PARTNER_ID});
  assert.equal(equipped.ok, true);
  assert.equal(reloaded.useSite().active, true);
  assert.equal(reloaded.useSite().item.productId, sleeve.productId);
  assert.equal(reloaded.useSite().gameplayMutationAllowed, false);
  const unequipped = reloaded.unequipSleeve({targetPartnerId:SHOP_SAASUNA_PARTNER_ID});
  assert.equal(unequipped.ok, true);
  assert.equal(reloaded.useSite().active, false);
  const finalReload = createShopEconomyAuthority({storage, catalogItems:[sleeve], initialBalance:0});
  assert.equal(finalReload.useSite().active, false);
});

test('insufficient MANII is fail-closed with no ownership or debit', () => {
  const storage = new FakeStorage();
  const authority = createShopEconomyAuthority({storage, catalogItems:[sleeve], initialBalance:49});
  const result = authority.purchase({productId:sleeve.productId, requestId:'shop:test:insufficient'});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INSUFFICIENT_MANII');
  assert.equal(result.snapshot.wallet.MANII, 49);
  assert.deepEqual(result.snapshot.receipts, {});
  assert.deepEqual(result.snapshot.owned, {});
});

test('COIN and HONEY never fall back into the MANII authority', () => {
  const storage = new FakeStorage();
  const authority = createShopEconomyAuthority({storage, catalogItems:[coinItem, honeyItem], initialBalance:999});
  assert.equal(authority.getAcquireState(coinItem.productId).state, 'unsupported-currency');
  assert.equal(authority.getAcquireState(honeyItem.productId).state, 'unsupported-currency');
  const result = authority.purchase({productId:honeyItem.productId, requestId:'shop:test:honey'});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CURRENCY_NOT_AUTHORIZED_FOR_THIS_AUTHORITY');
  assert.equal(result.snapshot.wallet.MANII, 999);
});

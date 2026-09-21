import {
  mountShopLiveCatalogRuntime,
  projectShopLiveCatalog,
} from './shop-live-catalog-runtime.mjs';
import {
  APPROVED_FAN_ART_SHOP_WORKS,
  FORMAL_SHOP_CATALOG_ITEMS,
} from './shop-formal-catalog.mjs';
import {
  SHOP_MANII_CURRENCY,
  SHOP_MANII_DISPLAY_NAME,
  SHOP_SAASUNA_PARTNER_ID,
  createShopEconomyAuthority,
} from './shop-economy-core.mjs';

export const SHOP_COMMERCE_RUNTIME_SCHEMA = 'gameroad.shop-commerce-runtime.v1';

const SHOP_INPUT = Object.freeze({
  formalCatalogItems:FORMAL_SHOP_CATALOG_ITEMS,
  approvedFanArtWorks:APPROVED_FAN_ART_SHOP_WORKS,
});
const SHOP_PROJECTION = projectShopLiveCatalog(SHOP_INPUT);
const SHOP_ITEMS = Object.freeze(SHOP_PROJECTION.sections.flatMap((section)=>section.items));

function readInitialManiiBalance() {
  const reader = globalThis.GAMEROAD_READ_MANII_BALANCE;
  if (typeof reader !== 'function') return 0;
  try {
    const value = reader();
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function appendText(documentSource, parent, tagName, className, text) {
  const node = documentSource.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function renderSummary(documentSource, authority, message = '') {
  const summary = documentSource.getElementById('shopEconomySummary');
  if (!summary) return;
  const snapshot = authority.snapshot();
  const suffix = message ? '｜' + message : '';
  summary.textContent = SHOP_MANII_DISPLAY_NAME + '残高 ' + snapshot.wallet.MANII + suffix;
  summary.dataset.currency = SHOP_MANII_CURRENCY;
  summary.dataset.maniiBalance = String(snapshot.wallet.MANII);
}

function renderSleeveUseSite(documentSource, authority, items, refresh) {
  const host = documentSource.getElementById('shopSleeveUseSite');
  if (!host) return;
  host.replaceChildren();
  const current = authority.snapshot();
  const use = authority.useSite({targetPartnerId:SHOP_SAASUNA_PARTNER_ID});
  const sleeveProductId = items.find((item)=>item.targetUseSite === 'CARD_SLEEVE' && item.targetPartnerId === SHOP_SAASUNA_PARTNER_ID)?.productId;
  const sleeveItem = use.item || (sleeveProductId ? authority.getCatalogItem(sleeveProductId) : null);
  const owned = Boolean(sleeveProductId && current.owned[sleeveProductId]);

  if (!sleeveItem || !owned) {
    appendText(documentSource, host, 'p', 'safeNote', 'ショップで取得したカードスリーブがここに表示されます。');
    return;
  }

  appendText(documentSource, host, 'div', 'k', 'CARD SLEEVE USE SITE');
  appendText(documentSource, host, 'h3', 'shopSleeveUseSiteTitle', 'サースナーのスリーブ');
  if (sleeveItem.imageUrl) {
    const image = documentSource.createElement('img');
    image.className = 'shopSleeveUseSiteImage';
    image.src = sleeveItem.imageUrl;
    image.alt = sleeveItem.title;
    image.loading = 'lazy';
    host.appendChild(image);
  }
  appendText(documentSource, host, 'p', 'sub', use.active ? '装備中（カード画面の表示用）' : '取得済み。カード画面で装備できます。');
  const button = appendText(documentSource, host, 'button', 'btn' + (use.active ? '' : ' primary'), use.active ? '外す' : '装備する');
  button.type = 'button';
  button.addEventListener('click', ()=>{
    const result = use.active
      ? authority.unequipSleeve({targetPartnerId:SHOP_SAASUNA_PARTNER_ID})
      : authority.equipSleeve({productId:sleeveItem.productId, targetPartnerId:SHOP_SAASUNA_PARTNER_ID});
    if (result.ok) {
      refresh(result.status === 'EQUIPPED' ? 'スリーブを装備しました' : 'スリーブを外しました');
    } else {
      refresh('スリーブを適用できません');
    }
  });
}

function boot() {
  if (globalThis.__GAMEROAD_SHOP_COMMERCE_BOOTED__) return globalThis.__GAMEROAD_SHOP_ECONOMY__;
  const documentSource = globalThis.document;
  const host = documentSource?.getElementById('shopLiveCatalogHost');
  if (!documentSource || !host) return null;

  const authority = createShopEconomyAuthority({
    catalogItems:SHOP_ITEMS,
    initialBalance:readInitialManiiBalance(),
  });
  let requestSequence = 0;
  let lastMessage = '';

  const refresh = (message = '') => {
    lastMessage = message;
    renderSummary(documentSource, authority, lastMessage);
    mountShopLiveCatalogRuntime({
      host,
      formalCatalogItems:SHOP_INPUT.formalCatalogItems,
      approvedFanArtWorks:SHOP_INPUT.approvedFanArtWorks,
      getAcquireState:(productId)=>authority.getAcquireState(productId),
      onAcquireRequest:(request)=>{
        requestSequence += 1;
        const result = authority.purchase({
          productId:request.productId,
          requestId:'shop:local:' + Date.now() + ':' + requestSequence,
        });
        refresh(result.ok
          ? (result.status === 'ALREADY_PROCESSED' ? '重複購入を防止しました' : '購入しました')
          : result.reason === 'INSUFFICIENT_MANII'
            ? 'マニィが不足しています'
            : '取得できません');
        return result;
      },
    });
    renderSleeveUseSite(documentSource, authority, SHOP_ITEMS, refresh);
  };

  refresh();
  globalThis.__GAMEROAD_SHOP_COMMERCE_BOOTED__ = true;
  globalThis.__GAMEROAD_SHOP_CATALOG__ = Object.freeze({
    schema:SHOP_COMMERCE_RUNTIME_SCHEMA,
    projection:SHOP_PROJECTION,
    items:SHOP_ITEMS,
  });
  globalThis.__GAMEROAD_SHOP_ECONOMY__ = authority;
  return authority;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
}

export const SHOP_ECONOMY_SCHEMA = 'gameroad.shop-economy-core.v1';
export const SHOP_ECONOMY_STORAGE_KEY = 'gameroad.shop.economy.v1';
export const SHOP_MANII_CURRENCY = 'MANII';
export const SHOP_MANII_DISPLAY_NAME = 'マニィ';
export const SHOP_SLEEVE_USE_SITE = 'CARD_SLEEVE';
export const SHOP_SAASUNA_PARTNER_ID = 'partner.saasuna';

const MEMORY_STORE = new Map();

function memoryStorage() {
  return {
    getItem(key) {
      return MEMORY_STORE.has(key) ? MEMORY_STORE.get(key) : null;
    },
    setItem(key, value) {
      MEMORY_STORE.set(key, String(value));
    },
    removeItem(key) {
      MEMORY_STORE.delete(key);
    },
  };
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') return storage;
  if (globalThis?.localStorage && typeof globalThis.localStorage.getItem === 'function') return globalThis.localStorage;
  return memoryStorage();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeNonNegativeInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function safeToken(value, max = 256) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out && out.length <= max ? out : null;
}

function emptyState(initialBalance = 0) {
  return {
    schema:SHOP_ECONOMY_SCHEMA,
    version:1,
    revision:0,
    wallet:{MANII:safeNonNegativeInteger(initialBalance, 0)},
    receipts:{},
    owned:{},
    equipped:{sleeves:{}},
  };
}

function normalizeState(raw, initialBalance = 0) {
  const base = emptyState(initialBalance);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const wallet = raw.wallet && typeof raw.wallet === 'object' ? raw.wallet : {};
  const receipts = raw.receipts && typeof raw.receipts === 'object' ? raw.receipts : {};
  const owned = raw.owned && typeof raw.owned === 'object' ? raw.owned : {};
  const equipped = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {};
  const sleeves = equipped.sleeves && typeof equipped.sleeves === 'object' ? equipped.sleeves : {};
  return {
    schema:SHOP_ECONOMY_SCHEMA,
    version:1,
    revision:safeNonNegativeInteger(raw.revision, 0),
    wallet:{MANII:safeNonNegativeInteger(wallet.MANII, base.wallet.MANII)},
    receipts:{...receipts},
    owned:{...owned},
    equipped:{sleeves:{...sleeves}},
  };
}

function readState(storage, storageKey, initialBalance) {
  let raw = null;
  try {
    const encoded = storage.getItem(storageKey);
    raw = encoded ? JSON.parse(encoded) : null;
  } catch {
    raw = null;
  }
  return normalizeState(raw, initialBalance);
}

function writeState(storage, storageKey, state, initialBalance) {
  const encoded = JSON.stringify(state);
  storage.setItem(storageKey, encoded);
  const readback = readState(storage, storageKey, initialBalance);
  if (readback.revision !== state.revision || readback.wallet.MANII !== state.wallet.MANII) {
    throw new Error('Shop economy durable readback failed');
  }
  return readback;
}

function normalizeCatalog(catalogItems) {
  if (!Array.isArray(catalogItems)) throw new Error('catalogItems must be an array');
  const byProductId = new Map();
  for (const raw of catalogItems) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('catalog item must be an object');
    const productId = safeToken(raw.productId, 128);
    const title = safeToken(raw.title, 160);
    const currency = safeToken(raw.currency, 32);
    const price = Number.isSafeInteger(raw.price) && raw.price > 0 ? raw.price : null;
    if (!productId || !title || !currency || price == null) throw new Error('catalog item identity/price is invalid');
    if (byProductId.has(productId)) throw new Error('duplicate catalog productId: ' + productId);
    byProductId.set(productId, Object.freeze({
      productId,
      title,
      kind:safeToken(raw.kind, 32) || 'UNKNOWN',
      currency,
      price,
      imageUrl:safeToken(raw.imageUrl, 1024),
      targetUseSite:safeToken(raw.targetUseSite, 64),
      targetPartnerId:safeToken(raw.targetPartnerId, 128),
    }));
  }
  return byProductId;
}

function validRequestId(requestId) {
  return safeToken(requestId, 160);
}

function failure(reason, snapshot, extra = {}) {
  return Object.freeze({
    ok:false,
    status:'FAILED',
    reason,
    ...extra,
    snapshot,
  });
}

export function createShopEconomyAuthority({
  storage = null,
  storageKey = SHOP_ECONOMY_STORAGE_KEY,
  catalogItems = [],
  initialBalance = 0,
  clock = () => new Date().toISOString(),
} = {}) {
  const resolvedStorage = resolveStorage(storage);
  const itemsByProductId = normalizeCatalog(catalogItems);
  const safeInitialBalance = safeNonNegativeInteger(initialBalance, 0);
  let state = readState(resolvedStorage, storageKey, safeInitialBalance);

  function refresh() {
    state = readState(resolvedStorage, storageKey, safeInitialBalance);
    return state;
  }

  function snapshot() {
    return clone(refresh());
  }

  function getCatalogItem(productId) {
    const id = safeToken(productId, 128);
    return id ? itemsByProductId.get(id) || null : null;
  }

  function getAcquireState(productId) {
    const current = refresh();
    const item = getCatalogItem(productId);
    if (!item) return Object.freeze({state:'unavailable', reason:'PRODUCT_NOT_IN_FORMAL_CATALOG'});
    if (item.currency !== SHOP_MANII_CURRENCY) {
      return Object.freeze({state:'unsupported-currency', reason:'CURRENCY_NOT_AUTHORIZED_FOR_THIS_AUTHORITY', currency:item.currency});
    }
    if (current.owned[item.productId]) return Object.freeze({state:'owned', reason:'ALREADY_OWNED'});
    if (current.wallet.MANII < item.price) {
      return Object.freeze({state:'insufficient', reason:'INSUFFICIENT_MANII', balance:current.wallet.MANII, price:item.price});
    }
    return Object.freeze({state:'ready', reason:'READY', balance:current.wallet.MANII, price:item.price});
  }

  function purchase({productId, requestId} = {}) {
    const id = safeToken(productId, 128);
    const request = validRequestId(requestId);
    const current = refresh();
    if (!id) return failure('INVALID_PRODUCT_ID', clone(current));
    if (!request) return failure('INVALID_REQUEST_ID', clone(current));
    const previous = current.receipts[request];
    if (previous) {
      if (previous.productId !== id) {
        return failure('REQUEST_ID_REUSE_MISMATCH', clone(current));
      }
      return Object.freeze({
        ok:true,
        status:'ALREADY_PROCESSED',
        idempotent:true,
        receipt:clone(previous),
        snapshot:clone(current),
      });
    }

    const item = getCatalogItem(id);
    if (!item) return failure('PRODUCT_NOT_IN_FORMAL_CATALOG', clone(current));
    if (item.currency !== SHOP_MANII_CURRENCY) {
      return failure('CURRENCY_NOT_AUTHORIZED_FOR_THIS_AUTHORITY', clone(current), {currency:item.currency});
    }
    if (current.owned[item.productId]) {
      return failure('ALREADY_OWNED', clone(current));
    }
    if (current.wallet.MANII < item.price) {
      return failure('INSUFFICIENT_MANII', clone(current), {balance:current.wallet.MANII, price:item.price});
    }

    const next = clone(current);
    const receiptId = 'receipt:' + request;
    const acquiredAt = String(clock());
    next.revision += 1;
    next.wallet.MANII -= item.price;
    next.receipts[request] = {
      requestId:request,
      receiptId,
      productId:item.productId,
      currency:SHOP_MANII_CURRENCY,
      price:item.price,
      debited:item.price,
      status:'COMPLETED',
      acquiredAt,
      balanceAfter:next.wallet.MANII,
    };
    next.owned[item.productId] = {
      productId:item.productId,
      receiptId,
      acquiredAt,
    };
    state = writeState(resolvedStorage, storageKey, next, safeInitialBalance);
    return Object.freeze({
      ok:true,
      status:'COMPLETED',
      idempotent:false,
      receipt:clone(state.receipts[request]),
      ownership:clone(state.owned[item.productId]),
      durableSaveVerified:true,
      snapshot:clone(state),
    });
  }

  function equipSleeve({productId, targetPartnerId = SHOP_SAASUNA_PARTNER_ID} = {}) {
    const id = safeToken(productId, 128);
    const partnerId = safeToken(targetPartnerId, 128);
    const current = refresh();
    const item = getCatalogItem(id);
    if (!item) return failure('PRODUCT_NOT_IN_FORMAL_CATALOG', clone(current));
    if (item.currency !== SHOP_MANII_CURRENCY) return failure('CURRENCY_NOT_AUTHORIZED_FOR_THIS_AUTHORITY', clone(current));
    if (item.targetUseSite !== SHOP_SLEEVE_USE_SITE || item.targetPartnerId !== partnerId) {
      return failure('SLEEVE_TARGET_MISMATCH', clone(current));
    }
    if (!current.owned[item.productId]) return failure('OWNERSHIP_REQUIRED', clone(current));
    const next = clone(current);
    next.revision += 1;
    next.equipped.sleeves[partnerId] = item.productId;
    state = writeState(resolvedStorage, storageKey, next, safeInitialBalance);
    return Object.freeze({ok:true, status:'EQUIPPED', snapshot:clone(state), useSite:useSite()});
  }

  function unequipSleeve({targetPartnerId = SHOP_SAASUNA_PARTNER_ID} = {}) {
    const partnerId = safeToken(targetPartnerId, 128);
    const current = refresh();
    if (!partnerId) return failure('INVALID_TARGET_PARTNER_ID', clone(current));
    const next = clone(current);
    next.revision += 1;
    delete next.equipped.sleeves[partnerId];
    state = writeState(resolvedStorage, storageKey, next, safeInitialBalance);
    return Object.freeze({ok:true, status:'UNEQUIPPED', snapshot:clone(state), useSite:useSite()});
  }

  function useSite({targetPartnerId = SHOP_SAASUNA_PARTNER_ID} = {}) {
    const partnerId = safeToken(targetPartnerId, 128);
    const current = refresh();
    if (!partnerId) return Object.freeze({active:false, reason:'INVALID_TARGET_PARTNER_ID', item:null, gameplayMutationAllowed:false});
    const productId = current.equipped.sleeves[partnerId];
    const item = productId ? getCatalogItem(productId) : null;
    const active = Boolean(item && current.owned[productId] && item.targetUseSite === SHOP_SLEEVE_USE_SITE && item.targetPartnerId === partnerId);
    return Object.freeze({
      active,
      targetUseSite:SHOP_SLEEVE_USE_SITE,
      targetPartnerId:partnerId,
      productId:active ? productId : null,
      item:active ? item : null,
      gameplayMutationAllowed:false,
      presentationOnly:true,
    });
  }

  return Object.freeze({
    schema:SHOP_ECONOMY_SCHEMA,
    currency:SHOP_MANII_CURRENCY,
    currencyDisplayName:SHOP_MANII_DISPLAY_NAME,
    snapshot,
    getCatalogItem,
    getAcquireState,
    purchase,
    equipSleeve,
    unequipSleeve,
    useSite,
  });
}

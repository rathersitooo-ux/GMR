export * from './cards-deck-presentation-core.mjs';

import { createDeckSwipePresentationController } from './cards-deck-presentation-core.mjs';
import { resolveDeckEditorSwipe } from './deck-storage-corner-core.mjs';
import {
  createDeckStorageCornerController,
  mountDeckStorageCorner,
} from './deck-storage-corner-runtime.mjs';

const deckStorageLiveInstallations = new WeakMap();
const fanArtLocalSkinInstallations = new WeakMap();

export const FANART_LOCAL_SKIN_CONTRACT = Object.freeze({
  dbName: 'gameroad_local_card_creator_v1',
  dbVersion: 1,
  assetsStore: 'assets',
  skinsStore: 'skins',
  localOnly: true,
  networkWrites: 0,
  canonicalIdentityMutation: false,
});

function cardsScreen(doc) {
  return doc?.querySelector?.('section[data-screen="cards"]') ?? null;
}

function byCardId(doc, selector, cardId) {
  const id = String(cardId ?? '');
  if (!id) return null;
  return [...(doc?.querySelectorAll?.(selector) ?? [])].find((node) => String(node?.dataset?.id ?? '') === id) ?? null;
}

function readLiveDeck(doc) {
  const ids = (selector) => [...(doc?.querySelectorAll?.(selector) ?? [])]
    .map((node) => String(node?.dataset?.id ?? ''))
    .filter(Boolean);
  return [...ids('#deckSlots [data-id]'), ...ids('#exDeckSlots [data-id]')];
}

function createExistingDeckAuthorityBridge(doc) {
  const collectionCard = (id) => byCardId(doc, '#collectionGrid [data-id]', id);
  const deckCard = (id) => byCardId(doc, '#deckSlots [data-id], #exDeckSlots [data-id]', id);

  const addDeckCard = (cardId) => {
    const before = collectionCard(cardId);
    if (!before) return { ok: false, reason: 'collection-card-missing' };
    if (before.classList?.contains?.('inDeck')) return { ok: false, reason: 'already-in-deck' };
    before.click?.();
    const add = doc?.querySelector?.('#addSelectedCard');
    if (!add || add.disabled) return { ok: false, reason: 'existing-add-control-unavailable' };
    add.click?.();
    return collectionCard(cardId)?.classList?.contains?.('inDeck')
      ? { ok: true }
      : { ok: false, reason: 'deck-rule-rejected' };
  };

  const removeDeckCard = (cardId) => {
    const before = deckCard(cardId);
    if (!before) return { ok: false, reason: 'not-in-deck' };
    before.click?.();
    return deckCard(cardId)
      ? { ok: false, reason: 'existing-remove-control-rejected' }
      : { ok: true };
  };

  return Object.freeze({ getDeck: () => readLiveDeck(doc), addDeckCard, removeDeckCard });
}

function cardLabel(doc, id) {
  const node = byCardId(doc, '#collectionGrid [data-id]', id);
  const aria = node?.getAttribute?.('aria-label');
  return aria ? aria.replace(/\s+(?:札組登録済み|詳細を開く)$/u, '') : String(id);
}

function isRoyalThroughCurrentProjection(win, id) {
  const classifier = win?.__GAMEROAD_TEST__?.isRoyalCard;
  if (typeof classifier !== 'function') return false;
  try { return Boolean(classifier(String(id))); }
  catch { return false; }
}

function closestSwipeCard(target) {
  return target?.closest?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]') ?? null;
}

export function isNeutralizedDeckEditorSwipe(intent) {
  return intent?.action === 'none' && intent?.consumed === true;
}

export function presentDeckAddSwipe({ doc, presentation, result, sourceElement, cardId }) {
  if (result?.action !== 'deck-add' || !sourceElement) return false;
  try {
    if (!result.ok) {
      presentation?.playReject?.({
        sourceElement,
        targetElement: doc?.querySelector?.('#deckSlots, #exDeckSlots') ?? sourceElement,
        cardId,
        reason: result.reason ?? 'deck-rule-rejected',
      });
      return typeof presentation?.playReject === 'function';
    }
    const insertedElement = byCardId(doc, '#deckSlots [data-id], #exDeckSlots [data-id]', cardId);
    const targetElement = insertedElement?.closest?.('#deckSlots, #exDeckSlots')
      ?? insertedElement?.parentElement
      ?? doc?.querySelector?.('#deckSlots, #exDeckSlots');
    if (!targetElement) return false;
    presentation?.playSuccess?.({
      sourceElement,
      targetElement,
      insertedElement,
      cardId,
    });
    return typeof presentation?.playSuccess === 'function';
  } catch {
    return false;
  }
}

export function isSafeLocalFanArtSkinRow(row) {
  return Boolean(
    row
    && typeof row.baseCardId === 'string'
    && row.baseCardId.length > 0
    && typeof row.assetHash === 'string'
    && row.assetHash.length > 0
    && row.localOnly === true,
  );
}

export function buildLocalFanArtSkinProjectionEntries({ skins = [], assets = [], cardIds = [] } = {}) {
  const allowedIds = new Set(cardIds.map((value) => String(value ?? '')).filter(Boolean));
  const assetByHash = new Map(
    assets
      .filter((asset) => asset && typeof asset.hash === 'string' && asset.hash && asset.blob)
      .map((asset) => [asset.hash, asset]),
  );
  const seen = new Set();
  const entries = [];
  for (const skin of skins) {
    if (!isSafeLocalFanArtSkinRow(skin) || !allowedIds.has(skin.baseCardId) || seen.has(skin.baseCardId)) continue;
    const asset = assetByHash.get(skin.assetHash);
    if (!asset?.blob) continue;
    seen.add(skin.baseCardId);
    entries.push(Object.freeze({
      cardId: skin.baseCardId,
      assetHash: skin.assetHash,
      blob: asset.blob,
      localOnly: true,
    }));
  }
  return Object.freeze(entries);
}

function openFanArtLocalDb(win) {
  return new Promise((resolve, reject) => {
    const idb = win?.indexedDB;
    if (!idb?.open) {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    let request;
    try { request = idb.open(FANART_LOCAL_SKIN_CONTRACT.dbName, FANART_LOCAL_SKIN_CONTRACT.dbVersion); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FANART_LOCAL_SKIN_CONTRACT.assetsStore)) {
        db.createObjectStore(FANART_LOCAL_SKIN_CONTRACT.assetsStore, { keyPath: 'hash' });
      }
      if (!db.objectStoreNames.contains(FANART_LOCAL_SKIN_CONTRACT.skinsStore)) {
        db.createObjectStore(FANART_LOCAL_SKIN_CONTRACT.skinsStore, { keyPath: 'baseCardId' });
      }
      if (!db.objectStoreNames.contains('customCards')) {
        db.createObjectStore('customCards', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'));
    request.onblocked = () => reject(new Error('indexeddb-blocked'));
  });
}

function readFanArtStore(db, storeName) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(storeName, 'readonly'); }
    catch (error) { reject(error); return; }
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error ?? new Error('indexeddb-read-failed'));
  });
}

function localSkinTargets(doc) {
  return [...(doc?.querySelectorAll?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]') ?? [])];
}

export function installLocalFanArtSkinProjection({
  document: doc = globalThis.document,
  window: win = globalThis.window,
} = {}) {
  if (!doc?.querySelector || !doc?.querySelectorAll || !doc?.createElement) {
    return Object.freeze({ ready: Promise.resolve({ ok: false, reason: 'dom-unavailable' }), refresh: async () => ({ ok: false }), destroy() {} });
  }
  const existing = fanArtLocalSkinInstallations.get(doc);
  if (existing) return existing;

  const urls = new Set();
  let db = null;
  let observer = null;
  let destroyed = false;
  let entries = Object.freeze([]);

  const clearProjection = () => {
    for (const node of doc.querySelectorAll('[data-role="fanart-local-skin-projection"]')) node.remove?.();
    for (const url of urls) win?.URL?.revokeObjectURL?.(url);
    urls.clear();
  };

  const render = () => {
    if (destroyed) return { ok: false, reason: 'destroyed', applied: 0 };
    clearProjection();
    const targets = localSkinTargets(doc);
    let applied = 0;
    for (const entry of entries) {
      const url = win?.URL?.createObjectURL?.(entry.blob);
      if (!url) continue;
      urls.add(url);
      for (const target of targets) {
        if (String(target?.dataset?.id ?? '') !== entry.cardId) continue;
        const img = doc.createElement('img');
        img.dataset.role = 'fanart-local-skin-projection';
        img.dataset.cardId = entry.cardId;
        img.alt = '';
        img.src = url;
        img.setAttribute?.('aria-hidden', 'true');
        if (img.style) {
          img.style.position = 'absolute';
          img.style.inset = '0';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.pointerEvents = 'none';
          img.style.borderRadius = 'inherit';
          img.style.zIndex = '0';
        }
        if (target.style && !target.style.position) target.style.position = 'relative';
        target.appendChild?.(img);
        applied += 1;
      }
    }
    const trayToggle = doc.querySelector('#r4DeckTrayToggle');
    let badge = doc.querySelector('[data-role="fanart-local-skin-status"]');
    if (entries.length && trayToggle) {
      if (!badge) {
        badge = doc.createElement('span');
        badge.dataset.role = 'fanart-local-skin-status';
        badge.setAttribute?.('aria-label', 'この端末だけのファンアートスキン');
        trayToggle.after?.(badge);
      }
      badge.textContent = `ローカル絵 ${entries.length}`;
    } else {
      badge?.remove?.();
    }
    return { ok: true, localSkinCount: entries.length, applied };
  };

  const refresh = async () => {
    if (!db) return { ok: false, reason: 'storage-unavailable', applied: 0 };
    const [skins, assets] = await Promise.all([
      readFanArtStore(db, FANART_LOCAL_SKIN_CONTRACT.skinsStore),
      readFanArtStore(db, FANART_LOCAL_SKIN_CONTRACT.assetsStore),
    ]);
    const cardIds = localSkinTargets(doc).map((node) => String(node?.dataset?.id ?? '')).filter(Boolean);
    entries = buildLocalFanArtSkinProjectionEntries({ skins, assets, cardIds });
    return render();
  };

  const installation = {
    ready: null,
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect?.();
      observer = null;
      clearProjection();
      doc.querySelector('[data-role="fanart-local-skin-status"]')?.remove?.();
      try { db?.close?.(); } catch {}
      db = null;
      fanArtLocalSkinInstallations.delete(doc);
    },
  };
  installation.ready = (async () => {
    try {
      db = await openFanArtLocalDb(win);
      const result = await refresh();
      const Observer = win?.MutationObserver;
      const screen = cardsScreen(doc);
      if (Observer && screen) {
        let queued = false;
        observer = new Observer(() => {
          if (queued || destroyed) return;
          queued = true;
          Promise.resolve().then(() => {
            queued = false;
            if (!destroyed) render();
          });
        });
        observer.observe(screen, { childList: true, subtree: true });
      }
      return result;
    } catch {
      clearProjection();
      return { ok: false, reason: 'storage-unavailable', applied: 0 };
    }
  })();
  const frozen = Object.freeze(installation);
  fanArtLocalSkinInstallations.set(doc, frozen);
  return frozen;
}

export function installDeckStorageLiveMount({
  document: doc = globalThis.document,
  window: win = globalThis.window,
} = {}) {
  if (!doc?.querySelector || !doc?.addEventListener || !doc?.createElement) {
    return Object.freeze({ destroy() {} });
  }
  const existing = deckStorageLiveInstallations.get(doc);
  if (existing) return existing;

  const screen = cardsScreen(doc);
  const trayToggle = doc.querySelector('#r4DeckTrayToggle');
  if (!screen || !trayToggle || doc.querySelector('[data-role="deck-storage-button"]')) {
    return Object.freeze({ destroy() {} });
  }

  const host = doc.createElement('span');
  host.dataset.role = 'deck-storage-host';
  trayToggle.after?.(host);
  if (!host.parentNode) trayToggle.parentElement?.appendChild?.(host);

  const bridge = createExistingDeckAuthorityBridge(doc);
  let mounted = null;
  const controller = createDeckStorageCornerController({
    getDeck: bridge.getDeck,
    addDeckCard: bridge.addDeckCard,
    removeDeckCard: bridge.removeDeckCard,
    isRoyal: (id) => isRoyalThroughCurrentProjection(win, id),
    onChange: () => mounted?.render?.(),
  });
  mounted = mountDeckStorageCorner({
    controller,
    buttonHost: host,
    document: doc,
    getCardLabel: (id) => cardLabel(doc, id),
  });
  const presentation = createDeckSwipePresentationController({ document: doc, window: win });

  let gesture = null;
  let suppressClick = null;
  const now = () => Number(win?.performance?.now?.() ?? Date.now());

  const onPointerDown = (event) => {
    if (event?.pointerType === 'mouse' && event?.button !== 0) return;
    const card = closestSwipeCard(event?.target);
    if (!card || !screen.contains?.(card)) return;
    gesture = {
      pointerId: event.pointerId,
      cardId: String(card.dataset?.id ?? ''),
      surface: card.closest?.('#collectionGrid') ? 'collection' : 'deck',
      startX: Number(event.clientX),
      startY: Number(event.clientY),
      card,
    };
  };

  const onPointerUp = (event) => {
    const current = gesture;
    gesture = null;
    if (!current || current.pointerId !== event?.pointerId || !current.cardId) return;
    const dx = Number(event.clientX) - current.startX;
    const dy = Number(event.clientY) - current.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const intent = resolveDeckEditorSwipe({
      surface: current.surface,
      deltaX: dx,
      deltaY: dy,
      thresholdPx: 56,
    });
    if (isNeutralizedDeckEditorSwipe(intent)) {
      suppressClick = { cardId: current.cardId, until: now() + 450 };
      return;
    }
    const result = controller.applySwipe({
      surface: current.surface,
      cardId: current.cardId,
      deltaX: dx,
      deltaY: dy,
      thresholdPx: 56,
    });
    presentDeckAddSwipe({
      doc,
      presentation,
      result,
      sourceElement: current.card,
      cardId: current.cardId,
    });
    if (!result?.ok) return;
    suppressClick = { cardId: current.cardId, until: now() + 450 };
    mounted?.render?.();
  };

  const onPointerCancel = () => { gesture = null; };
  const onClickCapture = (event) => {
    if (!suppressClick || now() > suppressClick.until || event?.isTrusted === false) return;
    const card = closestSwipeCard(event?.target);
    if (!card || String(card.dataset?.id ?? '') !== suppressClick.cardId) return;
    suppressClick = null;
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  };

  doc.addEventListener('pointerdown', onPointerDown, false);
  doc.addEventListener('pointerup', onPointerUp, false);
  doc.addEventListener('pointercancel', onPointerCancel, false);
  doc.addEventListener('click', onClickCapture, true);

  let destroyed = false;
  const installation = Object.freeze({
    controller,
    mount: mounted,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      doc.removeEventListener('pointerdown', onPointerDown, false);
      doc.removeEventListener('pointerup', onPointerUp, false);
      doc.removeEventListener('pointercancel', onPointerCancel, false);
      doc.removeEventListener('click', onClickCapture, true);
      presentation?.dispose?.();
      mounted?.dispose?.();
      host.remove?.();
      deckStorageLiveInstallations.delete(doc);
    },
  });
  deckStorageLiveInstallations.set(doc, installation);
  return installation;
}

function autoInstallDeckStorageLiveMount(doc, win) {
  const install = () => {
    installLocalFanArtSkinProjection({ document: doc, window: win });
    installDeckStorageLiveMount({ document: doc, window: win });
  };
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();
}

if (typeof document !== 'undefined') autoInstallDeckStorageLiveMount(document, globalThis.window);

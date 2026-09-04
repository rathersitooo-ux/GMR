export * from './cards-deck-presentation-core.mjs';

import { createDeckSwipePresentationController } from './cards-deck-presentation-core.mjs';
import { resolveDeckEditorSwipe } from './deck-storage-corner-core.mjs';
import {
  createDeckStorageCornerController,
  mountDeckStorageCorner,
} from './deck-storage-corner-runtime.mjs';

const deckStorageLiveInstallations = new WeakMap();

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
  const install = () => installDeckStorageLiveMount({ document: doc, window: win });
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();
}

if (typeof document !== 'undefined') autoInstallDeckStorageLiveMount(document, globalThis.window);

const FANART_DB_NAME = 'gameroad_local_card_creator_v1';
const FANART_DB_VERSION = 1;
const FANART_ASSET_STORE = 'assets';
const FANART_SKIN_STORE = 'skins';
const FANART_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const FANART_MAX_PIXELS = 13_000_000;
const FANART_MAX_SIDE = 5000;
const FANART_STORED_MAX_SIDE = 1600;
const FANART_MAX_STORED_BYTES = 3 * 1024 * 1024;
const fanartInstallations = new WeakMap();

export const FANART_LOCAL_SKIN_CONTRACT = Object.freeze({
  schema: 'gameroad.fanart-local-skin-cards.v1',
  dbName: FANART_DB_NAME,
  dbVersion: FANART_DB_VERSION,
  localOnly: true,
  canonicalIdentityPreserved: true,
  networkSync: false,
  rankedStateMutation: false,
  opponentPreferenceLocalOnly: true,
  maxSourceBytes: FANART_MAX_SOURCE_BYTES,
  maxSourcePixels: FANART_MAX_PIXELS,
  maxSourceSide: FANART_MAX_SIDE,
  storedMaxSide: FANART_STORED_MAX_SIDE,
  maxStoredBytes: FANART_MAX_STORED_BYTES,
});

export function normalizeLocalSkinCardId(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token && token === value && token.length <= 160 ? token : null;
}

export function inspectLocalSkinImageHeader(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? 0);
  if (b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return Object.freeze({ type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) });
  }
  if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let p = 2;
  while (p + 8 < b.length) {
    if (b[p] !== 0xff) { p += 1; continue; }
    const marker = b[p + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2 || p + 2 + len > b.length) break;
    if (sof.has(marker) && len >= 7) return Object.freeze({ type: 'image/jpeg', height: (b[p + 5] << 8) | b[p + 6], width: (b[p + 7] << 8) | b[p + 8] });
    p += 2 + len;
  }
  return null;
}

export function validateLocalSkinSource({ bytes, size } = {}) {
  if (!Number.isInteger(size) || size < 24 || size > FANART_MAX_SOURCE_BYTES) return Object.freeze({ ok: false, reason: 'SOURCE_SIZE' });
  const meta = inspectLocalSkinImageHeader(bytes);
  if (!meta || !new Set(['image/png', 'image/jpeg']).has(meta.type)) return Object.freeze({ ok: false, reason: 'SOURCE_TYPE' });
  if (!meta.width || !meta.height || meta.width > FANART_MAX_SIDE || meta.height > FANART_MAX_SIDE || meta.width * meta.height > FANART_MAX_PIXELS) return Object.freeze({ ok: false, reason: 'SOURCE_DIMENSIONS' });
  return Object.freeze({ ok: true, ...meta });
}

function fanartOpenDb(idb) {
  return new Promise((resolve, reject) => {
    if (!idb?.open) return reject(new Error('INDEXEDDB_UNAVAILABLE'));
    const request = idb.open(FANART_DB_NAME, FANART_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FANART_ASSET_STORE)) db.createObjectStore(FANART_ASSET_STORE, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(FANART_SKIN_STORE)) db.createObjectStore(FANART_SKIN_STORE, { keyPath: 'baseCardId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
  });
}

function fanartRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
  });
}

function fanartTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('INDEXEDDB_TX_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('INDEXEDDB_TX_ABORTED'));
  });
}

async function fanartReadSkin(idb, cardId) {
  const db = await fanartOpenDb(idb);
  const tx = db.transaction([FANART_SKIN_STORE, FANART_ASSET_STORE], 'readonly');
  const skin = await fanartRequest(tx.objectStore(FANART_SKIN_STORE).get(cardId));
  const asset = skin?.assetHash ? await fanartRequest(tx.objectStore(FANART_ASSET_STORE).get(skin.assetHash)) : null;
  await fanartTx(tx);
  return skin && asset?.blob ? { skin, asset } : null;
}

async function fanartWriteSkin(idb, skin, asset) {
  const db = await fanartOpenDb(idb);
  const tx = db.transaction([FANART_SKIN_STORE, FANART_ASSET_STORE], 'readwrite');
  tx.objectStore(FANART_ASSET_STORE).put(asset);
  tx.objectStore(FANART_SKIN_STORE).put(skin);
  await fanartTx(tx);
}

async function fanartDeleteSkin(idb, cardId) {
  const db = await fanartOpenDb(idb);
  const readTx = db.transaction(FANART_SKIN_STORE, 'readonly');
  const skin = await fanartRequest(readTx.objectStore(FANART_SKIN_STORE).get(cardId));
  await fanartTx(readTx);
  const tx = db.transaction([FANART_SKIN_STORE, FANART_ASSET_STORE], 'readwrite');
  tx.objectStore(FANART_SKIN_STORE).delete(cardId);
  if (skin?.assetHash) tx.objectStore(FANART_ASSET_STORE).delete(skin.assetHash);
  await fanartTx(tx);
}

async function fanartSetOpponentUsage(idb, record, enabled) {
  if (!record?.skin || !record?.asset) return false;
  await fanartWriteSkin(idb, {
    ...record.skin,
    opponentEnabled: enabled === true,
    updatedAt: Date.now(),
  }, record.asset);
  return true;
}

export async function readFanartLocalOpponentSkinPreference({
  indexedDB: idb = globalThis.indexedDB,
  cardId,
} = {}) {
  const id = normalizeLocalSkinCardId(cardId);
  if (!id) return null;
  let record = null;
  try { record = await fanartReadSkin(idb, id); }
  catch { return null; }
  if (!record || record.skin?.opponentEnabled !== true) return null;
  return Object.freeze({
    source: 'viewer_local',
    cardId: id,
    assetHash: record.skin.assetHash,
    blob: record.asset.blob,
    mime: record.asset.mime ?? record.asset.blob?.type ?? '',
    width: record.asset.width ?? null,
    height: record.asset.height ?? null,
  });
}

function fanartCanvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED')), type, quality));
}

async function fanartProcessImage(file, doc, win) {
  if (!(file instanceof Blob)) throw new Error('IMAGE_REQUIRED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = validateLocalSkinSource({ bytes, size: file.size });
  if (!meta.ok) throw new Error(meta.reason);
  const scale = Math.min(1, FANART_STORED_MAX_SIDE / Math.max(meta.width, meta.height));
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));
  const canvas = doc.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  let bitmap = null; let sourceUrl = '';
  try {
    if (typeof win.createImageBitmap === 'function') try { bitmap = await win.createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); } catch {}
    if (bitmap) context.drawImage(bitmap, 0, 0, width, height);
    else {
      sourceUrl = win.URL.createObjectURL(file);
      const image = new win.Image(); image.src = sourceUrl; await image.decode();
      context.drawImage(image, 0, 0, width, height);
    }
    let blob;
    try { blob = await fanartCanvasBlob(canvas, 'image/webp', 0.9); } catch { blob = await fanartCanvasBlob(canvas, meta.type, 0.9); }
    if (blob.size > FANART_MAX_STORED_BYTES) throw new Error('STORED_IMAGE_TOO_LARGE');
    const digest = await (win.crypto || globalThis.crypto).subtle.digest('SHA-256', await blob.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    return { hash, blob, mime: blob.type || meta.type, width, height, sourceWidth: meta.width, sourceHeight: meta.height, sourceName: String(file.name || 'local-image').slice(0, 120) };
  } finally {
    bitmap?.close?.();
    if (sourceUrl) win.URL.revokeObjectURL(sourceUrl);
  }
}

export function installFanartLocalSkinCards({ document: doc = globalThis.document, window: win = globalThis.window, indexedDB: idb = globalThis.indexedDB } = {}) {
  if (!doc?.querySelector || !doc?.createElement || !win?.URL) return Object.freeze({ destroy() {} });
  const prior = fanartInstallations.get(doc);
  if (prior) return prior;
  const screen = cardsScreen(doc);
  if (!screen) return Object.freeze({ destroy() {} });
  let selected = null; let destroyed = false; let ticket = 0;
  const urls = new Map();
  const button = doc.createElement('button');
  button.type = 'button'; button.dataset.role = 'fanart-local-skin-button'; button.textContent = '自分用スキン';
  button.setAttribute('aria-label', '選択したカードへ端末内画像スキンを設定');
  const opponentButton = doc.createElement('button');
  opponentButton.type = 'button'; opponentButton.dataset.role = 'fanart-opponent-skin-button'; opponentButton.textContent = '相手用スキン';
  opponentButton.setAttribute('aria-label', '選択したカードの端末内画像を自分の画面で相手カードにも使用');
  const input = doc.createElement('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg'; input.hidden = true;
  const anchor = doc.querySelector('#r4DeckTrayToggle') || screen.querySelector('button') || screen;
  anchor.after?.(button); if (!button.parentNode) screen.appendChild(button);
  button.after?.(opponentButton); if (!opponentButton.parentNode) screen.appendChild(opponentButton);
  opponentButton.after?.(input); if (!input.parentNode) screen.appendChild(input);
  if (!doc.getElementById('gameroad-fanart-local-skin-style')) {
    const style = doc.createElement('style'); style.id = 'gameroad-fanart-local-skin-style';
    style.textContent = '[data-fanart-local-skin-host="1"]{position:relative!important}[data-role="fanart-local-skin-overlay"]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;pointer-events:none;z-index:3}[data-role="fanart-local-skin-button"],[data-role="fanart-opponent-skin-button"]{min-height:44px}';
    (doc.head || doc.documentElement)?.appendChild(style);
  }
  const revoke = (id) => { const url = urls.get(id); if (url) { win.URL.revokeObjectURL(url); urls.delete(id); } };
  const renderNode = async (node, currentTicket) => {
    const id = normalizeLocalSkinCardId(String(node?.dataset?.id ?? '')); if (!id) return;
    let record = null; try { record = await fanartReadSkin(idb, id); } catch {}
    if (destroyed || currentTicket !== ticket || !node.isConnected) return;
    const old = node.querySelector?.('[data-role="fanart-local-skin-overlay"]');
    if (!record) { old?.remove?.(); node.removeAttribute?.('data-fanart-local-skin-host'); revoke(id); return; }
    revoke(id); const url = win.URL.createObjectURL(record.asset.blob); urls.set(id, url);
    const overlay = old || doc.createElement('img'); overlay.dataset.role = 'fanart-local-skin-overlay'; overlay.alt = ''; overlay.src = url; overlay.setAttribute('aria-hidden', 'true');
    node.dataset.fanartLocalSkinHost = '1'; if (!old) node.appendChild(overlay);
  };
  const refresh = async () => {
    const currentTicket = ++ticket;
    const nodes = [...screen.querySelectorAll('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]')];
    await Promise.all(nodes.map((node) => renderNode(node, currentTicket)));
    if (selected) {
      let record = null; try { record = await fanartReadSkin(idb, selected); } catch {}
      if (!destroyed && currentTicket === ticket) {
        button.textContent = record ? 'スキン解除' : '自分用スキン';
        opponentButton.textContent = record?.skin?.opponentEnabled === true ? '相手用:使用中' : '相手用スキン';
      }
    }
  };
  const select = (event) => {
    const node = event.target?.closest?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]');
    if (!node) return; selected = normalizeLocalSkinCardId(String(node.dataset?.id ?? '')); if (selected) refresh().catch(() => {});
  };
  const choose = async () => {
    if (!selected) { button.textContent = '先にカードを選択'; return; }
    let current = null; try { current = await fanartReadSkin(idb, selected); } catch {}
    if (current) { await fanartDeleteSkin(idb, selected); await refresh(); return; }
    input.click();
  };
  const chooseOpponent = async () => {
    if (!selected) { opponentButton.textContent = '先にカードを選択'; return; }
    let current = null; try { current = await fanartReadSkin(idb, selected); } catch {}
    if (!current) { opponentButton.textContent = '先に自分用スキンを設定'; return; }
    await fanartSetOpponentUsage(idb, current, current.skin?.opponentEnabled !== true);
    await refresh();
  };
  const save = async () => {
    const file = input.files?.[0]; input.value = ''; if (!file || !selected) return;
    const asset = await fanartProcessImage(file, doc, win);
    await fanartWriteSkin(idb, { baseCardId: selected, assetHash: asset.hash, label: '自分用skin', localOnly: true, opponentEnabled: false, updatedAt: Date.now() }, asset);
    await refresh();
  };
  screen.addEventListener('pointerdown', select, true);
  button.addEventListener('click', () => choose().catch(() => { button.textContent = '端末保存を確認できません'; }));
  opponentButton.addEventListener('click', () => chooseOpponent().catch(() => { opponentButton.textContent = '端末保存を確認できません'; }));
  input.addEventListener('change', () => save().catch(() => { button.textContent = '画像を確認できません'; }));
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => refresh().catch(() => {})) : null;
  observer?.observe(screen, { childList: true, subtree: true }); refresh().catch(() => {});
  const installation = Object.freeze({ contract: FANART_LOCAL_SKIN_CONTRACT, refresh, selectedCardId: () => selected, destroy() {
    if (destroyed) return; destroyed = true; observer?.disconnect?.(); screen.removeEventListener('pointerdown', select, true); for (const id of [...urls.keys()]) revoke(id); button.remove?.(); opponentButton.remove?.(); input.remove?.(); fanartInstallations.delete(doc);
  } });
  fanartInstallations.set(doc, installation); return installation;
}

function autoInstallFanart(doc, win) {
  const install = () => installFanartLocalSkinCards({ document: doc, window: win, indexedDB: win?.indexedDB });
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true }); else install();
}

if (typeof document !== 'undefined') autoInstallFanart(document, globalThis.window);
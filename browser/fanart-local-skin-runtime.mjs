const DB_NAME = 'gameroad_local_card_creator_v1';
const DB_VERSION = 1;
const ASSET_STORE = 'assets';
const SKIN_STORE = 'skins';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 13_000_000;
const MAX_SOURCE_SIDE = 5000;
const STORED_MAX_SIDE = 1600;
const MAX_STORED_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg']);
const STYLE_ID = 'gameroad-fanart-local-skin-style';
const BUTTON_ROLE = 'fanart-local-skin-button';
const OVERLAY_ROLE = 'fanart-local-skin-overlay';
const installations = new WeakMap();

export const FANART_LOCAL_SKIN_CONTRACT = Object.freeze({
  schema: 'gameroad.fanart-local-skin-cards.v1',
  dbName: DB_NAME,
  dbVersion: DB_VERSION,
  localOnly: true,
  canonicalIdentityPreserved: true,
  networkSync: false,
  rankedStateMutation: false,
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxSourcePixels: MAX_SOURCE_PIXELS,
  maxSourceSide: MAX_SOURCE_SIDE,
  storedMaxSide: STORED_MAX_SIDE,
  maxStoredBytes: MAX_STORED_BYTES,
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
    if (p + 4 > b.length) break;
    const len = (b[p + 2] << 8) | b[p + 3];
    if (len < 2 || p + 2 + len > b.length) break;
    if (sof.has(marker) && len >= 7) {
      return Object.freeze({
        type: 'image/jpeg',
        height: (b[p + 5] << 8) | b[p + 6],
        width: (b[p + 7] << 8) | b[p + 8],
      });
    }
    p += 2 + len;
  }
  return null;
}

export function validateLocalSkinSource({ bytes, size } = {}) {
  if (!Number.isInteger(size) || size < 24 || size > MAX_SOURCE_BYTES) return Object.freeze({ ok: false, reason: 'SOURCE_SIZE' });
  const meta = inspectLocalSkinImageHeader(bytes);
  if (!meta || !ALLOWED_TYPES.has(meta.type)) return Object.freeze({ ok: false, reason: 'SOURCE_TYPE' });
  if (!meta.width || !meta.height || meta.width > MAX_SOURCE_SIDE || meta.height > MAX_SOURCE_SIDE || meta.width * meta.height > MAX_SOURCE_PIXELS) {
    return Object.freeze({ ok: false, reason: 'SOURCE_DIMENSIONS' });
  }
  return Object.freeze({ ok: true, ...meta });
}

function openDb(idb) {
  return new Promise((resolve, reject) => {
    if (!idb?.open) { reject(new Error('INDEXEDDB_UNAVAILABLE')); return; }
    let request;
    try { request = idb.open(DB_NAME, DB_VERSION); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'hash' });
      if (!db.objectStoreNames.contains(SKIN_STORE)) db.createObjectStore(SKIN_STORE, { keyPath: 'baseCardId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    request.onblocked = () => reject(new Error('INDEXEDDB_BLOCKED'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('INDEXEDDB_TX_FAILED'));
    tx.onabort = () => reject(tx.error || new Error('INDEXEDDB_TX_ABORTED'));
  });
}

async function readSkinRecord(idb, cardId) {
  const db = await openDb(idb);
  const tx = db.transaction([SKIN_STORE, ASSET_STORE], 'readonly');
  const skin = await requestResult(tx.objectStore(SKIN_STORE).get(cardId));
  const asset = skin?.assetHash ? await requestResult(tx.objectStore(ASSET_STORE).get(skin.assetHash)) : null;
  await txDone(tx);
  return skin && asset?.blob ? Object.freeze({ skin, asset }) : null;
}

async function writeSkinRecord(idb, skin, asset) {
  const db = await openDb(idb);
  const tx = db.transaction([SKIN_STORE, ASSET_STORE], 'readwrite');
  tx.objectStore(ASSET_STORE).put(asset);
  tx.objectStore(SKIN_STORE).put(skin);
  await txDone(tx);
}

async function deleteSkinRecord(idb, cardId) {
  const db = await openDb(idb);
  const readTx = db.transaction(SKIN_STORE, 'readonly');
  const skin = await requestResult(readTx.objectStore(SKIN_STORE).get(cardId));
  await txDone(readTx);
  const tx = db.transaction([SKIN_STORE, ASSET_STORE], 'readwrite');
  tx.objectStore(SKIN_STORE).delete(cardId);
  if (skin?.assetHash) tx.objectStore(ASSET_STORE).delete(skin.assetHash);
  await txDone(tx);
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('IMAGE_ENCODE_FAILED')), type, quality));
}

async function digestBlob(blob, cryptoApi) {
  if (!cryptoApi?.subtle?.digest) throw new Error('SHA256_UNAVAILABLE');
  const hash = await cryptoApi.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function processImage(file, { document: doc, window: win, crypto: cryptoApi }) {
  if (!(file instanceof Blob)) throw new Error('IMAGE_REQUIRED');
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateLocalSkinSource({ bytes: sourceBytes, size: file.size });
  if (!checked.ok) throw new Error(checked.reason);
  const scale = Math.min(1, STORED_MAX_SIDE / Math.max(checked.width, checked.height));
  const width = Math.max(1, Math.round(checked.width * scale));
  const height = Math.max(1, Math.round(checked.height * scale));
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('CANVAS_UNAVAILABLE');
  let bitmap = null;
  let sourceUrl = null;
  try {
    if (typeof win?.createImageBitmap === 'function') {
      try { bitmap = await win.createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); }
      catch { bitmap = null; }
    }
    if (bitmap) context.drawImage(bitmap, 0, 0, width, height);
    else {
      sourceUrl = win.URL.createObjectURL(file);
      const image = new win.Image();
      image.src = sourceUrl;
      await image.decode();
      context.drawImage(image, 0, 0, width, height);
    }
    let blob;
    try { blob = await canvasBlob(canvas, 'image/webp', 0.9); }
    catch { blob = await canvasBlob(canvas, checked.type, 0.9); }
    if (blob.size > MAX_STORED_BYTES) throw new Error('STORED_IMAGE_TOO_LARGE');
    return Object.freeze({
      hash: await digestBlob(blob, cryptoApi),
      blob,
      mime: blob.type || checked.type,
      width,
      height,
      sourceWidth: checked.width,
      sourceHeight: checked.height,
      sourceName: String(file.name || 'local-image').slice(0, 120),
    });
  } finally {
    bitmap?.close?.();
    if (sourceUrl) win.URL.revokeObjectURL(sourceUrl);
  }
}

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `[data-fanart-local-skin-host="1"]{position:relative!important}[data-role="${OVERLAY_ROLE}"]{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;pointer-events:none;z-index:3}[data-role="${BUTTON_ROLE}"]{min-height:44px}`;
  (doc.head || doc.documentElement)?.appendChild(style);
}

function cardsScreen(doc) {
  return doc.querySelector?.('section[data-screen="cards"]') ?? null;
}

function liveCardNodes(screen) {
  return [...(screen?.querySelectorAll?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]') ?? [])];
}

export function installFanartLocalSkinCards({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  indexedDB: idb = globalThis.indexedDB,
} = {}) {
  if (!doc?.querySelector || !doc?.createElement || !win?.URL) return Object.freeze({ destroy() {} });
  const previous = installations.get(doc);
  if (previous) return previous;
  const screen = cardsScreen(doc);
  if (!screen) return Object.freeze({ destroy() {} });
  ensureStyle(doc);

  let selectedCardId = null;
  let destroyed = false;
  let refreshTicket = 0;
  const urls = new Map();
  const anchor = doc.querySelector('#r4DeckTrayToggle') || screen.querySelector('button') || screen;
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset.role = BUTTON_ROLE;
  button.textContent = '自分用スキン';
  button.setAttribute('aria-label', '選択したカードへ端末内画像スキンを設定');
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg';
  input.hidden = true;
  anchor.after?.(button);
  if (!button.parentNode) screen.appendChild(button);
  button.after?.(input);
  if (!input.parentNode) screen.appendChild(input);

  const revoke = (cardId) => {
    const url = urls.get(cardId);
    if (url) { win.URL.revokeObjectURL(url); urls.delete(cardId); }
  };

  const renderCard = async (node, ticket) => {
    const cardId = normalizeLocalSkinCardId(String(node?.dataset?.id ?? ''));
    if (!cardId) return;
    let record = null;
    try { record = await readSkinRecord(idb, cardId); }
    catch { record = null; }
    if (destroyed || ticket !== refreshTicket || !node.isConnected) return;
    const existing = node.querySelector?.(`[data-role="${OVERLAY_ROLE}"]`);
    if (!record) {
      existing?.remove?.();
      node.removeAttribute?.('data-fanart-local-skin-host');
      revoke(cardId);
      return;
    }
    revoke(cardId);
    const url = win.URL.createObjectURL(record.asset.blob);
    urls.set(cardId, url);
    const overlay = existing || doc.createElement('img');
    overlay.dataset.role = OVERLAY_ROLE;
    overlay.alt = '';
    overlay.src = url;
    overlay.setAttribute?.('aria-hidden', 'true');
    node.dataset.fanartLocalSkinHost = '1';
    if (!existing) node.appendChild(overlay);
  };

  const refresh = async () => {
    const ticket = ++refreshTicket;
    await Promise.all(liveCardNodes(screen).map((node) => renderCard(node, ticket)));
    if (selectedCardId) {
      let hasSkin = false;
      try { hasSkin = Boolean(await readSkinRecord(idb, selectedCardId)); }
      catch { hasSkin = false; }
      if (!destroyed && ticket === refreshTicket) button.textContent = hasSkin ? 'スキン解除' : '自分用スキン';
    }
  };

  const onCardClick = (event) => {
    const node = event.target?.closest?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]');
    if (!node || !screen.contains(node)) return;
    selectedCardId = normalizeLocalSkinCardId(String(node.dataset?.id ?? ''));
    if (selectedCardId) refresh();
  };

  const onButton = async () => {
    if (!selectedCardId) {
      button.textContent = '先にカードを選択';
      return;
    }
    let current = null;
    try { current = await readSkinRecord(idb, selectedCardId); }
    catch { current = null; }
    if (current) {
      await deleteSkinRecord(idb, selectedCardId);
      await refresh();
      return;
    }
    input.click();
  };

  const onFile = async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !selectedCardId) return;
    const asset = await processImage(file, { document: doc, window: win, crypto: win.crypto || globalThis.crypto });
    await writeSkinRecord(idb, Object.freeze({
      baseCardId: selectedCardId,
      assetHash: asset.hash,
      label: '自分用skin',
      localOnly: true,
      updatedAt: Date.now(),
    }), asset);
    await refresh();
  };

  button.addEventListener('click', onButton);
  input.addEventListener('change', () => { onFile().catch(() => { button.textContent = '画像を確認できません'; }); });
  screen.addEventListener('click', onCardClick);
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => { refresh().catch(() => {}); }) : null;
  observer?.observe?.(screen, { childList: true, subtree: true });
  refresh().catch(() => {});

  const installation = Object.freeze({
    contract: FANART_LOCAL_SKIN_CONTRACT,
    refresh,
    selectedCardId: () => selectedCardId,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect?.();
      button.removeEventListener('click', onButton);
      screen.removeEventListener('click', onCardClick);
      for (const cardId of urls.keys()) revoke(cardId);
      button.remove?.();
      input.remove?.();
      installations.delete(doc);
    },
  });
  installations.set(doc, installation);
  return installation;
}

function autoInstall(doc, win) {
  const install = () => installFanartLocalSkinCards({ document: doc, window: win, indexedDB: win?.indexedDB });
  if (doc?.readyState === 'loading') doc.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();
}

if (typeof document !== 'undefined') autoInstall(document, globalThis.window);

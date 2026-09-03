export const FANART_LOCAL_SKIN_CONTRACT = Object.freeze({
  schema: 'GAMEROAD_FANART_LOCAL_SKIN_V1',
  dbName: 'gameroad_local_card_creator_v1',
  dbVersion: 2,
  storeName: 'liveSkins',
  maxSourceBytes: 8 * 1024 * 1024,
  maxPixels: 13_000_000,
  maxSide: 5000,
  storedMaxSide: 1600,
  maxStoredBytes: 3 * 1024 * 1024,
  allowedInput: Object.freeze(['image/png', 'image/jpeg']),
  localOnly: true,
  rankedEligible: false,
});

const installations = new WeakMap();

function bytesOf(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value ?? 0);
}

export function detectFanArtImageType(value) {
  const b = bytesOf(value);
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return '';
}

function pngDimensions(b) {
  if (b.length < 24) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegDimensions(b) {
  let p = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (p + 8 < b.length) {
    if (b[p] !== 0xff) { p += 1; continue; }
    const marker = b[p + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    if (p + 4 > b.length) break;
    const length = (b[p + 2] << 8) | b[p + 3];
    if (length < 2 || p + 2 + length > b.length) break;
    if (sof.has(marker) && length >= 7) return {
      height: (b[p + 5] << 8) | b[p + 6],
      width: (b[p + 7] << 8) | b[p + 8],
    };
    p += 2 + length;
  }
  return null;
}

export function validateFanArtImageBytes(value, sourceBytes = bytesOf(value).byteLength) {
  const b = bytesOf(value);
  if (sourceBytes < 24) throw new Error('FANART_IMAGE_TOO_SHORT');
  if (sourceBytes > FANART_LOCAL_SKIN_CONTRACT.maxSourceBytes) throw new Error('FANART_IMAGE_TOO_LARGE');
  const mime = detectFanArtImageType(b);
  if (!FANART_LOCAL_SKIN_CONTRACT.allowedInput.includes(mime)) throw new Error('FANART_IMAGE_TYPE_INVALID');
  const dimensions = mime === 'image/png' ? pngDimensions(b) : jpegDimensions(b);
  if (!dimensions?.width || !dimensions?.height) throw new Error('FANART_IMAGE_DIMENSIONS_INVALID');
  if (dimensions.width > FANART_LOCAL_SKIN_CONTRACT.maxSide || dimensions.height > FANART_LOCAL_SKIN_CONTRACT.maxSide || dimensions.width * dimensions.height > FANART_LOCAL_SKIN_CONTRACT.maxPixels) {
    throw new Error('FANART_IMAGE_DIMENSIONS_TOO_LARGE');
  }
  return Object.freeze({ mime, width: dimensions.width, height: dimensions.height });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('FANART_IDB_TRANSACTION_FAILED'));
    tx.onabort = () => reject(tx.error ?? new Error('FANART_IDB_TRANSACTION_ABORTED'));
  });
}

export function createLocalFanArtSkinStore({ window: win = globalThis.window } = {}) {
  const memory = new Map();
  let mode = 'checking';
  let dbPromise = null;

  const open = () => {
    if (mode === 'memory') return Promise.reject(new Error('FANART_IDB_UNAVAILABLE'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const indexedDb = win?.indexedDB;
      if (!indexedDb?.open) { reject(new Error('FANART_IDB_UNAVAILABLE')); return; }
      let request;
      try { request = indexedDb.open(FANART_LOCAL_SKIN_CONTRACT.dbName, FANART_LOCAL_SKIN_CONTRACT.dbVersion); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FANART_LOCAL_SKIN_CONTRACT.storeName)) {
          db.createObjectStore(FANART_LOCAL_SKIN_CONTRACT.storeName, { keyPath: 'baseCardId' });
        }
      };
      request.onsuccess = () => { mode = 'indexeddb'; resolve(request.result); };
      request.onerror = () => reject(request.error ?? new Error('FANART_IDB_OPEN_FAILED'));
      request.onblocked = () => reject(new Error('FANART_IDB_BLOCKED'));
    }).catch((error) => {
      mode = 'memory';
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  };

  const degrade = () => { mode = 'memory'; dbPromise = null; };

  const list = async () => {
    if (mode === 'memory') return [...memory.values()];
    try {
      const db = await open();
      const tx = db.transaction(FANART_LOCAL_SKIN_CONTRACT.storeName, 'readonly');
      const request = tx.objectStore(FANART_LOCAL_SKIN_CONTRACT.storeName).getAll();
      const rows = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result ?? []);
        request.onerror = () => reject(request.error ?? new Error('FANART_IDB_READ_FAILED'));
      });
      await transactionDone(tx);
      memory.clear();
      for (const row of rows) if (row?.baseCardId) memory.set(String(row.baseCardId), row);
      return rows;
    } catch {
      degrade();
      return [...memory.values()];
    }
  };

  const put = async (record) => {
    const key = String(record?.baseCardId ?? '');
    if (!key) throw new Error('FANART_BASE_CARD_REQUIRED');
    memory.set(key, record);
    if (mode === 'memory') return record;
    try {
      const db = await open();
      const tx = db.transaction(FANART_LOCAL_SKIN_CONTRACT.storeName, 'readwrite');
      tx.objectStore(FANART_LOCAL_SKIN_CONTRACT.storeName).put(record);
      await transactionDone(tx);
    } catch { degrade(); }
    return record;
  };

  const remove = async (baseCardId) => {
    const key = String(baseCardId ?? '');
    memory.delete(key);
    if (mode === 'memory') return;
    try {
      const db = await open();
      const tx = db.transaction(FANART_LOCAL_SKIN_CONTRACT.storeName, 'readwrite');
      tx.objectStore(FANART_LOCAL_SKIN_CONTRACT.storeName).delete(key);
      await transactionDone(tx);
    } catch { degrade(); }
  };

  return Object.freeze({ open, list, put, remove, mode: () => mode });
}

async function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('FANART_IMAGE_ENCODE_FAILED')), type, quality));
}

export async function processLocalFanArtImage(file, { document: doc = globalThis.document, window: win = globalThis.window } = {}) {
  if (!(file instanceof Blob)) throw new Error('FANART_IMAGE_REQUIRED');
  const source = new Uint8Array(await file.arrayBuffer());
  const meta = validateFanArtImageBytes(source, file.size);
  const scale = Math.min(1, FANART_LOCAL_SKIN_CONTRACT.storedMaxSide / Math.max(meta.width, meta.height));
  const width = Math.max(1, Math.round(meta.width * scale));
  const height = Math.max(1, Math.round(meta.height * scale));

  if (scale === 1 && file.size <= FANART_LOCAL_SKIN_CONTRACT.maxStoredBytes) {
    return Object.freeze({ blob: file, mime: meta.mime, width, height, sourceWidth: meta.width, sourceHeight: meta.height });
  }

  const canvas = doc?.createElement?.('canvas');
  const context = canvas?.getContext?.('2d', { alpha: true });
  if (!canvas || !context) throw new Error('FANART_IMAGE_PROCESSING_UNAVAILABLE');
  canvas.width = width;
  canvas.height = height;
  let bitmap = null;
  let url = '';
  try {
    if (typeof win?.createImageBitmap === 'function') {
      try { bitmap = await win.createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }); }
      catch { bitmap = null; }
    }
    if (bitmap) context.drawImage(bitmap, 0, 0, width, height);
    else {
      url = win?.URL?.createObjectURL?.(file) ?? '';
      const ImageCtor = win?.Image;
      if (!url || !ImageCtor) throw new Error('FANART_IMAGE_DECODE_UNAVAILABLE');
      const image = new ImageCtor();
      image.src = url;
      await image.decode();
      context.drawImage(image, 0, 0, width, height);
    }
    let blob;
    try { blob = await canvasBlob(canvas, 'image/webp', 0.9); }
    catch { blob = await canvasBlob(canvas, meta.mime, 0.9); }
    if (blob.size > FANART_LOCAL_SKIN_CONTRACT.maxStoredBytes) throw new Error('FANART_STORED_IMAGE_TOO_LARGE');
    return Object.freeze({ blob, mime: blob.type || meta.mime, width, height, sourceWidth: meta.width, sourceHeight: meta.height });
  } finally {
    bitmap?.close?.();
    if (url) win?.URL?.revokeObjectURL?.(url);
  }
}

function liveCardNodes(doc) {
  return [...(doc?.querySelectorAll?.('#collectionGrid [data-id], #deckSlots [data-id], #exDeckSlots [data-id]') ?? [])];
}

function cardName(node) {
  const aria = node?.getAttribute?.('aria-label');
  return aria ? aria.replace(/\s+(?:札組登録済み|詳細を開く)$/u, '') : String(node?.dataset?.id ?? '');
}

function restoreProjectedNode(node) {
  if (!node?.dataset?.fanartLocalSkin) return;
  const image = node.querySelector?.('img');
  if (image?.dataset?.fanartOriginalSrc !== undefined) {
    image.src = image.dataset.fanartOriginalSrc;
    delete image.dataset.fanartOriginalSrc;
  }
  if (node.dataset.fanartOriginalBackground !== undefined) {
    node.style.backgroundImage = node.dataset.fanartOriginalBackground;
    delete node.dataset.fanartOriginalBackground;
  }
  delete node.dataset.fanartLocalSkin;
}

export function projectLocalFanArtSkins({ document: doc = globalThis.document, window: win = globalThis.window, records = [] } = {}) {
  const byId = new Map(records.filter((row) => row?.baseCardId && row?.blob instanceof Blob).map((row) => [String(row.baseCardId), row]));
  const urls = [];
  for (const node of liveCardNodes(doc)) {
    restoreProjectedNode(node);
    const record = byId.get(String(node?.dataset?.id ?? ''));
    if (!record) continue;
    const url = win?.URL?.createObjectURL?.(record.blob);
    if (!url) continue;
    urls.push(url);
    const image = node.querySelector?.('img');
    if (image) {
      image.dataset ??= {};
      image.dataset.fanartOriginalSrc = image.src ?? '';
      image.src = url;
    } else if (node.style) {
      node.dataset.fanartOriginalBackground = node.style.backgroundImage ?? '';
      node.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,.58) 100%), url("${url}")`;
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
    }
    node.dataset.fanartLocalSkin = '1';
  }
  return Object.freeze({
    count: byId.size,
    dispose() { for (const url of urls) win?.URL?.revokeObjectURL?.(url); },
  });
}

function setStyles(el, styles) {
  for (const [key, value] of Object.entries(styles)) el.style[key] = value;
  return el;
}

function button(doc, text) {
  const el = doc.createElement('button');
  el.type = 'button';
  el.textContent = text;
  return el;
}

function ensureDialogStyle(doc) {
  if (doc.getElementById?.('gmrFanArtLocalSkinStyle')) return;
  const style = doc.createElement('style');
  style.id = 'gmrFanArtLocalSkinStyle';
  style.textContent = `
[data-role="fanart-local-skin-button"]{margin-inline-start:6px;min-height:38px;padding:6px 10px;border:1px solid rgba(228,201,120,.7);border-radius:9px;background:#1a2824;color:#f3f6f4;font:inherit;font-weight:800}
[data-role="fanart-local-skin-dialog"]{max-width:min(92vw,560px);width:560px;border:1px solid #44544f;border-radius:14px;background:#0d1312;color:#f3f6f4;padding:0;box-shadow:0 24px 80px #000a}
[data-role="fanart-local-skin-dialog"]::backdrop{background:#0009}
.gmrFanArtBody{padding:16px;display:grid;gap:12px}.gmrFanArtHead{display:flex;align-items:center;justify-content:space-between;gap:10px}.gmrFanArtHead h2{margin:0;font-size:20px}.gmrFanArtNotice{font-size:12px;color:#c7d2ce}.gmrFanArtForm{display:grid;gap:8px}.gmrFanArtForm label{display:grid;gap:4px;font-size:11px;color:#aab8b3}.gmrFanArtForm select,.gmrFanArtForm input{min-height:40px;border:1px solid #344640;border-radius:8px;background:#080d0c;color:#fff;padding:7px}.gmrFanArtActions{display:flex;gap:8px;flex-wrap:wrap}.gmrFanArtActions button{min-height:40px;border:1px solid #344640;border-radius:8px;background:#1a2824;color:#fff;padding:7px 10px;font:inherit;font-weight:800}.gmrFanArtActions button[data-primary="1"]{background:#eadcae;color:#151916;border-color:#eadcae}.gmrFanArtStatus{min-height:34px;padding:8px 10px;border-left:3px solid #8fd2b0;background:#111a17;font-size:12px}.gmrFanArtList{display:grid;gap:6px}.gmrFanArtRow{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px;border:1px solid #344640;border-radius:8px}.gmrFanArtRow small{color:#aab8b3}
@media(max-width:600px){[data-role="fanart-local-skin-dialog"]{width:96vw}.gmrFanArtBody{padding:12px}}
`;
  (doc.head ?? doc.body)?.appendChild?.(style);
}

export function installLocalFanArtSkinMount({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  storage = null,
} = {}) {
  if (!doc?.querySelector || !doc?.createElement) return Object.freeze({ destroy() {} });
  const existing = installations.get(doc);
  if (existing) return existing;
  const screen = doc.querySelector('section[data-screen="cards"]');
  if (!screen) return Object.freeze({ destroy() {} });
  if (doc.querySelector('[data-role="fanart-local-skin-button"]')) return Object.freeze({ destroy() {} });

  ensureDialogStyle(doc);
  const store = storage ?? createLocalFanArtSkinStore({ window: win });
  const trayToggle = doc.querySelector('#r4DeckTrayToggle');
  const openButton = button(doc, 'ファンアート');
  openButton.dataset.role = 'fanart-local-skin-button';
  if (trayToggle?.after) trayToggle.after(openButton);
  else (trayToggle?.parentElement ?? screen).appendChild?.(openButton);

  const dialog = doc.createElement('dialog');
  dialog.dataset.role = 'fanart-local-skin-dialog';
  const body = doc.createElement('div');
  body.className = 'gmrFanArtBody';
  const head = doc.createElement('div');
  head.className = 'gmrFanArtHead';
  const title = doc.createElement('h2');
  title.textContent = '自分だけのカード画像';
  const closeButton = button(doc, '閉じる');
  head.append(title, closeButton);
  const notice = doc.createElement('div');
  notice.className = 'gmrFanArtNotice';
  notice.textContent = 'PNG/JPGをこの端末だけに保存します。公開・送信・ランク戦のカード情報は変更しません。';
  const form = doc.createElement('form');
  form.className = 'gmrFanArtForm';
  const cardLabelEl = doc.createElement('label');
  cardLabelEl.textContent = '元カード';
  const select = doc.createElement('select');
  cardLabelEl.appendChild(select);
  const fileLabel = doc.createElement('label');
  fileLabel.textContent = 'PNG / JPG';
  const file = doc.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg';
  file.required = true;
  fileLabel.appendChild(file);
  const memoLabel = doc.createElement('label');
  memoLabel.textContent = 'メモ';
  const memo = doc.createElement('input');
  memo.maxLength = 80;
  memo.placeholder = '自分用メモ';
  memoLabel.appendChild(memo);
  const actions = doc.createElement('div');
  actions.className = 'gmrFanArtActions';
  const saveButton = button(doc, 'この絵を使う');
  saveButton.type = 'submit';
  saveButton.dataset.primary = '1';
  actions.appendChild(saveButton);
  form.append(cardLabelEl, fileLabel, memoLabel, actions);
  const status = doc.createElement('div');
  status.className = 'gmrFanArtStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const list = doc.createElement('div');
  list.className = 'gmrFanArtList';
  body.append(head, notice, form, status, list);
  dialog.appendChild(body);
  (doc.body ?? screen).appendChild?.(dialog);

  let records = [];
  let projection = null;
  let destroyed = false;
  let refreshQueued = false;

  const setStatus = (text, bad = false) => {
    status.textContent = text;
    status.style.borderLeftColor = bad ? '#ff9c91' : '#8fd2b0';
  };

  const refreshOptions = () => {
    const seen = new Set();
    const entries = [];
    for (const node of liveCardNodes(doc)) {
      const id = String(node?.dataset?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      entries.push([id, cardName(node) || id]);
    }
    select.replaceChildren?.();
    for (const [id, label] of entries) {
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = label;
      select.appendChild(option);
    }
  };

  const applyProjection = () => {
    projection?.dispose?.();
    projection = projectLocalFanArtSkins({ document: doc, window: win, records });
  };

  const renderList = () => {
    list.replaceChildren?.();
    for (const record of records) {
      const row = doc.createElement('div');
      row.className = 'gmrFanArtRow';
      const text = doc.createElement('div');
      const strong = doc.createElement('strong');
      strong.textContent = record.label || record.baseCardId;
      const small = doc.createElement('small');
      small.textContent = `${record.baseCardId} / local-only`;
      text.append(strong, doc.createElement('br'), small);
      const remove = button(doc, '解除');
      remove.addEventListener('click', async () => {
        await store.remove(record.baseCardId);
        records = records.filter((rowValue) => rowValue.baseCardId !== record.baseCardId);
        applyProjection();
        renderList();
        setStatus('ローカル画像を解除しました');
      });
      row.append(text, remove);
      list.appendChild(row);
    }
    if (!records.length) {
      const empty = doc.createElement('div');
      empty.className = 'gmrFanArtNotice';
      empty.textContent = '保存済みのローカル画像はありません';
      list.appendChild(empty);
    }
  };

  const load = async () => {
    try { await store.open?.(); } catch { /* memory fallback is intentional */ }
    const loaded = await store.list();
    const valid = [];
    for (const row of loaded) {
      if (row?.baseCardId && row?.blob instanceof Blob && row?.localOnly === true && row?.rankedEligible === false) valid.push(row);
      else if (row?.baseCardId) await store.remove(row.baseCardId);
    }
    records = valid;
    refreshOptions();
    applyProjection();
    renderList();
    setStatus(store.mode?.() === 'indexeddb' ? '端末内のローカル画像を読み込みました' : '端末保存を使えないため、このセッションだけで利用します');
  };

  const open = () => {
    refreshOptions();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };
  const close = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const baseCardId = String(select.value ?? '');
    if (!baseCardId) { setStatus('元カードを選んでください', true); return; }
    try {
      setStatus('画像を確認中…');
      const processed = await processLocalFanArtImage(file.files?.[0], { document: doc, window: win });
      const record = {
        baseCardId,
        blob: processed.blob,
        mime: processed.mime,
        width: processed.width,
        height: processed.height,
        label: String(memo.value ?? '').trim().slice(0, 80),
        localOnly: true,
        rankedEligible: false,
        updatedAt: new Date().toISOString(),
      };
      await store.put(record);
      records = records.filter((row) => row.baseCardId !== baseCardId);
      records.push(record);
      file.value = '';
      applyProjection();
      renderList();
      setStatus(store.mode?.() === 'indexeddb' ? 'この端末へ保存しました' : 'このセッションだけで使います');
    } catch (error) {
      setStatus(error?.message ?? String(error), true);
    }
  });

  const queueProjectionRefresh = () => {
    if (refreshQueued || destroyed) return;
    refreshQueued = true;
    Promise.resolve().then(() => {
      refreshQueued = false;
      if (!destroyed) applyProjection();
    });
  };
  const Observer = win?.MutationObserver;
  const observer = Observer ? new Observer(queueProjectionRefresh) : null;
  observer?.observe?.(screen, { childList: true, subtree: true });

  load().catch((error) => setStatus(error?.message ?? 'ローカル画像を初期化できません', true));

  const installation = Object.freeze({
    open,
    refresh: async () => { await load(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect?.();
      projection?.dispose?.();
      for (const node of liveCardNodes(doc)) restoreProjectedNode(node);
      openButton.remove?.();
      dialog.remove?.();
      installations.delete(doc);
    },
  });
  installations.set(doc, installation);
  return installation;
}

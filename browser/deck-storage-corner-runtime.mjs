import {
  addCardToStorage,
  createDeckStorageState,
  createStorageCornerViewModel,
  DECK_STORAGE_DEFAULTS,
  removeCardFromStorage,
  resolveDeckEditorSwipe,
} from './deck-storage-corner-core.mjs';

function requiredFn(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}_REQUIRED`);
  return value;
}

function accepted(result) {
  return result === true || result?.ok === true;
}

export function createDeckStorageCornerController({
  getDeck,
  addDeckCard,
  removeDeckCard,
  isRoyal,
  initialStorage = [],
  maxDeckSize = DECK_STORAGE_DEFAULTS.maxDeckSize,
  onChange = null,
} = {}) {
  requiredFn(getDeck, 'GET_DECK');
  requiredFn(addDeckCard, 'ADD_DECK_CARD');
  requiredFn(removeDeckCard, 'REMOVE_DECK_CARD');
  requiredFn(isRoyal, 'IS_ROYAL');
  if (!Number.isInteger(maxDeckSize) || maxDeckSize <= 0) throw new RangeError('MAX_DECK_SIZE_INVALID');

  let storage = [...initialStorage];
  let open = false;

  const snapshot = () => createDeckStorageState({ deck: getDeck(), storage });
  const view = () => Object.freeze({ ...createStorageCornerViewModel(snapshot(), { isRoyal, maxDeckSize }), open });
  const notify = (event) => { try { onChange?.(Object.freeze({ event, view: view() })); } catch {} };

  const openStorage = () => { open = true; notify('open'); return view(); };
  const closeStorage = () => { open = false; notify('close'); return view(); };

  const store = (cardId) => {
    const result = addCardToStorage(snapshot(), cardId);
    storage = [...result.state.storage];
    open = true;
    notify('storage-add');
    return Object.freeze({ ...result, view: view() });
  };

  const discard = (cardId) => {
    const result = removeCardFromStorage(snapshot(), cardId);
    if (result.ok) storage = [...result.state.storage];
    notify(result.ok ? 'storage-remove' : 'storage-remove-reject');
    return Object.freeze({ ...result, view: view() });
  };

  const sendToDeck = (cardId) => {
    if (!storage.includes(String(cardId))) return Object.freeze({ ok: false, action: 'storage-to-deck', reason: 'not-in-storage', view: view() });
    const result = addDeckCard(cardId);
    if (!accepted(result)) {
      notify('storage-to-deck-reject');
      return Object.freeze({ ok: false, action: 'storage-to-deck', reason: result?.reason ?? 'deck-rule-rejected', view: view() });
    }
    storage.splice(storage.indexOf(String(cardId)), 1);
    notify('storage-to-deck');
    return Object.freeze({ ok: true, action: 'storage-to-deck', cardId: String(cardId), view: view() });
  };

  const applySwipe = ({ surface, cardId, deltaX, deltaY, thresholdPx } = {}) => {
    const intent = resolveDeckEditorSwipe({ surface, deltaX, deltaY, thresholdPx });
    if (intent.action === 'none') return Object.freeze({ ok: false, action: 'none', view: view() });
    if (intent.action === 'storage-add') return store(cardId);
    if (intent.action === 'deck-add') {
      if (getDeck().length >= maxDeckSize) {
        const overflow = store(cardId);
        return Object.freeze({ ...overflow, overflow: true, reason: 'deck-full-overflow' });
      }
      const result = addDeckCard(cardId);
      notify(accepted(result) ? 'deck-add' : 'deck-add-reject');
      return Object.freeze({ ok: accepted(result), action: 'deck-add', reason: result?.reason, view: view() });
    }
    const result = removeDeckCard(cardId);
    notify(accepted(result) ? 'deck-remove' : 'deck-remove-reject');
    return Object.freeze({ ok: accepted(result), action: 'deck-remove', reason: result?.reason, view: view() });
  };

  return Object.freeze({ view, openStorage, closeStorage, store, discard, sendToDeck, applySwipe });
}

export function installDeckStorageCornerStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById?.('gr-deck-storage-style')) return;
  const style = doc.createElement('style');
  style.id = 'gr-deck-storage-style';
  style.textContent = `
.gr-storage-button{appearance:none;border:1px solid #b58a00;border-radius:999px;background:#ffd84a;color:#241b00;font:800 14px/1 system-ui;padding:8px 12px;min-width:48px;cursor:pointer}
.gr-storage-button[data-overflow="true"]{color:#c51616}
.gr-storage-backdrop{position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,.34);display:grid;place-items:center;padding:18px}
.gr-storage-window{width:min(760px,94vw);max-height:82vh;overflow:auto;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:18px;padding:16px;box-shadow:0 18px 60px rgba(0,0,0,.45)}
.gr-storage-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.gr-storage-title{font:800 18px/1.2 system-ui}.gr-storage-close{appearance:none;border:0;border-radius:10px;padding:8px 10px;cursor:pointer}
.gr-storage-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.gr-storage-column{min-width:0;background:rgba(255,255,255,.06);border-radius:14px;padding:10px}.gr-storage-column h3{margin:0 0 8px;font:800 14px/1.2 system-ui}.gr-storage-card{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin:6px 0;padding:9px 10px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.08);color:#fff}.gr-storage-card-actions{display:flex;gap:6px}.gr-storage-card-actions button{cursor:pointer}
.gr-storage-discovery-hint{position:absolute;left:12px;bottom:12px;z-index:3;pointer-events:none;user-select:none;border-radius:999px;padding:6px 10px;background:rgba(17,24,39,.72);border:1px solid rgba(255,216,74,.72);color:#fff3bd;font:800 12px/1 system-ui;letter-spacing:.01em;box-shadow:0 5px 18px rgba(0,0,0,.2)}
@media(max-width:560px){.gr-storage-columns{grid-template-columns:1fr 1fr;gap:8px}.gr-storage-window{padding:12px}.gr-storage-card{display:block}.gr-storage-card-actions{margin-top:6px}.gr-storage-discovery-hint{left:8px;bottom:8px;padding:5px 8px;font-size:11px}}
`;
  doc.head.appendChild(style);
}

const CARDS_INTERACTIVE_SELECTOR = 'button,a,input,select,textarea,label,[role="button"],[role="link"],[data-card],[data-card-id],#collectionGrid [data-id],#deckSlots [data-id],#exDeckSlots [data-id],.card,.cardPreview';

function finitePoint(value) {
  return Number.isFinite(value);
}

export function shouldRevealDeckStorageFromCardsSwipe({
  startX,
  startY,
  endX,
  endY,
  interactive = false,
  thresholdPx = 56,
} = {}) {
  if (interactive || !finitePoint(startX) || !finitePoint(startY) || !finitePoint(endX) || !finitePoint(endY)) return false;
  if (!Number.isFinite(thresholdPx) || thresholdPx <= 0) return false;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  return deltaX <= -thresholdPx && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
}

function resolveCardsScreen(doc) {
  return doc?.querySelector?.('.screen.cards') ?? null;
}

function isCardsInteractiveTarget(target) {
  try { return Boolean(target?.closest?.(CARDS_INTERACTIVE_SELECTOR)); }
  catch { return true; }
}

export function installDeckStorageCardsDiscovery({
  document: doc = globalThis.document,
  openStorage,
  thresholdPx = 56,
} = {}) {
  requiredFn(openStorage, 'OPEN_STORAGE');
  if (!doc?.addEventListener || !doc?.removeEventListener) {
    return Object.freeze({ ensureHint: () => null, destroy() {} });
  }

  let gesture = null;
  let hint = null;

  const ensureHint = () => {
    if (hint?.parentNode) return hint;
    const screen = resolveCardsScreen(doc);
    if (!screen?.appendChild || !doc.createElement) return null;
    const existing = screen.querySelector?.('[data-role="deck-storage-discovery-hint"]');
    if (existing) { hint = existing; return hint; }
    hint = doc.createElement('div');
    hint.className = 'gr-storage-discovery-hint';
    hint.dataset.role = 'deck-storage-discovery-hint';
    hint.setAttribute?.('aria-hidden', 'true');
    hint.textContent = '← ストレージ';
    screen.appendChild(hint);
    return hint;
  };

  const onPointerDown = (event) => {
    const screen = resolveCardsScreen(doc);
    if (!screen?.classList?.contains?.('active') || !screen.contains?.(event?.target)) {
      gesture = null;
      return;
    }
    const interactive = isCardsInteractiveTarget(event?.target);
    if (interactive || !finitePoint(event?.clientX) || !finitePoint(event?.clientY)) {
      gesture = null;
      return;
    }
    gesture = {
      pointerId: event?.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      interactive,
    };
  };

  const finishGesture = (event, cancelled = false) => {
    const current = gesture;
    gesture = null;
    if (!current || cancelled) return false;
    if (current.pointerId != null && event?.pointerId != null && current.pointerId !== event.pointerId) return false;
    const screen = resolveCardsScreen(doc);
    if (!screen?.classList?.contains?.('active')) return false;
    const reveal = shouldRevealDeckStorageFromCardsSwipe({
      ...current,
      endX: event?.clientX,
      endY: event?.clientY,
      thresholdPx,
    });
    if (!reveal) return false;
    openStorage();
    return true;
  };

  const onPointerUp = (event) => { finishGesture(event, false); };
  const onPointerCancel = (event) => { finishGesture(event, true); };

  doc.addEventListener('pointerdown', onPointerDown, { passive: true });
  doc.addEventListener('pointerup', onPointerUp, { passive: true });
  doc.addEventListener('pointercancel', onPointerCancel, { passive: true });
  ensureHint();

  let destroyed = false;
  return Object.freeze({
    ensureHint,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      gesture = null;
      doc.removeEventListener('pointerdown', onPointerDown, { passive: true });
      doc.removeEventListener('pointerup', onPointerUp, { passive: true });
      doc.removeEventListener('pointercancel', onPointerCancel, { passive: true });
      hint?.remove?.();
      hint = null;
    },
  });
}

export function mountDeckStorageCorner({
  controller,
  buttonHost,
  document: doc = globalThis.document,
  getCardLabel = (id) => id,
} = {}) {
  if (!controller?.view || !buttonHost || !doc?.createElement) throw new TypeError('MOUNT_INPUT_INVALID');
  installDeckStorageCornerStyles(doc);

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'gr-storage-button';
  button.dataset.role = 'deck-storage-button';
  buttonHost.appendChild(button);
  let backdrop = null;

  const close = () => {
    backdrop?.remove?.();
    backdrop = null;
    controller.closeStorage();
    renderButton();
  };

  const cardRow = (id) => {
    const row = doc.createElement('div');
    row.className = 'gr-storage-card';
    row.dataset.cardId = id;
    const label = doc.createElement('span');
    label.textContent = String(getCardLabel(id));
    const actions = doc.createElement('span');
    actions.className = 'gr-storage-card-actions';
    const toDeck = doc.createElement('button');
    toDeck.type = 'button';
    toDeck.textContent = 'デッキへ';
    toDeck.addEventListener('click', () => { controller.sendToDeck(id); render(); });
    const discard = doc.createElement('button');
    discard.type = 'button';
    discard.textContent = '外す';
    discard.addEventListener('click', () => { controller.discard(id); render(); });
    actions.append(toDeck, discard);
    row.append(label, actions);
    return row;
  };

  const column = (title, ids, side) => {
    const box = doc.createElement('section');
    box.className = 'gr-storage-column';
    box.dataset.side = side;
    const heading = doc.createElement('h3');
    heading.textContent = `${title} ${ids.length}`;
    box.appendChild(heading);
    for (const id of ids) box.appendChild(cardRow(id));
    return box;
  };

  function renderButton() {
    const view = controller.view();
    button.textContent = view.storageButtonLabel;
    button.dataset.overflow = view.overDeckLimit ? 'true' : 'false';
    button.setAttribute('aria-label', view.overDeckLimit
      ? `デッキ選択 ${view.selectionCount}/${view.maxDeckSize}枚・超過分ストレージ ${view.storageCount}枚`
      : `ストレージ ${view.storageCount}枚`);
  }

  function render() {
    renderButton();
    const view = controller.view();
    if (!view.open) { backdrop?.remove?.(); backdrop = null; return; }
    backdrop?.remove?.();
    backdrop = doc.createElement('div');
    backdrop.className = 'gr-storage-backdrop';
    backdrop.dataset.role = 'deck-storage-backdrop';
    const win = doc.createElement('section');
    win.className = 'gr-storage-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    const head = doc.createElement('div');
    head.className = 'gr-storage-head';
    const title = doc.createElement('div');
    title.className = 'gr-storage-title';
    title.textContent = 'ストレージ';
    const x = doc.createElement('button');
    x.type = 'button';
    x.className = 'gr-storage-close';
    x.textContent = '閉じる';
    x.addEventListener('click', close);
    head.append(title, x);
    const cols = doc.createElement('div');
    cols.className = 'gr-storage-columns';
    cols.append(column('その他', view.normal, 'left'), column('ロイヤル', view.royal, 'right'));
    win.append(head, cols);
    backdrop.appendChild(win);
    backdrop.addEventListener('pointerdown', (event) => { if (event.target === backdrop) close(); });
    doc.body.appendChild(backdrop);
  }

  const open = () => { controller.openStorage(); render(); };
  button.addEventListener('click', open);
  const discovery = installDeckStorageCardsDiscovery({ document: doc, openStorage: open });
  render();
  return Object.freeze({
    button,
    render,
    open,
    close,
    dispose: () => {
      discovery.destroy();
      close();
      button.remove?.();
    },
  });
}

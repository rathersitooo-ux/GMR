export * from './cards-deck-presentation-core.mjs';

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
    const result = controller.applySwipe({
      surface: current.surface,
      cardId: current.cardId,
      deltaX: dx,
      deltaY: dy,
      thresholdPx: 56,
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

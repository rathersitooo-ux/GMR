const STYLE_ID = 'gameroad-quick-deck-overlay-style';

function positiveInteger(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function cardIdentity(card, index) {
  if (typeof card === 'string' || typeof card === 'number') return String(card);
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw new TypeError(`CARD_${index}_INVALID`);
  const id = card.cardId ?? card.id ?? card.key;
  if (id == null || String(id).trim() === '') throw new TypeError(`CARD_${index}_ID_REQUIRED`);
  return String(id);
}

function cardLabel(card, cardId) {
  if (typeof card === 'string' || typeof card === 'number') return String(card);
  const value = card.displayName ?? card.name ?? card.label ?? cardId;
  return String(value || cardId);
}

export function normalizeQuickDeckSnapshot(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('QUICK_DECK_SNAPSHOT_INVALID');
  }
  if (!Array.isArray(snapshot.cards)) throw new TypeError('QUICK_DECK_CARDS_REQUIRED');

  const grouped = new Map();
  snapshot.cards.forEach((card, index) => {
    const cardId = cardIdentity(card, index);
    const quantity = typeof card === 'object' && card !== null
      ? positiveInteger(card.quantity ?? card.count, 1)
      : 1;
    const label = cardLabel(card, cardId);
    const imageRef = typeof card === 'object' && card !== null && card.imageRef != null
      ? String(card.imageRef)
      : null;
    const current = grouped.get(cardId);
    if (current) {
      current.quantity += quantity;
      return;
    }
    grouped.set(cardId, { cardId, label, quantity, imageRef });
  });

  const entries = Object.freeze([...grouped.values()].map((entry) => Object.freeze({ ...entry })));
  const totalCards = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const capacity = snapshot.capacity == null ? null : positiveInteger(snapshot.capacity, null);
  const deckName = snapshot.deckName == null ? null : String(snapshot.deckName);

  return Object.freeze({
    deckId: snapshot.deckId == null ? null : String(snapshot.deckId),
    deckName,
    totalCards,
    capacity,
    entries,
    readOnlyProjection: true,
  });
}

export function buildQuickDeckOverlayModel(snapshot = {}) {
  const deck = normalizeQuickDeckSnapshot(snapshot);
  return Object.freeze({
    title: 'デッキ確認',
    deck,
    summary: deck.capacity == null ? `${deck.totalCards}枚` : `${deck.totalCards} / ${deck.capacity}枚`,
    empty: deck.totalCards === 0,
    closeActions: Object.freeze(['CLOSE_BUTTON', 'OUTSIDE_POINTER', 'ESCAPE']),
    readOnlyProjection: true,
  });
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function installQuickDeckOverlayStyles(doc) {
  if (!doc?.createElement || !doc?.head?.append) return null;
  const existing = doc.getElementById?.(STYLE_ID);
  if (existing) return existing;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.quick-deck-overlay-backdrop{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:clamp(12px,3vw,28px);background:rgba(3,8,15,.62);backdrop-filter:blur(6px)}
.quick-deck-overlay-panel{width:min(880px,94vw);max-height:min(78vh,720px);overflow:auto;border:1px solid color-mix(in srgb,var(--accent,#77dffc) 34%,rgba(255,255,255,.18));border-radius:18px;background:color-mix(in srgb,var(--bg,#071019) 94%,#111827);box-shadow:0 24px 60px rgba(0,0,0,.45);padding:16px;color:var(--text,#f5f7fb)}
.quick-deck-overlay-head{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;background:inherit;padding-bottom:12px;z-index:1}
.quick-deck-overlay-title{font:700 clamp(18px,2.5vw,26px)/1.2 system-ui;margin:0}.quick-deck-overlay-summary{opacity:.82;font-size:13px}.quick-deck-overlay-close{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:inherit;font-size:22px}
.quick-deck-overlay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:10px}.quick-deck-overlay-card{min-height:94px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);padding:10px;display:grid;align-content:space-between;gap:8px}.quick-deck-overlay-card-name{font-size:13px;overflow-wrap:anywhere}.quick-deck-overlay-card-count{justify-self:end;font-weight:800}.quick-deck-overlay-empty{padding:24px 8px;text-align:center;opacity:.72}
@media (prefers-reduced-motion:reduce){.quick-deck-overlay-backdrop{backdrop-filter:none}}
`;
  doc.head.append(style);
  return style;
}

function renderOverlay(doc, model, close) {
  const backdrop = element(doc, 'div', 'quick-deck-overlay-backdrop');
  backdrop.dataset.quickDeckOverlay = 'open';
  const panel = element(doc, 'section', 'quick-deck-overlay-panel');
  panel.setAttribute?.('role', 'dialog');
  panel.setAttribute?.('aria-modal', 'true');
  panel.setAttribute?.('aria-label', model.title);

  const head = element(doc, 'div', 'quick-deck-overlay-head');
  const titleGroup = element(doc, 'div', 'quick-deck-overlay-title-group');
  titleGroup.append(element(doc, 'h2', 'quick-deck-overlay-title', model.deck.deckName || model.title));
  titleGroup.append(element(doc, 'div', 'quick-deck-overlay-summary', model.summary));
  const closeButton = element(doc, 'button', 'quick-deck-overlay-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute?.('aria-label', '閉じる');
  closeButton.dataset.quickDeckClose = 'button';
  closeButton.addEventListener('click', () => close('CLOSE_BUTTON'));
  head.append(titleGroup, closeButton);
  panel.append(head);

  if (model.empty) {
    panel.append(element(doc, 'p', 'quick-deck-overlay-empty', 'デッキにカードがありません'));
  } else {
    const grid = element(doc, 'div', 'quick-deck-overlay-grid');
    grid.dataset.quickDeckCardCount = String(model.deck.entries.length);
    for (const entry of model.deck.entries) {
      const card = element(doc, 'article', 'quick-deck-overlay-card');
      card.dataset.cardId = entry.cardId;
      card.append(element(doc, 'span', 'quick-deck-overlay-card-name', entry.label));
      const count = element(doc, 'span', 'quick-deck-overlay-card-count', `×${entry.quantity}`);
      count.dataset.quantity = String(entry.quantity);
      card.append(count);
      grid.append(card);
    }
    panel.append(grid);
  }

  backdrop.append(panel);
  backdrop.addEventListener('click', (event) => {
    if (event?.target === backdrop) close('OUTSIDE_POINTER');
  });
  return backdrop;
}

export function mountQuickDeckOverlay({ root, getDeckSnapshot, onClose } = {}) {
  if (!root || typeof root.replaceChildren !== 'function' || !root.ownerDocument?.createElement) {
    throw new TypeError('root must be a DOM element with ownerDocument');
  }
  if (typeof getDeckSnapshot !== 'function') throw new TypeError('getDeckSnapshot must be a function');
  if (onClose !== undefined && typeof onClose !== 'function') throw new TypeError('onClose must be a function');

  const doc = root.ownerDocument;
  let destroyed = false;
  let opened = false;
  let lastModel = null;

  const detachKeydown = () => doc.removeEventListener?.('keydown', onKeydown);
  const notifyClose = (reason) => {
    if (typeof onClose === 'function') onClose(Object.freeze({ reason, model: lastModel }));
  };

  function close(reason = 'PROGRAMMATIC') {
    if (!opened) return false;
    opened = false;
    detachKeydown();
    root.replaceChildren();
    notifyClose(reason);
    return true;
  }

  function onKeydown(event) {
    if (event?.key === 'Escape') close('ESCAPE');
  }

  function open() {
    if (destroyed) return Object.freeze({ ok: false, reason: 'DESTROYED', model: null });
    let model;
    try {
      model = buildQuickDeckOverlayModel(getDeckSnapshot());
    } catch {
      close('INVALID_SNAPSHOT');
      lastModel = null;
      root.replaceChildren();
      return Object.freeze({ ok: false, reason: 'INVALID_SNAPSHOT', model: null });
    }

    if (opened) detachKeydown();
    installQuickDeckOverlayStyles(doc);
    lastModel = model;
    const overlay = renderOverlay(doc, model, close);
    root.replaceChildren(overlay);
    opened = true;
    doc.addEventListener?.('keydown', onKeydown);
    return Object.freeze({ ok: true, reason: null, model });
  }

  function destroy() {
    if (destroyed) return false;
    const wasOpen = opened;
    if (wasOpen) close('DESTROY');
    else root.replaceChildren();
    destroyed = true;
    lastModel = null;
    detachKeydown();
    return true;
  }

  return Object.freeze({
    open,
    close,
    destroy,
    isOpen: () => opened,
    getLastModel: () => lastModel,
  });
}

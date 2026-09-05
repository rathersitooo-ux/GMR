import {
  addCardToStorage,
  createDeckStorageState,
  createStorageCornerViewModel,
  DECK_STORAGE_DEFAULTS,
  removeCardFromStorage,
  resolveDeckEditorSwipe,
} from './deck-storage-corner-core.mjs';
import { createDeckSwipeFlightPlan, DECK_SWIPE_PRESENTATION_EVENTS } from './cards-deck-presentation-core.mjs';

function requiredFn(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name}_REQUIRED`);
  return value;
}

function accepted(result) {
  return result === true || result?.ok === true;
}

function safeAnimate(element, keyframes, options) {
  try { return typeof element?.animate === 'function' ? element.animate(keyframes, options) : null; }
  catch { return null; }
}

function resolveReducedMotion(win, explicit) {
  if (typeof explicit === 'boolean') return explicit;
  try { return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); }
  catch { return false; }
}

function installDeckRemoveGhostStyles(doc) {
  if (!doc?.createElement || doc.getElementById?.('gr-deck-remove-ghost-style')) return;
  const style = doc.createElement('style');
  style.id = 'gr-deck-remove-ghost-style';
  style.textContent = `
.gr-deck-remove-ghost-layer{position:fixed;inset:0;z-index:10000;pointer-events:none;overflow:hidden;contain:layout style paint}
.gr-deck-remove-anchor-card,.gr-deck-remove-ghost-card{position:fixed!important;margin:0!important;pointer-events:none!important;transform-origin:center center;will-change:transform,opacity,filter}
.gr-deck-remove-anchor-card{opacity:1;filter:brightness(1.02) drop-shadow(0 8px 10px rgba(0,0,0,.18))}
.gr-deck-remove-ghost-card{opacity:.72;filter:brightness(1.12) drop-shadow(0 10px 12px rgba(0,0,0,.24))}
.gr-deck-remove-ghost-streak{position:fixed;width:76px;height:3px;border-radius:999px;transform-origin:right center;opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14) 24%,rgba(255,239,176,.94));filter:drop-shadow(0 0 5px rgba(255,224,139,.58));will-change:transform,opacity}
@keyframes grDeckRemoveReturnPulse{0%{filter:brightness(1)}38%{filter:brightness(1.34) drop-shadow(0 0 14px rgba(255,216,74,.7))}100%{filter:brightness(1)}}
.gr-deck-remove-return-pulse{animation:grDeckRemoveReturnPulse 360ms ease-out 1}
@media(prefers-reduced-motion:reduce){.gr-deck-remove-ghost-streak,.gr-deck-remove-ghost-card{display:none!important}.gr-deck-remove-return-pulse{animation:none;filter:brightness(1.14)}}
`;
  (doc.head ?? doc.documentElement)?.appendChild?.(style);
}

export function createDeckRemoveGhostTransfer({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  reducedMotion,
  flightMs = 230,
  streakCount = 2,
} = {}) {
  if (!Number.isFinite(flightMs) || flightMs <= 0) throw new RangeError('FLIGHT_MS_INVALID');
  if (!Number.isInteger(streakCount) || streakCount < 0 || streakCount > 4) throw new RangeError('STREAK_COUNT_INVALID');
  installDeckRemoveGhostStyles(doc);
  const pending = new Map();
  const timers = new Set();
  const setTimer = (fn, ms) => {
    let id;
    const wrapped = () => { timers.delete(id); fn(); };
    id = (win?.setTimeout ?? globalThis.setTimeout)(wrapped, ms);
    timers.add(id);
    return id;
  };

  const removeEntry = (cardId) => {
    const id = String(cardId ?? '');
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    entry.layer?.remove?.();
    return true;
  };

  const cloneSnapshot = (sourceElement, className, rect) => {
    const clone = sourceElement.cloneNode(true);
    clone.removeAttribute?.('id');
    clone.setAttribute?.('aria-hidden', 'true');
    clone.classList?.add?.(className);
    Object.assign(clone.style ?? {}, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    return clone;
  };

  const prepare = ({ cardId, sourceElement } = {}) => {
    const id = String(cardId ?? '');
    if (!id || !sourceElement?.getBoundingClientRect || !sourceElement?.cloneNode || !doc?.createElement || !doc?.body?.appendChild) return false;
    removeEntry(id);
    const sourceRect = sourceElement.getBoundingClientRect();
    if (!(sourceRect.width > 0 && sourceRect.height > 0)) return false;
    const layer = doc.createElement('div');
    layer.className = 'gr-deck-remove-ghost-layer';
    layer.setAttribute?.('aria-hidden', 'true');
    const anchor = cloneSnapshot(sourceElement, 'gr-deck-remove-anchor-card', sourceRect);
    const ghost = cloneSnapshot(sourceElement, 'gr-deck-remove-ghost-card', sourceRect);
    layer.appendChild(anchor);
    layer.appendChild(ghost);
    doc.body.appendChild(layer);
    pending.set(id, { layer, anchor, ghost, sourceRect });
    return true;
  };

  const pulseTarget = (targetElement) => {
    if (!targetElement?.classList?.add || !targetElement?.classList?.remove) return;
    targetElement.classList.remove('gr-deck-remove-return-pulse');
    void targetElement.offsetWidth;
    targetElement.classList.add('gr-deck-remove-return-pulse');
    setTimer(() => targetElement.classList.remove('gr-deck-remove-return-pulse'), 380);
  };

  const commit = ({ cardId, targetElement } = {}) => {
    const id = String(cardId ?? '');
    const entry = pending.get(id);
    pulseTarget(targetElement);
    if (!entry || !targetElement?.getBoundingClientRect) return false;
    const isReduced = resolveReducedMotion(win, reducedMotion);
    const plan = createDeckSwipeFlightPlan({
      sourceRect: entry.sourceRect,
      targetRect: targetElement.getBoundingClientRect(),
      reducedMotion: isReduced,
      config: { flightMs, streakCount },
    });
    const finish = () => removeEntry(id);
    if (isReduced || plan.flightMs === 0) {
      safeAnimate(entry.anchor, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'ease-out', fill: 'forwards' });
      setTimer(finish, 110);
      return true;
    }

    const angle = Math.atan2(plan.dy, plan.dx) * 180 / Math.PI;
    const streaks = [];
    for (let index = 0; index < plan.streakCount; index += 1) {
      const streak = doc.createElement('span');
      streak.className = 'gr-deck-remove-ghost-streak';
      Object.assign(streak.style ?? {}, {
        left: `${plan.source.centerX}px`,
        top: `${plan.source.centerY + (index - (plan.streakCount - 1) / 2) * 10}px`,
        transform: `translateX(-76px) rotate(${angle}deg)`,
      });
      entry.layer.appendChild(streak);
      streaks.push(streak);
    }

    const anchorAnim = safeAnimate(entry.anchor, [
      { transform: 'translate3d(0,0,0)', opacity: 1, offset: 0 },
      { transform: 'translate3d(0,0,0)', opacity: 1, offset: .62 },
      { transform: 'translate3d(0,0,0)', opacity: 0, offset: 1 },
    ], { duration: plan.flightMs, easing: 'ease-out', fill: 'forwards' });
    const ghostAnim = safeAnimate(entry.ghost, [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: .72, offset: 0 },
      { transform: `translate3d(${plan.dx * .54}px,${plan.dy * .54 + plan.arcY}px,0) scale(.91) rotate(${plan.rotationDeg}deg)`, opacity: .44, offset: .56 },
      { transform: `translate3d(${plan.dx}px,${plan.dy}px,0) scale(.72) rotate(${plan.rotationDeg * .35}deg)`, opacity: 0, offset: 1 },
    ], { duration: plan.flightMs, easing: 'cubic-bezier(.18,.82,.25,1)', fill: 'forwards' });

    for (let index = 0; index < streaks.length; index += 1) {
      const lag = index * 24;
      safeAnimate(streaks[index], [
        { opacity: 0, transform: `translate3d(0,0,0) translateX(-76px) rotate(${angle}deg)`, offset: 0 },
        { opacity: .84 - index * .18, offset: .28 },
        { opacity: 0, transform: `translate3d(${plan.dx * .78}px,${plan.dy * .78 + plan.arcY * .3}px,0) translateX(-76px) rotate(${angle}deg)`, offset: 1 },
      ], { duration: Math.max(100, plan.flightMs - lag), delay: lag, easing: 'ease-out', fill: 'forwards' });
    }

    if (ghostAnim && 'onfinish' in ghostAnim) ghostAnim.onfinish = finish;
    else if (anchorAnim && 'onfinish' in anchorAnim) anchorAnim.onfinish = finish;
    setTimer(finish, plan.flightMs + 40);
    return true;
  };

  const cancel = ({ cardId } = {}) => removeEntry(cardId);
  const dispose = () => {
    for (const id of timers) (win?.clearTimeout ?? globalThis.clearTimeout)?.(id);
    timers.clear();
    for (const id of [...pending.keys()]) removeEntry(id);
  };
  return Object.freeze({ prepare, commit, cancel, dispose, get pendingCount() { return pending.size; } });
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
  const subscribers = new Set();

  const snapshot = () => createDeckStorageState({ deck: getDeck(), storage });
  const view = () => Object.freeze({ ...createStorageCornerViewModel(snapshot(), { isRoyal, maxDeckSize }), open });
  const notify = (event, detail = {}) => {
    const payload = Object.freeze({ event, ...detail, view: view() });
    try { onChange?.(payload); } catch {}
    for (const subscriber of [...subscribers]) {
      try { subscriber(payload); } catch {}
    }
  };
  const subscribe = (listener) => {
    requiredFn(listener, 'SUBSCRIBER');
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  };

  const openStorage = () => { open = true; notify('open'); return view(); };
  const closeStorage = () => { open = false; notify('close'); return view(); };

  const store = (cardId) => {
    const result = addCardToStorage(snapshot(), cardId);
    storage = [...result.state.storage];
    open = true;
    notify('storage-add', { cardId: String(cardId) });
    return Object.freeze({ ...result, view: view() });
  };

  const discard = (cardId) => {
    const result = removeCardFromStorage(snapshot(), cardId);
    if (result.ok) storage = [...result.state.storage];
    notify(result.ok ? 'storage-remove' : 'storage-remove-reject', { cardId: String(cardId) });
    return Object.freeze({ ...result, view: view() });
  };

  const sendToDeck = (cardId) => {
    if (!storage.includes(String(cardId))) return Object.freeze({ ok: false, action: 'storage-to-deck', reason: 'not-in-storage', view: view() });
    const result = addDeckCard(cardId);
    if (!accepted(result)) {
      notify('storage-to-deck-reject', { cardId: String(cardId) });
      return Object.freeze({ ok: false, action: 'storage-to-deck', reason: result?.reason ?? 'deck-rule-rejected', view: view() });
    }
    storage.splice(storage.indexOf(String(cardId)), 1);
    notify('storage-to-deck', { cardId: String(cardId) });
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
      notify(accepted(result) ? 'deck-add' : 'deck-add-reject', { cardId: String(cardId) });
      return Object.freeze({ ok: accepted(result), action: 'deck-add', reason: result?.reason, view: view() });
    }
    const id = String(cardId);
    if (surface === 'collection' && !getDeck().includes(id)) {
      return Object.freeze({ ok: false, action: 'none', reason: 'not-in-deck', view: view() });
    }
    notify('deck-remove-start', { cardId: id, surface });
    const result = removeDeckCard(cardId);
    notify(accepted(result) ? 'deck-remove' : 'deck-remove-reject', { cardId: id, surface });
    return Object.freeze({ ok: accepted(result), action: 'deck-remove', reason: result?.reason, view: view() });
  };

  return Object.freeze({ view, openStorage, closeStorage, store, discard, sendToDeck, applySwipe, subscribe });
}

export function installDeckStorageCornerStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById?.('gr-deck-storage-style')) return;
  const style = doc.createElement('style');
  style.id = 'gr-deck-storage-style';
  style.textContent = `
.gr-storage-button{appearance:none;border:1px solid #b58a00;border-radius:999px;background:#ffd84a;color:#241b00;font:800 14px/1 system-ui;padding:8px 12px;min-width:48px;cursor:pointer}
.gr-storage-button[data-overflow="true"]{color:#c51616}
.gr-storage-backdrop{position:fixed;left:12px;top:12px;right:auto;bottom:auto;z-index:2200;width:min(420px,46vw);max-width:calc(100vw - 24px);pointer-events:none;background:transparent;padding:0}
.gr-storage-window{pointer-events:auto;width:100%;max-height:42vh;overflow:auto;background:rgba(17,24,39,.96);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:12px;box-shadow:0 10px 32px rgba(0,0,0,.34)}
.gr-storage-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.gr-storage-title{font:800 16px/1.2 system-ui}.gr-storage-close{appearance:none;border:0;border-radius:9px;padding:6px 8px;cursor:pointer}
.gr-storage-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gr-storage-column{min-width:0;background:rgba(255,255,255,.06);border-radius:11px;padding:8px}.gr-storage-column h3{margin:0 0 6px;font:800 13px/1.2 system-ui}.gr-storage-card{display:grid;grid-template-columns:54px minmax(0,1fr) auto;align-items:center;gap:6px;width:100%;margin:5px 0;padding:7px 8px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.08);color:#fff}.gr-storage-card-visual{display:block;width:54px;aspect-ratio:5/7;overflow:hidden;border-radius:6px;background:rgba(255,255,255,.08);pointer-events:none}.gr-storage-card-visual>*{display:block;max-width:100%;width:100%;height:100%;object-fit:cover;pointer-events:none}.gr-storage-card-actions{display:flex;gap:5px}.gr-storage-card-actions button{cursor:pointer}
.gr-storage-discovery-hint{position:absolute;left:12px;bottom:12px;z-index:3;pointer-events:none;user-select:none;border-radius:999px;padding:6px 10px;background:rgba(17,24,39,.72);border:1px solid rgba(255,216,74,.72);color:#fff3bd;font:800 12px/1 system-ui;letter-spacing:.01em;box-shadow:0 5px 18px rgba(0,0,0,.2)}
.gr-deck-swipe-gesture-hint{position:absolute;right:12px;z-index:3;pointer-events:none;user-select:none;max-width:min(220px,46vw);border-radius:999px;padding:6px 10px;background:rgba(17,24,39,.72);border:1px solid rgba(255,216,74,.72);color:#fff3bd;font:800 12px/1 system-ui;letter-spacing:.01em;box-shadow:0 5px 18px rgba(0,0,0,.2);white-space:nowrap}
.gr-deck-swipe-gesture-hint[data-gesture="collection-right"]{bottom:56px}
.gr-deck-swipe-gesture-hint[data-gesture="deck-left"]{bottom:12px}
@media(max-width:560px){.gr-storage-backdrop{left:8px;top:8px;width:min(310px,58vw);max-width:calc(100vw - 16px)}.gr-storage-window{max-height:38vh;padding:9px}.gr-storage-columns{grid-template-columns:1fr 1fr;gap:6px}.gr-storage-card{grid-template-columns:44px minmax(0,1fr);padding:6px}.gr-storage-card-visual{width:44px}.gr-storage-card-actions{grid-column:2;margin-top:5px;flex-wrap:wrap}.gr-storage-discovery-hint{left:8px;bottom:8px;padding:5px 8px;font-size:11px}}
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


const DECK_SWIPE_FIRST_SUCCESS_STORAGE_KEY = 'gameroad.cards.deck-swipe-first-success.v1';

function readDeckSwipeFirstSuccessState(win) {
  const fallback = { collectionRightDone: false, deckLeftDone: false };
  try {
    const raw = win?.localStorage?.getItem?.(DECK_SWIPE_FIRST_SUCCESS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      collectionRightDone: parsed?.collectionRightDone === true,
      deckLeftDone: parsed?.deckLeftDone === true,
    };
  } catch {
    return fallback;
  }
}

function persistDeckSwipeFirstSuccessState(win, state) {
  try {
    if (typeof win?.localStorage?.setItem !== 'function') return false;
    win.localStorage.setItem(DECK_SWIPE_FIRST_SUCCESS_STORAGE_KEY, JSON.stringify({
      collectionRightDone: state.collectionRightDone === true,
      deckLeftDone: state.deckLeftDone === true,
    }));
    return true;
  } catch {
    return false;
  }
}

export function installDeckSwipeFirstSuccessHints({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  controller,
} = {}) {
  if (!doc?.addEventListener || !doc?.removeEventListener || typeof controller?.subscribe !== 'function') {
    return Object.freeze({ state: () => Object.freeze({ collectionRightDone: false, deckLeftDone: false }), render: () => null, destroy() {} });
  }

  let state = readDeckSwipeFirstSuccessState(win);
  let destroyed = false;
  const roleFor = (gesture) => `deck-swipe-first-success-hint-${gesture}`;
  const currentHint = (screen, gesture) => [...(screen?.children ?? [])]
    .find((node) => node?.dataset?.role === roleFor(gesture)) ?? null;
  const ensureHint = (screen, gesture, textContent) => {
    const existing = currentHint(screen, gesture);
    if (existing) return existing;
    if (!screen?.appendChild || !doc?.createElement) return null;
    const hint = doc.createElement('div');
    hint.className = 'gr-deck-swipe-gesture-hint';
    hint.dataset.role = roleFor(gesture);
    hint.dataset.gesture = gesture;
    hint.setAttribute?.('aria-hidden', 'true');
    hint.textContent = textContent;
    screen.appendChild(hint);
    return hint;
  };
  const removeHint = (screen, gesture) => currentHint(screen, gesture)?.remove?.();
  const render = () => {
    if (destroyed) return null;
    const screen = resolveCardsScreen(doc);
    if (!screen) return null;
    if (state.collectionRightDone) removeHint(screen, 'collection-right');
    else ensureHint(screen, 'collection-right', 'カードを → デッキへ');
    if (state.deckLeftDone) removeHint(screen, 'deck-left');
    else ensureHint(screen, 'deck-left', 'デッキから ← 外す');
    return Object.freeze({ ...state });
  };
  const retire = (key) => {
    if (destroyed || state[key] === true) return false;
    state = { ...state, [key]: true };
    persistDeckSwipeFirstSuccessState(win, state);
    render();
    return true;
  };
  const onDeckSwipeLand = () => { retire('collectionRightDone'); };
  doc.addEventListener(DECK_SWIPE_PRESENTATION_EVENTS.LAND, onDeckSwipeLand);
  const unsubscribe = controller.subscribe((payload) => {
    if (payload?.event === 'deck-remove' && payload?.surface === 'deck') retire('deckLeftDone');
  });
  render();

  return Object.freeze({
    state: () => Object.freeze({ ...state }),
    render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      doc.removeEventListener(DECK_SWIPE_PRESENTATION_EVENTS.LAND, onDeckSwipeLand);
      unsubscribe?.();
      const screen = resolveCardsScreen(doc);
      removeHint(screen, 'collection-right');
      removeHint(screen, 'deck-left');
    },
  });
}

export function mountDeckStorageCorner({
  controller,
  buttonHost,
  document: doc = globalThis.document,
  window: win = globalThis.window,
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
  let panel = null;
  const ghostTransfer = createDeckRemoveGhostTransfer({ document: doc, window: win });

  const findCollectionCard = (cardId) => [...(doc?.querySelectorAll?.('#collectionGrid [data-id]') ?? [])]
    .find((node) => String(node?.dataset?.id ?? '') === String(cardId ?? '')) ?? null;
  const findDeckCard = (cardId) => [...(doc?.querySelectorAll?.('#deckSlots [data-id], #exDeckSlots [data-id]') ?? [])]
    .find((node) => String(node?.dataset?.id ?? '') === String(cardId ?? '')) ?? null;

  const unsubscribe = typeof controller.subscribe === 'function'
    ? controller.subscribe((payload) => {
        if (!payload?.cardId) return;
        if (payload.event === 'deck-remove-start') {
          ghostTransfer.prepare({ cardId: payload.cardId, sourceElement: findDeckCard(payload.cardId) ?? findCollectionCard(payload.cardId) });
        } else if (payload.event === 'deck-remove') {
          ghostTransfer.commit({ cardId: payload.cardId, targetElement: findCollectionCard(payload.cardId) });
        } else if (payload.event === 'deck-remove-reject') {
          ghostTransfer.cancel({ cardId: payload.cardId });
        }
      })
    : () => {};

  const close = () => {
    backdrop?.remove?.();
    backdrop = null;
    panel = null;
    controller.closeStorage();
    renderButton();
  };

  const cloneStorageVisual = (id) => {
    const card = findCollectionCard(id) ?? findDeckCard(id);
    const source = card?.querySelector?.('img,[data-card-art],.card-art,.card-image') ?? card;
    if (!source?.cloneNode) return null;
    const clone = source.cloneNode(true);
    clone.removeAttribute?.('id');
    clone.removeAttribute?.('data-id');
    clone.setAttribute?.('aria-hidden', 'true');
    clone.setAttribute?.('tabindex', '-1');
    for (const child of [...(clone.querySelectorAll?.('[id],[data-id],button,a,input,select,textarea,[tabindex],[role="button"],[role="link"]') ?? [])]) {
      child.removeAttribute?.('id');
      child.removeAttribute?.('data-id');
      child.setAttribute?.('aria-hidden', 'true');
      child.setAttribute?.('tabindex', '-1');
      if ('disabled' in child) child.disabled = true;
    }
    return clone;
  };

  const cardRow = (id) => {
    const row = doc.createElement('div');
    row.className = 'gr-storage-card';
    row.dataset.cardId = id;
    const visualClone = cloneStorageVisual(id);
    if (visualClone) {
      const visual = doc.createElement('span');
      visual.className = 'gr-storage-card-visual';
      visual.setAttribute?.('aria-hidden', 'true');
      visual.appendChild(visualClone);
      row.appendChild(visual);
    }
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
      ? `デッキ上限を${view.overflowCount}枚超過・ストレージ ${view.storageCount}枚`
      : `ストレージ ${view.storageCount}枚`);
  }

  function render() {
    renderButton();
    const view = controller.view();
    if (!view.open) { backdrop?.remove?.(); backdrop = null; panel = null; return; }
    backdrop?.remove?.();
    backdrop = doc.createElement('div');
    backdrop.className = 'gr-storage-backdrop';
    backdrop.dataset.role = 'deck-storage-backdrop';
    const storageWindow = doc.createElement('section');
    panel = storageWindow;
    storageWindow.className = 'gr-storage-window';
    storageWindow.setAttribute('role', 'dialog');
    storageWindow.setAttribute('aria-modal', 'false');
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
    storageWindow.append(head, cols);
    backdrop.appendChild(storageWindow);
    doc.body.appendChild(backdrop);
  }

  const open = () => { controller.openStorage(); render(); };
  const onOutsidePointerDown = (event) => {
    if (!panel || panel.contains?.(event?.target) || button.contains?.(event?.target)) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    close();
  };
  button.addEventListener('click', open);
  doc.addEventListener?.('pointerdown', onOutsidePointerDown, true);
  const discovery = installDeckStorageCardsDiscovery({ document: doc, openStorage: open });
  const swipeHints = installDeckSwipeFirstSuccessHints({ document: doc, window: win, controller });
  render();
  return Object.freeze({
    button,
    render,
    open,
    close,
    dispose: () => {
      unsubscribe();
      ghostTransfer.dispose();
      doc.removeEventListener?.('pointerdown', onOutsidePointerDown, true);
      swipeHints.destroy();
      discovery.destroy();
      close();
      button.remove?.();
    },
  });
}

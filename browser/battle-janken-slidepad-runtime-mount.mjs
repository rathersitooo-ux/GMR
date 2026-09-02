import {
  ensureRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS,
} from './new-base-round-start-janken-slot-assignment-core.mjs';

export const BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA = 'gameroad.battle-janken-slidepad-runtime.v1';

const SLOT_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);
const SLOT_VIEW = Object.freeze({
  ROCK: Object.freeze({ symbol: '♣', hand: 'グー', className: 'rock' }),
  SCISSORS: Object.freeze({ symbol: '♦', hand: 'チョキ', className: 'scissors' }),
  PAPER: Object.freeze({ symbol: '♠', hand: 'パー', className: 'paper' }),
});
const STYLE_ID = 'gameroad-battle-janken-slidepad-live-r1-style';
const HOST_ATTR = 'data-battle-janken-slidepad';
const SLOT_ATTR = 'data-janken-slot';
const GESTURE_DEAD_ZONE_PX = 10;
const GESTURE_MIN_DIRECTION_COSINE = 0.45;
const GESTURE_STICK_TRAVEL_PX = 30;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalRoundId(value) {
  const text = String(value ?? '').trim();
  return text ? `battle-round:${text}` : null;
}

function normalizedHand(hand) {
  if (!Array.isArray(hand)) return [];
  const seen = new Set();
  return hand.flatMap((card) => {
    const id = typeof card?.id === 'string' ? card.id.trim() : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const suit = typeof card?.suit === 'string' && card.suit.trim() ? card.suit.trim() : 'UNKNOWN';
    return [Object.freeze({
      id,
      suit,
      label: typeof card?.label === 'string' && card.label.trim() ? card.label.trim() : id,
      selectable: card?.selectable !== false,
    })];
  });
}

export function buildBattleJankenSlidePadModel({
  roundId,
  hand,
  currentSnapshot = null,
  pickDuplicateIndex,
} = {}) {
  const canonical = canonicalRoundId(roundId);
  const cards = normalizedHand(hand);
  if (!canonical || cards.length === 0) {
    return deepFreeze({
      schema: BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
      roundId: canonical,
      assignment: currentSnapshot,
      ordinaryHandCardIds: Object.freeze(cards.map((card) => card.id)),
      slots: Object.freeze(SLOT_ORDER.map((jankenHand) => Object.freeze({
        jankenHand,
        ...SLOT_VIEW[jankenHand],
        cardId: null,
        cardLabel: null,
        occupied: false,
        selectable: false,
      }))),
    });
  }

  const assignment = ensureRoundStartJankenSlotAssignment({
    currentSnapshot,
    roundId: canonical,
    hand: cards.map(({ id, suit }) => ({ id, suit })),
    pickDuplicateIndex,
  });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const slots = assignment.slots.map((slot) => {
    const card = slot.cardId ? byId.get(slot.cardId) ?? null : null;
    const occupied = slot.status === NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS.OCCUPIED && !!slot.cardId;
    return Object.freeze({
      jankenHand: slot.jankenHand,
      ...SLOT_VIEW[slot.jankenHand],
      cardId: slot.cardId,
      cardLabel: card?.label ?? slot.cardId,
      occupied,
      selectable: occupied && card?.selectable !== false,
    });
  });
  return deepFreeze({
    schema: BATTLE_JANKEN_SLIDEPAD_RUNTIME_SCHEMA,
    roundId: canonical,
    assignment,
    ordinaryHandCardIds: assignment.ordinaryHandCardIds,
    slots: Object.freeze(slots),
  });
}

export function resolveBattleJankenSlotCardAction(model, jankenHand, currentHandCardIds = []) {
  const slot = model?.slots?.find?.((candidate) => candidate.jankenHand === jankenHand);
  if (!slot?.selectable || !slot.cardId) return null;
  const current = new Set(Array.isArray(currentHandCardIds) ? currentHandCardIds : []);
  return current.has(slot.cardId) ? slot.cardId : null;
}

export function resolveBattleJankenSlidePadGestureTarget({
  origin,
  pointer,
  candidates,
  deadZonePx = GESTURE_DEAD_ZONE_PX,
  minDirectionCosine = GESTURE_MIN_DIRECTION_COSINE,
} = {}) {
  const originX = Number(origin?.x);
  const originY = Number(origin?.y);
  const pointerX = Number(pointer?.x);
  const pointerY = Number(pointer?.y);
  if (![originX, originY, pointerX, pointerY].every(Number.isFinite)) return null;
  const dragX = pointerX - originX;
  const dragY = pointerY - originY;
  const dragDistance = Math.hypot(dragX, dragY);
  if (dragDistance < Math.max(0, Number(deadZonePx) || 0)) return null;

  const minimumCosine = Math.max(-1, Math.min(1, Number(minDirectionCosine) || 0));
  let best = null;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (candidate?.selectable !== true || !candidate?.id) continue;
    const targetX = Number(candidate.x) - originX;
    const targetY = Number(candidate.y) - originY;
    const targetDistance = Math.hypot(targetX, targetY);
    if (!Number.isFinite(targetDistance) || targetDistance <= 0) continue;
    const cosine = ((dragX * targetX) + (dragY * targetY)) / (dragDistance * targetDistance);
    if (cosine < minimumCosine) continue;
    if (!best || cosine > best.cosine || (cosine === best.cosine && targetDistance < best.targetDistance)) {
      best = { id: candidate.id, cosine, targetDistance };
    }
  }
  return best?.id ?? null;
}

function addStyle(documentRef) {
  if (documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${HOST_ATTR}="1"]{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:42;width:248px;height:196px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${HOST_ATTR}="1"] .grJankenSlidePadHandle{position:absolute;right:0;bottom:0;width:68px;height:68px;border-radius:50%;border:2px solid rgba(255,255,255,.82);background:radial-gradient(circle at 36% 28%,#f7fff4 0 10%,#79b99d 11% 34%,#183d38 68%,#071b19 100%);box-shadow:0 8px 22px rgba(0,0,0,.38),inset 0 0 0 4px rgba(255,255,255,.08);color:white;font-weight:900;font-size:10px;letter-spacing:.08em;pointer-events:auto;touch-action:none;transition:transform 80ms cubic-bezier(.2,.8,.2,1);will-change:transform}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot{position:absolute;right:2px;bottom:2px;width:82px;height:112px;border-radius:12px;border:2px solid rgba(239,249,244,.78);background:linear-gradient(160deg,#f9fcfa 0%,#dbe7e2 68%,#a9bab4 100%);box-shadow:0 9px 22px rgba(0,0,0,.34);color:#10211e;padding:7px 6px;display:grid;grid-template-rows:auto 1fr auto;align-items:center;text-align:center;opacity:0;transform-origin:calc(100% - 32px) calc(100% - 25px);transform:translate(0,0) rotate(22deg) scale(.66);transition:transform 190ms cubic-bezier(.2,.8,.2,1),opacity 150ms ease,filter 90ms ease,box-shadow 90ms ease;pointer-events:none;touch-action:none}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot{opacity:1;pointer-events:none}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.rock{transform:translate(-162px,15px) rotate(-18deg)}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.scissors{transform:translate(-124px,-55px) rotate(-8deg);transition-delay:35ms}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.paper{transform:translate(-48px,-92px) rotate(5deg);transition-delay:70ms}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot[data-armed="true"]{filter:brightness(1.1) saturate(1.08);border-color:rgba(255,255,255,.98);box-shadow:0 10px 26px rgba(0,0,0,.4),0 0 0 4px rgba(255,255,255,.2)}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot:disabled{filter:saturate(.15);background:linear-gradient(160deg,#f2f4f3,#c7cecb);border-color:rgba(255,255,255,.5);color:#68736f;box-shadow:0 6px 14px rgba(0,0,0,.22);cursor:default}
[${HOST_ATTR}="1"] .grJankenSlidePadSuit{font-size:25px;line-height:1;font-weight:900}
[${HOST_ATTR}="1"] .grJankenSlidePadCard{font-size:10px;line-height:1.15;font-weight:850;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
[${HOST_ATTR}="1"] .grJankenSlidePadHand{font-size:9px;font-weight:900;letter-spacing:.08em;opacity:.72}
@media(max-width:540px) and (orientation:portrait){[${HOST_ATTR}="1"]{bottom:max(92px,calc(env(safe-area-inset-bottom) + 92px))}}
@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"]{width:220px;height:160px;right:7px;bottom:7px}[${HOST_ATTR}="1"] .grJankenSlidePadHandle{width:58px;height:58px}[${HOST_ATTR}="1"] .grJankenSlidePadSlot{width:70px;height:94px;padding:5px}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.rock{transform:translate(-143px,10px) rotate(-18deg)}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.scissors{transform:translate(-109px,-47px) rotate(-8deg)}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.paper{transform:translate(-43px,-75px) rotate(5deg)}}
@media(prefers-reduced-motion:reduce){[${HOST_ATTR}="1"] .grJankenSlidePadSlot,[${HOST_ATTR}="1"] .grJankenSlidePadHandle{transition:none!important}}
`;
  documentRef.head?.appendChild(style);
}

function cardCatalog(globalRef) {
  const source = globalRef?.__CARD_DATA__;
  if (Array.isArray(source)) return source;
  if (source instanceof Map) return [...source.values()];
  if (source && typeof source === 'object') return Object.values(source);
  return [];
}

function readHand(globalRef, battleRoot) {
  const catalog = new Map(cardCatalog(globalRef).flatMap((card) => {
    const id = typeof card?.id === 'string' ? card.id : null;
    return id ? [[id, card]] : [];
  }));
  return [...battleRoot.querySelectorAll('#hand .handCard[data-card-id]')].flatMap((node) => {
    const id = node.dataset?.cardId?.trim?.() ?? '';
    if (!id) return [];
    const card = catalog.get(id) ?? {};
    return [{
      id,
      suit: node.dataset?.suit || card.suit || 'UNKNOWN',
      label: card.name || card.label || node.getAttribute?.('aria-label') || node.textContent?.trim?.() || id,
      selectable: !node.disabled && node.getAttribute?.('aria-disabled') !== 'true',
    }];
  });
}

function entropyIndex(globalRef, request) {
  const length = request.max - request.min + 1;
  if (length <= 1) return request.min;
  try {
    if (globalRef?.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalRef.crypto.getRandomValues(values);
      return request.min + (values[0] % length);
    }
  } catch {}
  return request.min + Math.floor(Math.random() * length);
}

function clickExistingHandCard(battleRoot, cardId) {
  const node = [...battleRoot.querySelectorAll('#hand .handCard[data-card-id]')]
    .find((candidate) => candidate.dataset?.cardId === cardId);
  if (!node || node.disabled || node.getAttribute?.('aria-disabled') === 'true') return false;
  node.click();
  return true;
}

function elementCenter(node) {
  const rect = node?.getBoundingClientRect?.();
  if (!rect) return null;
  const x = Number(rect.left) + (Number(rect.width) / 2);
  const y = Number(rect.top) + (Number(rect.height) / 2);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function mountBattleJankenSlidePadRuntime(globalRef = globalThis, { battleRoot = null } = {}) {
  const documentRef = globalRef?.document;
  const root = battleRoot ?? documentRef?.querySelector?.('section[data-screen="battle"]');
  if (!documentRef || !root) return null;
  const existing = root.querySelector?.(`[${HOST_ATTR}="1"]`);
  if (existing?.__gameroadRuntime) return existing.__gameroadRuntime;
  addStyle(documentRef);

  const host = documentRef.createElement('aside');
  host.setAttribute(HOST_ATTR, '1');
  host.dataset.expanded = 'false';
  host.setAttribute('aria-label', 'じゃんけん SlidePad');
  const slotNodes = new Map();
  for (const hand of SLOT_ORDER) {
    const view = SLOT_VIEW[hand];
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = `grJankenSlidePadSlot ${view.className}`;
    button.setAttribute(SLOT_ATTR, hand);
    button.dataset.armed = 'false';
    button.disabled = true;
    button.innerHTML = `<span class="grJankenSlidePadSuit">${view.symbol}</span><span class="grJankenSlidePadCard">空き</span><span class="grJankenSlidePadHand">${view.hand}</span>`;
    host.appendChild(button);
    slotNodes.set(hand, button);
  }
  const handle = documentRef.createElement('button');
  handle.type = 'button';
  handle.className = 'grJankenSlidePadHandle';
  handle.textContent = 'SlidePad';
  handle.setAttribute('aria-expanded', 'false');
  host.appendChild(handle);
  root.appendChild(host);

  let assignment = null;
  let model = null;
  let expanded = false;
  let destroyed = false;
  let timer = null;
  let roundOpenTimer = null;
  let lastRoundId = null;
  let activePointerId = null;
  let dragOrigin = null;
  let dragMoved = false;
  let dragStartedExpanded = false;
  let armedHand = null;

  function setExpanded(next) {
    expanded = next === true;
    host.dataset.expanded = String(expanded);
    handle.setAttribute('aria-expanded', String(expanded));
  }

  function setArmed(nextHand) {
    armedHand = nextHand ?? null;
    for (const [hand, node] of slotNodes) node.dataset.armed = String(hand === armedHand);
    handle.style.transform = '';
    if (!armedHand || !dragOrigin) return;
    const target = elementCenter(slotNodes.get(armedHand));
    if (!target) return;
    const dx = target.x - dragOrigin.x;
    const dy = target.y - dragOrigin.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) return;
    const travel = Math.min(GESTURE_STICK_TRAVEL_PX, distance);
    handle.style.transform = `translate(${((dx / distance) * travel).toFixed(2)}px,${((dy / distance) * travel).toFixed(2)}px)`;
  }

  function currentGestureCandidates() {
    return SLOT_ORDER.flatMap((hand) => {
      const node = slotNodes.get(hand);
      const center = elementCenter(node);
      if (!center || node?.disabled) return [];
      return [{ id: hand, ...center, selectable: true }];
    });
  }

  function updateGesture(event) {
    if (activePointerId === null || event?.pointerId !== activePointerId || !dragOrigin) return null;
    const pointer = { x: Number(event.clientX), y: Number(event.clientY) };
    if (![pointer.x, pointer.y].every(Number.isFinite)) return null;
    if (Math.hypot(pointer.x - dragOrigin.x, pointer.y - dragOrigin.y) >= GESTURE_DEAD_ZONE_PX) dragMoved = true;
    const target = resolveBattleJankenSlidePadGestureTarget({
      origin: dragOrigin,
      pointer,
      candidates: currentGestureCandidates(),
    });
    setArmed(target);
    event.preventDefault?.();
    return target;
  }

  function finishGesture(event, { commit = false, cancelled = false } = {}) {
    if (activePointerId === null || event?.pointerId !== activePointerId) return;
    if (!cancelled) updateGesture(event);
    const pointerId = activePointerId;
    const startedExpanded = dragStartedExpanded;
    const shouldToggle = !dragMoved && !cancelled;
    const selectedHand = commit && dragMoved ? armedHand : null;
    activePointerId = null;
    dragOrigin = null;
    dragMoved = false;
    dragStartedExpanded = false;
    setArmed(null);
    try {
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture?.(pointerId);
    } catch {}
    if (cancelled) {
      setExpanded(startedExpanded);
      return;
    }
    if (shouldToggle) {
      setExpanded(!startedExpanded);
      return;
    }
    if (!selectedHand || !model) return;
    const currentHandIds = readHand(globalRef, root).map((card) => card.id);
    const cardId = resolveBattleJankenSlotCardAction(model, selectedHand, currentHandIds);
    if (cardId) clickExistingHandCard(root, cardId);
  }

  function openForRound(roundId) {
    if (!roundId || roundId === lastRoundId) return;
    lastRoundId = roundId;
    setExpanded(false);
    if (roundOpenTimer !== null) globalRef.clearTimeout?.(roundOpenTimer);
    roundOpenTimer = globalRef.setTimeout?.(() => {
      roundOpenTimer = null;
      if (!destroyed && lastRoundId === roundId) setExpanded(true);
    }, 0) ?? null;
  }

  function render() {
    if (destroyed) return;
    const roundText = root.querySelector?.('#roundNo')?.textContent;
    const hand = readHand(globalRef, root);
    if (!String(roundText ?? '').trim() || hand.length === 0) return;
    model = buildBattleJankenSlidePadModel({
      roundId: roundText,
      hand,
      currentSnapshot: assignment,
      pickDuplicateIndex: (request) => entropyIndex(globalRef, request),
    });
    assignment = model.assignment;
    const currentHandIds = hand.map((card) => card.id);
    for (const slot of model.slots) {
      const node = slotNodes.get(slot.jankenHand);
      const cardText = node.querySelector('.grJankenSlidePadCard');
      node.disabled = !slot.selectable;
      node.dataset.cardId = slot.cardId ?? '';
      node.setAttribute('aria-label', slot.occupied
        ? `${slot.symbol} ${slot.hand} ${slot.cardLabel}`
        : `${slot.symbol} ${slot.hand} 空き`);
      cardText.textContent = slot.occupied ? slot.cardLabel : '空き';
      node.onclick = () => {
        const cardId = resolveBattleJankenSlotCardAction(model, slot.jankenHand, currentHandIds);
        if (cardId) clickExistingHandCard(root, cardId);
      };
    }
    openForRound(model.roundId);
  }

  function schedule() {
    if (destroyed) return;
    if (timer !== null) globalRef.clearTimeout?.(timer);
    timer = globalRef.setTimeout?.(() => { timer = null; render(); }, 50) ?? null;
  }

  handle.addEventListener('pointerdown', (event) => {
    if (activePointerId !== null) return;
    const pointerId = event?.pointerId;
    if (!Number.isFinite(pointerId)) return;
    const center = elementCenter(handle);
    if (!center) return;
    activePointerId = pointerId;
    dragOrigin = center;
    dragMoved = false;
    dragStartedExpanded = expanded;
    if (!expanded) setExpanded(true);
    try { handle.setPointerCapture?.(pointerId); } catch {}
    event.preventDefault?.();
  });
  handle.addEventListener('pointermove', updateGesture);
  handle.addEventListener('pointerup', (event) => finishGesture(event, { commit: true }));
  handle.addEventListener('pointercancel', (event) => finishGesture(event, { cancelled: true }));
  handle.addEventListener('click', (event) => {
    if (event?.detail === 0) setExpanded(!expanded);
  });

  const Observer = globalRef.MutationObserver;
  const observers = [];
  if (typeof Observer === 'function') {
    for (const target of [root.querySelector?.('#hand'), root.querySelector?.('#roundNo'), root.querySelector?.('#phaseTitle')]) {
      if (!target) continue;
      const observer = new Observer(schedule);
      observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
      observers.push(observer);
    }
  }
  schedule();

  const runtime = Object.freeze({
    render,
    snapshot: () => model,
    isExpanded: () => expanded,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      if (timer !== null) globalRef.clearTimeout?.(timer);
      if (roundOpenTimer !== null) globalRef.clearTimeout?.(roundOpenTimer);
      for (const observer of observers) observer.disconnect();
      host.remove();
      return true;
    },
  });
  host.__gameroadRuntime = runtime;
  return runtime;
}

function autoMount() {
  if (typeof globalThis !== 'object' || !globalThis.document) return;
  const runtime = mountBattleJankenSlidePadRuntime(globalThis);
  if (runtime) globalThis.__GAMEROAD_BATTLE_JANKEN_SLIDEPAD__ = runtime;
}

if (typeof globalThis === 'object' && globalThis.document) {
  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  } else {
    queueMicrotask(autoMount);
  }
}

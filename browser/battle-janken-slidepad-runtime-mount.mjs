import {
  ensureRoundStartJankenSlotAssignment,
  NEW_BASE_ROUND_START_JANKEN_SLOT_STATUS,
} from './new-base-round-start-janken-slot-assignment-core.mjs';
import {
  advanceSlotRollDrag,
  createSlotRollState,
  resolveSlotRollCommit,
} from './slidepad-slot-roll-core.mjs';

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
const RELEASE_FLIGHT_DURATION_MS = 560;
const HAND_DRAG_DEAD_ZONE_PX = 8;
const HAND_AURA_ARM_PADDING_PX = 18;
const HAND_AURA_RELEASE_DURATION_MS = 520;
export const BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS = 'section[data-screen="battle"] #targetBox.on,section[data-screen="battle"] #targetBox.vfTargetProxyOn{z-index:60!important}';

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

export function projectBattleLoadCardPreview(model, jankenHand) {
  const hand = typeof jankenHand === 'string' ? jankenHand : null;
  if (!hand || !model?.slots) return null;
  const slot = model.slots.find?.((candidate) => candidate.jankenHand === hand);
  if (!slot?.selectable || !slot.cardId) return null;
  return deepFreeze({
    kind: 'LOAD_CARD',
    cardId: slot.cardId,
    cardLabel: slot.cardLabel,
    jankenHand: slot.jankenHand,
    symbol: slot.symbol,
    hand: slot.hand,
  });
}

export function resolveBattleJankenSlotCardAction(model, jankenHand, currentSourceHandCardIds = []) {
  const slot = model?.slots?.find?.((candidate) => candidate.jankenHand === jankenHand);
  if (!slot?.selectable || !slot.cardId) return null;
  const roundSource = new Set(Array.isArray(model?.assignment?.sourceHandCardIds)
    ? model.assignment.sourceHandCardIds
    : []);
  const currentSource = new Set(Array.isArray(currentSourceHandCardIds) ? currentSourceHandCardIds : []);
  return roundSource.has(slot.cardId) && currentSource.has(slot.cardId) ? slot.cardId : null;
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


export function createBattleJankenSlotRollState(model, anchorHand) {
  const items = SLOT_ORDER.flatMap((hand) => {
    const slot = model?.slots?.find?.((candidate) => candidate.jankenHand === hand);
    if (!slot?.selectable || !slot.cardId) return [];
    return [{ id: hand, label: `${slot.symbol ?? ''} ${slot.hand ?? hand}`.trim() }];
  });
  const anchorIndex = items.findIndex((item) => item.id === anchorHand);
  if (items.length === 0 || anchorIndex < 0) return null;
  return createSlotRollState({ items, anchorIndex });
}

export function advanceBattleJankenSlotRollState(state, { deltaPx, detentPx } = {}) {
  if (!state) return Object.freeze({ state: null, detents: Object.freeze([]) });
  return advanceSlotRollDrag(state, { deltaPx, detentPx });
}

export function isBattleHandAuraLaunchArmed({
  pointer,
  auraRect,
  paddingPx = HAND_AURA_ARM_PADDING_PX,
} = {}) {
  const x = Number(pointer?.x);
  const y = Number(pointer?.y);
  const left = Number(auraRect?.left);
  const top = Number(auraRect?.top);
  const width = Number(auraRect?.width);
  const height = Number(auraRect?.height);
  const padding = Math.max(0, Number(paddingPx) || 0);
  if (![x, y, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const centerX = left + (width / 2);
  const centerY = top + (height / 2);
  const radius = (Math.max(width, height) / 2) + padding;
  return Math.hypot(x - centerX, y - centerY) <= radius;
}

export function projectBattleHandDragGhostPosition({
  pointer,
  grabOffset,
  cardSize,
  viewportHeight = null,
} = {}) {
  const x = Number(pointer?.x);
  const y = Number(pointer?.y);
  const grabX = Number(grabOffset?.x);
  const height = Number(cardSize?.height);
  if (![x, y, grabX, height].every(Number.isFinite) || height <= 0) return null;
  const left = x - grabX;
  const unclampedTop = y - height;
  const viewport = Number(viewportHeight);
  const maxTop = Number.isFinite(viewport) && viewport > 0
    ? Math.max(0, viewport - height)
    : Number.POSITIVE_INFINITY;
  const top = Math.min(Math.max(0, unclampedTop), maxTop);
  return deepFreeze({ left, top });
}

function addStyle(documentRef) {
  if (documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${HOST_ATTR}="1"]{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));z-index:42;width:248px;height:196px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${HOST_ATTR}="1"] .grJankenSlidePadHandle{position:absolute;right:0;bottom:0;width:68px;height:68px;border-radius:50%;border:2px solid rgba(255,255,255,.82);background:radial-gradient(circle at 36% 28%,#f7fff4 0 10%,#79b99d 11% 34%,#183d38 68%,#071b19 100%);box-shadow:0 8px 22px rgba(0,0,0,.38),inset 0 0 0 4px rgba(255,255,255,.08);color:white;font-weight:900;font-size:10px;letter-spacing:.08em;pointer-events:auto;touch-action:none;transition:transform 80ms cubic-bezier(.2,.8,.2,1),filter 100ms ease,box-shadow 100ms ease;will-change:transform,filter,box-shadow}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot{position:absolute;right:2px;bottom:2px;width:82px;height:112px;border-radius:12px;border:2px solid rgba(239,249,244,.78);background:linear-gradient(160deg,#f9fcfa 0%,#dbe7e2 68%,#a9bab4 100%);box-shadow:0 9px 22px rgba(0,0,0,.34);color:#10211e;padding:7px 6px;display:grid;grid-template-rows:auto 1fr auto;align-items:center;text-align:center;opacity:0;transform-origin:calc(100% - 32px) calc(100% - 25px);transform:translate(0,0) rotate(22deg) scale(.66);transition:transform 190ms cubic-bezier(.2,.8,.2,1),opacity 150ms ease,filter 90ms ease,box-shadow 90ms ease;pointer-events:none;touch-action:none}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot{opacity:1;pointer-events:auto}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.rock{transform:translate(-162px,15px) rotate(-18deg)}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.scissors{transform:translate(-124px,-55px) rotate(-8deg);transition-delay:35ms}
[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.paper{transform:translate(-48px,-92px) rotate(5deg);transition-delay:70ms}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot[data-armed="true"]{filter:brightness(1.1) saturate(1.08);border-color:rgba(255,255,255,.98);box-shadow:0 10px 26px rgba(0,0,0,.4),0 0 0 4px rgba(255,255,255,.2)}
[${HOST_ATTR}="1"] .grJankenSlidePadSlot:disabled{filter:saturate(.15);background:linear-gradient(160deg,#f2f4f3,#c7cecb);border-color:rgba(255,255,255,.5);color:#68736f;box-shadow:0 6px 14px rgba(0,0,0,.22);cursor:default;pointer-events:none}
[${HOST_ATTR}="1"] .grJankenSlidePadSuit{font-size:25px;line-height:1;font-weight:900}
[${HOST_ATTR}="1"] .grJankenSlidePadCard{font-size:10px;line-height:1.15;font-weight:850;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
[${HOST_ATTR}="1"] .grJankenSlidePadHand{font-size:9px;font-weight:900;letter-spacing:.08em;opacity:.72}
[${HOST_ATTR}="1"] .grJankenLoadPreview{position:absolute;left:8px;top:8px;width:106px;height:142px;border-radius:16px;border:2px solid rgba(255,255,255,.92);background:linear-gradient(155deg,rgba(252,255,253,.98),rgba(210,229,219,.98));box-shadow:0 14px 34px rgba(0,0,0,.45),0 0 0 3px rgba(255,255,255,.12);color:#10211e;padding:9px 8px;display:grid;grid-template-rows:auto auto 1fr auto;gap:4px;align-items:center;text-align:center;opacity:0;transform:translateY(8px) scale(.88);transition:opacity 90ms ease,transform 120ms cubic-bezier(.2,.8,.2,1);pointer-events:none}
[${HOST_ATTR}="1"] .grJankenLoadPreview[data-visible="true"]{opacity:1;transform:translateY(0) scale(1)}
[${HOST_ATTR}="1"] .grJankenLoadPreviewLabel{font-size:9px;font-weight:950;letter-spacing:.12em;opacity:.62}
[${HOST_ATTR}="1"] .grJankenLoadPreviewSuit{font-size:34px;line-height:1;font-weight:950}
[${HOST_ATTR}="1"] .grJankenLoadPreviewCard{font-size:12px;line-height:1.12;font-weight:900;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
[${HOST_ATTR}="1"] .grJankenLoadPreviewHand{font-size:12px;font-weight:950;letter-spacing:.08em}
section[data-screen="battle"] #hand .handCard[data-janken-reserved="true"]{display:none!important}
section[data-screen="battle"] #hand .handCard[data-hand-aura-draggable="true"]{touch-action:none}
section[data-screen="battle"] #hand .handCard[data-hand-aura-dragging="true"]{opacity:.22!important}
${BATTLE_JANKEN_TARGET_PROXY_LAYER_CSS}
[${HOST_ATTR}="1"][data-hand-aura-active="true"] .grJankenSlidePadHandle{filter:brightness(1.3) saturate(1.35);box-shadow:0 8px 22px rgba(0,0,0,.38),0 0 0 5px rgba(132,255,213,.18),0 0 28px rgba(108,255,205,.45),inset 0 0 0 4px rgba(255,255,255,.15)}
[${HOST_ATTR}="1"][data-hand-aura-armed="true"] .grJankenSlidePadHandle{filter:brightness(1.75) saturate(1.55);box-shadow:0 8px 22px rgba(0,0,0,.34),0 0 0 8px rgba(214,255,239,.25),0 0 44px rgba(115,255,208,.9),inset 0 0 20px rgba(255,255,255,.42)}
.grHandAuraDragGhost{position:fixed!important;right:auto!important;bottom:auto!important;margin:0!important;z-index:220!important;pointer-events:none!important;transition:none!important;transform:none!important;transform-origin:50% 50%!important;will-change:left,top,transform,opacity,filter;box-sizing:border-box}
.grHandAuraDragGhost[data-aura-charged="true"]{filter:brightness(1.35) saturate(1.3) drop-shadow(0 0 7px rgba(222,255,244,.98)) drop-shadow(0 0 18px rgba(89,255,199,.9))!important;box-shadow:0 0 0 3px rgba(231,255,247,.62),0 0 26px rgba(75,255,191,.8)!important}
@media(max-width:540px) and (orientation:portrait){[${HOST_ATTR}="1"]{bottom:185px}[${HOST_ATTR}="1"] .grJankenLoadPreview{width:98px;height:132px}}
@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"]{width:220px;height:160px;right:7px;bottom:7px}[${HOST_ATTR}="1"] .grJankenSlidePadHandle{width:58px;height:58px}[${HOST_ATTR}="1"] .grJankenSlidePadSlot{width:70px;height:94px;padding:5px}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.rock{transform:translate(-143px,10px) rotate(-18deg)}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.scissors{transform:translate(-109px,-47px) rotate(-8deg)}[${HOST_ATTR}="1"][data-expanded="true"] .grJankenSlidePadSlot.paper{transform:translate(-64px,-75px) rotate(5deg)}[${HOST_ATTR}="1"] .grJankenLoadPreview{width:90px;height:120px;left:2px;top:2px}}
@media(prefers-reduced-motion:reduce){[${HOST_ATTR}="1"] .grJankenSlidePadSlot,[${HOST_ATTR}="1"] .grJankenSlidePadHandle,[${HOST_ATTR}="1"] .grJankenLoadPreview{transition:none!important}}
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

function handCardNodes(battleRoot) {
  return [...battleRoot.querySelectorAll('#hand .handCard[data-card-id]')];
}

function readHand(globalRef, battleRoot) {
  const catalog = new Map(cardCatalog(globalRef).flatMap((card) => {
    const id = typeof card?.id === 'string' ? card.id : null;
    return id ? [[id, card]] : [];
  }));
  return handCardNodes(battleRoot).flatMap((node) => {
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

function restoreHandNode(node) {
  if (!node?.dataset) return;
  delete node.dataset.jankenReserved;
  delete node.dataset.handAuraDraggable;
  delete node.dataset.handAuraDragging;
  if (node.dataset.jankenReservedAriaOwned === '1') {
    node.removeAttribute?.('aria-hidden');
    delete node.dataset.jankenReservedAriaOwned;
  }
}

function syncHandZoneProjection(battleRoot, model) {
  const selected = new Set(Array.isArray(model?.assignment?.selectedJankenCardIds)
    ? model.assignment.selectedJankenCardIds
    : []);
  for (const node of handCardNodes(battleRoot)) {
    const id = node.dataset?.cardId?.trim?.() ?? '';
    const reserved = !!id && selected.has(id);
    if (reserved) {
      node.dataset.jankenReserved = 'true';
      node.dataset.handAuraDraggable = 'false';
      if (node.getAttribute?.('aria-hidden') !== 'true') {
        node.dataset.jankenReservedAriaOwned = '1';
        node.setAttribute?.('aria-hidden', 'true');
      }
      continue;
    }
    delete node.dataset.jankenReserved;
    if (node.dataset.jankenReservedAriaOwned === '1') {
      node.removeAttribute?.('aria-hidden');
      delete node.dataset.jankenReservedAriaOwned;
    }
    const selectable = !node.disabled && node.getAttribute?.('aria-disabled') !== 'true';
    node.dataset.handAuraDraggable = selectable ? 'true' : 'false';
  }
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
  const node = handCardNodes(battleRoot)
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

function launchTargetCenter(battleRoot) {
  const target = battleRoot?.querySelector?.('#battlePhaseSurface') ?? battleRoot;
  const rect = target?.getBoundingClientRect?.();
  if (!rect) return null;
  const x = Number(rect.left) + (Number(rect.width) * 0.5);
  const y = Number(rect.top) + (Number(rect.height) * 0.44);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function spatialSlotRole(slotNodes, selectedHand) {
  const ordered = [...slotNodes.entries()].flatMap(([hand, node]) => {
    const center = elementCenter(node);
    return center ? [{ hand, y: center.y }] : [];
  }).sort((a, b) => a.y - b.y);
  const index = ordered.findIndex((entry) => entry.hand === selectedHand);
  if (index < 0 || ordered.length < 2) return 'middle';
  if (index === 0) return 'top';
  if (index === ordered.length - 1) return 'bottom';
  return 'middle';
}

function captureReleasedJankenCardFlight(globalRef, battleRoot, slotNodes, selectedHand) {
  if (globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;
  const sourceNode = slotNodes.get(selectedHand);
  const sourceRect = sourceNode?.getBoundingClientRect?.();
  const start = elementCenter(sourceNode);
  const target = launchTargetCenter(battleRoot);
  if (!sourceNode || !sourceRect || !start || !target || typeof sourceNode.animate !== 'function') return null;
  return {
    clone: sourceNode.cloneNode(true),
    sourceRect,
    start,
    target,
    role: spatialSlotRole(slotNodes, selectedHand),
  };
}

function animateReleasedJankenCard(host, flight) {
  if (!flight) return false;
  const { clone, sourceRect, start, target, role } = flight;
  clone.disabled = false;
  clone.dataset.armed = 'false';
  clone.dataset.jankenFlight = '1';
  clone.setAttribute('aria-hidden', 'true');
  clone.style.position = 'fixed';
  clone.style.left = `${sourceRect.left}px`;
  clone.style.top = `${sourceRect.top}px`;
  clone.style.right = 'auto';
  clone.style.bottom = 'auto';
  clone.style.width = `${sourceRect.width}px`;
  clone.style.height = `${sourceRect.height}px`;
  clone.style.margin = '0';
  clone.style.opacity = '1';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '160';
  clone.style.transition = 'none';
  clone.style.transformOrigin = '50% 50%';
  clone.style.willChange = 'transform,opacity,filter';
  host.appendChild(clone);

  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const flightDistance = Math.max(1, Math.hypot(dx, dy));
  const outwardSign = role === 'top' ? -1 : role === 'bottom' ? 1 : 0;
  const spin = role === 'top' ? -720 : role === 'bottom' ? 720 : 0;
  const bend = outwardSign === 0 ? 0 : Math.min(230, Math.max(96, flightDistance * 0.34));
  const p1 = { x: dx * 0.16, y: (dy * 0.14) + (outwardSign * bend) };
  const p2 = { x: dx * 0.76, y: (dy * 0.76) + (outwardSign * bend * 0.12) };
  const pointAt = (t) => {
    const inv = 1 - t;
    return {
      x: (3 * inv * inv * t * p1.x) + (3 * inv * t * t * p2.x) + (t * t * t * dx),
      y: (3 * inv * inv * t * p1.y) + (3 * inv * t * t * p2.y) + (t * t * t * dy),
    };
  };
  const sampleOffsets = [0, 0.12, 0.28, 0.46, 0.64, 0.82, 1];
  const frames = sampleOffsets.map((t) => {
    const point = pointAt(t);
    const depth = t * t * (3 - (2 * t));
    const scale = 1 - (0.66 * depth);
    return {
      offset: t,
      opacity: 1 - (0.42 * depth),
      filter: `blur(${(0.7 * depth).toFixed(2)}px) brightness(${(1 - (0.12 * depth)).toFixed(3)})`,
      transform: `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0) rotate(${(spin * t).toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    };
  });
  const animation = clone.animate(frames, {
    duration: RELEASE_FLIGHT_DURATION_MS,
    easing: 'cubic-bezier(.16,.74,.18,1)',
    fill: 'forwards',
  });
  animation.finished.then(() => clone.remove(), () => clone.remove());
  return true;
}

function animateHandAuraLaunch(globalRef, documentRef, battleRoot, handle, ghost) {
  if (!ghost) return false;
  const ghostRect = ghost.getBoundingClientRect?.();
  const start = ghostRect
    ? { x: Number(ghostRect.left) + Number(ghostRect.width) / 2, y: Number(ghostRect.top) + Number(ghostRect.height) / 2 }
    : null;
  const aura = elementCenter(handle);
  const target = launchTargetCenter(battleRoot);
  if (globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    || !start || !aura || !target || typeof ghost.animate !== 'function') {
    ghost.remove?.();
    return false;
  }
  ghost.dataset.auraCharged = 'true';
  ghost.setAttribute?.('aria-hidden', 'true');
  ghost.style.visibility = 'visible';
  documentRef.body?.appendChild?.(ghost);
  const auraDx = aura.x - start.x;
  const auraDy = aura.y - start.y;
  const targetDx = target.x - start.x;
  const targetDy = target.y - start.y;
  const frames = [
    { offset: 0, opacity: 1, filter: 'brightness(1.25) saturate(1.2) drop-shadow(0 0 8px rgba(116,255,209,.8))', transform: 'translate3d(0,0,0) scale(1)' },
    { offset: 0.2, opacity: 1, filter: 'brightness(1.75) saturate(1.45) drop-shadow(0 0 14px rgba(223,255,244,1)) drop-shadow(0 0 28px rgba(82,255,194,.95))', transform: `translate3d(${auraDx.toFixed(2)}px,${auraDy.toFixed(2)}px,0) scale(.82)` },
    { offset: 0.34, opacity: 1, filter: 'brightness(2.05) saturate(1.55) drop-shadow(0 0 18px rgba(238,255,249,1)) drop-shadow(0 0 38px rgba(76,255,189,1))', transform: `translate3d(${auraDx.toFixed(2)}px,${auraDy.toFixed(2)}px,0) scale(1.03)` },
    { offset: 1, opacity: 0.56, filter: 'brightness(1.05) saturate(.95) blur(.65px) drop-shadow(0 0 9px rgba(104,255,205,.55))', transform: `translate3d(${targetDx.toFixed(2)}px,${targetDy.toFixed(2)}px,0) scale(.32)` },
  ];
  const animation = ghost.animate(frames, {
    duration: HAND_AURA_RELEASE_DURATION_MS,
    easing: 'cubic-bezier(.17,.76,.18,1)',
    fill: 'forwards',
  });
  animation.finished.then(() => ghost.remove(), () => ghost.remove());
  return true;
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
  host.dataset.handAuraActive = 'false';
  host.dataset.handAuraArmed = 'false';
  host.setAttribute('aria-label', 'じゃんけん SlidePad / カード発射オーラ');
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
  const loadPreview = documentRef.createElement('div');
  loadPreview.className = 'grJankenLoadPreview';
  loadPreview.dataset.visible = 'false';
  loadPreview.setAttribute('aria-hidden', 'true');
  loadPreview.innerHTML = '<span class="grJankenLoadPreviewLabel">LOAD CARD</span><span class="grJankenLoadPreviewSuit"></span><span class="grJankenLoadPreviewCard"></span><span class="grJankenLoadPreviewHand"></span>';
  host.appendChild(loadPreview);
  const loadPreviewSuit = loadPreview.querySelector('.grJankenLoadPreviewSuit');
  const loadPreviewCard = loadPreview.querySelector('.grJankenLoadPreviewCard');
  const loadPreviewHand = loadPreview.querySelector('.grJankenLoadPreviewHand');
  const handle = documentRef.createElement('button');
  handle.type = 'button';
  handle.className = 'grJankenSlidePadHandle';
  handle.textContent = 'SlidePad';
  handle.setAttribute('aria-expanded', 'false');
  handle.setAttribute('aria-label', 'じゃんけん SlidePad / カード発射オーラ');
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
  let slotRollState = null;
  let slotRollLastX = 0;
  let slotRollDetentPx = 0;
  let handDrag = null;
  let boundHandRoot = null;
  let suppressNativeClickCardId = null;
  let allowAuraProgrammaticClick = false;
  let suppressClickTimer = null;

  function renderLoadPreview(nextHand) {
    const preview = projectBattleLoadCardPreview(model, nextHand);
    const visible = !!preview;
    loadPreview.dataset.visible = String(visible);
    loadPreview.setAttribute('aria-hidden', String(!visible));
    loadPreview.dataset.cardId = preview?.cardId ?? '';
    loadPreview.dataset.jankenHand = preview?.jankenHand ?? '';
    loadPreviewSuit.textContent = preview?.symbol ?? '';
    loadPreviewCard.textContent = preview?.cardLabel ?? '';
    loadPreviewHand.textContent = preview ? `${preview.hand} / ${preview.jankenHand}` : '';
    return preview;
  }

  function setExpanded(next) {
    expanded = next === true;
    host.dataset.expanded = String(expanded);
    handle.setAttribute('aria-expanded', String(expanded));
  }

  function setArmed(nextHand) {
    armedHand = nextHand ?? null;
    for (const [hand, node] of slotNodes) node.dataset.armed = String(hand === armedHand);
    renderLoadPreview(armedHand);
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

  function clearBattleSlotRoll() {
    slotRollState = null;
    slotRollLastX = 0;
    slotRollDetentPx = 0;
  }

  function beginBattleSlotRoll(anchorHand, pointerX) {
    slotRollState = createBattleJankenSlotRollState(model, anchorHand);
    slotRollLastX = Number(pointerX);
    const handleWidth = Number(handle.getBoundingClientRect?.()?.width);
    slotRollDetentPx = Number.isFinite(handleWidth) && handleWidth > 0 ? handleWidth : 0;
    return slotRollState;
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

    if (!slotRollState) {
      const anchor = resolveBattleJankenSlidePadGestureTarget({
        origin: dragOrigin,
        pointer,
        candidates: currentGestureCandidates(),
      });
      setArmed(anchor);
      if (anchor) beginBattleSlotRoll(anchor, pointer.x);
      event.preventDefault?.();
      return anchor;
    }

    const deltaPx = pointer.x - slotRollLastX;
    slotRollLastX = pointer.x;
    if (slotRollDetentPx > 0 && Number.isFinite(deltaPx) && deltaPx !== 0) {
      slotRollState = advanceBattleJankenSlotRollState(slotRollState, {
        deltaPx,
        detentPx: slotRollDetentPx,
      }).state;
      setArmed(slotRollState?.itemId ?? armedHand);
    }
    event.preventDefault?.();
    return armedHand;
  }

  function finishGesture(event, { commit = false, cancelled = false } = {}) {
    if (activePointerId === null || event?.pointerId !== activePointerId) return;
    if (!cancelled) updateGesture(event);
    const pointerId = activePointerId;
    const startedExpanded = dragStartedExpanded;
    const shouldToggle = !dragMoved && !cancelled;
    const selectedHand = commit && dragMoved
      ? (slotRollState ? (resolveSlotRollCommit(slotRollState)?.itemId ?? armedHand) : armedHand)
      : null;
    activePointerId = null;
    dragOrigin = null;
    dragMoved = false;
    dragStartedExpanded = false;
    clearBattleSlotRoll();
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
    const currentSourceHandIds = readHand(globalRef, root).map((card) => card.id);
    const cardId = resolveBattleJankenSlotCardAction(model, selectedHand, currentSourceHandIds);
    const flight = cardId ? captureReleasedJankenCardFlight(globalRef, root, slotNodes, selectedHand) : null;
    if (cardId && clickExistingHandCard(root, cardId)) animateReleasedJankenCard(host, flight);
  }

  function clearAuraHostState() {
    host.dataset.handAuraActive = 'false';
    host.dataset.handAuraArmed = 'false';
  }

  function removeHandDragListeners(state) {
    const source = state?.source;
    const handlers = state?.handlers;
    if (!source || !handlers) return;
    source.removeEventListener?.('pointermove', handlers.move);
    source.removeEventListener?.('pointerup', handlers.up);
    source.removeEventListener?.('pointercancel', handlers.cancel);
    source.removeEventListener?.('lostpointercapture', handlers.lost);
  }

  function cleanupHandDrag(state, { keepGhost = false } = {}) {
    if (!state) return;
    removeHandDragListeners(state);
    if (state.source?.dataset) delete state.source.dataset.handAuraDragging;
    try {
      if (state.source?.hasPointerCapture?.(state.pointerId)) state.source.releasePointerCapture?.(state.pointerId);
    } catch {}
    if (!keepGhost) state.ghost?.remove?.();
    clearAuraHostState();
    if (handDrag === state) handDrag = null;
  }

  function isReservedCardId(cardId) {
    return Array.isArray(model?.assignment?.selectedJankenCardIds)
      && model.assignment.selectedJankenCardIds.includes(cardId);
  }

  function updateHandDrag(event) {
    const state = handDrag;
    if (!state || event?.pointerId !== state.pointerId) return false;
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (![x, y].every(Number.isFinite)) return false;
    const distance = Math.hypot(x - state.originPointer.x, y - state.originPointer.y);
    if (!state.moved && distance >= HAND_DRAG_DEAD_ZONE_PX) {
      state.moved = true;
      state.ghost.style.visibility = 'visible';
      state.source.dataset.handAuraDragging = 'true';
      host.dataset.handAuraActive = 'true';
    }
    if (!state.moved) return false;
    const ghostPosition = projectBattleHandDragGhostPosition({
      pointer: { x, y },
      grabOffset: state.offset,
      cardSize: state.cardSize,
      viewportHeight: globalRef?.innerHeight,
    });
    if (!ghostPosition) return false;
    state.ghost.style.left = `${ghostPosition.left.toFixed(2)}px`;
    state.ghost.style.top = `${ghostPosition.top.toFixed(2)}px`;
    const armed = isBattleHandAuraLaunchArmed({
      pointer: { x, y },
      auraRect: handle.getBoundingClientRect?.(),
    });
    state.armed = armed;
    host.dataset.handAuraArmed = String(armed);
    state.ghost.dataset.auraCharged = String(armed);
    event.preventDefault?.();
    return armed;
  }

  function scheduleSuppressClear(cardId) {
    if (suppressClickTimer !== null) globalRef.clearTimeout?.(suppressClickTimer);
    suppressClickTimer = globalRef.setTimeout?.(() => {
      suppressClickTimer = null;
      if (suppressNativeClickCardId === cardId) suppressNativeClickCardId = null;
    }, 0) ?? null;
  }

  function finishHandDrag(event, { cancelled = false } = {}) {
    const state = handDrag;
    if (!state || event?.pointerId !== state.pointerId) return;
    if (!cancelled) updateHandDrag(event);
    const moved = state.moved;
    const cardId = state.cardId;
    const sourceStillOrdinary = !isReservedCardId(cardId)
      && state.source?.dataset?.jankenReserved !== 'true';
    const commit = !cancelled && moved && state.armed && sourceStillOrdinary;
    if (moved) {
      event.preventDefault?.();
      event.stopPropagation?.();
      suppressNativeClickCardId = cardId;
      scheduleSuppressClear(cardId);
    }

    let clicked = false;
    if (commit) {
      allowAuraProgrammaticClick = true;
      try { clicked = clickExistingHandCard(root, cardId); }
      finally { allowAuraProgrammaticClick = false; }
    }
    if (commit && clicked) {
      const ghost = state.ghost;
      cleanupHandDrag(state, { keepGhost: true });
      animateHandAuraLaunch(globalRef, documentRef, root, handle, ghost);
      return;
    }
    cleanupHandDrag(state);
  }

  function beginHandDrag(event) {
    if (destroyed || handDrag || activePointerId !== null) return;
    const source = event?.target?.closest?.('#hand .handCard[data-card-id]');
    if (!source || source.dataset?.handAuraDraggable !== 'true' || source.dataset?.jankenReserved === 'true') return;
    const cardId = source.dataset?.cardId?.trim?.() ?? '';
    const pointerId = event?.pointerId;
    if (!cardId || !Number.isFinite(pointerId) || isReservedCardId(cardId)) return;
    const rect = source.getBoundingClientRect?.();
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!rect || ![x, y, Number(rect.left), Number(rect.top), Number(rect.width), Number(rect.height)].every(Number.isFinite)) return;
    const ghost = source.cloneNode(true);
    ghost.removeAttribute?.('id');
    ghost.classList?.add?.('grHandAuraDragGhost');
    ghost.removeAttribute?.('data-hand-aura-dragging');
    ghost.removeAttribute?.('data-janken-reserved');
    ghost.setAttribute?.('aria-hidden', 'true');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.visibility = 'hidden';
    documentRef.body?.appendChild?.(ghost);
    const state = {
      pointerId,
      cardId,
      source,
      ghost,
      originPointer: { x, y },
      offset: { x: x - Number(rect.left), y: y - Number(rect.top) },
      cardSize: { width: Number(rect.width), height: Number(rect.height) },
      moved: false,
      armed: false,
      handlers: null,
    };
    state.handlers = {
      move: updateHandDrag,
      up: (nextEvent) => finishHandDrag(nextEvent),
      cancel: (nextEvent) => finishHandDrag(nextEvent, { cancelled: true }),
      lost: (nextEvent) => finishHandDrag(nextEvent, { cancelled: true }),
    };
    handDrag = state;
    source.addEventListener?.('pointermove', state.handlers.move);
    source.addEventListener?.('pointerup', state.handlers.up);
    source.addEventListener?.('pointercancel', state.handlers.cancel);
    source.addEventListener?.('lostpointercapture', state.handlers.lost);
    try { source.setPointerCapture?.(pointerId); } catch {}
  }

  function captureHandClick(event) {
    if (allowAuraProgrammaticClick || !suppressNativeClickCardId) return;
    const source = event?.target?.closest?.('#hand .handCard[data-card-id]');
    if (source?.dataset?.cardId !== suppressNativeClickCardId) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    suppressNativeClickCardId = null;
  }

  function bindHandInput() {
    const next = root.querySelector?.('#hand');
    if (next === boundHandRoot) return;
    if (handDrag) cleanupHandDrag(handDrag);
    if (boundHandRoot) {
      boundHandRoot.removeEventListener?.('pointerdown', beginHandDrag);
      boundHandRoot.removeEventListener?.('click', captureHandClick, true);
    }
    boundHandRoot = next ?? null;
    if (boundHandRoot) {
      boundHandRoot.addEventListener?.('pointerdown', beginHandDrag);
      boundHandRoot.addEventListener?.('click', captureHandClick, true);
    }
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
    bindHandInput();
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
    syncHandZoneProjection(root, model);
    const currentSourceHandIds = hand.map((card) => card.id);
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
        const cardId = resolveBattleJankenSlotCardAction(model, slot.jankenHand, currentSourceHandIds);
        if (cardId) clickExistingHandCard(root, cardId);
      };
    }
    if (armedHand) renderLoadPreview(armedHand);
    openForRound(model.roundId);
  }

  function schedule() {
    if (destroyed) return;
    if (timer !== null) globalRef.clearTimeout?.(timer);
    timer = globalRef.setTimeout?.(() => { timer = null; render(); }, 50) ?? null;
  }

  handle.addEventListener('pointerdown', (event) => {
    if (activePointerId !== null || handDrag) return;
    const pointerId = event?.pointerId;
    if (!Number.isFinite(pointerId)) return;
    const center = elementCenter(handle);
    if (!center) return;
    activePointerId = pointerId;
    dragOrigin = center;
    dragMoved = false;
    clearBattleSlotRoll();
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
    loadPreviewSnapshot: () => projectBattleLoadCardPreview(model, armedHand),
    isExpanded: () => expanded,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      if (timer !== null) globalRef.clearTimeout?.(timer);
      if (roundOpenTimer !== null) globalRef.clearTimeout?.(roundOpenTimer);
      if (suppressClickTimer !== null) globalRef.clearTimeout?.(suppressClickTimer);
      if (handDrag) cleanupHandDrag(handDrag);
      if (boundHandRoot) {
        boundHandRoot.removeEventListener?.('pointerdown', beginHandDrag);
        boundHandRoot.removeEventListener?.('click', captureHandClick, true);
      }
      for (const node of handCardNodes(root)) restoreHandNode(node);
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

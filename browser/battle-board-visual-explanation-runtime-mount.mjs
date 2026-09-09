import { projectBattleBoardVisualExplanation } from './battle-board-visual-explanation-core.mjs';
import { projectPartnerAdviceBoardEmphasis } from './partner-advice-runtime-mount.mjs';

const NODE = '#board .node[data-pos]';
const ROLES = 'data-board-visual-roles';
const SUMMARY = 'battleBoardVisualExplanationSummary';
const PROVIDER = '__GAMEROAD_BOARD_PARTNER_ADVICE_AUTHORITY__';
const HAND_CARD = '#hand .handCard[data-card-id]';
const PINCH_ATTR = 'data-battle-card-pinch-active';
const PINCH_MIN_SCALE = 1;
const PINCH_MAX_SCALE = 2.2;
const PINCH_MIN_DISTANCE_PX = 8;
const PINCH_CLICK_SUPPRESS_MS = 350;
const PARTNER_ADVICE_ROOT_ID = 'partnerAdviceChatPresentation';
const PARTNER_ADVICE_COLLAPSED_ATTR = 'data-player-focus-collapsed';
const PARTNER_ADVICE_DISCLOSURE_CLASS = 'partnerAdvicePeripheralDisclosure';
const PARTNER_ADVICE_MOTION_READY_ATTR = 'data-player-focus-motion-ready';
const PARTNER_ADVICE_EXPAND_MS = 180;
const PARTNER_ADVICE_COLLAPSE_MS = 140;
const PARTNER_ADVICE_CONTENT_REVEAL_MS = 120;

function token(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v === value && v.length <= 160 ? v : null;
}

function partnerProjection(win, valid) {
  const p = win?.[PROVIDER];
  if (!p || typeof p.getAdviceResult !== 'function' || typeof p.isCurrent !== 'function' || typeof p.resolveTarget !== 'function') return null;
  try {
    return projectPartnerAdviceBoardEmphasis({
      adviceResult: p.getAdviceResult(),
      isCurrent: p.isCurrent,
      resolveTarget: (candidateId) => {
        const raw = p.resolveTarget(candidateId);
        const id = token(typeof raw === 'string' ? raw : raw?.targetId);
        return id && valid.has(id) ? { targetId: id } : null;
      },
    });
  } catch {
    return null;
  }
}

export function collectBattleBoardRuntimeAuthority(win = globalThis) {
  const doc = win?.document;
  if (!doc) return null;
  const nodes = [...(doc.querySelectorAll?.(NODE) || [])];
  const ids = [...new Set(nodes.map(n => token(n?.dataset?.pos)).filter(Boolean))];
  if (!ids.length) return null;
  const valid = new Set(ids);
  const reachable = [...new Set(nodes.filter(n => n?.classList?.contains?.('reachable')).map(n => token(n?.dataset?.pos)).filter(id => id && valid.has(id)))];
  const endpoint = token(doc.getElementById?.('endpointText')?.textContent || '');
  return Object.freeze({
    validPositionIds: Object.freeze(ids),
    reachablePositionIds: Object.freeze(reachable),
    selectedPositionId: endpoint && valid.has(endpoint) ? endpoint : null,
    partnerProjection: partnerProjection(win, valid),
  });
}

export function projectBattleBoardRuntimeExplanation(authority = {}) {
  return projectBattleBoardVisualExplanation(authority);
}

export function projectBattleCardPinchScale({
  startDistance,
  currentDistance,
  minScale = PINCH_MIN_SCALE,
  maxScale = PINCH_MAX_SCALE,
} = {}) {
  const start = Number(startDistance);
  const current = Number(currentDistance);
  const minimum = Number(minScale);
  const maximum = Number(maxScale);
  if (![start, current, minimum, maximum].every(Number.isFinite) || start < PINCH_MIN_DISTANCE_PX || current <= 0 || minimum <= 0 || maximum < minimum) return null;
  return Math.min(maximum, Math.max(minimum, current / start));
}

function installStyle(doc) {
  if (doc.getElementById?.('gameroad-board-visual-explanation-runtime-style')) return;
  const style = doc.createElement('style');
  style.id = 'gameroad-board-visual-explanation-runtime-style';
  style.textContent = `#${SUMMARY}{display:inline-flex;gap:5px;margin-inline-start:5px;padding:2px 5px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(3,16,15,.64);font-size:9px;font-weight:900;pointer-events:none}#${SUMMARY}[hidden],#${SUMMARY} [hidden]{display:none!important}${NODE}[${ROLES}~="selected"]{outline:2px solid rgba(255,255,255,.92);outline-offset:2px}${NODE}[${ROLES}~="partner-recommendation"]{box-shadow:0 0 0 2px rgba(255,222,130,.9)}section[data-screen="battle"] ${HAND_CARD}{touch-action:none}section[data-screen="battle"] ${HAND_CARD}[${PINCH_ATTR}="true"]{position:relative;z-index:120!important;filter:drop-shadow(0 16px 24px rgba(0,0,0,.42))}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"]{--gameroad-partner-advice-motion-ms:${PARTNER_ADVICE_EXPAND_MS}ms;transform-origin:left top;transition:width var(--gameroad-partner-advice-motion-ms) cubic-bezier(.2,.8,.2,1),max-height var(--gameroad-partner-advice-motion-ms) cubic-bezier(.2,.8,.2,1),padding var(--gameroad-partner-advice-motion-ms) cubic-bezier(.2,.8,.2,1),gap var(--gameroad-partner-advice-motion-ms) cubic-bezier(.2,.8,.2,1)}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="true"]{--gameroad-partner-advice-motion-ms:${PARTNER_ADVICE_COLLAPSE_MS}ms}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[data-battle-advice-overlay="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="true"]{width:min(164px,46vw)!important;max-height:52px!important;overflow:hidden!important;padding:4px!important;gap:4px!important;grid-template-columns:minmax(0,1fr) auto!important;backdrop-filter:blur(4px)!important}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceRoleControl{grid-column:1!important;min-height:44px!important;overflow:hidden}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceRoleControl span,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdvicePartnerSwitch,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceLaneProgress,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceSpeech,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceTutorialConversation,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceTutorialReplay,section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="true"] .partnerAdviceQuickReply{display:none!important}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID} .${PARTNER_ADVICE_DISCLOSURE_CLASS}{grid-column:2;grid-row:1;align-self:start;justify-self:end;min-width:44px;min-height:44px;padding:0 8px;border:1px solid rgba(255,216,120,.56);border-radius:10px;background:rgba(69,49,19,.84);color:#fff1c9;font-size:10px;font-weight:950;line-height:1;pointer-events:auto;touch-action:manipulation}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_COLLAPSED_ATTR}="false"] .${PARTNER_ADVICE_DISCLOSURE_CLASS}{position:sticky;top:0;z-index:2}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="false"] .partnerAdviceLaneProgress{animation:gameroadPartnerAdviceReveal ${PARTNER_ADVICE_CONTENT_REVEAL_MS}ms 45ms both cubic-bezier(.2,.8,.2,1)}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="false"] .partnerAdviceSpeech.partner.on{animation:gameroadPartnerAdviceReveal ${PARTNER_ADVICE_CONTENT_REVEAL_MS}ms 65ms both cubic-bezier(.2,.8,.2,1)}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="false"] .partnerAdviceSpeech.characterReaction.on{animation:gameroadPartnerAdviceReaction 200ms both cubic-bezier(.2,.8,.2,1)}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[${PARTNER_ADVICE_MOTION_READY_ATTR}="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="false"] .partnerAdviceSpeech.player.on{animation:gameroadPartnerAdvicePlayerReply ${PARTNER_ADVICE_CONTENT_REVEAL_MS}ms both cubic-bezier(.2,.8,.2,1)}@keyframes gameroadPartnerAdviceReveal{from{opacity:0;transform:translate3d(-4px,0,0) scale(.985)}to{opacity:1;transform:none}}@keyframes gameroadPartnerAdviceReaction{0%{opacity:.72;transform:translate3d(-5px,0,0) scale(.985)}68%{opacity:1;transform:translate3d(1px,0,0) scale(1.008)}100%{opacity:1;transform:none}}@keyframes gameroadPartnerAdvicePlayerReply{from{opacity:0;transform:translate3d(4px,0,0) scale(.985)}to{opacity:1;transform:none}}@media(max-width:540px),(max-height:420px){#${SUMMARY}{font-size:8px;padding:2px 4px}section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID}[data-battle-advice-overlay="true"][${PARTNER_ADVICE_COLLAPSED_ATTR}="true"]{width:min(154px,46vw)!important}}@media(prefers-reduced-motion:reduce){#${SUMMARY},${NODE}[${ROLES}],section[data-screen="battle"] ${HAND_CARD},section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID},section[data-screen="battle"] #${PARTNER_ADVICE_ROOT_ID} *{transition:none!important;animation:none!important}}`;
  doc.head?.appendChild(style);
}

function installSummary(doc) {
  const current = doc.getElementById?.(SUMMARY);
  if (current) return current;
  const endpoint = doc.getElementById?.('endpointText');
  if (!endpoint?.parentNode?.insertBefore) return null;
  const root = doc.createElement('span');
  root.id = SUMMARY;
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<span data-r>移動可能 <b>0</b></span><span data-s hidden>選択 <b>—</b></span><span data-p hidden>おすすめ <b>—</b></span>';
  endpoint.parentNode.insertBefore(root, endpoint.nextSibling || null);
  return root;
}

function render(doc, root, projection) {
  for (const n of doc.querySelectorAll?.(`${NODE}[${ROLES}]`) || []) n.removeAttribute?.(ROLES);
  if (!projection?.ok) {
    if (root) root.hidden = true;
    return;
  }
  const byId = new Map([...(doc.querySelectorAll?.(NODE) || [])].map(n => [n?.dataset?.pos, n]));
  for (const [id, roles] of Object.entries(projection.rolesByPosition || {})) {
    if (roles?.length) byId.get(id)?.setAttribute?.(ROLES, roles.join(' '));
  }
  if (!root) return;
  const reachable = projection.channels.reachable.length;
  const selected = projection.channels.selected[0] || null;
  const partner = projection.recommendation.active ? projection.recommendation.targetId : null;
  root.querySelector?.('[data-r] b')?.replaceChildren?.(String(reachable));
  const s = root.querySelector?.('[data-s]');
  if (s) { s.hidden = !selected; if (selected) s.querySelector('b').textContent = selected; }
  const p = root.querySelector?.('[data-p]');
  if (p) { p.hidden = !partner; if (partner) p.querySelector('b').textContent = partner; }
  root.hidden = reachable === 0 && !selected && !partner;
  root.dataset.gameplayAuthority = 'false';
}

function hasUrgentPartnerAdvice(root) {
  if (!root?.querySelector) return false;
  if (root.querySelector('.partnerAdviceSpeech.characterReaction.on')) return true;
  if (root.querySelector('.partnerAdviceSpeech.player.on')) return true;
  const tutorialConversation = root.querySelector('.partnerAdviceTutorialConversation');
  return tutorialConversation?.hidden === false;
}

export function installPartnerAdvicePeripheralDisclosure(win = globalThis) {
  const doc = win?.document;
  const battleSurface = doc?.querySelector?.('section[data-screen="battle"]');
  if (!doc || !battleSurface || typeof doc.createElement !== 'function') return null;
  let dead = false;
  let suppressUrgentUntilClear = false;

  const sync = () => {
    if (dead) return Object.freeze({ active: false, collapsed: null });
    const root = doc.getElementById?.(PARTNER_ADVICE_ROOT_ID);
    if (!root || root?.dataset?.battleAdviceOverlay !== 'true') return Object.freeze({ active: false, collapsed: null });

    const motionReady = root.getAttribute?.(PARTNER_ADVICE_MOTION_READY_ATTR) === 'true';
    if (root.getAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR) == null) root.setAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR, 'true');
    let button = root.querySelector?.(`.${PARTNER_ADVICE_DISCLOSURE_CLASS}`);
    if (!button) {
      button = doc.createElement('button');
      button.type = 'button';
      button.className = PARTNER_ADVICE_DISCLOSURE_CLASS;
      button.setAttribute?.('data-player-focus-disclosure', 'true');
      root.appendChild?.(button);
    }
    if (button?.getAttribute?.('data-player-focus-bound') !== 'true') {
      button?.setAttribute?.('data-player-focus-bound', 'true');
      button?.addEventListener?.('click', () => {
        const collapsed = root.getAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR) !== 'false';
        if (collapsed) {
          suppressUrgentUntilClear = false;
          root.setAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR, 'false');
        } else {
          suppressUrgentUntilClear = hasUrgentPartnerAdvice(root);
          root.setAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR, 'true');
        }
        sync();
      });
    }

    const urgent = hasUrgentPartnerAdvice(root);
    if (!urgent) suppressUrgentUntilClear = false;
    if (urgent && !suppressUrgentUntilClear) root.setAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR, 'false');
    const collapsed = root.getAttribute?.(PARTNER_ADVICE_COLLAPSED_ATTR) !== 'false';
    if (button) {
      button.textContent = collapsed ? '助言' : '閉じる';
      button.setAttribute?.('aria-expanded', collapsed ? 'false' : 'true');
      button.setAttribute?.('aria-label', collapsed ? '相棒の助言を開く' : '相棒の助言を閉じる');
    }
    root.dataset.playerFocusDisclosure = 'presentation-only';
    if (!motionReady) root.setAttribute?.(PARTNER_ADVICE_MOTION_READY_ATTR, 'true');
    return Object.freeze({
      active: true,
      collapsed,
      autoExpanded: !collapsed && urgent && !suppressUrgentUntilClear,
      motionReady: true,
      urgentDismissedByPlayer: urgent && suppressUrgentUntilClear,
    });
  };

  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => queueMicrotask(sync)) : null;
  observer?.observe?.(battleSurface, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-pressed'] });
  sync();
  return Object.freeze({
    sync,
    snapshot: sync,
    destroy() {
      if (dead) return false;
      dead = true;
      observer?.disconnect?.();
      return true;
    },
  });
}

function pointerDistance(left, right) {
  if (!left || !right) return NaN;
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y));
}

function snapshotInlinePinchStyle(card) {
  const style = card?.style;
  if (!style) return null;
  return Object.freeze({
    scale: style.scale || '',
    transformOrigin: style.transformOrigin || '',
    zIndex: style.zIndex || '',
    willChange: style.willChange || '',
  });
}

function restoreInlinePinchStyle(card, prior) {
  if (!card?.style || !prior) return;
  card.style.scale = prior.scale;
  card.style.transformOrigin = prior.transformOrigin;
  card.style.zIndex = prior.zIndex;
  card.style.willChange = prior.willChange;
  card.removeAttribute?.(PINCH_ATTR);
}

function cancelSinglePointerDrag(win, card, pointerId) {
  if (!card?.dispatchEvent || typeof win?.PointerEvent !== 'function') return false;
  try {
    const cancel = new win.PointerEvent('pointercancel', { pointerId, bubbles: false, cancelable: false });
    Object.defineProperty(cancel, '__gameroadPinchAbort', { value: true });
    card.dispatchEvent(cancel);
    return true;
  } catch {
    return false;
  }
}

export function installBattleCardPinchZoomRuntime(win = globalThis) {
  const doc = win?.document;
  const hand = doc?.querySelector?.('#hand');
  if (!doc || !hand || typeof hand.addEventListener !== 'function') return null;
  const current = win.__GAMEROAD_BATTLE_CARD_PINCH_ZOOM_RUNTIME__;
  if (current?.destroy) return current;

  const pointers = new Map();
  let gesture = null;
  let dead = false;
  let suppressedCard = null;
  let suppressUntil = 0;

  function targetCard(event) {
    return event?.target?.closest?.(HAND_CARD) ?? null;
  }

  function point(event, card) {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    const pointerId = Number(event?.pointerId);
    if (!card || ![x, y, pointerId].every(Number.isFinite)) return null;
    return { pointerId, x, y, card };
  }

  function matchingPoints(card) {
    return [...pointers.values()].filter((entry) => entry.card === card);
  }

  function finishGesture(card = gesture?.card) {
    if (!gesture || (card && gesture.card !== card)) return false;
    const finishedCard = gesture.card;
    restoreInlinePinchStyle(finishedCard, gesture.priorStyle);
    suppressedCard = finishedCard;
    suppressUntil = Date.now() + PINCH_CLICK_SUPPRESS_MS;
    gesture = null;
    return true;
  }

  function beginGesture(card) {
    if (gesture || !card) return false;
    const matches = matchingPoints(card);
    if (matches.length < 2) return false;
    const first = matches[0];
    const second = matches[1];
    const startDistance = pointerDistance(first, second);
    if (!Number.isFinite(startDistance) || startDistance < PINCH_MIN_DISTANCE_PX) return false;
    const priorStyle = snapshotInlinePinchStyle(card);
    if (!priorStyle) return false;
    cancelSinglePointerDrag(win, card, first.pointerId);
    gesture = { card, pointerIds: new Set([first.pointerId, second.pointerId]), startDistance, priorStyle, scale: 1 };
    card.setAttribute?.(PINCH_ATTR, 'true');
    card.style.transformOrigin = '50% 50%';
    card.style.willChange = 'scale';
    card.style.zIndex = '120';
    card.style.scale = '1';
    return true;
  }

  function onPointerDown(event) {
    if (dead || gesture) return;
    const card = targetCard(event);
    const entry = point(event, card);
    if (!entry) return;
    pointers.set(entry.pointerId, entry);
    if (beginGesture(card)) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }

  function onPointerMove(event) {
    if (dead) return;
    const pointerId = Number(event?.pointerId);
    const existing = pointers.get(pointerId);
    if (!existing) return;
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (![x, y].every(Number.isFinite)) return;
    pointers.set(pointerId, { ...existing, x, y });
    if (!gesture || !gesture.pointerIds.has(pointerId)) return;
    const points = [...gesture.pointerIds].map((id) => pointers.get(id)).filter(Boolean);
    if (points.length < 2) return;
    const scale = projectBattleCardPinchScale({ startDistance: gesture.startDistance, currentDistance: pointerDistance(points[0], points[1]) });
    if (scale == null) return;
    gesture.scale = scale;
    gesture.card.style.scale = String(scale);
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function onPointerEnd(event) {
    if (event?.__gameroadPinchAbort === true) return;
    const pointerId = Number(event?.pointerId);
    if (!Number.isFinite(pointerId)) return;
    const wasGesturePointer = gesture?.pointerIds?.has(pointerId) === true;
    pointers.delete(pointerId);
    if (!wasGesturePointer) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    finishGesture();
  }

  function onClick(event) {
    if (!suppressedCard || Date.now() > suppressUntil) {
      suppressedCard = null;
      suppressUntil = 0;
      return;
    }
    if (targetCard(event) !== suppressedCard) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    suppressedCard = null;
    suppressUntil = 0;
  }

  hand.addEventListener('pointerdown', onPointerDown, true);
  hand.addEventListener('pointermove', onPointerMove, true);
  hand.addEventListener('pointerup', onPointerEnd, true);
  hand.addEventListener('pointercancel', onPointerEnd, true);
  hand.addEventListener('lostpointercapture', onPointerEnd, true);
  hand.addEventListener('click', onClick, true);

  const control = Object.freeze({
    snapshot: () => Object.freeze({ active: !!gesture, cardId: gesture?.card?.dataset?.cardId ?? null, scale: gesture?.scale ?? 1, pointerCount: pointers.size }),
    destroy() {
      if (dead) return false;
      dead = true;
      finishGesture();
      pointers.clear();
      hand.removeEventListener('pointerdown', onPointerDown, true);
      hand.removeEventListener('pointermove', onPointerMove, true);
      hand.removeEventListener('pointerup', onPointerEnd, true);
      hand.removeEventListener('pointercancel', onPointerEnd, true);
      hand.removeEventListener('lostpointercapture', onPointerEnd, true);
      hand.removeEventListener('click', onClick, true);
      suppressedCard = null;
      suppressUntil = 0;
      return true;
    },
  });
  win.__GAMEROAD_BATTLE_CARD_PINCH_ZOOM_RUNTIME__ = control;
  return control;
}

export function installBattleBoardVisualExplanationRuntime(win = globalThis) {
  const doc = win?.document;
  const board = doc?.querySelector?.('#board');
  if (!doc?.getElementById?.('battleMap') || !board || typeof doc.createElement !== 'function') return null;
  installStyle(doc);
  const root = installSummary(doc);
  const partnerAdviceDisclosure = installPartnerAdvicePeripheralDisclosure(win);
  let dead = false;
  const sync = () => {
    if (dead) return Object.freeze({ active: false, projection: null });
    const authority = collectBattleBoardRuntimeAuthority(win);
    const projection = authority ? projectBattleBoardRuntimeExplanation(authority) : null;
    render(doc, root, projection);
    partnerAdviceDisclosure?.sync?.();
    return Object.freeze({ active: projection?.ok === true, projection });
  };
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => queueMicrotask(sync)) : null;
  observer?.observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-pos'] });
  const endpoint = doc.getElementById?.('endpointText');
  if (observer && endpoint) observer.observe(endpoint, { childList: true, characterData: true, subtree: true });
  sync();
  const control = Object.freeze({ sync, snapshot: sync, destroy() { if (dead) return false; dead = true; observer?.disconnect?.(); partnerAdviceDisclosure?.destroy?.(); render(doc, root, null); root?.remove?.(); return true; } });
  win.__GAMEROAD_BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME__ = control;
  return control;
}

function autoInstall(win = globalThis) {
  const doc = win?.document;
  if (!doc) return;
  const run = () => {
    if (!win.__GAMEROAD_BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME__) installBattleBoardVisualExplanationRuntime(win);
    if (!win.__GAMEROAD_BATTLE_CARD_PINCH_ZOOM_RUNTIME__) installBattleCardPinchZoomRuntime(win);
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true }); else run();
}
autoInstall();

export const BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME = Object.freeze({
  actualPositionSelector: NODE,
  selectedAuthority: '#endpointText',
  reachableAuthority: `${NODE}.reachable`,
  partnerProvider: PROVIDER,
  summaryRoot: `#${SUMMARY}`,
  presentationOnly: true,
  gameplayAuthority: false,
  topologyInference: false,
  automaticExecution: false,
  cardPinchZoom: true,
  cardPinchSelector: HAND_CARD,
  cardPinchScaleRange: Object.freeze([PINCH_MIN_SCALE, PINCH_MAX_SCALE]),
  partnerAdvicePeripheralDisclosure: true,
  partnerAdvicePeripheralMotion: Object.freeze({
    initialMotion: false,
    expandMs: PARTNER_ADVICE_EXPAND_MS,
    collapseMs: PARTNER_ADVICE_COLLAPSE_MS,
    contentRevealMs: PARTNER_ADVICE_CONTENT_REVEAL_MS,
    restartOnSameStateSync: false,
    reducedMotionPreservesState: true,
    presentationOnly: true,
  }),
});
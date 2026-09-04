import { createDeckSwipeFlightPlan } from './cards-deck-presentation-core.mjs';

function safeAnimate(element, keyframes, options) {
  try { return typeof element?.animate === 'function' ? element.animate(keyframes, options) : null; }
  catch { return null; }
}

function reduced(win, explicit) {
  if (typeof explicit === 'boolean') return explicit;
  try { return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); }
  catch { return false; }
}

function installStyles(doc) {
  if (!doc?.createElement || doc.getElementById?.('gr-deck-remove-ghost-style')) return;
  const style = doc.createElement('style');
  style.id = 'gr-deck-remove-ghost-style';
  style.textContent = `
.gr-deck-remove-ghost-layer{position:fixed;inset:0;z-index:10000;pointer-events:none;overflow:hidden;contain:layout style paint}
.gr-deck-remove-ghost-card{position:fixed!important;margin:0!important;pointer-events:none!important;transform-origin:center center;will-change:transform,opacity,filter;opacity:.76;filter:brightness(1.12) drop-shadow(0 10px 12px rgba(0,0,0,.24))}
.gr-deck-remove-ghost-streak{position:fixed;width:76px;height:3px;border-radius:999px;transform-origin:right center;opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14) 24%,rgba(255,239,176,.94));filter:drop-shadow(0 0 5px rgba(255,224,139,.58));will-change:transform,opacity}
@keyframes grDeckRemoveReturnPulse{0%{filter:brightness(1)}38%{filter:brightness(1.34) drop-shadow(0 0 14px rgba(255,216,74,.7))}100%{filter:brightness(1)}}
.gr-deck-remove-return-pulse{animation:grDeckRemoveReturnPulse 360ms ease-out 1}
@media(prefers-reduced-motion:reduce){.gr-deck-remove-ghost-streak{display:none!important}.gr-deck-remove-return-pulse{animation:none;filter:brightness(1.14)}}
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
  installStyles(doc);
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

  const prepare = ({ cardId, sourceElement } = {}) => {
    const id = String(cardId ?? '');
    if (!id || !sourceElement?.getBoundingClientRect || !sourceElement?.cloneNode || !doc?.createElement || !doc?.body?.appendChild) return false;
    removeEntry(id);
    const sourceRect = sourceElement.getBoundingClientRect();
    if (!(sourceRect.width > 0 && sourceRect.height > 0)) return false;
    const layer = doc.createElement('div');
    layer.className = 'gr-deck-remove-ghost-layer';
    layer.setAttribute?.('aria-hidden', 'true');
    const clone = sourceElement.cloneNode(true);
    clone.removeAttribute?.('id');
    clone.setAttribute?.('aria-hidden', 'true');
    clone.classList?.add?.('gr-deck-remove-ghost-card');
    Object.assign(clone.style ?? {}, {
      left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`, height: `${sourceRect.height}px`,
    });
    layer.appendChild(clone);
    doc.body.appendChild(layer);
    pending.set(id, { layer, clone, sourceRect });
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
    if (!entry || !targetElement?.getBoundingClientRect) return false;
    pulseTarget(targetElement);
    const isReduced = reduced(win, reducedMotion);
    const plan = createDeckSwipeFlightPlan({
      sourceRect: entry.sourceRect,
      targetRect: targetElement.getBoundingClientRect(),
      reducedMotion: isReduced,
      config: { flightMs, streakCount },
    });
    const finish = () => removeEntry(id);
    if (isReduced || plan.flightMs === 0) {
      safeAnimate(entry.clone, [{ opacity: .76 }, { opacity: 0 }], { duration: 90, easing: 'ease-out', fill: 'forwards' });
      setTimer(finish, 100);
      return true;
    }
    const angle = Math.atan2(plan.dy, plan.dx) * 180 / Math.PI;
    const streaks = [];
    for (let i = 0; i < plan.streakCount; i += 1) {
      const streak = doc.createElement('span');
      streak.className = 'gr-deck-remove-ghost-streak';
      Object.assign(streak.style ?? {}, {
        left: `${plan.source.centerX}px`,
        top: `${plan.source.centerY + (i - (plan.streakCount - 1) / 2) * 10}px`,
        transform: `translateX(-76px) rotate(${angle}deg)`,
      });
      entry.layer.appendChild(streak);
      streaks.push(streak);
    }
    const cardAnim = safeAnimate(entry.clone, [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: .76, offset: 0 },
      { transform: `translate3d(${plan.dx * .54}px,${plan.dy * .54 + plan.arcY}px,0) scale(.91) rotate(${plan.rotationDeg}deg)`, opacity: .54, offset: .56 },
      { transform: `translate3d(${plan.dx}px,${plan.dy}px,0) scale(.72) rotate(${plan.rotationDeg * .35}deg)`, opacity: 0, offset: 1 },
    ], { duration: plan.flightMs, easing: 'cubic-bezier(.18,.82,.25,1)', fill: 'forwards' });
    for (let i = 0; i < streaks.length; i += 1) {
      const lag = i * 24;
      safeAnimate(streaks[i], [
        { opacity: 0, transform: `translate3d(0,0,0) translateX(-76px) rotate(${angle}deg)`, offset: 0 },
        { opacity: .84 - i * .18, offset: .28 },
        { opacity: 0, transform: `translate3d(${plan.dx * .78}px,${plan.dy * .78 + plan.arcY * .3}px,0) translateX(-76px) rotate(${angle}deg)`, offset: 1 },
      ], { duration: Math.max(100, plan.flightMs - lag), delay: lag, easing: 'ease-out', fill: 'forwards' });
    }
    if (cardAnim && 'onfinish' in cardAnim) cardAnim.onfinish = finish;
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

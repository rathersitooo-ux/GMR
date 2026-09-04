import {
  createDeckSwipeFlightPlan,
  installDeckSwipePresentationStyles,
} from './cards-deck-presentation-core.mjs';

function resolveReducedMotion(win, explicit) {
  if (typeof explicit === 'boolean') return explicit;
  try { return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); }
  catch { return false; }
}

function animate(element, keyframes, options) {
  try { return typeof element?.animate === 'function' ? element.animate(keyframes, options) : null; }
  catch { return null; }
}

function setStyle(element, values) {
  if (!element?.style) return;
  for (const [key, value] of Object.entries(values)) {
    try { element.style[key] = value; } catch {}
  }
}

function setVar(element, name, value) {
  try { element?.style?.setProperty?.(name, value); } catch {}
}

export function prepareDeckRemoveGhostTransfer({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  sourceElement,
  targetElement,
  cardId = null,
  reducedMotion,
} = {}) {
  if (!sourceElement?.getBoundingClientRect || !targetElement?.getBoundingClientRect) return null;
  if (!doc?.createElement || !doc?.body?.appendChild) return null;

  installDeckSwipePresentationStyles(doc);
  const reduced = resolveReducedMotion(win, reducedMotion);
  let plan;
  try {
    plan = createDeckSwipeFlightPlan({
      sourceRect: sourceElement.getBoundingClientRect(),
      targetRect: targetElement.getBoundingClientRect(),
      reducedMotion: reduced,
    });
  } catch {
    return null;
  }

  const timers = new Set();
  const setTimer = (fn, ms) => {
    let id;
    const wrapped = () => {
      if (id !== undefined) timers.delete(id);
      fn();
    };
    id = (win?.setTimeout ?? globalThis.setTimeout)?.(wrapped, ms);
    if (id !== undefined) timers.add(id);
    return id;
  };
  const clearTimers = () => {
    const clear = win?.clearTimeout ?? globalThis.clearTimeout;
    for (const id of timers) clear?.(id);
    timers.clear();
  };

  if (plan.reducedMotion || plan.flightMs === 0) {
    let played = false;
    return Object.freeze({
      cardId: cardId == null ? null : String(cardId),
      plan,
      sourceElement,
      targetElement,
      ghostElement: null,
      streakElements: Object.freeze([]),
      play() {
        if (played) return false;
        played = true;
        targetElement.classList?.add?.('gr-deck-swipe-target-hit');
        setTimer(() => targetElement.classList?.remove?.('gr-deck-swipe-target-hit'), plan.landingPulseMs);
        return true;
      },
      cancel() { clearTimers(); return true; },
    });
  }

  if (!sourceElement?.cloneNode) return null;
  const layer = doc.createElement('div');
  layer.className = 'gr-deck-swipe-layer';
  layer.setAttribute?.('aria-hidden', 'true');
  setStyle(layer, { visibility: 'hidden' });

  const ghost = sourceElement.cloneNode(true);
  ghost.removeAttribute?.('id');
  ghost.setAttribute?.('aria-hidden', 'true');
  ghost.classList?.add?.('gr-deck-swipe-flight-card', 'gr-deck-remove-ghost-card');
  setStyle(ghost, {
    left: `${plan.source.left}px`,
    top: `${plan.source.top}px`,
    width: `${plan.source.width}px`,
    height: `${plan.source.height}px`,
    pointerEvents: 'none',
  });
  layer.appendChild(ghost);

  const streaks = [];
  const angle = Math.atan2(plan.dy, plan.dx) * 180 / Math.PI;
  for (let index = 0; index < plan.streakCount; index += 1) {
    const streak = doc.createElement('span');
    streak.className = 'gr-deck-swipe-streak gr-deck-remove-ghost-streak';
    setVar(streak, '--gr-streak-i', String(index));
    setVar(streak, '--gr-streak-angle', `${angle}deg`);
    setVar(streak, '--gr-streak-left', `${plan.source.centerX}px`);
    setVar(streak, '--gr-streak-top', `${plan.source.centerY + (index - 0.5) * 10}px`);
    layer.appendChild(streak);
    streaks.push(streak);
  }
  doc.body.appendChild(layer);

  let state = 'prepared';
  const finish = () => {
    if (state === 'finished' || state === 'cancelled') return;
    state = 'finished';
    clearTimers();
    layer.remove?.();
    targetElement.classList?.add?.('gr-deck-swipe-target-hit');
    setTimer(() => targetElement.classList?.remove?.('gr-deck-swipe-target-hit'), plan.landingPulseMs);
  };

  return Object.freeze({
    cardId: cardId == null ? null : String(cardId),
    plan,
    sourceElement,
    targetElement,
    ghostElement: ghost,
    streakElements: Object.freeze([...streaks]),
    play() {
      if (state !== 'prepared') return false;
      state = 'playing';
      setStyle(layer, { visibility: 'visible' });

      const cardAnim = animate(ghost, [
        { transform: 'translate3d(0,0,0) scale(.98)', opacity: 0.76, filter: 'brightness(1.08)', offset: 0 },
        { transform: `translate3d(${plan.dx * 0.54}px,${plan.dy * 0.54 + plan.arcY}px,0) scale(${plan.midFlightScale}) rotate(${plan.rotationDeg}deg)`, opacity: 0.5, filter: 'brightness(1.12)', offset: 0.56 },
        { transform: `translate3d(${plan.dx}px,${plan.dy}px,0) scale(${plan.flightEndScale}) rotate(${plan.rotationDeg * 0.35}deg)`, opacity: 0, filter: 'brightness(1.18)', offset: 1 },
      ], { duration: plan.flightMs, easing: 'cubic-bezier(.18,.82,.25,1)', fill: 'forwards' });

      for (let index = 0; index < streaks.length; index += 1) {
        const streak = streaks[index];
        const lag = index * 24;
        animate(streak, [
          { opacity: 0, transform: `translate3d(0,0,0) translateX(-72px) rotate(${angle}deg)`, offset: 0 },
          { opacity: Math.max(0.3, 0.9 - index * 0.2), offset: 0.24 },
          { opacity: 0, transform: `translate3d(${plan.dx * 0.78}px,${plan.dy * 0.78 + plan.arcY * 0.35}px,0) translateX(-72px) rotate(${angle}deg)`, offset: 1 },
        ], { duration: Math.max(100, plan.flightMs - lag), delay: lag, easing: 'ease-out', fill: 'forwards' });
      }

      if (cardAnim && 'onfinish' in cardAnim) cardAnim.onfinish = finish;
      setTimer(finish, plan.flightMs + 40);
      return true;
    },
    cancel() {
      if (state === 'finished' || state === 'cancelled') return false;
      state = 'cancelled';
      clearTimers();
      layer.remove?.();
      return true;
    },
  });
}

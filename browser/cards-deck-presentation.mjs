const EVENT_NAMES = Object.freeze({
  COMMIT: 'gameroad:deck-swipe-commit',
  LAND: 'gameroad:deck-swipe-land',
  REJECT: 'gameroad:deck-swipe-reject',
});

export const DECK_SWIPE_PRESENTATION_EVENTS = EVENT_NAMES;

export const DECK_SWIPE_SFX_CUES = Object.freeze({
  commit: Object.freeze({ kind: 'noise', durationSec: 0.085, gain: 0.14, filterStartHz: 880, filterEndHz: 2400 }),
  land: Object.freeze({ kind: 'tone', durationSec: 0.075, gain: 0.12, wave: 'triangle', startHz: 760, endHz: 1180 }),
  reject: Object.freeze({ kind: 'tone', durationSec: 0.09, gain: 0.08, wave: 'sine', startHz: 190, endHz: 135 }),
});

export const DEFAULT_DECK_SWIPE_PRESENTATION = Object.freeze({
  flightMs: 220,
  landingPulseMs: 260,
  countPulseMs: 280,
  recentAddMs: 620,
  rejectMs: 240,
  sourceLiftScale: 1.02,
  midFlightScale: 0.9,
  flightEndScale: 0.7,
  countPulseScale: 1.15,
  arcMinPx: 18,
  arcMaxPx: 44,
  streakCount: 2,
});

function finite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name}_INVALID`);
  return value;
}

function positive(value, name) {
  finite(value, name);
  if (value <= 0) throw new RangeError(`${name}_INVALID`);
  return value;
}

function nonNegative(value, name) {
  finite(value, name);
  if (value < 0) throw new RangeError(`${name}_INVALID`);
  return value;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new TypeError('CONFIG_INVALID');
  }
  const merged = { ...DEFAULT_DECK_SWIPE_PRESENTATION, ...config };
  for (const key of ['flightMs', 'landingPulseMs', 'countPulseMs', 'recentAddMs', 'rejectMs']) {
    positive(merged[key], key.toUpperCase());
  }
  for (const key of ['sourceLiftScale', 'midFlightScale', 'flightEndScale', 'countPulseScale']) {
    positive(merged[key], key.toUpperCase());
  }
  nonNegative(merged.arcMinPx, 'ARC_MIN_PX');
  nonNegative(merged.arcMaxPx, 'ARC_MAX_PX');
  if (merged.arcMaxPx < merged.arcMinPx) throw new RangeError('ARC_RANGE_INVALID');
  if (!Number.isInteger(merged.streakCount) || merged.streakCount < 0 || merged.streakCount > 4) {
    throw new RangeError('STREAK_COUNT_INVALID');
  }
  return Object.freeze(merged);
}

export function normalizeDeckSwipeRect(rect, name = 'RECT') {
  if (!rect || typeof rect !== 'object' || Array.isArray(rect)) throw new TypeError(`${name}_INVALID`);
  const left = finite(rect.left, `${name}_LEFT`);
  const top = finite(rect.top, `${name}_TOP`);
  const width = positive(rect.width, `${name}_WIDTH`);
  const height = positive(rect.height, `${name}_HEIGHT`);
  return Object.freeze({
    left,
    top,
    width,
    height,
    right: Number.isFinite(rect.right) ? rect.right : left + width,
    bottom: Number.isFinite(rect.bottom) ? rect.bottom : top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  });
}

export function createDeckSwipeFlightPlan({ sourceRect, targetRect, reducedMotion = false, config = {} } = {}) {
  const cfg = normalizeConfig(config);
  const source = normalizeDeckSwipeRect(sourceRect, 'SOURCE_RECT');
  const target = normalizeDeckSwipeRect(targetRect, 'TARGET_RECT');
  const dx = target.centerX - source.centerX;
  const dy = target.centerY - source.centerY;
  const distance = Math.hypot(dx, dy);
  const arcY = -clamp(distance * 0.075, cfg.arcMinPx, cfg.arcMaxPx);
  const rotationDeg = clamp(dy * 0.018, -4, 4);
  const reduced = Boolean(reducedMotion);
  return Object.freeze({
    kind: 'success',
    reducedMotion: reduced,
    source,
    target,
    dx,
    dy,
    distance,
    arcY,
    rotationDeg,
    flightMs: reduced ? 0 : cfg.flightMs,
    streakCount: reduced ? 0 : cfg.streakCount,
    landingPulseMs: cfg.landingPulseMs,
    countPulseMs: cfg.countPulseMs,
    recentAddMs: cfg.recentAddMs,
    sourceLiftScale: cfg.sourceLiftScale,
    midFlightScale: cfg.midFlightScale,
    flightEndScale: cfg.flightEndScale,
    countPulseScale: cfg.countPulseScale,
    preserveSemanticFeedback: true,
  });
}

export function createDeckSwipeRejectPlan({ reason = 'rejected', reducedMotion = false, config = {} } = {}) {
  const cfg = normalizeConfig(config);
  return Object.freeze({
    kind: 'reject',
    reason: String(reason || 'rejected'),
    reducedMotion: Boolean(reducedMotion),
    recoilMs: reducedMotion ? 0 : cfg.rejectMs,
    preserveSemanticFeedback: true,
  });
}

export function createDeckSwipeFeedbackDetail({ phase, cardId = null, reason = null, reducedMotion = false } = {}) {
  if (!['commit', 'land', 'reject'].includes(phase)) throw new RangeError('PHASE_INVALID');
  return Object.freeze({
    phase,
    cardId: cardId == null ? null : String(cardId),
    reason: reason == null ? null : String(reason),
    reducedMotion: Boolean(reducedMotion),
  });
}

function resolveReducedMotion(win, explicit) {
  if (typeof explicit === 'boolean') return explicit;
  try {
    return Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function emit(doc, win, name, detail) {
  if (!doc?.dispatchEvent) return;
  const CustomEventCtor = win?.CustomEvent ?? globalThis.CustomEvent;
  if (typeof CustomEventCtor === 'function') {
    doc.dispatchEvent(new CustomEventCtor(name, { detail }));
    return;
  }
  doc.dispatchEvent({ type: name, detail });
}

function safeClassAdd(element, className) {
  element?.classList?.add?.(className);
}

function safeClassRemove(element, className) {
  element?.classList?.remove?.(className);
}

function safeAnimate(element, keyframes, options) {
  try {
    return typeof element?.animate === 'function' ? element.animate(keyframes, options) : null;
  } catch {
    return null;
  }
}

function cloneForFlight(sourceElement, doc, plan) {
  if (!sourceElement?.cloneNode || !doc?.createElement || !doc?.body?.appendChild) return null;
  const layer = doc.createElement('div');
  layer.className = 'gr-deck-swipe-layer';
  layer.setAttribute?.('aria-hidden', 'true');

  const clone = sourceElement.cloneNode(true);
  clone.removeAttribute?.('id');
  clone.setAttribute?.('aria-hidden', 'true');
  clone.classList?.add?.('gr-deck-swipe-flight-card');
  Object.assign(clone.style ?? {}, {
    left: `${plan.source.left}px`,
    top: `${plan.source.top}px`,
    width: `${plan.source.width}px`,
    height: `${plan.source.height}px`,
  });
  layer.appendChild(clone);

  const streaks = [];
  for (let index = 0; index < plan.streakCount; index += 1) {
    const streak = doc.createElement('span');
    streak.className = 'gr-deck-swipe-streak';
    streak.style?.setProperty?.('--gr-streak-i', String(index));
    streak.style?.setProperty?.('--gr-streak-angle', `${Math.atan2(plan.dy, plan.dx) * 180 / Math.PI}deg`);
    streak.style?.setProperty?.('--gr-streak-left', `${plan.source.centerX}px`);
    streak.style?.setProperty?.('--gr-streak-top', `${plan.source.centerY + (index - 0.5) * 10}px`);
    layer.appendChild(streak);
    streaks.push(streak);
  }
  doc.body.appendChild(layer);
  return { layer, clone, streaks };
}

export function installDeckSwipePresentationStyles(doc, { styleId = 'gameroad-deck-swipe-presentation-style' } = {}) {
  if (!doc?.createElement) return null;
  if (doc.getElementById?.(styleId)) return doc.getElementById(styleId);
  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
.gr-deck-swipe-layer{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;contain:layout style paint}
.gr-deck-swipe-flight-card{position:fixed!important;margin:0!important;pointer-events:none!important;transform-origin:center center;will-change:transform,opacity,filter;filter:drop-shadow(0 12px 14px rgba(0,0,0,.28)) brightness(1.05)}
.gr-deck-swipe-streak{position:fixed;left:var(--gr-streak-left);top:var(--gr-streak-top);width:72px;height:3px;border-radius:999px;transform-origin:right center;transform:translateX(-72px) rotate(var(--gr-streak-angle));opacity:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18) 28%,rgba(255,239,176,.92));filter:drop-shadow(0 0 5px rgba(255,224,139,.55));will-change:transform,opacity}
.gr-deck-swipe-source-armed{transform:scale(1.02);filter:brightness(1.05);transition:transform 70ms ease-out,filter 70ms ease-out}
.gr-deck-swipe-target-hit{animation:grDeckSwipeTargetHit 260ms cubic-bezier(.2,.9,.25,1)}
.gr-deck-swipe-count-hit{animation:grDeckSwipeCountHit 280ms cubic-bezier(.18,1.4,.25,1)}
.gr-deck-swipe-recent-add{animation:grDeckSwipeRecentAdd 620ms ease-out}
.gr-deck-swipe-reject{animation:grDeckSwipeReject 240ms ease-out}
.gr-deck-swipe-target-reject{animation:grDeckSwipeTargetReject 240ms ease-out}
@keyframes grDeckSwipeTargetHit{0%{transform:scale(1);filter:brightness(1)}38%{transform:scale(1.04);filter:brightness(1.34) drop-shadow(0 0 13px rgba(255,219,118,.72))}100%{transform:scale(1);filter:brightness(1)}}
@keyframes grDeckSwipeCountHit{0%{transform:scale(1)}42%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes grDeckSwipeRecentAdd{0%{filter:brightness(1)}24%{filter:brightness(1.35) drop-shadow(0 0 10px rgba(255,222,132,.62))}100%{filter:brightness(1)}}
@keyframes grDeckSwipeReject{0%,100%{transform:translateX(0)}35%{transform:translateX(-8px)}65%{transform:translateX(4px)}}
@keyframes grDeckSwipeTargetReject{0%,100%{filter:brightness(1)}45%{filter:brightness(1.18) saturate(.7)}}
@media (prefers-reduced-motion:reduce){.gr-deck-swipe-flight-card,.gr-deck-swipe-streak{display:none!important}.gr-deck-swipe-target-hit,.gr-deck-swipe-count-hit,.gr-deck-swipe-recent-add,.gr-deck-swipe-reject,.gr-deck-swipe-target-reject{animation-duration:1ms!important}}
`;
  (doc.head ?? doc.documentElement)?.appendChild?.(style);
  return style;
}

function resolveEnabled(enabled) {
  try { return typeof enabled === 'function' ? Boolean(enabled()) : enabled !== false; }
  catch { return false; }
}

export function createDeckSwipeSfxPlayer({
  window: win = globalThis.window,
  enabled = true,
  volume = 1,
} = {}) {
  if (!Number.isFinite(volume) || volume < 0 || volume > 2) throw new RangeError('SFX_VOLUME_INVALID');
  let context = null;

  const getContext = () => {
    if (!resolveEnabled(enabled)) return null;
    if (context) return context;
    const AudioContextCtor = win?.AudioContext ?? win?.webkitAudioContext;
    if (typeof AudioContextCtor !== 'function') return null;
    try {
      context = new AudioContextCtor();
      if (context.state === 'suspended') Promise.resolve(context.resume?.()).catch(() => {});
      return context;
    } catch {
      context = null;
      return null;
    }
  };

  const shapeGain = (gainParam, now, duration, peak) => {
    gainParam?.cancelScheduledValues?.(now);
    gainParam?.setValueAtTime?.(0.0001, now);
    gainParam?.linearRampToValueAtTime?.(Math.max(0.0001, peak), now + Math.min(0.018, duration * 0.28));
    gainParam?.exponentialRampToValueAtTime?.(0.0001, now + duration);
  };

  const playNoise = (ctx, cue) => {
    if (!ctx.createBuffer || !ctx.createBufferSource || !ctx.createBiquadFilter || !ctx.createGain) return false;
    const rate = Math.max(8000, Number(ctx.sampleRate) || 48000);
    const frameCount = Math.max(1, Math.ceil(rate * cue.durationSec));
    const buffer = ctx.createBuffer(1, frameCount, rate);
    const data = buffer.getChannelData?.(0);
    if (data) {
      for (let i = 0; i < data.length; i += 1) {
        const envelope = 1 - i / data.length;
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const now = Number(ctx.currentTime) || 0;
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.Q?.setValueAtTime?.(0.8, now);
    filter.frequency?.setValueAtTime?.(cue.filterStartHz, now);
    filter.frequency?.exponentialRampToValueAtTime?.(cue.filterEndHz, now + cue.durationSec);
    shapeGain(gain.gain, now, cue.durationSec, cue.gain * volume);
    source.connect?.(filter);
    filter.connect?.(gain);
    gain.connect?.(ctx.destination);
    source.start?.(now);
    source.stop?.(now + cue.durationSec + 0.01);
    return true;
  };

  const playTone = (ctx, cue) => {
    if (!ctx.createOscillator || !ctx.createGain) return false;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = Number(ctx.currentTime) || 0;
    osc.type = cue.wave;
    osc.frequency?.setValueAtTime?.(cue.startHz, now);
    const endHz = Math.max(1, cue.endHz);
    osc.frequency?.exponentialRampToValueAtTime?.(endHz, now + cue.durationSec);
    shapeGain(gain.gain, now, cue.durationSec, cue.gain * volume);
    osc.connect?.(gain);
    gain.connect?.(ctx.destination);
    osc.start?.(now);
    osc.stop?.(now + cue.durationSec + 0.01);
    return true;
  };

  const play = (phase) => {
    const cue = DECK_SWIPE_SFX_CUES[phase];
    if (!cue || !resolveEnabled(enabled)) return false;
    try {
      const ctx = getContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') Promise.resolve(ctx.resume?.()).catch(() => {});
      return cue.kind === 'noise' ? playNoise(ctx, cue) : playTone(ctx, cue);
    } catch {
      return false;
    }
  };

  const dispose = () => {
    const current = context;
    context = null;
    try { return current?.close?.(); } catch { return undefined; }
  };

  return Object.freeze({
    play,
    playCommit: () => play('commit'),
    playLand: () => play('land'),
    playReject: () => play('reject'),
    dispose,
    get hasContext() { return Boolean(context); },
  });
}

export function createDeckSwipePresentationController({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  reducedMotion,
  config = {},
  onCommitSfx,
  onLandSfx,
  onRejectSfx,
  sfx = true,
  sfxEnabled = true,
  sfxVolume = 1,
  sfxPlayer = null,
} = {}) {
  const cfg = normalizeConfig(config);
  const timers = new Set();
  const layers = new Set();
  installDeckSwipePresentationStyles(doc);
  const localSfx = sfx === false ? null : (sfxPlayer ?? createDeckSwipeSfxPlayer({ window: win, enabled: sfxEnabled, volume: sfxVolume }));

  const setTimer = (fn, ms) => {
    let id;
    let firedSynchronously = false;
    const wrapped = () => {
      firedSynchronously = true;
      if (id !== undefined) timers.delete(id);
      fn();
    };
    id = (win?.setTimeout ?? globalThis.setTimeout)(wrapped, ms);
    if (!firedSynchronously) timers.add(id);
    return id;
  };

  const clearPresentationClass = (element, className, ms) => {
    safeClassAdd(element, className);
    setTimer(() => safeClassRemove(element, className), Math.max(1, ms));
  };

  const fire = (phase, payload, callback) => {
    const detail = createDeckSwipeFeedbackDetail({ phase, ...payload });
    emit(doc, win, EVENT_NAMES[phase.toUpperCase()], detail);
    try {
      if (callback) callback(detail);
      else if (phase === 'commit') localSfx?.playCommit?.();
      else if (phase === 'land') localSfx?.playLand?.();
      else if (phase === 'reject') localSfx?.playReject?.();
    } catch { /* presentation audio cannot break deck state */ }
    return detail;
  };

  const land = ({ targetElement, insertedElement, cardId, reduced }) => {
    clearPresentationClass(targetElement, 'gr-deck-swipe-target-hit', cfg.landingPulseMs);
    clearPresentationClass(insertedElement, 'gr-deck-swipe-recent-add', cfg.recentAddMs);
    fire('land', { cardId, reducedMotion: reduced }, onLandSfx);
  };

  function playSuccess({ sourceElement, targetElement, countElement = null, insertedElement = null, cardId = null } = {}) {
    if (!sourceElement?.getBoundingClientRect || !targetElement?.getBoundingClientRect) {
      throw new TypeError('SOURCE_AND_TARGET_ELEMENTS_REQUIRED');
    }
    const reduced = resolveReducedMotion(win, reducedMotion);
    const plan = createDeckSwipeFlightPlan({
      sourceRect: sourceElement.getBoundingClientRect(),
      targetRect: targetElement.getBoundingClientRect(),
      reducedMotion: reduced,
      config: cfg,
    });
    safeClassAdd(sourceElement, 'gr-deck-swipe-source-armed');
    setTimer(() => safeClassRemove(sourceElement, 'gr-deck-swipe-source-armed'), 90);
    fire('commit', { cardId, reducedMotion: reduced }, onCommitSfx);
    clearPresentationClass(countElement, 'gr-deck-swipe-count-hit', cfg.countPulseMs);

    if (plan.reducedMotion || plan.flightMs === 0) {
      land({ targetElement, insertedElement, cardId, reduced });
      return Object.freeze({ plan, cancel: () => {} });
    }

    const flight = cloneForFlight(sourceElement, doc, plan);
    if (!flight) {
      land({ targetElement, insertedElement, cardId, reduced });
      return Object.freeze({ plan, cancel: () => {} });
    }
    layers.add(flight.layer);
    let landed = false;
    const finish = () => {
      if (landed) return;
      landed = true;
      layers.delete(flight.layer);
      flight.layer.remove?.();
      land({ targetElement, insertedElement, cardId, reduced });
    };

    const cardAnim = safeAnimate(flight.clone, [
      { transform: 'translate3d(0,0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate3d(${plan.dx * 0.52}px,${plan.dy * 0.52 + plan.arcY}px,0) scale(${plan.midFlightScale}) rotate(${plan.rotationDeg}deg)`, opacity: 1, offset: 0.56 },
      { transform: `translate3d(${plan.dx}px,${plan.dy}px,0) scale(${plan.flightEndScale}) rotate(${plan.rotationDeg * 0.35}deg)`, opacity: 0.18, offset: 1 },
    ], { duration: plan.flightMs, easing: 'cubic-bezier(.18,.82,.25,1)', fill: 'forwards' });

    for (let i = 0; i < flight.streaks.length; i += 1) {
      const streak = flight.streaks[i];
      const lag = i * 26;
      safeAnimate(streak, [
        { opacity: 0, transform: `translate3d(0,0,0) translateX(-72px) rotate(${Math.atan2(plan.dy, plan.dx) * 180 / Math.PI}deg)`, offset: 0 },
        { opacity: 0.82 - i * 0.18, offset: 0.28 },
        { opacity: 0, transform: `translate3d(${plan.dx * 0.74}px,${plan.dy * 0.74 + plan.arcY * 0.35}px,0) translateX(-72px) rotate(${Math.atan2(plan.dy, plan.dx) * 180 / Math.PI}deg)`, offset: 1 },
      ], { duration: Math.max(90, plan.flightMs - lag), delay: lag, easing: 'ease-out', fill: 'forwards' });
    }

    if (cardAnim && 'onfinish' in cardAnim) cardAnim.onfinish = finish;
    setTimer(finish, plan.flightMs + 34);

    return Object.freeze({
      plan,
      cancel: () => {
        if (landed) return;
        landed = true;
        layers.delete(flight.layer);
        flight.layer.remove?.();
      },
    });
  }

  function playReject({ sourceElement, targetElement = null, cardId = null, reason = 'rejected' } = {}) {
    if (!sourceElement) throw new TypeError('SOURCE_ELEMENT_REQUIRED');
    const reduced = resolveReducedMotion(win, reducedMotion);
    const plan = createDeckSwipeRejectPlan({ reason, reducedMotion: reduced, config: cfg });
    clearPresentationClass(sourceElement, 'gr-deck-swipe-reject', Math.max(1, cfg.rejectMs));
    clearPresentationClass(targetElement, 'gr-deck-swipe-target-reject', Math.max(1, cfg.rejectMs));
    fire('reject', { cardId, reason: plan.reason, reducedMotion: reduced }, onRejectSfx);
    return plan;
  }

  function cancelAll() {
    for (const id of timers) (win?.clearTimeout ?? globalThis.clearTimeout)(id);
    timers.clear();
    for (const layer of layers) layer.remove?.();
    layers.clear();
  }

  const dispose = () => { cancelAll(); try { localSfx?.dispose?.(); } catch {} };

  return Object.freeze({ playSuccess, playReject, cancelAll, dispose, config: cfg, sfxPlayer: localSfx });
}

const cardsInspectorDismissInstallations = new WeakMap();

function resolveOpenCardsInspector(doc) {
  const screen = doc?.querySelector?.('.screen.cards');
  if (!screen || !screen.classList?.contains?.('active') || screen.dataset?.inspector !== 'open') return null;
  const preview = screen.querySelector?.('.cardPreview') ?? doc.querySelector?.('.screen.cards .cardPreview');
  if (!preview) return null;
  return { screen, preview };
}

function restoreCardsInspectorFocus(doc, screen) {
  const selected = screen?.querySelector?.('.collectionGrid [data-card].selected')
    ?? doc?.querySelector?.('.screen.cards .collectionGrid [data-card].selected');
  try { selected?.focus?.({ preventScroll: true }); }
  catch { try { selected?.focus?.(); } catch {} }
}

function consumeCardsInspectorDismissEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
}

export function installCardsInspectorDismissInteractions({ document: doc = globalThis.document } = {}) {
  if (!doc?.addEventListener || !doc?.removeEventListener || !doc?.querySelector) {
    return Object.freeze({ destroy() {} });
  }
  const existing = cardsInspectorDismissInstallations.get(doc);
  if (existing) return existing;

  const dismiss = (event, resolved) => {
    consumeCardsInspectorDismissEvent(event);
    resolved.screen.dataset.inspector = 'closed';
    restoreCardsInspectorFocus(doc, resolved.screen);
  };

  const onKeyDown = (event) => {
    if (event?.key !== 'Escape') return;
    const resolved = resolveOpenCardsInspector(doc);
    if (!resolved) return;
    dismiss(event, resolved);
  };

  const onClickCapture = (event) => {
    const resolved = resolveOpenCardsInspector(doc);
    if (!resolved) return;
    const target = event?.target;
    if (target && resolved.preview.contains?.(target)) return;
    dismiss(event, resolved);
  };

  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('click', onClickCapture, true);

  let destroyed = false;
  const controller = Object.freeze({
    destroy() {
      if (destroyed) return;
      destroyed = true;
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('click', onClickCapture, true);
      cardsInspectorDismissInstallations.delete(doc);
    },
  });
  cardsInspectorDismissInstallations.set(doc, controller);
  return controller;
}

if (typeof document !== 'undefined') installCardsInspectorDismissInteractions({ document });

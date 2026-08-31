import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
} from './home-shell-presentation-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_HOME_BOOT_PRESENTATION';
const STYLE_ID = 'gameroad-home-shell-runtime-style';
const HOME_SELECTOR = 'section[data-screen="home"]';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const SLIDEPAD_CENTER_SELECTOR = '#homePadCenter';
const SLIDEPAD_DEAD_ZONE_PX = 18;
const SLIDEPAD_DOWN_REJECT_RATIO = 1.15;
const SLIDEPAD_MAX_KNOB_TRAVEL_PX = 22;
const SLIDEPAD_ROUTE_IDS = Object.freeze({
  battle: Object.freeze(['setup', 'battle']),
  shop: Object.freeze(['shop']),
  partner: Object.freeze(['characters', 'partner']),
  cards: Object.freeze(['cards']),
});

const runtime = {
  mounted: false,
  home: null,
  observer: null,
  resizeHandler: null,
  media: null,
  mediaHandler: null,
  refreshScheduled: false,
  active: false,
  enterCount: 0,
  renderCount: 0,
  lastVariant: null,
  lastProfile: null,
  lastRouteIds: [],
  lastSelectedRouteId: null,
  lastError: null,
  animations: new Set(),
  slidepad: {
    center: null,
    handlers: null,
    pointerId: null,
    originX: 0,
    originY: 0,
    moved: false,
    previewButton: null,
  },
};

export function resolveHomeSlidepadRole({
  dx = 0,
  dy = 0,
  deadZonePx = SLIDEPAD_DEAD_ZONE_PX,
  downRejectRatio = SLIDEPAD_DOWN_REJECT_RATIO,
} = {}) {
  const x = Number(dx);
  const y = Number(dy);
  const dead = Number(deadZonePx);
  const rejectRatio = Number(downRejectRatio);
  if (![x, y, dead, rejectRatio].every(Number.isFinite) || dead < 0 || rejectRatio <= 0) return null;
  const distance = Math.hypot(x, y);
  if (distance < dead) return null;
  if (y > Math.abs(x) * rejectRatio) return null;
  if (x < 0) return y < 0 ? 'partner' : 'cards';
  return y < 0 ? 'battle' : 'shop';
}

export function resolveHomeSlidepadRouteId(routeIds, role) {
  if (!Array.isArray(routeIds) || typeof role !== 'string') return null;
  const available = new Set(routeIds.map((value) => String(value || '').trim()).filter(Boolean));
  const candidates = SLIDEPAD_ROUTE_IDS[role];
  if (!candidates) return null;
  return candidates.find((id) => available.has(id)) || null;
}

export function resolveHomeSlidepadRelease({ dx = 0, dy = 0, routeIds = [], deadZonePx } = {}) {
  const role = resolveHomeSlidepadRole({ dx, dy, deadZonePx });
  const routeId = resolveHomeSlidepadRouteId(routeIds, role);
  return Object.freeze({ role, routeId, commit: Boolean(routeId) });
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}{
  min-width:${HOME_TOUCH_TARGET_MIN_PX}px;
  min-height:${HOME_TOUCH_TARGET_MIN_PX}px;
  touch-action:manipulation;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:focus-visible{
  outline:2px solid currentColor;
  outline-offset:3px;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}[data-home-slidepad-preview="true"]{
  outline:2px solid currentColor;
  outline-offset:4px;
  filter:brightness(1.12) saturate(1.05);
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${SLIDEPAD_CENTER_SELECTOR}{
  touch-action:none;
  translate:var(--gameroad-home-slidepad-x, 0px) var(--gameroad-home-slidepad-y, 0px);
}
@media (prefers-reduced-motion:reduce){
  ${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}{
    scroll-behavior:auto;
  }
}
`;
  document.head.append(style);
}

function routeButtons(home) {
  return [...home.querySelectorAll(ROUTE_SELECTOR)].filter((node) => node instanceof HTMLElement);
}

function routeId(button) {
  const value = String(button?.dataset?.homeTarget || '').trim();
  return value || null;
}

function selectedRouteId(buttons) {
  const selected = buttons.find((button) => (
    button.getAttribute('aria-current') === 'page'
    || button.getAttribute('aria-current') === 'true'
    || button.getAttribute('aria-pressed') === 'true'
  ));
  return selected ? routeId(selected) : null;
}

function reducedMotion() {
  return Boolean(runtime.media?.matches);
}

function isHomeActive(home) {
  if (!home?.isConnected) return false;
  if (home.hasAttribute('hidden')) return false;
  if (home.classList.contains('active')) return true;
  const style = getComputedStyle(home);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function clearAnimations() {
  for (const animation of runtime.animations) {
    try { animation.cancel(); } catch {}
  }
  runtime.animations.clear();
}

function runEntrance(buttons) {
  clearAnimations();
  if (reducedMotion()) return;
  buttons.forEach((button, index) => {
    if (typeof button.animate !== 'function') return;
    const animation = button.animate([
      { opacity: 0.48, filter: 'brightness(.78) saturate(.72)', transform: 'translateY(7px) scale(.986)' },
      { opacity: 1, filter: 'none', transform: 'translateY(0) scale(1)' },
    ], {
      duration: 260,
      delay: Math.min(index, 8) * 24,
      easing: 'cubic-bezier(.16,.82,.18,1)',
      fill: 'none',
    });
    runtime.animations.add(animation);
    animation.finished.catch(() => undefined).finally(() => runtime.animations.delete(animation));
  });
}

function markHome(home, { variant, profile, routeIds, selectedRouteId: selected }) {
  home.dataset.homeShellMounted = 'true';
  home.dataset.homeShellVariant = variant;
  home.dataset.homeShellProfile = profile;
  home.dataset.homeShellRouteCount = String(routeIds.length);
  if (selected) home.dataset.homeShellSelectedRoute = selected;
  else delete home.dataset.homeShellSelectedRoute;
  home.style.setProperty('--gameroad-home-shell-touch-min', `${HOME_TOUCH_TARGET_MIN_PX}px`);
}

function unmarkHome(home) {
  if (!home) return;
  delete home.dataset.homeShellMounted;
  delete home.dataset.homeShellVariant;
  delete home.dataset.homeShellProfile;
  delete home.dataset.homeShellRouteCount;
  delete home.dataset.homeShellSelectedRoute;
  home.style.removeProperty('--gameroad-home-shell-touch-min');
}

function resetKnob(center) {
  if (!(center instanceof HTMLElement)) return;
  center.style.removeProperty('--gameroad-home-slidepad-x');
  center.style.removeProperty('--gameroad-home-slidepad-y');
  delete center.dataset.homeSlidepadDragging;
}

function setPreview(button) {
  const previous = runtime.slidepad.previewButton;
  if (previous && previous !== button) delete previous.dataset.homeSlidepadPreview;
  runtime.slidepad.previewButton = button instanceof HTMLElement ? button : null;
  if (runtime.slidepad.previewButton) runtime.slidepad.previewButton.dataset.homeSlidepadPreview = 'true';
}

function clearPreview() {
  if (runtime.slidepad.previewButton) delete runtime.slidepad.previewButton.dataset.homeSlidepadPreview;
  runtime.slidepad.previewButton = null;
}

function moveKnob(center, dx, dy, role) {
  if (!(center instanceof HTMLElement)) return;
  if (!role) {
    center.style.setProperty('--gameroad-home-slidepad-x', '0px');
    center.style.setProperty('--gameroad-home-slidepad-y', '0px');
    return;
  }
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0) return;
  const travel = Math.min(SLIDEPAD_MAX_KNOB_TRAVEL_PX, distance);
  center.style.setProperty('--gameroad-home-slidepad-x', `${((dx / distance) * travel).toFixed(1)}px`);
  center.style.setProperty('--gameroad-home-slidepad-y', `${((dy / distance) * travel).toFixed(1)}px`);
}

function buttonForRole(home, role) {
  const buttons = routeButtons(home);
  const id = resolveHomeSlidepadRouteId(buttons.map(routeId).filter(Boolean), role);
  return id ? buttons.find((button) => routeId(button) === id) || null : null;
}

function resetGesture({ releaseCapture = true } = {}) {
  const center = runtime.slidepad.center;
  const pointerId = runtime.slidepad.pointerId;
  runtime.slidepad.pointerId = null;
  runtime.slidepad.originX = 0;
  runtime.slidepad.originY = 0;
  runtime.slidepad.moved = false;
  clearPreview();
  resetKnob(center);
  if (releaseCapture && center instanceof HTMLElement && pointerId != null) {
    try {
      if (center.hasPointerCapture?.(pointerId)) center.releasePointerCapture(pointerId);
    } catch {}
  }
}

function unbindSlidepad() {
  const center = runtime.slidepad.center;
  const handlers = runtime.slidepad.handlers;
  resetGesture();
  if (center instanceof HTMLElement && handlers) {
    center.removeEventListener('pointerdown', handlers.pointerdown);
    center.removeEventListener('pointermove', handlers.pointermove);
    center.removeEventListener('pointerup', handlers.pointerup);
    center.removeEventListener('pointercancel', handlers.pointercancel);
    center.removeEventListener('lostpointercapture', handlers.lostpointercapture);
    delete center.dataset.homeSlidepadBound;
  }
  runtime.slidepad.center = null;
  runtime.slidepad.handlers = null;
}

function bindSlidepad(home) {
  const center = home.querySelector(SLIDEPAD_CENTER_SELECTOR);
  if (!(center instanceof HTMLElement)) {
    if (runtime.slidepad.center) unbindSlidepad();
    return;
  }
  if (runtime.slidepad.center === center && runtime.slidepad.handlers) return;
  unbindSlidepad();
  runtime.slidepad.center = center;
  center.dataset.homeSlidepadBound = 'true';

  const pointerVector = (event) => ({
    dx: Number(event.clientX) - runtime.slidepad.originX,
    dy: Number(event.clientY) - runtime.slidepad.originY,
  });

  const updateFromPointer = (event) => {
    const { dx, dy } = pointerVector(event);
    const distance = Math.hypot(dx, dy);
    if (distance >= SLIDEPAD_DEAD_ZONE_PX) runtime.slidepad.moved = true;
    const role = resolveHomeSlidepadRole({ dx, dy });
    const button = role ? buttonForRole(home, role) : null;
    setPreview(button);
    moveKnob(center, dx, dy, button ? role : null);
    return { dx, dy, role: button ? role : null, button };
  };

  const handlers = {
    pointerdown(event) {
      if (!runtime.active || runtime.slidepad.pointerId != null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const rect = center.getBoundingClientRect();
      runtime.slidepad.pointerId = event.pointerId;
      runtime.slidepad.originX = rect.left + rect.width / 2;
      runtime.slidepad.originY = rect.top + rect.height / 2;
      runtime.slidepad.moved = false;
      center.dataset.homeSlidepadDragging = 'true';
      try { center.setPointerCapture?.(event.pointerId); } catch {}
      updateFromPointer(event);
    },
    pointermove(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      updateFromPointer(event);
      if (runtime.slidepad.moved) event.preventDefault();
    },
    pointerup(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      const { button } = updateFromPointer(event);
      const moved = runtime.slidepad.moved;
      resetGesture();
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      if (button && runtime.active) button.click();
    },
    pointercancel(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      resetGesture();
    },
    lostpointercapture(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      resetGesture({ releaseCapture: false });
    },
  };
  runtime.slidepad.handlers = handlers;
  center.addEventListener('pointerdown', handlers.pointerdown);
  center.addEventListener('pointermove', handlers.pointermove);
  center.addEventListener('pointerup', handlers.pointerup);
  center.addEventListener('pointercancel', handlers.pointercancel);
  center.addEventListener('lostpointercapture', handlers.lostpointercapture);
}

export function refreshHomeBootPresentation() {
  const home = document.querySelector(HOME_SELECTOR);
  if (!(home instanceof HTMLElement)) {
    runtime.lastError = 'HOME_DOM_UNAVAILABLE';
    runtime.active = false;
    unbindSlidepad();
    return snapshot();
  }
  if (runtime.home && runtime.home !== home) {
    unbindSlidepad();
    unmarkHome(runtime.home);
  }
  runtime.home = home;

  const buttons = routeButtons(home);
  const ids = buttons.map(routeId).filter(Boolean);
  const selected = selectedRouteId(buttons);
  let state;
  try {
    state = createHomeShellState({ routeIds: ids, selectedRouteId: selected });
  } catch (error) {
    runtime.lastError = String(error?.message || error || 'HOME_STATE_INVALID');
    return snapshot();
  }

  const variant = classifyHomeViewport({ width: innerWidth, height: innerHeight });
  const profile = reducedMotion() ? 'reduced' : 'full';
  const active = isHomeActive(home);
  markHome(home, {
    variant,
    profile,
    routeIds: state.routeIds,
    selectedRouteId: state.selectedRouteId,
  });
  bindSlidepad(home);

  const entering = active && !runtime.active;
  runtime.active = active;
  runtime.lastVariant = variant;
  runtime.lastProfile = profile;
  runtime.lastRouteIds = [...state.routeIds];
  runtime.lastSelectedRouteId = state.selectedRouteId;
  runtime.lastError = null;
  runtime.renderCount += 1;
  if (entering) {
    runtime.enterCount += 1;
    runEntrance(buttons);
  }
  return snapshot();
}

function scheduleRefresh() {
  if (runtime.refreshScheduled) return;
  runtime.refreshScheduled = true;
  const run = () => {
    runtime.refreshScheduled = false;
    refreshHomeBootPresentation();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else queueMicrotask(run);
}

export function mountHomeBootPresentation() {
  if (runtime.mounted) return snapshot();
  ensureStyle();
  runtime.media = matchMedia('(prefers-reduced-motion: reduce)');
  runtime.resizeHandler = () => scheduleRefresh();
  runtime.mediaHandler = () => scheduleRefresh();
  addEventListener('resize', runtime.resizeHandler, { passive: true });
  runtime.media.addEventListener?.('change', runtime.mediaHandler);
  runtime.observer = new MutationObserver(() => scheduleRefresh());
  runtime.observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-current', 'aria-pressed', 'data-home-target'],
  });
  runtime.mounted = true;
  refreshHomeBootPresentation();
  return snapshot();
}

export function unmountHomeBootPresentation() {
  clearAnimations();
  runtime.observer?.disconnect();
  if (runtime.resizeHandler) removeEventListener('resize', runtime.resizeHandler);
  runtime.media?.removeEventListener?.('change', runtime.mediaHandler);
  unbindSlidepad();
  unmarkHome(runtime.home);
  runtime.mounted = false;
  runtime.active = false;
  runtime.refreshScheduled = false;
  runtime.observer = null;
  runtime.home = null;
  return snapshot();
}

export function snapshot() {
  return Object.freeze({
    mounted: runtime.mounted,
    active: runtime.active,
    enterCount: runtime.enterCount,
    renderCount: runtime.renderCount,
    viewportVariant: runtime.lastVariant,
    presentationProfile: runtime.lastProfile,
    routeIds: Object.freeze([...runtime.lastRouteIds]),
    selectedRouteId: runtime.lastSelectedRouteId,
    touchTargetMinPx: HOME_TOUCH_TARGET_MIN_PX,
    slidepadGestureBound: Boolean(runtime.slidepad.center && runtime.slidepad.handlers),
    slidepadPointerActive: runtime.slidepad.pointerId != null,
    projectionStatus: 'scene-authority-not-mounted-here',
    lastError: runtime.lastError,
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  globalThis[GLOBAL_KEY] = Object.freeze({
    mount: mountHomeBootPresentation,
    refresh: refreshHomeBootPresentation,
    snapshot,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountHomeBootPresentation(), { once: true });
  } else {
    mountHomeBootPresentation();
  }
}

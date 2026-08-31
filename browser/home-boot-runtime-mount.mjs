import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
} from './home-shell-presentation-core.mjs';
import { refreshDailyTourHomeLauncher } from './daily-tour-home-launcher.mjs';

const GLOBAL_KEY = 'GAMEROAD_HOME_BOOT_PRESENTATION';
const STYLE_ID = 'gameroad-home-shell-runtime-style';
const HOME_SELECTOR = 'section[data-screen="home"]';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';

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
};

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

export function refreshHomeBootPresentation() {
  const home = document.querySelector(HOME_SELECTOR);
  if (!(home instanceof HTMLElement)) {
    runtime.lastError = 'HOME_DOM_UNAVAILABLE';
    runtime.active = false;
    return snapshot();
  }
  if (runtime.home && runtime.home !== home) unmarkHome(runtime.home);
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
  refreshDailyTourHomeLauncher(home, { active, routeButtons: buttons });

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

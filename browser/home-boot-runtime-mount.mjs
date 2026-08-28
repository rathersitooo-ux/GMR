import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
} from './home-shell-presentation-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_HOME_BOOT_PRESENTATION';
const STYLE_ID = 'gameroad-home-shell-runtime-style';
const HOME_SELECTOR = 'section[data-screen="home"]';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';

export const HOME_VISUAL_AUTHORITY = Object.freeze({
  canonical: 'slidepad',
  fallback: 'legacy',
  primarySelector: '#homeMainMenuSlidePad, .homeSlidePad',
  secondarySelector: '.codexHomeUtilities',
  secondaryButtonSelector: '.homeUtilityBtn',
  suppressedSelectors: Object.freeze([
    '#codexHomeVisualLayer',
    '.codexHomeVisualLayer',
    '#codexHomePartnerChip',
    '.codexPartnerChip',
    '#codexHomeBattleCta',
    '.codexBattleCta',
  ]),
  chromeSelectors: Object.freeze([
    '.codexHomeCenterStage',
    '.codexHomeLeftRail',
    '.codexHomeRightRail',
  ]),
});

export function resolveHomePrimaryAuthority({ hasSlidePad = false } = {}) {
  return hasSlidePad ? HOME_VISUAL_AUTHORITY.canonical : HOME_VISUAL_AUTHORITY.fallback;
}

export function createHomeVisualAuthorityCss() {
  const authority = `${HOME_SELECTOR}[data-home-primary-authority="${HOME_VISUAL_AUTHORITY.canonical}"]`;
  const suppressed = HOME_VISUAL_AUTHORITY.suppressedSelectors
    .map((selector) => `${authority} ${selector}`)
    .join(',\n');
  const chrome = HOME_VISUAL_AUTHORITY.chromeSelectors
    .map((selector) => `${authority} ${selector}`)
    .join(',\n');
  return `
/* Home R2 visual authority: one interactive command surface plus low-profile
   secondary utilities. Historical dashboard/narration chrome is removed only
   while the canonical slidepad exists; fallback mode keeps the legacy DOM. */
${suppressed},
${chrome}{
  display:none!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
${authority} ${HOME_VISUAL_AUTHORITY.primarySelector}{
  display:grid!important;
  visibility:visible!important;
  pointer-events:auto!important;
}
${authority} ${HOME_VISUAL_AUTHORITY.secondarySelector} ${HOME_VISUAL_AUTHORITY.secondaryButtonSelector}{
  min-height:${HOME_TOUCH_TARGET_MIN_PX}px!important;
  height:${HOME_TOUCH_TARGET_MIN_PX}px!important;
  border-color:transparent!important;
  background:transparent!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
  color:#f7fbff!important;
  text-shadow:0 2px 7px rgba(0,0,0,.92)!important;
}
${authority} ${HOME_VISUAL_AUTHORITY.secondarySelector} ${HOME_VISUAL_AUTHORITY.secondaryButtonSelector}:focus-visible{
  outline:2px solid rgba(255,255,255,.9)!important;
  outline-offset:2px!important;
}
${HOME_SELECTOR}[data-home-shell-variant="portrait"][data-home-primary-authority="slidepad"] ${HOME_VISUAL_AUTHORITY.secondarySelector}{
  position:fixed!important;
  z-index:23!important;
  left:max(8px,env(safe-area-inset-left))!important;
  right:auto!important;
  top:clamp(146px,22vh,196px)!important;
  bottom:auto!important;
  width:min(92px,24vw)!important;
  max-width:92px!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:6px!important;
  transform:none!important;
  background:transparent!important;
  pointer-events:auto!important;
}
${HOME_SELECTOR}[data-home-shell-variant="portrait"][data-home-primary-authority="slidepad"] ${HOME_VISUAL_AUTHORITY.secondarySelector} ${HOME_VISUAL_AUTHORITY.secondaryButtonSelector}{
  width:100%!important;
  min-width:0!important;
  padding:0 8px!important;
  border-radius:0!important;
  font-size:11px!important;
  opacity:.88;
}
${HOME_SELECTOR}[data-home-shell-variant="portrait"][data-home-primary-authority="slidepad"] ${HOME_VISUAL_AUTHORITY.secondarySelector} ${HOME_VISUAL_AUTHORITY.secondaryButtonSelector}:focus-visible,
${HOME_SELECTOR}[data-home-shell-variant="portrait"][data-home-primary-authority="slidepad"] ${HOME_VISUAL_AUTHORITY.secondarySelector} ${HOME_VISUAL_AUTHORITY.secondaryButtonSelector}:hover{
  opacity:1;
}
${HOME_SELECTOR}[data-home-shell-variant="short-landscape"][data-home-primary-authority="slidepad"] ${HOME_VISUAL_AUTHORITY.secondarySelector}{
  left:max(8px,env(safe-area-inset-left))!important;
  right:auto!important;
  top:clamp(74px,20vh,92px)!important;
  width:min(172px,26vw)!important;
  grid-template-columns:repeat(2,minmax(0,1fr))!important;
  gap:2px!important;
  background:transparent!important;
}
`;
}

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
  lastPrimaryAuthority: null,
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
${createHomeVisualAuthorityCss()}
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

function markHome(home, { variant, profile, routeIds, selectedRouteId: selected, primaryAuthority }) {
  home.dataset.homeShellMounted = 'true';
  home.dataset.homeShellVariant = variant;
  home.dataset.homeShellProfile = profile;
  home.dataset.homeShellRouteCount = String(routeIds.length);
  home.dataset.homePrimaryAuthority = primaryAuthority;
  home.dataset.homeVisualAuthority = primaryAuthority === HOME_VISUAL_AUTHORITY.canonical
    ? 'single-surface-r1'
    : 'legacy-fallback';
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
  delete home.dataset.homePrimaryAuthority;
  delete home.dataset.homeVisualAuthority;
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
  const primaryAuthority = resolveHomePrimaryAuthority({
    hasSlidePad: Boolean(home.querySelector(HOME_VISUAL_AUTHORITY.primarySelector)),
  });
  markHome(home, {
    variant,
    profile,
    routeIds: state.routeIds,
    selectedRouteId: state.selectedRouteId,
    primaryAuthority,
  });

  const entering = active && !runtime.active;
  runtime.active = active;
  runtime.lastVariant = variant;
  runtime.lastProfile = profile;
  runtime.lastRouteIds = [...state.routeIds];
  runtime.lastSelectedRouteId = state.selectedRouteId;
  runtime.lastPrimaryAuthority = primaryAuthority;
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
  runtime.lastPrimaryAuthority = null;
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
    primaryAuthority: runtime.lastPrimaryAuthority,
    visualAuthority: runtime.lastPrimaryAuthority === HOME_VISUAL_AUTHORITY.canonical
      ? 'single-surface-r1'
      : 'legacy-fallback',
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

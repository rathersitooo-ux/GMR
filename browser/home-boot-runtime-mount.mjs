import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
} from './home-shell-presentation-core.mjs';
import { projectBootLoadingPresentation } from './boot-loading-presentation-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_HOME_BOOT_PRESENTATION';
const STYLE_ID = 'gameroad-home-shell-runtime-style';
const HOME_SELECTOR = 'section[data-screen="home"]';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const BOOT_SURFACE_ID = 'gameroad-boot-loading-runtime';

const BOOT_PHASE_LABELS = Object.freeze({
  SPLASH: '起動中',
  LOADING: '読み込み中',
  READY: '準備完了',
  RECOVERY: '復旧中',
  UPDATE_REQUIRED: '更新が必要です',
  ERROR: '読み込みに失敗しました',
});

const BOOT_ACTION_LABELS = Object.freeze({
  CONTINUE: '続ける',
  RETRY: '再試行',
  BACK: '戻る',
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
  bootSurface: null,
  bootRefs: null,
  bootRenderCount: 0,
  lastBootPhase: null,
  lastBootProfile: null,
  lastBootSemanticKey: null,
  lastBootActionIds: [],
  lastBootError: null,
};

function ensureStyle(doc = globalThis.document) {
  if (!doc?.createElement) return null;
  if (doc.getElementById?.(STYLE_ID)) return doc.getElementById(STYLE_ID);
  const style = doc.createElement('style');
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
#${BOOT_SURFACE_ID}{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:var(--gameroad-boot-bg,rgba(250,250,252,.97));color:var(--gameroad-boot-fg,#15171c)}
#${BOOT_SURFACE_ID}[hidden]{display:none!important}
#${BOOT_SURFACE_ID} .grBootPanel{width:min(520px,100%);display:grid;gap:14px;text-align:center}
#${BOOT_SURFACE_ID} .grBootPhase{font-size:clamp(1.2rem,3.5vw,1.8rem);line-height:1.15}
#${BOOT_SURFACE_ID} .grBootStatus,#${BOOT_SURFACE_ID} .grBootError{min-height:1.25em;overflow-wrap:anywhere}
#${BOOT_SURFACE_ID} .grBootError{font-weight:700}
#${BOOT_SURFACE_ID} .grBootProgress{width:100%;height:10px}
#${BOOT_SURFACE_ID} .grBootActions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#${BOOT_SURFACE_ID} .grBootAction{min-width:${HOME_TOUCH_TARGET_MIN_PX}px;min-height:${HOME_TOUCH_TARGET_MIN_PX}px;padding:9px 16px;font:inherit;touch-action:manipulation}
#${BOOT_SURFACE_ID} .grBootAction:focus-visible{outline:2px solid currentColor;outline-offset:3px}
@media (prefers-reduced-motion:reduce){
  ${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}{scroll-behavior:auto}
  #${BOOT_SURFACE_ID}{scroll-behavior:auto}
}
`;
  (doc.head ?? doc.documentElement)?.appendChild?.(style);
  return style;
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
  if (runtime.media) return Boolean(runtime.media.matches);
  try { return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); }
  catch { return false; }
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

function makeBootNode(doc, tag, className, slot = null) {
  const node = doc.createElement(tag);
  node.className = className;
  if (slot) node.dataset.bootSlot = slot;
  return node;
}

function ensureBootSurface(doc) {
  if (!doc?.createElement || !doc?.body?.appendChild) throw new Error('BOOT_DOM_UNAVAILABLE');
  if (runtime.bootSurface?.isConnected !== false && runtime.bootRefs) return runtime.bootSurface;

  let surface = doc.getElementById?.(BOOT_SURFACE_ID) ?? null;
  if (surface) surface.remove?.();
  surface = doc.createElement('section');
  surface.id = BOOT_SURFACE_ID;
  surface.hidden = true;
  surface.setAttribute?.('aria-hidden', 'true');
  surface.setAttribute?.('aria-live', 'polite');
  surface.setAttribute?.('aria-atomic', 'true');

  const panel = makeBootNode(doc, 'div', 'grBootPanel', 'panel');
  const phase = makeBootNode(doc, 'strong', 'grBootPhase', 'phase');
  const status = makeBootNode(doc, 'div', 'grBootStatus', 'status');
  const progress = makeBootNode(doc, 'progress', 'grBootProgress', 'progress');
  progress.max = 1;
  const progressText = makeBootNode(doc, 'div', 'grBootProgressText', 'progressText');
  const error = makeBootNode(doc, 'div', 'grBootError', 'error');
  const actions = makeBootNode(doc, 'div', 'grBootActions', 'actions');
  panel.append?.(phase, status, progress, progressText, error, actions);
  surface.appendChild?.(panel);
  doc.body.appendChild(surface);

  runtime.bootSurface = surface;
  runtime.bootRefs = { phase, status, progress, progressText, error, actions };
  return surface;
}

function bootPhaseLabel(phase) {
  return BOOT_PHASE_LABELS[phase] ?? String(phase || '');
}

function bootActionLabel(actionId) {
  return BOOT_ACTION_LABELS[actionId] ?? String(actionId || '');
}

export function renderBootLoadingPresentation(state, {
  document: doc = globalThis.document,
  reducedMotion: explicitReducedMotion,
  lowPerf = false,
  actionHandlers = {},
} = {}) {
  const projection = projectBootLoadingPresentation({
    state,
    reducedMotion: typeof explicitReducedMotion === 'boolean' ? explicitReducedMotion : reducedMotion(),
    lowPerf: Boolean(lowPerf),
  });
  ensureStyle(doc);
  const surface = ensureBootSurface(doc);
  const refs = runtime.bootRefs;

  surface.hidden = false;
  surface.removeAttribute?.('aria-hidden');
  surface.setAttribute?.('role', projection.actionIds.length ? 'dialog' : 'status');
  surface.dataset.bootPhase = projection.phase;
  surface.dataset.bootProfile = projection.presentationProfile;
  surface.dataset.bootSemanticKey = projection.semanticKey;

  refs.phase.textContent = bootPhaseLabel(projection.phase);
  refs.status.textContent = projection.statusCode ?? '';
  refs.status.hidden = projection.statusCode == null;
  refs.error.textContent = projection.errorCode == null ? '' : `エラー: ${projection.errorCode}`;
  refs.error.hidden = projection.errorCode == null;

  if (projection.progress == null) {
    refs.progress.hidden = true;
    refs.progress.removeAttribute?.('value');
    refs.progressText.textContent = '';
    refs.progressText.hidden = true;
  } else {
    refs.progress.hidden = false;
    refs.progress.value = projection.progress;
    refs.progressText.textContent = `${Math.round(projection.progress * 100)}%`;
    refs.progressText.hidden = false;
  }

  refs.actions.replaceChildren?.();
  for (const actionId of projection.actionIds) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'grBootAction';
    button.dataset.bootAction = actionId;
    button.textContent = bootActionLabel(actionId);
    const handler = actionHandlers?.[actionId];
    button.disabled = typeof handler !== 'function';
    button.onclick = typeof handler === 'function'
      ? () => handler(Object.freeze({ actionId, state, projection }))
      : null;
    refs.actions.appendChild?.(button);
  }

  runtime.bootRenderCount += 1;
  runtime.lastBootPhase = projection.phase;
  runtime.lastBootProfile = projection.presentationProfile;
  runtime.lastBootSemanticKey = projection.semanticKey;
  runtime.lastBootActionIds = [...projection.actionIds];
  runtime.lastBootError = null;
  return bootSnapshot();
}

export function clearBootLoadingPresentation({ document: doc = globalThis.document } = {}) {
  const surface = runtime.bootSurface ?? doc?.getElementById?.(BOOT_SURFACE_ID) ?? null;
  if (surface) {
    surface.hidden = true;
    surface.setAttribute?.('aria-hidden', 'true');
  }
  runtime.lastBootPhase = null;
  runtime.lastBootProfile = null;
  runtime.lastBootSemanticKey = null;
  runtime.lastBootActionIds = [];
  runtime.lastBootError = null;
  return bootSnapshot();
}

export function bootSnapshot() {
  return Object.freeze({
    rendered: runtime.lastBootSemanticKey != null,
    renderCount: runtime.bootRenderCount,
    phase: runtime.lastBootPhase,
    presentationProfile: runtime.lastBootProfile,
    semanticKey: runtime.lastBootSemanticKey,
    actionIds: Object.freeze([...runtime.lastBootActionIds]),
    source: 'caller-owned-boot-state',
    lastError: runtime.lastBootError,
  });
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
  clearBootLoadingPresentation();
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
    renderBoot: renderBootLoadingPresentation,
    clearBoot: clearBootLoadingPresentation,
    bootSnapshot,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountHomeBootPresentation(), { once: true });
  } else {
    mountHomeBootPresentation();
  }
}

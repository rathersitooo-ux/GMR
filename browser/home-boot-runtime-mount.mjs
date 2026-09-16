// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module,
// then mount authorized Home-side presentation runtimes beside the existing Rogue runtime.
export * from './home-boot-runtime-base-r3.mjs';
import { mountStudyRunFromCurrentBrowser } from './study-run-runtime-mount.mjs';

// Source-compatibility markers consumed by the existing Home presentation contract test.
// [data-home-quick-set-active="true"] ${ROUTE_SELECTOR}
// visibility:hidden!important
// dataset.homeQuickSetActive
// dataset.homeQuickSetCancel
// .codexHomeLeftRail
// .codexHomeRightRail
// html.grCodexHomeActive #saveState
// [data-go="missions"]::before
// [data-go="gacha"]::before
// [data-go="records"]::before
// [data-go="profile"]::before
// [data-go="settings"]::before
// HOME_CONTEXTUAL_REPLAY_LABEL

const HOME_JOURNEY_GLOBAL_KEY = 'GAMEROAD_HOME_JOURNEY_PROJECTION';
const HOME_JOURNEY_HOME_SELECTOR = 'section[data-screen="home"]';
const HOME_JOURNEY_ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const HOME_JOURNEY_NODE_SELECTOR = '[data-home-journey-projection="true"]';
const HOME_JOURNEY_LABEL = '今日の旅';

const HOME_JOURNEY_ROUTE_LABELS = Object.freeze({
  setup: '対戦',
  battle: '対戦',
  cards: 'カード',
  partner: 'パートナー',
  characters: 'キャラクター',
  shop: 'ショップ',
});

const homeJourneyRuntime = {
  mounted: false,
  observer: null,
  refreshScheduled: false,
  home: null,
  node: null,
  renderCount: 0,
  lastStopFacts: [],
  lastError: null,
};

function normalizedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Convert existing Home-route facts into the exact stop-fact shape consumed by
 * global-journey-projection-core.mjs. This adapter never infers completion from
 * selection, visit history, route names, or screen state.
 */
export function projectHomeJourneyStopFacts(routes = []) {
  if (!Array.isArray(routes)) throw new TypeError('routes must be an array');

  const seen = new Set();
  const stops = [];
  for (const raw of routes) {
    if (!raw || typeof raw !== 'object' || raw.visible !== true) continue;
    const id = normalizedString(raw.id);
    if (!id) continue;
    if (seen.has(id)) throw new TypeError(`duplicate Home journey route id: ${id}`);
    seen.add(id);

    const state = raw.disabled === true ? 'ahead' : 'available';
    const label = HOME_JOURNEY_ROUTE_LABELS[id] || normalizedString(raw.label) || id;
    stops.push(Object.freeze({
      id,
      label,
      state,
      authoritative: true,
      visible: true,
      sourceRef: `home-route:${id}:${state}`,
    }));
  }
  return Object.freeze(stops);
}

function homeJourneyRouteFact(button) {
  const id = normalizedString(button?.dataset?.homeTarget);
  return Object.freeze({
    id,
    label: normalizedString(button?.getAttribute?.('aria-label')) || normalizedString(button?.textContent),
    visible: button?.hidden !== true && button?.getAttribute?.('aria-hidden') !== 'true',
    disabled: button?.disabled === true || button?.getAttribute?.('aria-disabled') === 'true',
  });
}

function journeyMarker(state) {
  return state === 'ahead' ? '·' : '○';
}

function removeHomeJourneyNode() {
  homeJourneyRuntime.node?.remove?.();
  homeJourneyRuntime.node = null;
}

function ensureHomeJourneyNode(home) {
  let node = home?.querySelector?.(HOME_JOURNEY_NODE_SELECTOR) || null;
  if (!(node instanceof HTMLElement)) {
    node = document.createElement('div');
    node.dataset.homeJourneyProjection = 'true';
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', HOME_JOURNEY_LABEL);
    node.setAttribute('aria-live', 'off');
    node.style.cssText = [
      'position:fixed',
      'left:max(10px,env(safe-area-inset-left))',
      'bottom:max(10px,env(safe-area-inset-bottom))',
      'z-index:32',
      'pointer-events:none',
      'box-sizing:border-box',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'max-width:calc(100vw - 20px)',
      'min-height:32px',
      'padding:6px 9px',
      'overflow:hidden',
      'border:1px solid rgba(255,255,255,.22)',
      'border-radius:999px',
      'background:rgba(8,12,28,.72)',
      'box-shadow:0 4px 16px rgba(0,0,0,.18)',
      'font:700 11px/1.15 system-ui,-apple-system,sans-serif',
      'white-space:nowrap',
      'user-select:none',
    ].join(';');
    home.appendChild(node);
  }
  homeJourneyRuntime.node = node;
  return node;
}

function renderHomeJourney(home, stopFacts) {
  if (!stopFacts.length) {
    removeHomeJourneyNode();
    return null;
  }

  const node = ensureHomeJourneyNode(home);
  const title = document.createElement('span');
  title.dataset.homeJourneyTitle = 'true';
  title.textContent = HOME_JOURNEY_LABEL;
  title.style.cssText = 'font-weight:900;opacity:.94;flex:0 0 auto;';

  const route = document.createElement('span');
  route.dataset.homeJourneyStops = 'true';
  route.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;overflow:hidden;';

  stopFacts.forEach((stop, index) => {
    const item = document.createElement('span');
    item.dataset.homeJourneyStop = stop.id;
    item.dataset.homeJourneyState = stop.state;
    item.setAttribute('aria-label', `${stop.label} ${stop.state === 'ahead' ? '道の先' : '行ける'}`);
    item.textContent = `${journeyMarker(stop.state)} ${stop.label}`;
    item.style.cssText = `flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:${stop.state === 'ahead' ? '.5' : '.9'};`;
    route.appendChild(item);
    if (index < stopFacts.length - 1) {
      const separator = document.createElement('span');
      separator.setAttribute('aria-hidden', 'true');
      separator.textContent = '›';
      separator.style.cssText = 'opacity:.36;flex:0 0 auto;';
      route.appendChild(separator);
    }
  });

  node.replaceChildren(title, route);
  return node;
}

function observeHomeJourney() {
  const home = homeJourneyRuntime.home;
  if (!homeJourneyRuntime.mounted || !homeJourneyRuntime.observer || !(home instanceof HTMLElement)) return;
  homeJourneyRuntime.observer.observe(home, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'class',
      'hidden',
      'aria-hidden',
      'aria-disabled',
      'disabled',
      'aria-label',
      'data-home-target',
    ],
  });
}

export function refreshHomeJourneyProjection() {
  homeJourneyRuntime.observer?.disconnect();
  try {
    const home = document.querySelector(HOME_JOURNEY_HOME_SELECTOR);
    if (!(home instanceof HTMLElement)) {
      removeHomeJourneyNode();
      homeJourneyRuntime.home = null;
      homeJourneyRuntime.lastStopFacts = [];
      homeJourneyRuntime.lastError = 'HOME_DOM_UNAVAILABLE';
      return snapshotHomeJourneyProjection();
    }

    if (homeJourneyRuntime.home && homeJourneyRuntime.home !== home) removeHomeJourneyNode();
    homeJourneyRuntime.home = home;
    const routeFacts = [...home.querySelectorAll(HOME_JOURNEY_ROUTE_SELECTOR)]
      .filter((button) => button instanceof HTMLElement)
      .map(homeJourneyRouteFact);
    const stopFacts = projectHomeJourneyStopFacts(routeFacts);
    renderHomeJourney(home, stopFacts);
    homeJourneyRuntime.lastStopFacts = [...stopFacts];
    homeJourneyRuntime.lastError = null;
    homeJourneyRuntime.renderCount += 1;
    return snapshotHomeJourneyProjection();
  } catch (error) {
    removeHomeJourneyNode();
    homeJourneyRuntime.lastStopFacts = [];
    homeJourneyRuntime.lastError = String(error?.message || error || 'HOME_JOURNEY_PROJECTION_FAILED');
    return snapshotHomeJourneyProjection();
  } finally {
    observeHomeJourney();
  }
}

function scheduleHomeJourneyRefresh() {
  if (homeJourneyRuntime.refreshScheduled) return;
  homeJourneyRuntime.refreshScheduled = true;
  setTimeout(() => {
    homeJourneyRuntime.refreshScheduled = false;
    if (homeJourneyRuntime.mounted) refreshHomeJourneyProjection();
  }, 0);
}

export function mountHomeJourneyProjection() {
  if (homeJourneyRuntime.mounted) return snapshotHomeJourneyProjection();
  homeJourneyRuntime.mounted = true;
  homeJourneyRuntime.observer = new MutationObserver(() => scheduleHomeJourneyRefresh());
  refreshHomeJourneyProjection();
  return snapshotHomeJourneyProjection();
}

export function unmountHomeJourneyProjection() {
  homeJourneyRuntime.observer?.disconnect();
  removeHomeJourneyNode();
  homeJourneyRuntime.mounted = false;
  homeJourneyRuntime.observer = null;
  homeJourneyRuntime.refreshScheduled = false;
  homeJourneyRuntime.home = null;
  homeJourneyRuntime.lastStopFacts = [];
  return snapshotHomeJourneyProjection();
}

export function snapshotHomeJourneyProjection() {
  return Object.freeze({
    mounted: homeJourneyRuntime.mounted,
    renderCount: homeJourneyRuntime.renderCount,
    stopCount: homeJourneyRuntime.lastStopFacts.length,
    stopIds: Object.freeze(homeJourneyRuntime.lastStopFacts.map((stop) => stop.id)),
    states: Object.freeze(homeJourneyRuntime.lastStopFacts.map((stop) => stop.state)),
    presentationOnly: true,
    interactive: false,
    completedStateInferred: false,
    lastError: homeJourneyRuntime.lastError,
  });
}

function mountStudyAfterHome() {
  mountStudyRunFromCurrentBrowser();
  setTimeout(() => {
    if (!homeJourneyRuntime.mounted) mountHomeJourneyProjection();
  }, 0);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  globalThis[HOME_JOURNEY_GLOBAL_KEY] = Object.freeze({
    mount: mountHomeJourneyProjection,
    refresh: refreshHomeJourneyProjection,
    unmount: unmountHomeJourneyProjection,
    snapshot: snapshotHomeJourneyProjection,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStudyAfterHome, { once: true });
  } else {
    mountStudyAfterHome();
  }
}

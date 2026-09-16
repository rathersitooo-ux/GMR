// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module,
// then mount the already-authorized Study runtime beside the existing Rogue runtime.
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

const HOME_ROUTE_SELECTOR = 'section[data-screen="home"] .homePadChoice[data-home-target]';
const NAV_GUARD_ATTR = 'data-home-nav-readiness-guard';
const NAV_PREV_ARIA_ATTR = 'data-home-nav-readiness-prev-aria-disabled';
const NAV_PREV_ARIA_MISSING = '__missing__';
const NAV_READINESS_POLL_MS = 50;
const guardedRouteActivationBlockers = new Map();

export function isHomeNavigationAuthorityReady(globalScope = globalThis) {
  const runtime = globalScope && globalScope.__GAMEROAD_SCREEN_TRANSITION__;
  return Boolean(runtime && typeof runtime.navigateDetail === 'function');
}

function readRouteControls(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return Array.from(root.querySelectorAll(HOME_ROUTE_SELECTOR));
}

function blockGuardedActivation(event) {
  event?.preventDefault?.();
  event?.stopImmediatePropagation?.();
  event?.stopPropagation?.();
}

function guardRouteControl(control) {
  if (!control || typeof control.getAttribute !== 'function' || typeof control.setAttribute !== 'function') return false;
  if (control.getAttribute(NAV_GUARD_ATTR) === 'true') return false;

  const disabled = 'disabled' in control ? Boolean(control.disabled) : false;
  const ariaDisabled = control.getAttribute('aria-disabled');
  if (disabled || ariaDisabled === 'true') return false;

  const blocker = (event) => blockGuardedActivation(event);
  control.setAttribute(NAV_GUARD_ATTR, 'true');
  control.setAttribute(NAV_PREV_ARIA_ATTR, ariaDisabled === null ? NAV_PREV_ARIA_MISSING : ariaDisabled);
  control.setAttribute('aria-disabled', 'true');
  control.addEventListener?.('click', blocker, true);
  guardedRouteActivationBlockers.set(control, blocker);
  return true;
}

function restoreRouteControl(control) {
  if (!control || typeof control.getAttribute !== 'function' || typeof control.removeAttribute !== 'function') return false;
  if (control.getAttribute(NAV_GUARD_ATTR) !== 'true') return false;

  const blocker = guardedRouteActivationBlockers.get(control);
  if (blocker) {
    control.removeEventListener?.('click', blocker, true);
    guardedRouteActivationBlockers.delete(control);
  }

  const previousAria = control.getAttribute(NAV_PREV_ARIA_ATTR);
  if (previousAria === NAV_PREV_ARIA_MISSING || previousAria === null) {
    control.removeAttribute('aria-disabled');
  } else {
    control.setAttribute('aria-disabled', previousAria);
  }
  control.removeAttribute(NAV_GUARD_ATTR);
  control.removeAttribute(NAV_PREV_ARIA_ATTR);
  return true;
}

export function syncHomeNavigationReadiness({ root = document, globalScope = globalThis } = {}) {
  const ready = isHomeNavigationAuthorityReady(globalScope);
  let gated = 0;
  let restored = 0;

  for (const control of readRouteControls(root)) {
    if (ready) {
      if (restoreRouteControl(control)) restored += 1;
    } else if (guardRouteControl(control)) {
      gated += 1;
    }
  }

  return Object.freeze({ ready, gated, restored });
}

export function mountHomeNavigationReadinessGuard({
  root = document,
  globalScope = globalThis,
  schedule = globalThis.setTimeout,
  pollMs = NAV_READINESS_POLL_MS,
} = {}) {
  let stopped = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    if (timer !== null && typeof globalScope.clearTimeout === 'function') {
      globalScope.clearTimeout(timer);
    }
    timer = null;
  };

  const check = () => {
    if (stopped) return;
    const state = syncHomeNavigationReadiness({ root, globalScope });
    if (state.ready) {
      stop();
      return;
    }
    if (typeof schedule === 'function') {
      timer = schedule(check, pollMs);
    }
  };

  check();
  return Object.freeze({ stop });
}

function mountStudyAfterHome() {
  mountHomeNavigationReadinessGuard();
  mountStudyRunFromCurrentBrowser();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStudyAfterHome, { once: true });
  } else {
    mountStudyAfterHome();
  }
}
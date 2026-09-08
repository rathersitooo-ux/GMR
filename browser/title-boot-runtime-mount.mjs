import {
  TITLE_BOOT_ROUTE_KINDS,
  resolveRecoveryCancel,
  resolveTitleBootRoute,
} from './title-boot-router-core.mjs';
import {
  BOOT_LOADING_PHASES,
  createBootLoadingState,
  projectBootLoadingPresentation,
} from './boot-loading-presentation-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_TITLE_BOOT_RUNTIME';
const SURFACE_ID = 'gameroad-title-boot-runtime';
const STYLE_ID = 'gameroad-title-boot-runtime-style';

export const TITLE_BOOT_QUICK_DESTINATIONS = Object.freeze([
  Object.freeze({ screen: 'setup', label: 'バトル' }),
  Object.freeze({ screen: 'cards', label: 'カード' }),
  Object.freeze({ screen: 'characters', label: 'パートナー' }),
  Object.freeze({ screen: 'home', label: 'ホーム' }),
]);

const runtime = {
  mounted: false,
  running: false,
  routeKind: null,
  lastDestination: null,
  lastError: null,
  recovery: null,
};

function currentScreen(source = globalThis) {
  try {
    const value = source.GAMEROAD_GET_CURRENT_SCREEN?.();
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function screenExists(doc, screen) {
  if (!doc?.querySelector) return true;
  return Boolean(doc.querySelector(`.screen[data-screen="${screen}"]`));
}

export function projectTitleQuickDestinations({ document: doc = globalThis.document } = {}) {
  return Object.freeze(TITLE_BOOT_QUICK_DESTINATIONS.filter(({ screen }) => screenExists(doc, screen)));
}

export function readTitleBootContext(source = globalThis) {
  const provider = source?.GAMEROAD_TITLE_BOOT_CONTEXT_PROVIDER;
  if (typeof provider !== 'function') return Object.freeze({});
  try {
    const value = provider();
    return Object.freeze(value && typeof value === 'object' ? { ...value } : {});
  } catch (error) {
    return Object.freeze({ contextProviderError: String(error?.message || error) });
  }
}

function ensureStyle(doc) {
  if (!doc?.createElement || !doc?.head) return;
  if (doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${SURFACE_ID}{position:fixed;inset:0;z-index:2147483640;display:grid;place-items:center;padding:max(20px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));background:#fff;color:#111;touch-action:manipulation}
#${SURFACE_ID}[hidden]{display:none!important}
#${SURFACE_ID} .grTitleBootPanel{width:min(620px,100%);display:grid;gap:18px;text-align:center}
#${SURFACE_ID} .grTitleBootName{margin:0;font-size:clamp(2rem,8vw,4.5rem);line-height:.95;letter-spacing:.04em}
#${SURFACE_ID} .grTitleBootStatus{min-height:1.35em;font-weight:700;overflow-wrap:anywhere}
#${SURFACE_ID} .grTitleBootProgress{width:100%;height:10px}
#${SURFACE_ID} .grTitleBootActions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#${SURFACE_ID} .grTitleBootAction{min-height:48px;padding:11px 14px;border:1px solid currentColor;background:#fff;color:inherit;font:inherit;font-weight:800;border-radius:12px;touch-action:manipulation}
#${SURFACE_ID} .grTitleBootAction:focus-visible{outline:3px solid currentColor;outline-offset:3px}
@media (max-width:520px){#${SURFACE_ID} .grTitleBootActions{grid-template-columns:1fr 1fr}}
@media (prefers-reduced-motion:reduce){#${SURFACE_ID} *{scroll-behavior:auto!important}}
`;
  doc.head.appendChild(style);
}

function ensureSurface(doc) {
  if (!doc?.createElement || !doc?.body?.appendChild) return null;
  ensureStyle(doc);
  let surface = doc.getElementById?.(SURFACE_ID) ?? null;
  if (surface) return surface;
  surface = doc.createElement('section');
  surface.id = SURFACE_ID;
  surface.setAttribute('aria-live', 'polite');
  surface.setAttribute('aria-atomic', 'true');
  surface.innerHTML = '<div class="grTitleBootPanel"><h1 class="grTitleBootName">GAMEROAD</h1><div class="grTitleBootStatus" role="status"></div><progress class="grTitleBootProgress" max="1"></progress><div class="grTitleBootActions"></div></div>';
  doc.body.appendChild(surface);
  return surface;
}

function clearSurface(doc = globalThis.document) {
  const surface = doc?.getElementById?.(SURFACE_ID);
  if (surface) {
    surface.hidden = true;
    surface.setAttribute('aria-hidden', 'true');
  }
}

function showSurface(doc = globalThis.document) {
  const surface = ensureSurface(doc);
  if (!surface) return null;
  surface.hidden = false;
  surface.removeAttribute('aria-hidden');
  return surface;
}

function replaceActions(surface, actions = []) {
  const root = surface?.querySelector?.('.grTitleBootActions');
  if (!root) return;
  root.replaceChildren();
  for (const action of actions) {
    const button = surface.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'grTitleBootAction';
    button.dataset.titleBootAction = action.id;
    button.textContent = action.label;
    button.disabled = action.disabled === true;
    if (typeof action.run === 'function') button.addEventListener('click', action.run, { once: action.once === true });
    root.appendChild(button);
  }
}

function renderTitle({ source = globalThis, document: doc = globalThis.document, statusText = '' } = {}) {
  const surface = showSurface(doc);
  if (!surface) return null;
  surface.dataset.titleBootMode = 'title';
  const status = surface.querySelector('.grTitleBootStatus');
  if (status) status.textContent = statusText;
  const progress = surface.querySelector('.grTitleBootProgress');
  if (progress) progress.hidden = true;
  const actions = projectTitleQuickDestinations({ document: doc }).map(({ screen, label }) => ({
    id: `GO_${screen.toUpperCase()}`,
    label,
    run: () => void runTitleBoot({
      source,
      document: doc,
      context: { directDestination: { validated: true, screen } },
    }),
  }));
  replaceActions(surface, actions);
  return surface;
}

function renderBootState(state, { source = globalThis, document: doc = globalThis.document, onCancel = null } = {}) {
  const surface = showSurface(doc);
  if (!surface) return null;
  const projection = projectBootLoadingPresentation({ state });
  surface.dataset.titleBootMode = 'boot';
  surface.dataset.bootPhase = projection.phase;
  const status = surface.querySelector('.grTitleBootStatus');
  if (status) status.textContent = projection.statusCode || (projection.phase === BOOT_LOADING_PHASES.RECOVERY ? '対戦に復帰しています…' : '起動中…');
  const progress = surface.querySelector('.grTitleBootProgress');
  if (progress) {
    progress.hidden = projection.progress == null;
    if (projection.progress != null) progress.value = projection.progress;
  }
  replaceActions(surface, projection.actionIds.map((actionId) => ({
    id: actionId,
    label: actionId === 'CANCEL' ? 'キャンセル' : actionId,
    run: actionId === 'CANCEL' && typeof onCancel === 'function' ? onCancel : null,
    disabled: actionId === 'CANCEL' && typeof onCancel !== 'function',
  })));
  return projection;
}

async function navigateTo(destination, source = globalThis, doc = globalThis.document) {
  const target = String(destination || '').trim();
  if (!target) return Object.freeze({ status: 'rejected', reason: 'empty_destination' });
  if (currentScreen(source) === target) {
    clearSurface(doc);
    runtime.lastDestination = target;
    return Object.freeze({ status: 'completed', destination: target, sameScreen: true });
  }
  const navigation = source?.GAMEROAD_SCREEN_TRANSITION;
  if (!navigation || typeof navigation.navigate !== 'function') {
    return Object.freeze({ status: 'rejected', reason: 'screen_transition_unavailable', destination: target });
  }
  let result;
  try {
    result = await navigation.navigate(target, { reason: 'root' });
  } catch (error) {
    return Object.freeze({
      status: 'rejected',
      reason: 'screen_transition_failed',
      destination: target,
      error: String(error?.message || error || 'SCREEN_TRANSITION_FAILED'),
    });
  }
  if (result?.status === 'completed' || result?.status === 'same-screen' || currentScreen(source) === target) {
    clearSurface(doc);
    runtime.lastDestination = target;
  }
  return result;
}

function recoveryRuntime(source = globalThis) {
  const candidate = source?.GAMEROAD_MATCH_RECOVERY;
  return candidate && typeof candidate.reconnect === 'function' ? candidate : null;
}

async function recoverMatch(route, { source = globalThis, document: doc = globalThis.document } = {}) {
  const matchRecovery = recoveryRuntime(source);
  if (!matchRecovery) {
    runtime.lastError = 'MATCH_RECOVERY_RUNTIME_UNAVAILABLE';
    renderTitle({ source, document: doc, statusText: '対戦への復帰を開始できませんでした' });
    return Object.freeze({ status: 'rejected', reason: 'match_recovery_runtime_unavailable' });
  }

  const abortController = new AbortController();
  const recovery = { committed: false, cancelled: false, abortController, matchId: route.match.matchId };
  runtime.recovery = recovery;
  const cancelDecision = resolveRecoveryCancel({ committed: false });
  const onCancel = () => {
    if (!cancelDecision.allowed || recovery.committed || recovery.cancelled) return;
    recovery.cancelled = true;
    abortController.abort();
    try { matchRecovery.cancel?.(route.match, { reason: cancelDecision.effect }); } catch {}
    runtime.recovery = null;
    renderTitle({ source, document: doc });
  };
  renderBootState(createBootLoadingState({
    phase: BOOT_LOADING_PHASES.RECOVERY,
    canCancel: true,
    statusCode: '対戦に復帰しています…',
  }), { source, document: doc, onCancel });

  let result;
  try {
    result = await matchRecovery.reconnect(route.match, { signal: abortController.signal });
  } catch (error) {
    if (recovery.cancelled || abortController.signal.aborted) return Object.freeze({ status: 'cancelled' });
    runtime.lastError = String(error?.message || error || 'MATCH_RECOVERY_FAILED');
    runtime.recovery = null;
    renderTitle({ source, document: doc, statusText: '対戦への復帰に失敗しました' });
    return Object.freeze({ status: 'failed', error: runtime.lastError });
  }

  if (recovery.cancelled || abortController.signal.aborted) return Object.freeze({ status: 'cancelled' });
  if (result?.committed !== true) {
    runtime.lastError = 'MATCH_RECOVERY_NOT_COMMITTED';
    runtime.recovery = null;
    renderTitle({ source, document: doc, statusText: '対戦への復帰に失敗しました' });
    return Object.freeze({ status: 'failed', error: runtime.lastError });
  }

  recovery.committed = true;
  runtime.recovery = recovery;
  renderBootState(createBootLoadingState({
    phase: BOOT_LOADING_PHASES.RECOVERY,
    canCancel: false,
    statusCode: '対戦へ戻ります…',
  }), { source, document: doc });
  const navigationResult = await navigateTo('battle', source, doc);
  runtime.recovery = null;
  const enteredBattle = navigationResult?.status === 'completed'
    || navigationResult?.status === 'same-screen'
    || currentScreen(source) === 'battle';
  if (!enteredBattle) {
    runtime.lastError = `MATCH_RECOVERY_NAVIGATION_FAILED:${String(navigationResult?.reason || navigationResult?.status || 'unknown')}`;
    renderTitle({ source, document: doc, statusText: '対戦画面を開けませんでした' });
  }
  return Object.freeze({ status: 'committed', navigationResult });
}

export async function runTitleBoot({
  source = globalThis,
  document: doc = globalThis.document,
  context = readTitleBootContext(source),
} = {}) {
  if (runtime.running) return Object.freeze({ status: 'busy' });
  runtime.running = true;
  runtime.lastError = null;
  try {
    if (context?.contextProviderError) {
      runtime.lastError = context.contextProviderError;
      renderTitle({ source, document: doc });
      return Object.freeze({ status: 'title', reason: 'context_provider_error' });
    }
    const route = resolveTitleBootRoute(context || {});
    runtime.routeKind = route.kind;
    if (route.kind === TITLE_BOOT_ROUTE_KINDS.RESUME_CURRENT) {
      clearSurface(doc);
      return Object.freeze({ status: 'resumed-current', route });
    }
    if (route.kind === TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH) {
      return await recoverMatch(route, { source, document: doc });
    }
    if (route.kind === TITLE_BOOT_ROUTE_KINDS.REQUIRED_GATE) {
      renderBootState(createBootLoadingState({
        phase: BOOT_LOADING_PHASES.UPDATE_REQUIRED,
        statusCode: '更新が必要です',
      }), { source, document: doc });
      return Object.freeze({ status: 'required-gate', route });
    }
    if (route.kind === TITLE_BOOT_ROUTE_KINDS.DIRECT_DESTINATION || route.kind === TITLE_BOOT_ROUTE_KINDS.RESTORE_PREVIOUS) {
      const navigationResult = await navigateTo(route.destination, source, doc);
      if (navigationResult?.status === 'rejected') renderTitle({ source, document: doc });
      return Object.freeze({ status: 'navigation', route, navigationResult });
    }
    renderTitle({ source, document: doc });
    return Object.freeze({ status: 'title', route });
  } finally {
    runtime.running = false;
  }
}

export function titleBootSnapshot() {
  return Object.freeze({
    mounted: runtime.mounted,
    running: runtime.running,
    routeKind: runtime.routeKind,
    lastDestination: runtime.lastDestination,
    lastError: runtime.lastError,
    recovery: runtime.recovery ? Object.freeze({
      committed: runtime.recovery.committed,
      cancelled: runtime.recovery.cancelled,
      matchId: runtime.recovery.matchId,
    }) : null,
  });
}

export function mountTitleBootRuntime({ source = globalThis, document: doc = globalThis.document } = {}) {
  if (runtime.mounted) return titleBootSnapshot();
  runtime.mounted = true;
  queueMicrotask(() => void runTitleBoot({ source, document: doc }));
  return titleBootSnapshot();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const api = Object.freeze({
    mount: mountTitleBootRuntime,
    run: runTitleBoot,
    snapshot: titleBootSnapshot,
    quickDestinations: TITLE_BOOT_QUICK_DESTINATIONS,
  });
  if (!globalThis[GLOBAL_KEY]) Object.defineProperty(globalThis, GLOBAL_KEY, { value: api, configurable: false, writable: false });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountTitleBootRuntime(), { once: true });
  else mountTitleBootRuntime();
}

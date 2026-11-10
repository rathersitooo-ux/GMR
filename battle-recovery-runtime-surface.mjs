import {
  BATTLE_RECOVERY_LOCAL_STAGE,
  BATTLE_RECOVERY_STATUS,
  isBattleRecoveryPresentation,
  projectBattleRecoveryPresentation,
} from './battle-recovery-presentation-core.mjs';

export const BATTLE_RECOVERY_RUNTIME_SURFACE_SCHEMA =
  'gameroad.battle-recovery-runtime-surface.v1';

const STYLE_ID = 'gameroad-battle-recovery-runtime-surface-v1-style';
const ROOT_ATTR = 'data-battle-recovery-runtime-surface';

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function requiredHost(value) {
  if (!value || typeof value.appendChild !== 'function' || typeof value.querySelector !== 'function') {
    throw new TypeError('host must be a DOM-like element');
  }
  return value;
}

function requiredDocument(globalRef) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new TypeError('Battle recovery runtime surface requires a document');
  }
  return documentRef;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null || value === '') delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function addStyle(documentRef) {
  if (documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${ROOT_ATTR}="1"]{position:absolute;z-index:44;left:50%;top:max(54px,env(safe-area-inset-top));transform:translateX(-50%);display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;max-width:min(420px,72vw);padding:7px 11px;border:1px solid rgba(232,246,255,.48);border-radius:999px;background:rgba(8,20,32,.88);box-shadow:0 8px 24px rgba(0,0,0,.28);color:#f7fbff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:none;user-select:none;text-shadow:0 1px 5px rgba(0,0,0,.62)}
[${ROOT_ATTR}="1"][hidden]{display:none!important}
[${ROOT_ATTR}="1"] .grBattleRecoveryLabel{font-size:12px;line-height:1;font-weight:950;letter-spacing:.06em;white-space:nowrap}
[${ROOT_ATTR}="1"] .grBattleRecoveryDetail{min-width:0;font-size:10px;line-height:1.15;font-weight:760;opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${ROOT_ATTR}="1"][data-visual-cue="WAITING_SOFT_PULSE"]{animation:grBattleRecoveryPulse 1.5s ease-in-out infinite}
[${ROOT_ATTR}="1"][data-visual-cue="RECONNECT_SYNC_SWEEP"]{box-shadow:0 8px 24px rgba(0,0,0,.28),inset 0 0 0 1px rgba(125,218,255,.36);animation:grBattleRecoverySweep 1.1s ease-in-out infinite}
[${ROOT_ATTR}="1"][data-visual-cue="STALE_REFRESH_SNAP"]{animation:grBattleRecoverySnap .28s cubic-bezier(.2,.82,.2,1) 1}
@keyframes grBattleRecoveryPulse{0%,100%{filter:brightness(.96)}50%{filter:brightness(1.12)}}
@keyframes grBattleRecoverySweep{0%,100%{filter:brightness(.96)}50%{filter:brightness(1.18)}}
@keyframes grBattleRecoverySnap{0%{transform:translateX(-50%) scale(.96)}60%{transform:translateX(-50%) scale(1.025)}100%{transform:translateX(-50%) scale(1)}}
@media(max-height:430px) and (orientation:landscape){[${ROOT_ATTR}="1"]{top:max(40px,env(safe-area-inset-top));max-width:min(360px,58vw);padding:5px 9px}.grBattleRecoveryDetail{font-size:9px}}
@media(max-width:540px) and (orientation:portrait){[${ROOT_ATTR}="1"]{top:max(58px,env(safe-area-inset-top));max-width:76vw}}
@media(prefers-reduced-motion:reduce){[${ROOT_ATTR}="1"]{animation:none!important;transition:none!important}}
`;
  documentRef.head?.appendChild?.(style);
}

function createSurface(documentRef, host) {
  const root = documentRef.createElement('aside');
  root.setAttribute?.(ROOT_ATTR, '1');
  root.setAttribute?.('role', 'status');
  root.setAttribute?.('aria-live', 'polite');
  root.setAttribute?.('aria-atomic', 'true');
  root.dataset.presentationOnly = 'true';
  root.dataset.gameplayAuthority = 'false';
  root.dataset.networkAuthority = 'false';
  root.dataset.controlAuthority = 'false';
  root.dataset.blocksBoard = 'false';
  root.hidden = true;

  const label = documentRef.createElement('strong');
  label.className = 'grBattleRecoveryLabel';
  const detail = documentRef.createElement('span');
  detail.className = 'grBattleRecoveryDetail';
  root.appendChild(label);
  root.appendChild(detail);
  host.appendChild(root);
  return { root, label, detail };
}

/**
 * Caller-driven DOM projection for the already-merged Battle recovery core.
 *
 * This module never decides whether Battle is waiting/reconnecting/stale. The
 * caller supplies those authoritative facts. The only side-effect outside its
 * own DOM is a caller-owned local-input-lock callback receiving the existing
 * core's fail-closed projection. It does not clear drafts, retry network work,
 * infer a timeout, or roll back an authoritative commit.
 */
export function mountBattleRecoveryRuntimeSurface(globalRef = globalThis, {
  host,
  setLocalInputLocked,
} = {}) {
  const documentRef = requiredDocument(globalRef);
  const hostNode = requiredHost(host);
  const inputLock = requiredFunction(setLocalInputLocked, 'setLocalInputLocked');

  const existing = hostNode.querySelector?.(`[${ROOT_ATTR}="1"]`);
  if (existing?.__gameroadBattleRecoveryRuntime) {
    return existing.__gameroadBattleRecoveryRuntime;
  }

  addStyle(documentRef);
  const surface = createSurface(documentRef, hostNode);
  let destroyed = false;
  let lastProjection = null;

  function sync({
    status,
    localStage = BATTLE_RECOVERY_LOCAL_STAGE.NONE,
    reducedMotion = globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
    lowPerformance = hostNode?.dataset?.lowPerf === 'true',
  } = {}) {
    if (destroyed) throw new Error('BATTLE_RECOVERY_RUNTIME_DESTROYED');

    const projection = projectBattleRecoveryPresentation({
      status,
      localStage,
      reducedMotion: reducedMotion === true,
      lowPerformance: lowPerformance === true,
    });
    if (!isBattleRecoveryPresentation(projection)) {
      throw new TypeError('BATTLE_RECOVERY_PRESENTATION_REJECTED');
    }

    // Caller retains input authority. This callback only projects the core's
    // fail-closed lock request into the caller's existing local input seam.
    inputLock(projection.inputLockRequired, projection);

    surface.root.hidden = !projection.visible;
    surface.label.textContent = projection.label;
    surface.detail.textContent = projection.detail;
    setData(surface.root, 'status', projection.status);
    setData(surface.root, 'visualCue', projection.visualCue);
    setData(surface.root, 'motionMode', projection.motionMode);
    setData(surface.root, 'inputLocked', projection.inputLockRequired ? 'true' : 'false');
    setData(surface.root, 'authoritativeRefreshRequired', projection.requiresAuthoritativeRefresh ? 'true' : 'false');
    setData(surface.root, 'clearUncommittedLocalStage', projection.clearUncommittedLocalStage ? 'true' : 'false');
    setData(surface.root, 'localStage', projection.localStage);
    surface.root.setAttribute?.('aria-hidden', String(!projection.visible));

    lastProjection = projection;
    return projection;
  }

  function snapshot() {
    return lastProjection;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    surface.root.remove?.();
    return true;
  }

  const runtime = Object.freeze({
    schema: BATTLE_RECOVERY_RUNTIME_SURFACE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    networkAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    gameStateWrite: false,
    waitingDecisionAuthority: 'CALLER',
    reconnectDecisionAuthority: 'CALLER',
    staleDecisionAuthority: 'CALLER',
    localInputLockAuthority: 'CALLER_CALLBACK',
    clearsLocalStage: false,
    retriesNetwork: false,
    computesTimeout: false,
    root: surface.root,
    sync,
    snapshot,
    destroy,
  });
  surface.root.__gameroadBattleRecoveryRuntime = runtime;
  return runtime;
}

export const BATTLE_RECOVERY_RUNTIME_SURFACE_CONTRACT = Object.freeze({
  schema: BATTLE_RECOVERY_RUNTIME_SURFACE_SCHEMA,
  statuses: BATTLE_RECOVERY_STATUS,
  localStages: BATTLE_RECOVERY_LOCAL_STAGE,
  projectionCore: 'EXISTING_BATTLE_RECOVERY_PRESENTATION_CORE_ONLY',
  statusAuthority: 'CALLER',
  inputLockProjection: 'CALLER_CALLBACK_ONLY',
  compactNonblocking: true,
  pointerInputOwned: false,
  clearsLocalStage: false,
  rollsBackAuthoritativeCommit: false,
  triggersReconnect: false,
  computesTimeoutOrGrace: false,
  computesRetryPolicy: false,
  computesControlOwner: false,
  computesLegality: false,
  computesResult: false,
  gameStateWrite: false,
  secretExpansion: false,
});

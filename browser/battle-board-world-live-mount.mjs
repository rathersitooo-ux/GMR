import { createBattleBoardWorldFieldRenderModel } from './battle-board-world-field-renderer.mjs';
import {
  createBattleBoardWebglWorldRenderer,
  BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT,
} from './battle-board-webgl-world-renderer.mjs';
import { createBattleBoardWorldInteractionOverlay } from './battle-board-world-interaction-overlay-core.mjs';
import { projectLegacyWorldInteractionSnapshot } from './battle-board-legacy-world-interaction-adapter.mjs';

const SCHEMA = 'gameroad.battle-board-world-live-mount.v1';
const RUNTIME_NAME = 'GAMEROAD_BATTLE_BOARD_WORLD_3D_RUNTIME';
const STYLE_ID = 'gameroad-battle-board-world-3d-style';
const ROOT_ATTR = 'data-gr-world3d-mounted';
const INTERACTION_ATTR = 'data-gr-world3d-interaction-authority';
const ROAD_RE = /^R:(P[1-4]):([LCR]):([1-7])$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function addStyle(document) {
  const prior = document.getElementById?.(STYLE_ID);
  if (prior) return { node: prior, created: false };
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#battleMap[${ROOT_ATTR}="true"]{background:linear-gradient(180deg,#6c8790 0%,#406b63 42%,#244c43 100%)!important;isolation:isolate}
#battleMap[${ROOT_ATTR}="true"]>.grBattleWorld3dCanvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none;touch-action:none}
#battleMap[${ROOT_ATTR}="true"]>#board{position:absolute;inset:0;z-index:5;background:transparent!important;box-shadow:none!important}
#battleMap[${ROOT_ATTR}="true"]>#board .node:not(.reachable):not(.path):not(.pathStep):not(.currentPosition):not(.nextStep){opacity:0!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node.reachable,#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node.path,#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node.pathStep,#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node.currentPosition,#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node.nextStep{opacity:0!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
#battleMap[${ROOT_ATTR}="true"][${INTERACTION_ATTR}="canonical"]>#board .node[data-decision-label]::after{display:none!important}
#battleMap[${ROOT_ATTR}="true"]>#boardPlayers{position:relative;z-index:7}
#battleMap[${ROOT_ATTR}="true"]>#battleRuntime{position:relative;z-index:8}
@media(prefers-reduced-motion:reduce){#battleMap[${ROOT_ATTR}="true"]>.grBattleWorld3dCanvas{scroll-behavior:auto!important}}
`;
  (document.head ?? document.documentElement ?? document.body)?.appendChild?.(style);
  return { node: style, created: true };
}

function lowPerformanceFrom(root, global) {
  if (root?.dataset?.grLowPerf === 'true') return true;
  const memory = Number(global?.navigator?.deviceMemory);
  if (Number.isFinite(memory) && memory > 0 && memory <= 4) return true;
  return false;
}

function reducedMotionFrom(root, global) {
  if (root?.dataset?.grReducedMotion === 'true') return true;
  return global?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function restoreAttr(node, name, prior) {
  if (!node) return;
  if (prior.had) node.setAttribute?.(name, prior.value ?? '');
  else node.removeAttribute?.(name);
}

function uniquePositionIds(nodes) {
  return [...new Set(nodes.map((node) => node?.dataset?.pos ?? node?.getAttribute?.('data-pos') ?? null).filter(Boolean))];
}

export function collectBattleWorldBuiltCountByLaneKey(board) {
  const positions = uniquePositionIds([...(board?.querySelectorAll?.('.node.placedCard[data-pos]') ?? [])]);
  const byLane = new Map();
  for (const positionId of positions) {
    const match = ROAD_RE.exec(positionId); if (!match) continue;
    const laneKey = match[1] + ':' + match[2];
    if (!byLane.has(laneKey)) byLane.set(laneKey, new Set());
    byLane.get(laneKey).add(positionId);
  }
  return Object.freeze(Object.fromEntries([...byLane.entries()].map(([laneKey, ids]) => [laneKey, ids.size])));
}

export function collectLegacyBoardInteractionSnapshot(board) {
  const current = board?.querySelector?.('.node.currentPosition[data-pos]') ?? null;
  const next = board?.querySelector?.('.node.nextStep[data-pos]') ?? null;
  const reachable = [...(board?.querySelectorAll?.('.node.reachable[data-pos]') ?? [])];
  const path = [...(board?.querySelectorAll?.('.node.path[data-pos]') ?? []), ...(board?.querySelectorAll?.('.node.pathStep[data-pos]') ?? [])];
  return deepFreeze({
    currentPositionId: current?.dataset?.pos ?? null, nextPositionId: next?.dataset?.pos ?? null,
    reachablePositionIds: uniquePositionIds(reachable), pathPositionIds: uniquePositionIds(path),
  });
}

function builtSignature(counts) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => key + ':' + value).join('|');
}

export async function mountBattleBoardWorldLive(global = globalThis, {
  createRenderer = createBattleBoardWebglWorldRenderer,
  worldBounds = Object.freeze({ centerX: 0, centerZ: 0, width: 24, depth: 13.5, y: 0 }),
  builtCountByLaneKey = {},
} = {}) {
  const document = global?.document;
  if (!document?.createElement) return deepFreeze({ mounted: false, reason: 'DOCUMENT_REQUIRED', schema: SCHEMA });

  const existing = global[RUNTIME_NAME];
  if (existing?.schema === SCHEMA && existing?.mounted === true) return existing;

  const battleRoot = document.querySelector?.('section.screen.battle[data-screen="battle"]')
    ?? document.querySelector?.('.screen.battle')
    ?? null;
  const battleMap = document.getElementById?.('battleMap') ?? battleRoot?.querySelector?.('#battleMap') ?? null;
  if (!battleRoot || !battleMap) return deepFreeze({ mounted: false, reason: 'BATTLE_WORLD_HOST_REQUIRED', schema: SCHEMA });

  const style = addStyle(document);
  const priorRootAttr = {
    had: battleMap.hasAttribute?.(ROOT_ATTR) === true,
    value: battleMap.getAttribute?.(ROOT_ATTR) ?? null,
  };
  const priorInteractionAttr = {
    had: battleMap.hasAttribute?.(INTERACTION_ATTR) === true,
    value: battleMap.getAttribute?.(INTERACTION_ATTR) ?? null,
  };

  const canvas = document.createElement('canvas');
  canvas.className = 'grBattleWorld3dCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-battle-world3d-canvas', 'true');
  const board = document.getElementById?.('board') ?? battleMap.querySelector?.('#board') ?? null;
  if (!board) return deepFreeze({ mounted: false, reason: 'BATTLE_BOARD_REQUIRED', schema: SCHEMA });
  if (board?.parentNode === battleMap && typeof battleMap.insertBefore === 'function') battleMap.insertBefore(canvas, board);
  else battleMap.prepend?.(canvas);
  battleMap.setAttribute?.(ROOT_ATTR, 'true');

  const lowPerformance = lowPerformanceFrom(battleRoot, global);
  const reducedMotion = reducedMotionFrom(battleRoot, global);

  let renderer = null;
  let destroyed = false;
  try {
    renderer = await createRenderer({
      canvas,
      global,
      lowPerformance,
      reducedMotion,
      enableRemoteCc0Preview: false,
    });
  } catch (error) {
    canvas.remove?.();
    restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
    restoreAttr(battleMap, INTERACTION_ATTR, priorInteractionAttr);
    if (style.created) style.node?.remove?.();
    return deepFreeze({
      mounted: false,
      reason: 'WORLD_RENDERER_CREATE_FAILED',
      errorName: error?.name ?? 'Error',
      schema: SCHEMA,
    });
  }

  let observer = null;
  let syncPending = null;
  let lastBuiltSignature = null;
  let lastWorldModel = null;
  let lastInteraction = deepFreeze({ complete: false, safeToSuppressLegacyBoardVisuals: false, reason: 'NOT_SYNCED' });

  async function sync() {
    if (destroyed) return lastInteraction;
    const builtCounts = collectBattleWorldBuiltCountByLaneKey(board);
    const signature = builtSignature(builtCounts);
    if (signature !== lastBuiltSignature || !lastWorldModel) {
      lastWorldModel = createBattleBoardWorldFieldRenderModel({ worldBounds, builtCountByLaneKey: builtCounts });
      await renderer.replaceBoard(lastWorldModel); lastBuiltSignature = signature;
    }
    const projected = projectLegacyWorldInteractionSnapshot(collectLegacyBoardInteractionSnapshot(board));
    let overlay = null;
    let overlayResult = { complete: false, applied: 0, unresolvedNodeIds: [] };
    if (projected.safeToSuppressLegacyBoardVisuals) {
      try {
        overlay = createBattleBoardWorldInteractionOverlay(projected.canonicalOverlayInput);
        if (typeof renderer.applyInteractionOverlay === 'function') overlayResult = await Promise.resolve(renderer.applyInteractionOverlay(overlay));
      } catch (error) {
        overlayResult = { complete: false, applied: 0, unresolvedNodeIds: [], reason: error?.message ?? 'WORLD_INTERACTION_OVERLAY_FAILED' };
      }
    } else if (typeof renderer.applyInteractionOverlay === 'function') {
      try { await Promise.resolve(renderer.applyInteractionOverlay(createBattleBoardWorldInteractionOverlay())); } catch {}
    }
    const canonical = projected.safeToSuppressLegacyBoardVisuals === true && overlayResult?.complete === true;
    if (canonical) battleMap.setAttribute?.(INTERACTION_ATTR, 'canonical'); else battleMap.removeAttribute?.(INTERACTION_ATTR);
    lastInteraction = deepFreeze({
      complete: canonical, safeToSuppressLegacyBoardVisuals: projected.safeToSuppressLegacyBoardVisuals === true,
      unresolvedLegacy: projected.unresolved ?? [], overlayCount: overlay?.counts?.overlays ?? 0,
      unresolvedWorldNodeIds: overlayResult?.unresolvedNodeIds ?? [],
      reason: canonical ? 'CANONICAL_WORLD_INTERACTION_VISIBLE' : projected.safeToSuppressLegacyBoardVisuals ? 'WORLD_NODE_NOT_RENDERED' : 'LEGACY_MAPPING_INCOMPLETE',
    });
    return lastInteraction;
  }

  try { await sync(); } catch (error) {
    renderer.destroy?.(); canvas.remove?.(); restoreAttr(battleMap, ROOT_ATTR, priorRootAttr); restoreAttr(battleMap, INTERACTION_ATTR, priorInteractionAttr);
    if (style.created) style.node?.remove?.();
    return deepFreeze({ mounted: false, reason: 'WORLD_FIELD_RENDER_FAILED', errorName: error?.name ?? 'Error', schema: SCHEMA });
  }

  const scheduleSync = () => {
    if (destroyed || syncPending) return syncPending;
    syncPending = Promise.resolve().then(sync).catch(() => lastInteraction).finally(() => { syncPending = null; });
    return syncPending;
  };
  if (typeof global.MutationObserver === 'function') {
    observer = new global.MutationObserver(scheduleSync);
    observer.observe?.(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-pos'] });
  }
  function snapshot() {
    return deepFreeze({
      schema: SCHEMA,
      mounted: !destroyed,
      lowPerformance,
      reducedMotion,
      worldFieldMounted: Boolean(lastWorldModel),
      worldCounts: lastWorldModel?.counts ?? null,
      interaction: lastInteraction,
      renderer: renderer.inspect?.() ?? null,
      presentationOnly: true,
      gameplayAuthority: false,
      movementAuthority: false,
      legalityAuthority: false,
      gameStateWrite: false,
    });
  }

  const runtime = {
    schema: SCHEMA,
    mounted: true,
    canvas,
    renderer,
    sync,
    snapshot,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      renderer?.destroy?.();
      canvas.remove?.();
      restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
      restoreAttr(battleMap, INTERACTION_ATTR, priorInteractionAttr);
      if (style.created) style.node?.remove?.();
      try { delete global[RUNTIME_NAME]; } catch { /* best-effort runtime registry cleanup */ }
      return true;
    },
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  };

  Object.defineProperty(global, RUNTIME_NAME, {
    configurable: true,
    enumerable: true,
    writable: false,
    value: Object.freeze(runtime),
  });
  return global[RUNTIME_NAME];
}


const LAZY_RUNTIME_NAME = 'GAMEROAD_BATTLE_BOARD_WORLD_3D_LAZY_MOUNT';

function battleSurfaceVisible(global, battleRoot) {
  if (!battleRoot || battleRoot.hidden === true || battleRoot.getAttribute?.('aria-hidden') === 'true') return false;
  if (battleRoot.classList?.contains?.('active') || battleRoot.dataset?.active === 'true') return true;
  const style = global?.getComputedStyle?.(battleRoot);
  return style ? style.display !== 'none' && style.visibility !== 'hidden' : false;
}

export function installBattleBoardWorldLazyMount(global = globalThis, options = {}) {
  const document = global?.document;
  if (!document?.querySelector) return Object.freeze({ installed: false, reason: 'DOCUMENT_REQUIRED', schema: SCHEMA });
  const existing = global[LAZY_RUNTIME_NAME];
  if (existing?.installed === true) return existing;
  const battleRoot = document.querySelector('section.screen.battle[data-screen="battle"]') ?? document.querySelector('.screen.battle');
  if (!battleRoot) return Object.freeze({ installed: false, reason: 'BATTLE_ROOT_REQUIRED', schema: SCHEMA });

  let destroyed = false;
  let pending = null;
  let lastResult = null;
  const ensure = () => {
    if (destroyed || pending || !battleSurfaceVisible(global, battleRoot)) return pending;
    pending = Promise.resolve(mountBattleBoardWorldLive(global, options))
      .then((result) => {
        lastResult = result;
        return result;
      })
      .finally(() => { pending = null; });
    return pending;
  };
  const observer = typeof global.MutationObserver === 'function'
    ? new global.MutationObserver(() => { ensure(); })
    : null;
  observer?.observe?.(battleRoot, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-active'] });
  if (typeof global.queueMicrotask === 'function') global.queueMicrotask(() => { ensure(); });
  else Promise.resolve().then(() => { ensure(); });

  const runtime = Object.freeze({
    schema: SCHEMA,
    installed: true,
    ensure,
    snapshot: () => Object.freeze({
      installed: !destroyed,
      pending: Boolean(pending),
      visible: battleSurfaceVisible(global, battleRoot),
      mounted: global[RUNTIME_NAME]?.mounted === true,
      lastReason: lastResult?.reason ?? null,
    }),
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      global[RUNTIME_NAME]?.destroy?.();
      try { delete global[LAZY_RUNTIME_NAME]; } catch { /* best-effort lazy registry cleanup */ }
      return true;
    },
  });
  Object.defineProperty(global, LAZY_RUNTIME_NAME, { configurable: true, enumerable: true, writable: false, value: runtime });
  ensure();
  return runtime;
}

export const BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT = deepFreeze({
  schema: SCHEMA,
  runtimeName: RUNTIME_NAME,
  consumesExistingWorldFieldMount: false,
  consumesExistingWorldFieldModel: true,
  rendererContract: BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.schema,
  canvasLayer: 'BEHIND_EXISTING_BOARD_DOM',
  existingBoardDomRemainsInteractiveAuthority: true,
  passiveLegacyTopologyHidden: true,
  interactionCutoverPolicy: 'EXACT_LEGACY_ROAD_MAPPING_PLUS_RENDERED_WORLD_NODE_OR_KEEP_LEGACY_CUE',
  builtCountSource: 'EXISTING_PLACED_CARD_DOM_COUNT_ONLY',
  infersLowerFieldSemantics: false,
  remoteCc0PreviewFormalAsset: false,
  remoteAssetPreview: false,
  lowPerformanceFallback: true,
  reducedMotionAware: true,
  modifiesGameplay: false,
  secondBoardEngine: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  gameStateWrite: false,
});

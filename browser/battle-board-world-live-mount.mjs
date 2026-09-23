import { mountBattleBoardWorldField } from './battle-board-world-field-renderer.mjs';
import {
  createBattleBoardWebglWorldRenderer,
  BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT,
} from './battle-board-webgl-world-renderer.mjs';

const SCHEMA = 'gameroad.battle-board-world-live-mount.v1';
const RUNTIME_NAME = 'GAMEROAD_BATTLE_BOARD_WORLD_3D_RUNTIME';
const STYLE_ID = 'gameroad-battle-board-world-3d-style';
const ROOT_ATTR = 'data-gr-world3d-mounted';

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
#battleMap[${ROOT_ATTR}="true"]>#board{position:relative;z-index:2;background:transparent!important;box-shadow:none!important}
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

  const canvas = document.createElement('canvas');
  canvas.className = 'grBattleWorld3dCanvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-battle-world3d-canvas', 'true');
  const board = document.getElementById?.('board') ?? battleMap.querySelector?.('#board') ?? null;
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
      enableRemoteCc0Preview: !lowPerformance,
    });
  } catch (error) {
    canvas.remove?.();
    restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
    if (style.created) style.node?.remove?.();
    return deepFreeze({
      mounted: false,
      reason: 'WORLD_RENDERER_CREATE_FAILED',
      errorName: error?.name ?? 'Error',
      schema: SCHEMA,
    });
  }

  let renderPromise = Promise.resolve();
  const seam = Object.freeze({
    replaceBoard(model) {
      renderPromise = Promise.resolve(renderer.replaceBoard(model));
    },
  });
  const worldMount = mountBattleBoardWorldField({
    worldRenderer: seam,
    worldBounds,
    builtCountByLaneKey,
  });
  if (!worldMount?.mounted) {
    renderer.destroy?.();
    canvas.remove?.();
    restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
    if (style.created) style.node?.remove?.();
    return deepFreeze({
      mounted: false,
      reason: worldMount?.reason ?? 'WORLD_FIELD_MOUNT_FAILED',
      schema: SCHEMA,
    });
  }

  try {
    await renderPromise;
  } catch (error) {
    renderer.destroy?.();
    canvas.remove?.();
    restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
    if (style.created) style.node?.remove?.();
    return deepFreeze({
      mounted: false,
      reason: 'WORLD_FIELD_RENDER_FAILED',
      errorName: error?.name ?? 'Error',
      schema: SCHEMA,
    });
  }

  function snapshot() {
    return deepFreeze({
      schema: SCHEMA,
      mounted: !destroyed,
      lowPerformance,
      reducedMotion,
      worldFieldMounted: worldMount.mounted === true,
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
    worldMount,
    snapshot,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      renderer?.destroy?.();
      canvas.remove?.();
      restoreAttr(battleMap, ROOT_ATTR, priorRootAttr);
      if (style.created) style.node?.remove?.();
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

export const BATTLE_BOARD_WORLD_LIVE_MOUNT_CONTRACT = deepFreeze({
  schema: SCHEMA,
  runtimeName: RUNTIME_NAME,
  consumesExistingWorldFieldMount: true,
  rendererContract: BATTLE_BOARD_WEBGL_WORLD_RENDERER_CONTRACT.schema,
  canvasLayer: 'BEHIND_EXISTING_BOARD_DOM',
  existingBoardDomRemainsInteractiveAuthority: true,
  remoteCc0PreviewFormalAsset: false,
  lowPerformanceFallback: true,
  reducedMotionAware: true,
  modifiesGameplay: false,
  secondBoardEngine: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  gameStateWrite: false,
});

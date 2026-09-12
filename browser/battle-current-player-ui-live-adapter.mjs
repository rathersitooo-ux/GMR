import { mountBattleCurrentPlayerUi } from './battle-current-player-ui-runtime.mjs';

export const BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA = 'gameroad.battle-current-player-ui-live-adapter.v1';
const ROOT_RUNTIME_PROP = '__gameroadCurrentPlayerUiLiveAdapter';
const GLOBAL_RUNTIME_PROP = '__GAMEROAD_BATTLE_CURRENT_PLAYER_UI_LIVE__';

function resolveBattleRoot(documentRef) {
  return documentRef?.querySelector?.('section.screen.battle[data-screen="battle"]')
    ?? documentRef?.querySelector?.('.screen.battle')
    ?? documentRef?.querySelector?.('section[data-screen="battle"]')
    ?? null;
}

export function mountBattleCurrentPlayerUiLiveAdapter(globalRef = globalThis, {
  mountUi = mountBattleCurrentPlayerUi,
} = {}) {
  const documentRef = globalRef?.document;
  const root = resolveBattleRoot(documentRef);
  if (!documentRef || !root || typeof mountUi !== 'function') return null;
  if (root[ROOT_RUNTIME_PROP]) return root[ROOT_RUNTIME_PROP];

  let compositor = null;
  try {
    compositor = mountUi(globalRef, { root });
  } catch {
    return null;
  }
  if (!compositor) return null;

  let destroyed = false;
  let runtime = null;
  runtime = Object.freeze({
    schema: BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA,
    root,
    compositor,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    mounted: () => !destroyed && root[ROOT_RUNTIME_PROP] === runtime,
    inspect: () => compositor.inspect?.() ?? null,
    sync: (snapshot = {}) => compositor.sync?.(snapshot) ?? null,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      try { compositor.destroy?.(); } catch {}
      if (root[ROOT_RUNTIME_PROP] === runtime) delete root[ROOT_RUNTIME_PROP];
      if (globalRef[GLOBAL_RUNTIME_PROP] === runtime) delete globalRef[GLOBAL_RUNTIME_PROP];
      return true;
    },
  });
  root[ROOT_RUNTIME_PROP] = runtime;
  globalRef[GLOBAL_RUNTIME_PROP] = runtime;
  return runtime;
}

function autoMount() {
  if (typeof globalThis !== 'object' || !globalThis.document) return null;
  return mountBattleCurrentPlayerUiLiveAdapter(globalThis);
}

if (typeof globalThis === 'object' && globalThis.document) {
  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener?.('DOMContentLoaded', autoMount, { once: true });
  } else if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(autoMount);
  } else {
    Promise.resolve().then(autoMount);
  }
}

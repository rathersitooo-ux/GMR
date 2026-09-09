import { mountBattleScreenExternalSurface as mountBaseBattleScreenExternalSurface } from './battle-screen-runtime-mount-base-r4c.mjs';
import { mountBattleCriticalResourceHud } from './battle-critical-resource-hud-runtime.mjs';

export { BATTLE_SCREEN_RUNTIME, resolveViewerLocalPlayedCardArt } from './battle-screen-runtime-mount-base-r4c.mjs';

const RESOURCE_KEYS = Object.freeze(['honey', 'chipCount', 'honeyDelta', 'honeyDeltaSource']);

function isSnapshot(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasResourceFields(snapshot) {
  if (!isSnapshot(snapshot)) return false;
  return RESOURCE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(snapshot, key));
}

function pickResourceSnapshot(snapshot) {
  const source = isSnapshot(snapshot) ? snapshot : {};
  const picked = {};
  for (const key of RESOURCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) picked[key] = source[key];
  }
  return picked;
}

export function mountBattleScreenExternalSurface(global = globalThis, options = {}) {
  const base = mountBaseBattleScreenExternalSurface(global, options);
  const resourceHost = base?.hud?.root?.children?.[0] ?? base?.hud?.root;
  if (!resourceHost || typeof resourceHost.appendChild !== 'function') {
    base.destroy?.();
    throw new TypeError('BATTLE_SCREEN_RESOURCE_HUD_HOST_REQUIRED');
  }

  const resourceHud = mountBattleCriticalResourceHud(global, {
    host: resourceHost,
    snapshot: pickResourceSnapshot(options.hud)
  });

  let destroyed = false;

  function syncResource(snapshot) {
    if (!hasResourceFields(snapshot)) return resourceHud.snapshot();
    return resourceHud.sync(pickResourceSnapshot(snapshot));
  }

  function renderHud(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    const result = base.renderHud(snapshot);
    syncResource(snapshot);
    return result;
  }

  function render(model, hudSnapshot = null) {
    if (destroyed) throw new Error('BATTLE_SCREEN_RUNTIME_DESTROYED');
    const result = base.render(model, hudSnapshot);
    if (hudSnapshot !== null) syncResource(hudSnapshot);
    return result;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    resourceHud.destroy();
    return base.destroy();
  }

  return Object.freeze({
    ...base,
    resourceHud,
    renderHud,
    render,
    destroy
  });
}

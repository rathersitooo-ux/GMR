export const BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA =
  'gameroad.battle-critical-resource-hud-live-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function signedInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function optionalLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function explicitPlayer(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function requireResourceHud(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.sync !== 'function') {
    throw new TypeError('BATTLE_RESOURCE_HUD_SYNC_REQUIRED');
  }
  return value;
}

/**
 * Project only caller-selected player's already-authoritative resource facts into
 * the input shape consumed by the existing Battle screen resource HUD.
 *
 * This adapter intentionally does not find/select a player, calculate Honey,
 * inspect Chip card identities, rank players, or retain resource history.
 */
export function projectBattleCriticalResourceHudInput({
  player = null,
  honeyDelta = null,
  honeyDeltaSource = null,
} = {}) {
  const explicit = explicitPlayer(player);
  const honey = explicit ? nonNegativeInteger(explicit.honey) : null;
  const chipCount = explicit && Array.isArray(explicit.chip)
    ? nonNegativeInteger(explicit.chip.length)
    : null;
  const delta = signedInteger(honeyDelta);
  const deltaSource = optionalLabel(honeyDeltaSource);

  const snapshot = {
    honey,
    chipCount,
  };

  // Delta is optional presentation context. Forward it only as an atomic pair
  // so a partial/stale caller fact cannot become a visible attribution.
  if (delta !== null && deltaSource !== null) {
    snapshot.honeyDelta = delta;
    snapshot.honeyDeltaSource = deltaSource;
  }

  return deepFreeze(snapshot);
}

/**
 * Sync the explicit caller player's resources through the dedicated resource HUD
 * surface. The caller passes the existing screenRuntime.resourceHud (or an
 * equivalent caller-owned HUD surface), so generic screen renderHud state is not
 * rewritten by a resource-only update.
 */
export function syncBattleCriticalResourceHudFromPlayer({
  resourceHud = null,
  player = null,
  honeyDelta = null,
  honeyDeltaSource = null,
} = {}) {
  const hud = requireResourceHud(resourceHud);
  const snapshot = projectBattleCriticalResourceHudInput({
    player,
    honeyDelta,
    honeyDeltaSource,
  });
  return hud.sync(snapshot);
}

export const BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_CONTRACT = deepFreeze({
  schema: BATTLE_CRITICAL_RESOURCE_HUD_LIVE_ADAPTER_SCHEMA,
  presentationOnly: true,
  playerSelectionAuthority: false,
  resourceCalculationAuthority: false,
  resourceStoreAuthority: false,
  chipIdentityProjection: false,
  rankCalculationAuthority: false,
  gameStateWrite: false,
  genericHudRenderUsed: false,
  directSyncTarget: 'CALLER_OWNED_RESOURCE_HUD.sync',
  source: Object.freeze({
    honey: 'EXPLICIT_CALLER_PLAYER.honey',
    chipCount: 'EXPLICIT_CALLER_PLAYER.chip.length',
    honeyDelta: 'EXPLICIT_CALLER_OPTIONAL',
    honeyDeltaSource: 'EXPLICIT_CALLER_OPTIONAL',
  }),
  outputKeys: Object.freeze(['honey', 'chipCount', 'honeyDelta', 'honeyDeltaSource']),
});

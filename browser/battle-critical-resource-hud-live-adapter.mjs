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

function projectPaymentReceipt(value, manaCurrent, honeyCurrent) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cost = nonNegativeInteger(value.cost);
  const manaPaid = nonNegativeInteger(value.manaPaid);
  const honeyPaid = nonNegativeInteger(value.honeyPaid);
  const manaAfter = nonNegativeInteger(value.manaAfter);
  const honeyAfter = nonNegativeInteger(value.honeyAfter);
  const source = optionalLabel(value.source);
  const complete = cost !== null
    && manaPaid !== null
    && honeyPaid !== null
    && manaAfter !== null
    && honeyAfter !== null
    && source !== null;
  if (!complete) return null;
  if (manaPaid + honeyPaid !== cost) return null;
  if (honeyPaid > 0 && manaAfter !== 0) return null;
  if (manaCurrent === null || honeyCurrent === null) return null;
  if (manaAfter !== manaCurrent || honeyAfter !== honeyCurrent) return null;
  return deepFreeze({ cost, manaPaid, honeyPaid, manaAfter, honeyAfter, source });
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
 * inspect Chip card identities, rank players, calculate payment, or retain
 * resource history.
 */
export function projectBattleCriticalResourceHudInput({
  player = null,
  honeyDelta = null,
  honeyDeltaSource = null,
  paymentReceipt = null,
} = {}) {
  const explicit = explicitPlayer(player);
  const manaCurrent = explicit ? nonNegativeInteger(explicit.manaCurrent) : null;
  const manaMax = explicit ? nonNegativeInteger(explicit.manaMax) : null;
  const numericManaResolved = manaCurrent !== null && manaMax !== null && manaMax > 0 && manaCurrent <= manaMax;
  const honey = explicit ? nonNegativeInteger(explicit.honey) : null;
  const chipCount = explicit && Array.isArray(explicit.chip)
    ? nonNegativeInteger(explicit.chip.length)
    : null;
  const delta = signedInteger(honeyDelta);
  const deltaSource = optionalLabel(honeyDeltaSource);
  const payment = projectPaymentReceipt(
    paymentReceipt,
    numericManaResolved ? manaCurrent : null,
    honey,
  );

  const snapshot = {
    manaCurrent: numericManaResolved ? manaCurrent : null,
    manaMax: numericManaResolved ? manaMax : null,
    honey,
    chipCount,
  };

  // Delta is optional presentation context. Forward it only as an atomic pair
  // so a partial/stale caller fact cannot become a visible attribution.
  if (delta !== null && deltaSource !== null) {
    snapshot.honeyDelta = delta;
    snapshot.honeyDeltaSource = deltaSource;
  }

  // Payment is caller-authoritative presentation context. Forward only a complete,
  // self-consistent receipt that matches the player's current post-payment values.
  if (payment !== null) snapshot.paymentReceipt = payment;

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
  paymentReceipt = null,
} = {}) {
  const hud = requireResourceHud(resourceHud);
  const snapshot = projectBattleCriticalResourceHudInput({
    player,
    honeyDelta,
    honeyDeltaSource,
    paymentReceipt,
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
  paymentCalculationAuthority: false,
  paymentChoiceAuthority: false,
  gameStateWrite: false,
  genericHudRenderUsed: false,
  directSyncTarget: 'CALLER_OWNED_RESOURCE_HUD.sync',
  source: Object.freeze({
    manaCurrent: 'EXPLICIT_CALLER_PLAYER.manaCurrent',
    manaMax: 'EXPLICIT_CALLER_PLAYER.manaMax',
    physicalManaCardIdentity: 'NOT_PROJECTED',
    honey: 'EXPLICIT_CALLER_PLAYER.honey',
    chipCount: 'EXPLICIT_CALLER_PLAYER.chip.length',
    honeyDelta: 'EXPLICIT_CALLER_OPTIONAL',
    honeyDeltaSource: 'EXPLICIT_CALLER_OPTIONAL',
    paymentReceipt: 'EXPLICIT_CALLER_OPTIONAL_ATOMIC',
  }),
  outputKeys: Object.freeze([
    'manaCurrent',
    'manaMax',
    'honey',
    'chipCount',
    'honeyDelta',
    'honeyDeltaSource',
    'paymentReceipt',
  ]),
});

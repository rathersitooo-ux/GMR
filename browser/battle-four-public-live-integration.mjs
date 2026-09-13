import { projectBattleFourPublicRevealLive } from './battle-four-public-live-bridge.mjs';

export const BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA =
  'gameroad.battle-four-public-live-integration.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new TypeError('BATTLE_FOUR_PUBLIC_RUNTIME_REQUIRED');
  }
  if (typeof runtime.render !== 'function') {
    throw new TypeError('BATTLE_FOUR_PUBLIC_RUNTIME_RENDER_REQUIRED');
  }
  if (runtime.presentationOnly !== true || runtime.gameplayAuthority !== false || runtime.gameStateWrite !== false) {
    throw new TypeError('BATTLE_FOUR_PUBLIC_RUNTIME_AUTHORITY_BOUNDARY_INVALID');
  }
  return runtime;
}

/**
 * Production-facing composition seam for WU26.
 *
 * Caller owns both the legal public reveal snapshot and the already-mounted
 * Battle-screen runtime. This integration does not mount DOM, read hidden state,
 * infer a missing card, or create another renderer. It projects the accepted
 * four-card reveal through the merged WU26 bridge, then asks the existing runtime
 * to render that audited model exactly once.
 */
export function syncBattleFourPublicRevealToRuntime({
  runtime,
  eventId,
  participants,
  publicCards,
  reducedMotion = false,
  lowPerf = false,
  hudSnapshot = null,
} = {}) {
  const acceptedRuntime = requireRuntime(runtime);
  const projection = projectBattleFourPublicRevealLive({
    eventId,
    participants,
    publicCards,
    reducedMotion,
    lowPerf,
  });

  const renderedModel = hudSnapshot === null
    ? acceptedRuntime.render(projection.model)
    : acceptedRuntime.render(projection.model, hudSnapshot);

  if (renderedModel !== projection.model) {
    throw new TypeError('BATTLE_FOUR_PUBLIC_RUNTIME_RENDER_IDENTITY_MISMATCH');
  }

  return deepFreeze({
    schema: BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    secretProjectionAuthority: false,
    runtimeMountAuthority: false,
    renderCount: 1,
    eventId: projection.model.eventId,
    model: projection.model,
  });
}

export const BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_CONTRACT = deepFreeze({
  schema: BATTLE_FOUR_PUBLIC_LIVE_INTEGRATION_SCHEMA,
  revealProjection: 'MERGED_BATTLE_FOUR_PUBLIC_LIVE_BRIDGE',
  runtimeAuthority: 'CALLER_EXISTING_BATTLE_SCREEN_RUNTIME',
  runtimeMountAuthority: false,
  renderCallsPerSync: 1,
  requiresPresentationOnlyRuntime: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  secretProjectionAuthority: false,
  processingOrderCalculation: false,
  winnerCalculation: false,
  targetCalculation: false,
  shieldCalculation: false,
  cardIdentityInference: false,
  createsSecondRenderer: false,
  readsHiddenHand: false,
  readsDeck: false,
  productionHtmlMutationOwnedHere: false,
});

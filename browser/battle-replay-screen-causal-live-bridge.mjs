import { appendAcceptedBattleResolution } from './battle-replay-live-adapter.mjs';
import { auditBattleScreenModel } from './battle-screen-presentation-core.mjs';

export const BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE_SCHEMA =
  'gameroad.battle-replay-screen-causal-live-bridge.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeOptions(options) {
  if (options == null) return {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('BATTLE_REPLAY_SCREEN_OPTIONS_INVALID');
  }
  return options;
}

function screenContext(session) {
  return deepFreeze({
    schema: BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    matchId: session.matchId,
    resolutionSerial: session.lastResolutionSerial
  });
}

/**
 * Drop-in accepted-resolution wrapper.
 *
 * Replay append remains authoritative and runs first. Screen rendering is an
 * optional presentation-only side effect supplied by the caller. This module
 * never constructs a Battle screen model, infers compound attack facts,
 * computes processing order, or mounts a second screen runtime.
 */
export function appendAcceptedBattleResolutionToScreen(
  session,
  resolution,
  options = {}
) {
  const safe = safeOptions(options);
  const {
    screenModel = null,
    renderScreenModel = null,
    ...replayOptions
  } = safe;

  const next = appendAcceptedBattleResolution(session, resolution, replayOptions);

  if (screenModel == null || typeof renderScreenModel !== 'function') return next;
  const audit = auditBattleScreenModel(screenModel);
  if (!audit.ok) return next;

  try {
    renderScreenModel(screenModel, screenContext(next));
  } catch {
    // Presentation is fail-soft. The accepted replay append must never roll back.
  }
  return next;
}

export const BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE = deepFreeze({
  schema: BATTLE_REPLAY_SCREEN_CAUSAL_BRIDGE_SCHEMA,
  authority: 'NONE_PRESENTATION_ONLY',
  replayAppendAuthority: 'EXISTING_APPEND_ACCEPTED_BATTLE_RESOLUTION',
  screenModelAuthority: 'CALLER_ALREADY_BUILT_AUDITED_MODEL',
  rendererAuthority: 'CALLER_EXISTING_RUNTIME_INSTANCE',
  replayLogWidening: false,
  modelConstruction: false,
  compoundInference: false,
  orderCalculation: false,
  targetCalculation: false,
  winnerCalculation: false,
  routeCalculation: false,
  runtimeMountOwnedHere: false,
  screenFailurePolicy: 'FAIL_SOFT_AFTER_ACCEPTED_REPLAY_APPEND'
});

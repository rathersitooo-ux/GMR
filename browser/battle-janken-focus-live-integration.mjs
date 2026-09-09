import {
  createBattleJankenCompoundLiveInputStack,
} from './battle-janken-compound-live-input-stack.mjs';
import {
  createBattleJankenFocusAuthorityContextReader,
} from './battle-janken-focus-authority-context.mjs';
import {
  mountBattleJankenFocusRuntimeSurface,
} from './battle-janken-focus-runtime-surface.mjs';

export const BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA =
  'gameroad.battle-janken-focus-live-integration.v1';

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

/**
 * Composition-only factory for the already-merged Battle janken Focus path.
 *
 * The caller still owns every game authority:
 * - liveConsumer owns immutable Hand3 assignment + existing Battle commit path;
 * - previewRuntime owns the existing compound preview presentation;
 * - readCompoundAttackCandidate owns complete target/Shield/route candidate facts.
 *
 * This module merely returns the exact object shape consumed by the existing
 * SlidePad Focus mount. It creates no second controller, mapping, target picker,
 * legality engine, route engine, transport, or gameplay state.
 */
export function createBattleJankenFocusLiveIntegration({
  liveConsumer,
  previewRuntime,
  readCompoundAttackCandidate,
  mountSurface = mountBattleJankenFocusRuntimeSurface,
} = {}) {
  requiredObject(liveConsumer, 'liveConsumer');
  requiredObject(previewRuntime, 'previewRuntime');
  requiredFunction(readCompoundAttackCandidate, 'readCompoundAttackCandidate');
  requiredFunction(mountSurface, 'mountSurface');

  const liveInputStack = createBattleJankenCompoundLiveInputStack({
    liveConsumer,
    previewRuntime,
  });
  const readContext = createBattleJankenFocusAuthorityContextReader({
    liveConsumer,
    readCompoundAttackCandidate,
  });

  let destroyed = false;

  const integration = {
    schema: BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA,
    mountSurface,
    liveInputStack,

    async readContext(request) {
      if (destroyed) throw new Error('Battle janken Focus integration is destroyed');
      return readContext(request);
    },

    status() {
      let input = null;
      try { input = liveInputStack.status(); } catch {}
      return Object.freeze({
        schema: BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA,
        destroyed,
        input,
        presentationOnly: true,
        gameplayAuthority: false,
        handAssignmentAuthority: false,
        targetInference: false,
        legalTargetRecompute: false,
        routeRecompute: false,
        shieldMappingAuthority: false,
        commitTransportAuthority: false,
        gameStateWrite: false,
      });
    },

    destroy() {
      if (destroyed) return false;
      destroyed = true;
      try { liveInputStack.destroy?.(); } catch {}
      return true;
    },
  };

  return Object.freeze(integration);
}

export const BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_CONTRACT = Object.freeze({
  schema: BATTLE_JANKEN_FOCUS_LIVE_INTEGRATION_SCHEMA,
  authority: 'NONE',
  slidePadShape: Object.freeze(['mountSurface', 'readContext', 'liveInputStack']),
  surfaceSource: 'EXISTING_BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE',
  contextSource: 'EXISTING_BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_READER',
  inputSource: 'EXISTING_BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK',
  callerOwnsLiveConsumer: true,
  callerOwnsPreviewRuntime: true,
  callerOwnsCompoundCandidateAuthority: true,
  createsBattleEngine: false,
  computesHandAssignment: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShieldMapping: false,
  commitTransportAuthority: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesSlidePadRuntime: false,
  mutatesPublicPackage: false,
});

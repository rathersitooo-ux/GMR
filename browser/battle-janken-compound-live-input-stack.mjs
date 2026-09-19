[Reading 109 lines from start (total: 109 lines, 0 remaining)]

import {
  createBattleCompoundPreviewLiveConsumerBridge,
} from './battle-compound-preview-live-consumer-bridge.mjs';
import {
  createBattleJankenSlidePadLiveInputCoordinator,
} from './battle-janken-slidepad-live-input-coordinator.mjs';

export const BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_SCHEMA =
  'gameroad.battle-janken-compound-live-input-stack.v1';

function frozen(value) {
  return Object.freeze(value);
}

/**
 * Single construction boundary for the already-merged NEW BASE compound-input
 * chain. It deliberately keeps the bridge private so a production SlidePad
 * caller cannot bypass the latest-focus / visible-preview coordinator by
 * calling bridge commit methods directly.
 *
 * Authority stays in the injected liveConsumer and previewRuntime:
 *   liveConsumer -> exact preview bridge -> serialized input coordinator.
 * This module computes no card assignment, target, legality, route, Shield,
 * transport result, or gameplay state.
 */
export function createBattleJankenCompoundLiveInputStack({
  liveConsumer,
  previewRuntime,
} = {}) {
  const liveBridge = createBattleCompoundPreviewLiveConsumerBridge({
    liveConsumer,
    previewRuntime,
  });
  const coordinator = createBattleJankenSlidePadLiveInputCoordinator({ liveBridge });

  return frozen({
    schema: BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_SCHEMA,

    focus(jankenHand) {
      return coordinator.focus(jankenHand);
    },

    clearUncommittedSelection() {
      return coordinator.clearUncommittedSelection();
    },

    // Temporary compatibility only for the still-active upper surface/mount.
    // This alias is not a player-facing operation and is removed with their
    // dedicated-cancel migration.
    cancel() {
      return coordinator.clearUncommittedSelection();
    },

    commit() {
      return coordinator.commit();
    },

    status() {
      const input = coordinator.status();
      return frozen({
        schema: BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_SCHEMA,
        phase: input.phase,
        intentVersion: input.intentVersion,
        desiredHand: input.desiredHand,
        readyHand: input.readyHand,
        previewReady: input.previewReady,
        commitPending: input.commitPending,
        destroyed: input.destroyed,
        input,
        presentationOnly: true,
        gameplayAuthority: false,
        targetInference: false,
        legalTargetRecompute: false,
        routeRecompute: false,
        handAssignmentAuthority: false,
        gameStateWrite: false,
      });
    },

    destroy() {
      return coordinator.destroy();
    },
  });
}

export const BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_CONTRACT = frozen({
  schema: BATTLE_JANKEN_COMPOUND_LIVE_INPUT_STACK_SCHEMA,
  authority: 'NONE',
  composition: 'LIVE_CONSUMER_TO_EXACT_PREVIEW_BRIDGE_TO_LATEST_FOCUS_COORDINATOR',
  publicBridgeBypass: false,
  focusPolicy: 'EXISTING_LATEST_FOCUS_COORDINATOR_ONLY',
  previewPolicy: 'EXISTING_EXACT_COMPOUND_PREVIEW_BRIDGE_ONLY',
  commitPolicy: 'LATEST_VISIBLE_PREVIEW_REQUIRED',
  uncommittedSelectionClearPolicy: 'EXISTING_SHARED_GLOBAL_PRECOMMIT_CLEAR_THROUGH_COORDINATOR',
  legacyCancelCompatibilityAlias: true,
  callerOwnsLiveConsumerLifecycle: true,
  callerOwnsPreviewRuntimeLifecycle: true,
  authoritativeRollback: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShield: false,
  computesHandAssignment: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesJankenRuntime: false,
  mutatesBattleScreenRuntime: false,
  mutatesPublicPackage: false,
});

[executed on device: DESKTOP-ODSOHQD (01bf07a9-543b-4891-9550-4539d562ff6f)]
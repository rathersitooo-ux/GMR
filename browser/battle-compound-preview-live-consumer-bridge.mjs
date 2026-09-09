const BRIDGE_SCHEMA = 'gameroad.battle-compound-preview-live-consumer-bridge.v1';

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireMethod(owner, name, ownerName) {
  if (typeof owner?.[name] !== 'function') {
    throw new TypeError(`${ownerName}.${name} must be a function`);
  }
  return owner[name].bind(owner);
}

function readRoundId(value) {
  const roundId = value?.roundId;
  return typeof roundId === 'string' && roundId.trim() === roundId && roundId.length > 0
    ? roundId
    : null;
}

/**
 * Composition-only bridge between the existing NEW BASE live consumer and the
 * existing compound-attack preview runtime.
 *
 * This bridge owns no target, legality, route, hand-assignment, transport, or
 * gameplay state authority. Its only policy is a presentation safety boundary:
 * a staged compound attack is not commit-capable through this bridge unless the
 * exact staged package has first produced an active precommit preview.
 *
 * Explicit player cancel is deliberately different from stale-focus cleanup:
 * the former delegates to the shared consumer's existing global precommit clear
 * (caller plan/target draft + local compound stage), while the latter uses only
 * compound-stage clear so pointer churn cannot erase unrelated caller drafts.
 */
export function createBattleCompoundPreviewLiveConsumerBridge({
  liveConsumer,
  previewRuntime,
} = {}) {
  requireObject(liveConsumer, 'liveConsumer');
  requireObject(previewRuntime, 'previewRuntime');

  const syncRoundStart = requireMethod(liveConsumer, 'syncRoundStart', 'liveConsumer');
  const stageCompoundAttack = requireMethod(liveConsumer, 'stageCompoundAttack', 'liveConsumer');
  const clearCompoundAttack = requireMethod(liveConsumer, 'clearCompoundAttack', 'liveConsumer');
  const clearGlobalPrecommitSelection = requireMethod(liveConsumer, 'clearPrecommitSelection', 'liveConsumer');
  const commitCompoundAttack = requireMethod(liveConsumer, 'commitCompoundAttack', 'liveConsumer');
  const consumerStatus = requireMethod(liveConsumer, 'status', 'liveConsumer');
  const renderPreview = requireMethod(previewRuntime, 'render', 'previewRuntime');
  const clearPreview = requireMethod(previewRuntime, 'clear', 'previewRuntime');

  let observedRoundId = null;
  let visiblePreviewReady = false;

  function clearPresentation() {
    visiblePreviewReady = false;
    return clearPreview();
  }

  function adoptObservedRoundFromStatus() {
    const nextRoundId = readRoundId(consumerStatus());
    if (nextRoundId && observedRoundId && nextRoundId !== observedRoundId) {
      clearPresentation();
    }
    if (nextRoundId) observedRoundId = nextRoundId;
    return nextRoundId;
  }

  function failClosedStage(reason, preview = null) {
    const clearedStage = clearCompoundAttack();
    const previewCleared = clearPresentation();
    return Object.freeze({
      ok: false,
      staged: false,
      reason,
      stage: null,
      preview,
      clearedStage,
      previewCleared,
    });
  }

  return Object.freeze({
    schema: BRIDGE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    targetInference: false,
    legalTargetRecompute: false,
    routeRecompute: false,
    gameStateWrite: false,

    async syncRoundStart() {
      const snapshot = await syncRoundStart();
      const nextRoundId = readRoundId(snapshot);
      if (!nextRoundId) {
        clearPresentation();
        observedRoundId = null;
        throw new TypeError('liveConsumer.syncRoundStart() must return a canonical roundId');
      }
      if (observedRoundId && nextRoundId !== observedRoundId) {
        clearPresentation();
      }
      observedRoundId = nextRoundId;
      return snapshot;
    },

    async stageCompoundAttack(jankenHand) {
      visiblePreviewReady = false;
      const stage = await stageCompoundAttack(jankenHand);
      adoptObservedRoundFromStatus();

      if (!stage?.package) {
        return failClosedStage('STAGED_PACKAGE_REQUIRED');
      }

      let preview;
      try {
        // The preview runtime intentionally consumes the exact immutable package,
        // not a separately reconstructed target or route projection.
        preview = renderPreview(stage.package);
      } catch {
        return failClosedStage('PREVIEW_RENDER_FAILED');
      }

      if (preview?.active !== true) {
        return failClosedStage('VISIBLE_PREVIEW_REQUIRED', preview ?? null);
      }

      visiblePreviewReady = true;
      return Object.freeze({
        ok: true,
        staged: true,
        reason: 'VISIBLE_PREVIEW_READY',
        stage,
        preview,
      });
    },

    // Local-only clear remains available for stale focus/stage cleanup. It must
    // not clear the caller-owned plan/target draft merely because focus moved.
    clearCompoundAttack() {
      let clearedStage;
      try {
        clearedStage = clearCompoundAttack();
      } finally {
        clearPresentation();
      }
      return Object.freeze({
        ok: true,
        cleared: true,
        clearedStage,
      });
    },

    // Explicit player cancel uses the already-merged shared semantic that clears
    // caller draft + adapter-owned compound stage atomically. A rejected clear
    // keeps the visible preview so the same staged decision remains retryable.
    async clearPrecommitSelection() {
      const result = requireObject(
        await clearGlobalPrecommitSelection(),
        'liveConsumer.clearPrecommitSelection() result',
      );
      if (result.cleared !== true) {
        return Object.freeze({
          ...result,
          previewCleared: false,
        });
      }
      const previewCleared = clearPresentation();
      return Object.freeze({
        ...result,
        previewCleared,
      });
    },

    async commitCompoundAttack() {
      if (!visiblePreviewReady) {
        return Object.freeze({
          ok: false,
          committed: false,
          reason: 'VISIBLE_PREVIEW_REQUIRED',
        });
      }

      const result = await commitCompoundAttack();
      if (result?.ok === true && result?.committed === true) {
        clearPresentation();
      }
      return result;
    },

    status() {
      return Object.freeze({
        schema: BRIDGE_SCHEMA,
        observedRoundId,
        visiblePreviewReady,
        consumer: consumerStatus(),
      });
    },
  });
}

export const BATTLE_COMPOUND_PREVIEW_LIVE_CONSUMER_BRIDGE_CONTRACT = Object.freeze({
  schema: BRIDGE_SCHEMA,
  presentationOnly: true,
  authority: 'NONE',
  stagedPackageSource: 'EXISTING_NEW_BASE_LIVE_CONSUMER_ONLY',
  previewProjection: 'EXISTING_COMPOUND_ATTACK_PREVIEW_RUNTIME_ONLY',
  commitTransport: 'EXISTING_NEW_BASE_LIVE_CONSUMER_ONLY',
  explicitCancelPolicy: 'EXISTING_SHARED_GLOBAL_PRECOMMIT_CLEAR',
  staleFocusClearPolicy: 'COMPOUND_STAGE_ONLY',
  globalClearRejectPolicy: 'KEEP_VISIBLE_PREVIEW_AND_STAGE',
  visiblePreviewRequiredBeforeBridgeCommit: true,
  previewFailurePolicy: 'CLEAR_UNCOMMITTED_STAGE_FAIL_CLOSED',
  commitRejectPolicy: 'KEEP_VISIBLE_PREVIEW_AND_STAGE_FOR_CALLER_DECISION',
  roundChangePolicy: 'CLEAR_STALE_PRESENTATION',
  authoritativeRollback: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesHandAssignment: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesJankenRuntime: false,
  mutatesBattleScreenRuntime: false,
});

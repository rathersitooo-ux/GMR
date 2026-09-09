const BRIDGE_SCHEMA = 'gameroad.battle-janken-compound-preview-live-bridge.v1';

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requiredMethod(owner, name) {
  const object = requiredObject(owner, name.split('.')[0]);
  const methodName = name.split('.').at(-1);
  if (typeof object[methodName] !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  return object[methodName].bind(object);
}

function freeze(value) {
  return Object.freeze(value);
}

/**
 * Presentation-only bridge between the current NEW BASE live consumer and the
 * already-merged board preview runtime.
 *
 * The bridge does not derive a target, Shield lane, route, legality, or mapping.
 * It forwards the exact staged package produced by the live consumer to the
 * preview runtime. A package that cannot be projected visibly is cleared before
 * it can be committed through this bridge, so hidden targeting fails closed.
 */
export function createBattleJankenCompoundPreviewLiveBridge({
  liveConsumer,
  previewRuntime,
} = {}) {
  const stageCompoundAttack = requiredMethod(liveConsumer, 'liveConsumer.stageCompoundAttack');
  const clearCompoundAttack = requiredMethod(liveConsumer, 'liveConsumer.clearCompoundAttack');
  const commitCompoundAttack = requiredMethod(liveConsumer, 'liveConsumer.commitCompoundAttack');
  const readConsumerStatus = requiredMethod(liveConsumer, 'liveConsumer.status');
  const renderPreview = requiredMethod(previewRuntime, 'previewRuntime.render');
  const clearPreview = requiredMethod(previewRuntime, 'previewRuntime.clear');
  const refreshPreview = requiredMethod(previewRuntime, 'previewRuntime.refresh');

  let previewActive = false;
  let stagedIdentity = null;

  function resetPresentation() {
    previewActive = false;
    stagedIdentity = null;
    return clearPreview();
  }

  function clearBoth() {
    const preview = resetPresentation();
    const stage = clearCompoundAttack();
    return freeze({
      schema: BRIDGE_SCHEMA,
      ok: true,
      cleared: true,
      stage,
      preview,
      gameStateWrite: false,
    });
  }

  function currentStageMatchesBridge() {
    if (!previewActive || !stagedIdentity) return false;
    const current = readConsumerStatus()?.stagedCompoundAttack;
    return current?.jankenHand === stagedIdentity.jankenHand
      && current?.cardId === stagedIdentity.cardId;
  }

  return freeze({
    async focus(jankenHand) {
      resetPresentation();
      const staged = requiredObject(
        await stageCompoundAttack(jankenHand),
        'staged compound attack',
      );
      const pkg = requiredObject(staged.package, 'staged compound attack package');

      let projected;
      try {
        projected = renderPreview(pkg);
      } catch (error) {
        clearCompoundAttack();
        resetPresentation();
        throw error;
      }

      if (projected?.active !== true) {
        const stage = clearCompoundAttack();
        resetPresentation();
        return freeze({
          schema: BRIDGE_SCHEMA,
          ok: false,
          staged: false,
          previewActive: false,
          reason: 'EXACT_COMPOUND_PREVIEW_UNAVAILABLE',
          stage,
          gameStateWrite: false,
        });
      }

      previewActive = true;
      stagedIdentity = freeze({
        jankenHand: pkg.jankenHand,
        cardId: pkg.cardId,
      });

      return freeze({
        schema: BRIDGE_SCHEMA,
        ok: true,
        staged: true,
        previewActive: true,
        reason: 'EXACT_COMPOUND_PREVIEW_VISIBLE',
        package: pkg,
        preview: projected,
        gameStateWrite: false,
      });
    },

    clear() {
      return clearBoth();
    },

    refresh() {
      if (!currentStageMatchesBridge()) {
        return freeze({
          schema: BRIDGE_SCHEMA,
          ok: false,
          previewActive: false,
          reason: 'STAGED_COMPOUND_ATTACK_NOT_CURRENT',
          gameStateWrite: false,
        });
      }
      const preview = refreshPreview();
      if (preview?.active !== true) {
        const stage = clearCompoundAttack();
        resetPresentation();
        return freeze({
          schema: BRIDGE_SCHEMA,
          ok: false,
          previewActive: false,
          reason: 'EXACT_COMPOUND_PREVIEW_BECAME_UNAVAILABLE',
          stage,
          gameStateWrite: false,
        });
      }
      return freeze({
        schema: BRIDGE_SCHEMA,
        ok: true,
        previewActive: true,
        reason: 'EXACT_COMPOUND_PREVIEW_REFRESHED',
        preview,
        gameStateWrite: false,
      });
    },

    async commit() {
      if (!currentStageMatchesBridge()) {
        resetPresentation();
        return freeze({
          schema: BRIDGE_SCHEMA,
          ok: false,
          committed: false,
          reason: 'VISIBLE_CURRENT_STAGE_REQUIRED',
          gameStateWrite: false,
        });
      }

      try {
        const result = await commitCompoundAttack();
        if (result?.committed === true) {
          resetPresentation();
        }
        return result;
      } catch (error) {
        clearCompoundAttack();
        resetPresentation();
        throw error;
      }
    },

    status() {
      return freeze({
        schema: BRIDGE_SCHEMA,
        previewActive,
        stagedIdentity,
        currentStageMatchesBridge: currentStageMatchesBridge(),
        computesTarget: false,
        computesLegality: false,
        computesRoute: false,
        computesShieldMapping: false,
        gameStateWrite: false,
      });
    },
  });
}

export const BATTLE_JANKEN_COMPOUND_PREVIEW_LIVE_BRIDGE_CONTRACT = freeze({
  schema: BRIDGE_SCHEMA,
  stageAuthority: 'EXISTING_BATTLE_NEW_BASE_LIVE_CONSUMER',
  previewAuthority: 'EXISTING_BATTLE_COMPOUND_ATTACK_PREVIEW_RUNTIME',
  commitAuthority: 'EXISTING_BATTLE_NEW_BASE_LIVE_CONSUMER',
  forwardsExactStagedPackage: true,
  hiddenTargetCommitAllowed: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShieldMapping: false,
  gameStateWrite: false,
  secondTargetEngine: false,
  secondBattleEngine: false,
});

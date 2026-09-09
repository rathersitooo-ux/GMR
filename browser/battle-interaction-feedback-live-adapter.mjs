import { projectBattleInteractionFeedbackCue } from './battle-interaction-feedback-cue-core.mjs';

const SCHEMA = 'gameroad.battle-interaction-feedback-live-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function fail(reason) {
  return deepFreeze({ ok: false, reason, feedback: null, delivery: null });
}

function requiredText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

function normalizedGuard(value) {
  if (value == null) return null;
  return requiredText(value);
}

function deliveryStatus(callback, ...args) {
  if (typeof callback !== 'function') return 'UNAVAILABLE';
  try {
    callback(...args);
    return 'DELIVERED';
  } catch {
    return 'FAILED_SOFT';
  }
}

export function projectBattleInteractionFeedbackEvent(event, options = {}) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return fail('EVENT_REQUIRED');
  }
  if (event.rejected === true) return fail('REJECTED_EVENT_NOT_OWNED');

  const receiptId = requiredText(event.receiptId);
  if (!receiptId) return fail('RECEIPT_ID_REQUIRED');

  const stage = requiredText(event.stage);
  if (!stage) return fail('STAGE_REQUIRED');
  if (event.eventConfirmed !== true) return fail('EVENT_CONFIRMATION_REQUIRED');

  const projected = projectBattleInteractionFeedbackCue(stage, {
    authoritativeAccepted: event.authoritativeAccepted === true,
    audioEnabled: options.audioEnabled !== false,
    hapticsEnabled: options.hapticsEnabled !== false,
    visualEnabled: options.visualEnabled !== false,
    reducedMotion: options.reducedMotion === true,
    lowPerformance: options.lowPerformance === true,
  });

  if (!projected.ok) {
    return fail(projected.reason);
  }

  const expectedGuard = projected.cue.semanticGuard ?? null;
  const suppliedGuard = normalizedGuard(event.semanticGuard);
  if (expectedGuard !== suppliedGuard) {
    return fail('SEMANTIC_GUARD_MISMATCH');
  }

  return deepFreeze({
    ok: true,
    reason: 'CONFIRMED_FEEDBACK_EVENT_PROJECTED',
    feedback: {
      schema: SCHEMA,
      receiptId,
      stage,
      receiptStageKey: `${receiptId}::${stage}`,
      cue: projected.cue,
      eventConfirmed: true,
      authoritativeAccepted: event.authoritativeAccepted === true,
      blocksInput: false,
      gameStateWrite: false,
      gameplayAuthority: false,
      resultAuthority: false,
      legalityAuthority: false,
      targetAuthority: false,
      receiptAuthority: false,
      soundAssetRegistryOwned: false,
      numericHapticTimingOwned: false,
      browserHapticApiOwned: false,
    },
    delivery: null,
  });
}

export function createBattleInteractionFeedbackLiveAdapter({
  renderVisual,
  playFormalSfx,
  emitHaptic,
} = {}) {
  if (
    typeof renderVisual !== 'function'
    && typeof playFormalSfx !== 'function'
    && typeof emitHaptic !== 'function'
  ) {
    throw new Error('at least one feedback consumer callback is required');
  }

  const seen = new Set();
  let sequence = 0;

  function publish(event, options = {}) {
    const projected = projectBattleInteractionFeedbackEvent(event, options);
    if (!projected.ok) return projected;

    const feedback = projected.feedback;
    if (seen.has(feedback.receiptStageKey)) {
      return deepFreeze({
        ok: true,
        reason: 'DUPLICATE_FEEDBACK_SUPPRESSED',
        feedback,
        delivery: {
          sequence,
          duplicateSuppressed: true,
          visual: 'SUPPRESSED',
          audio: 'SUPPRESSED',
          haptic: 'SUPPRESSED',
        },
      });
    }

    // Consume the presentation receipt before callbacks so a re-entrant or failing
    // presentation consumer cannot cause the same confirmed event to fire twice.
    seen.add(feedback.receiptStageKey);
    sequence += 1;

    const cue = feedback.cue;
    const deliveryContext = deepFreeze({
      schema: SCHEMA,
      sequence,
      receiptId: feedback.receiptId,
      stage: feedback.stage,
      intensity: cue.intensity,
      semanticGuard: cue.semanticGuard,
    });
    const visual = cue.visualCue
      ? deliveryStatus(renderVisual, deepFreeze({
          ...deliveryContext,
          visualCue: cue.visualCue,
          motionProfile: cue.motionProfile,
        }))
      : 'DISABLED';
    const audio = cue.formalSfxKey
      ? deliveryStatus(playFormalSfx, cue.formalSfxKey, deliveryContext)
      : 'DISABLED';
    const haptic = cue.hapticClass
      ? deliveryStatus(emitHaptic, cue.hapticClass, deliveryContext)
      : 'DISABLED';

    return deepFreeze({
      ...projected,
      delivery: {
        sequence,
        duplicateSuppressed: false,
        visual,
        audio,
        haptic,
      },
    });
  }

  return Object.freeze({
    schema: SCHEMA,
    publish,
    getSequence: () => sequence,
    hasPresented: (receiptId, stage) => {
      const receipt = requiredText(receiptId);
      const normalizedStage = requiredText(stage);
      if (!receipt || !normalizedStage) return false;
      return seen.has(`${receipt}::${normalizedStage}`);
    },
  });
}

export const BATTLE_INTERACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT = Object.freeze({
  schema: SCHEMA,
  confirmedEventRequired: true,
  stableReceiptIdRequired: true,
  exactlyOncePerReceiptStageForAdapterLifetime: true,
  authoritativeAcceptanceDelegatedToCueCore: true,
  semanticGuardExactMatchRequired: true,
  rejectedEventOwned: false,
  rejectReasonPresentationOwned: false,
  soundAssetRegistryOwned: false,
  numericHapticTimingOwned: false,
  browserHapticApiOwned: false,
  gameplayAuthority: false,
  resultAuthority: false,
  legalityAuthority: false,
  targetAuthority: false,
  receiptAuthority: false,
  gameStateWrite: false,
  blocksInput: false,
});

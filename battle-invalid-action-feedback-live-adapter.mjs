import { projectBattleInteractionFeedbackCue } from './battle-interaction-feedback-cue-core.mjs';

const SCHEMA = 'gameroad.battle-invalid-action-feedback-live-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function fail(reason) {
  return deepFreeze({ ok: false, reason, feedback: null });
}

function viewerSafeReasonOf(rejection) {
  if (!rejection || typeof rejection !== 'object' || Array.isArray(rejection)) return null;
  if (rejection.rejected !== true) return null;
  if (rejection.viewerSafe !== true) return null;
  if (typeof rejection.viewerSafeReason !== 'string') return null;
  const text = rejection.viewerSafeReason.trim();
  return text === '' ? null : text;
}

export function projectBattleInvalidActionFeedback(rejection, {
  audioEnabled = true,
  hapticsEnabled = true,
  visualEnabled = true,
  reducedMotion = false,
  lowPerformance = false,
} = {}) {
  if (!rejection || typeof rejection !== 'object' || Array.isArray(rejection)) {
    return fail('REJECTION_REQUIRED');
  }
  if (rejection.rejected !== true) return fail('REJECTION_NOT_CONFIRMED');
  if (rejection.viewerSafe !== true) return fail('VIEWER_SAFE_ASSERTION_REQUIRED');

  const reasonText = viewerSafeReasonOf(rejection);
  if (!reasonText) return fail('VIEWER_SAFE_REASON_REQUIRED');

  // Reuse the existing accepted-input acknowledgement for the physical tap/click.
  // The rejection meaning itself remains text + failed visual state; this adapter does
  // not invent a second legality authority or a new SFX/haptic vocabulary.
  const acknowledgement = projectBattleInteractionFeedbackCue('INPUT_ACCEPTED', {
    audioEnabled,
    hapticsEnabled,
    visualEnabled,
    reducedMotion,
    lowPerformance,
  });
  if (!acknowledgement.ok) return fail('INPUT_ACKNOWLEDGEMENT_UNAVAILABLE');

  return deepFreeze({
    ok: true,
    reason: 'INVALID_ACTION_FEEDBACK_PROJECTED',
    feedback: {
      schema: SCHEMA,
      kind: 'INVALID_ACTION',
      reasonText,
      ariaLive: 'polite',
      visual: {
        state: 'failed',
        cue: visualEnabled ? 'REJECTED' : null,
        motionProfile: acknowledgement.cue.motionProfile,
      },
      inputAcknowledgement: {
        stage: acknowledgement.cue.stage,
        formalSfxKey: acknowledgement.cue.formalSfxKey,
        hapticClass: acknowledgement.cue.hapticClass,
      },
      blocksInput: false,
      gameStateWrite: false,
      gameplayAuthority: false,
      legalityAuthority: false,
      resultAuthority: false,
      targetAuthority: false,
      reasonAuthority: false,
      browserHapticApiOwned: false,
      transientLifetimeOwned: false,
    },
  });
}

function deliveryStatus(callback, payload) {
  if (typeof callback !== 'function') return 'UNAVAILABLE';
  try {
    callback(payload);
    return 'DELIVERED';
  } catch {
    return 'FAILED_SOFT';
  }
}

export function createBattleInvalidActionFeedbackLiveAdapter({
  render,
  playFormalSfx,
  emitHaptic,
} = {}) {
  if (typeof render !== 'function') throw new Error('render callback is required');

  let sequence = 0;

  function publish(rejection, options = {}) {
    const projected = projectBattleInvalidActionFeedback(rejection, options);
    if (!projected.ok) return projected;

    sequence += 1;
    const feedback = projected.feedback;
    const visualDelivery = deliveryStatus(render, deepFreeze({
      schema: feedback.schema,
      sequence,
      kind: feedback.kind,
      reasonText: feedback.reasonText,
      ariaLive: feedback.ariaLive,
      visual: feedback.visual,
    }));
    const audioDelivery = feedback.inputAcknowledgement.formalSfxKey
      ? deliveryStatus(playFormalSfx, feedback.inputAcknowledgement.formalSfxKey)
      : 'DISABLED';
    const hapticDelivery = feedback.inputAcknowledgement.hapticClass
      ? deliveryStatus(emitHaptic, feedback.inputAcknowledgement.hapticClass)
      : 'DISABLED';

    return deepFreeze({
      ...projected,
      delivery: {
        sequence,
        visual: visualDelivery,
        audio: audioDelivery,
        haptic: hapticDelivery,
      },
    });
  }

  return Object.freeze({
    schema: SCHEMA,
    publish,
    getSequence: () => sequence,
  });
}

export const BATTLE_INVALID_ACTION_FEEDBACK_LIVE_ADAPTER_CONTRACT = Object.freeze({
  schema: SCHEMA,
  canonicalReasonRequired: true,
  viewerSafeAssertionRequired: true,
  reasonInference: false,
  reusesExistingInputAcknowledgementCue: true,
  createsNewSfxVocabulary: false,
  createsNewHapticVocabulary: false,
  browserHapticApiOwned: false,
  gameplayAuthority: false,
  legalityAuthority: false,
  reasonAuthority: false,
  gameStateWrite: false,
  blocksInput: false,
  transientLifetimeOwned: false,
});

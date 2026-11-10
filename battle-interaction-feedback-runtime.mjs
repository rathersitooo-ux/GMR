import { projectBattleInteractionFeedbackCue } from './battle-interaction-feedback-cue-core.mjs';

const SCHEMA = 'gameroad.battle-interaction-feedback-runtime.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactFeedbackId(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > 160) return null;
  return token;
}

function fail(reason) {
  return deepFreeze({
    ok: false,
    reason,
    cue: null,
    feedbackId: null,
    duplicate: false,
    delivery: null,
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

function duplicateDelivery(sequence) {
  return deepFreeze({
    sequence,
    visual: 'SKIPPED_DUPLICATE',
    audio: 'SKIPPED_DUPLICATE',
    haptic: 'SKIPPED_DUPLICATE',
  });
}

export function createBattleInteractionFeedbackRuntime({
  renderVisual = null,
  playFormalSfx = null,
  emitHaptic = null,
} = {}) {
  for (const [name, callback] of Object.entries({ renderVisual, playFormalSfx, emitHaptic })) {
    if (callback !== null && typeof callback !== 'function') {
      throw new TypeError(`${name} must be a function or null`);
    }
  }

  const consumed = new Set();
  let sequence = 0;
  let destroyed = false;

  function publish(stage, {
    feedbackId,
    authoritativeAccepted = false,
    audioEnabled = true,
    hapticsEnabled = true,
    visualEnabled = true,
    reducedMotion = false,
    lowPerformance = false,
  } = {}) {
    if (destroyed) return fail('RUNTIME_DESTROYED');

    const id = exactFeedbackId(feedbackId);
    if (!id) return fail('FEEDBACK_ID_REQUIRED');

    const projected = projectBattleInteractionFeedbackCue(stage, {
      authoritativeAccepted,
      audioEnabled,
      hapticsEnabled,
      visualEnabled,
      reducedMotion,
      lowPerformance,
    });
    if (!projected?.ok || !projected.cue) {
      return deepFreeze({
        ...projected,
        feedbackId: id,
        duplicate: false,
        delivery: null,
      });
    }

    const dedupeKey = `${stage}\u0000${id}`;
    if (consumed.has(dedupeKey)) {
      return deepFreeze({
        ...projected,
        reason: 'DUPLICATE_FEEDBACK_IGNORED',
        feedbackId: id,
        duplicate: true,
        delivery: duplicateDelivery(sequence),
      });
    }

    // Reserve before invoking presentation callbacks so re-entrant rendering/audio
    // cannot replay the same accepted event. Runtime lifetime remains caller-owned.
    consumed.add(dedupeKey);
    sequence += 1;

    const cue = projected.cue;
    const visual = cue.visualCue
      ? deliveryStatus(renderVisual, deepFreeze({
          schema: SCHEMA,
          sequence,
          feedbackId: id,
          stage: cue.stage,
          visualCue: cue.visualCue,
          intensity: cue.intensity,
          motionProfile: cue.motionProfile,
          semanticGuard: cue.semanticGuard,
          presentationOnly: true,
          gameStateWrite: false,
        }))
      : 'DISABLED';
    const audio = cue.formalSfxKey
      ? deliveryStatus(playFormalSfx, cue.formalSfxKey)
      : 'DISABLED';
    const haptic = cue.hapticClass
      ? deliveryStatus(emitHaptic, cue.hapticClass)
      : 'DISABLED';

    return deepFreeze({
      ...projected,
      feedbackId: id,
      duplicate: false,
      delivery: {
        sequence,
        visual,
        audio,
        haptic,
      },
    });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    consumed.clear();
    return true;
  }

  return Object.freeze({
    schema: SCHEMA,
    publish,
    destroy,
    getSequence: () => sequence,
    isDestroyed: () => destroyed,
  });
}

export const BATTLE_INTERACTION_FEEDBACK_RUNTIME_CONTRACT = Object.freeze({
  schema: SCHEMA,
  reusesExistingCueProjection: true,
  requiresCallerFeedbackId: true,
  duplicateKey: 'stage+feedbackId',
  formalSfxKeyPassThroughOnly: true,
  createsNewSfxVocabulary: false,
  createsNewHapticVocabulary: false,
  numericHapticTimingOwned: false,
  browserHapticApiOwned: false,
  visualLifetimeOwned: false,
  gameplayAuthority: false,
  legalityAuthority: false,
  targetAuthority: false,
  resultAuthority: false,
  gameStateWrite: false,
  blocksInput: false,
});

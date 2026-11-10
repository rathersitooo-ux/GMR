const FEEDBACK_SCHEMA = 'gameroad.battle-interaction-feedback-cue.v1';

const FORMAL_SFX_KEYS = Object.freeze({
  CLICK: 'click',
  CARD_SLIDE: 'cardSlide',
  CARD_PLACE: 'cardPlace',
});

const HAPTIC_CLASSES = Object.freeze({
  TAP: 'TAP',
  COMMIT: 'COMMIT',
  RESOLVE: 'RESOLVE',
});

const STAGE_SPECS = Object.freeze({
  INPUT_ACCEPTED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CLICK,
    hapticClass: HAPTIC_CLASSES.TAP,
    visualCue: 'ACK',
    intensity: 'SUBTLE',
  }),
  FOCUS_ACCEPTED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CLICK,
    hapticClass: HAPTIC_CLASSES.TAP,
    visualCue: 'FOCUS',
    intensity: 'SUBTLE',
  }),
  STAGED_SELECTION: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_SLIDE,
    hapticClass: HAPTIC_CLASSES.TAP,
    visualCue: 'STAGED',
    intensity: 'MEDIUM',
  }),
  PRECOMMIT_CANCELLED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CLICK,
    hapticClass: HAPTIC_CLASSES.TAP,
    visualCue: 'CLEAR_STAGED',
    intensity: 'SUBTLE',
  }),
  COMMIT_ACCEPTED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_PLACE,
    hapticClass: HAPTIC_CLASSES.COMMIT,
    visualCue: 'COMMITTED',
    intensity: 'STRONG',
    authoritativeAcceptanceRequired: true,
  }),
  PUBLIC_REVEAL: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_SLIDE,
    hapticClass: null,
    visualCue: 'PUBLIC',
    intensity: 'MEDIUM',
  }),
  RESOLUTION_STEP: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CLICK,
    hapticClass: null,
    visualCue: 'RESOLUTION_STEP',
    intensity: 'MEDIUM',
  }),
  BOARD_RETURN_ACCEPTED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_PLACE,
    hapticClass: HAPTIC_CLASSES.RESOLVE,
    visualCue: 'BOARD_RETURN',
    intensity: 'STRONG',
    authoritativeAcceptanceRequired: true,
  }),
  GOAL_PATH_OPENED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_PLACE,
    hapticClass: HAPTIC_CLASSES.RESOLVE,
    visualCue: 'GOAL_PATH_OPEN',
    intensity: 'STRONG',
    authoritativeAcceptanceRequired: true,
    semanticGuard: 'NONTERMINAL_PATH_OPEN',
  }),
  GOAL_REACHED_ACCEPTED: Object.freeze({
    formalSfxKey: FORMAL_SFX_KEYS.CARD_PLACE,
    hapticClass: HAPTIC_CLASSES.RESOLVE,
    visualCue: 'GOAL_REACHED',
    intensity: 'STRONG',
    authoritativeAcceptanceRequired: true,
    semanticGuard: 'AUTHORITATIVE_GOAL_EVENT_ONLY',
  }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function motionProfile({ visualEnabled, reducedMotion, lowPerformance }) {
  if (!visualEnabled) return 'NONE';
  if (reducedMotion && lowPerformance) return 'REDUCED_LOW_PERF';
  if (reducedMotion) return 'REDUCED';
  if (lowPerformance) return 'LOW_PERF';
  return 'NORMAL';
}

export function projectBattleInteractionFeedbackCue(stage, {
  authoritativeAccepted = false,
  audioEnabled = true,
  hapticsEnabled = true,
  visualEnabled = true,
  reducedMotion = false,
  lowPerformance = false,
} = {}) {
  const spec = STAGE_SPECS[stage];
  if (!spec) {
    return deepFreeze({ ok: false, reason: 'UNSUPPORTED_PRESENTATION_STAGE', cue: null });
  }

  if (spec.authoritativeAcceptanceRequired && authoritativeAccepted !== true) {
    return deepFreeze({ ok: false, reason: 'AUTHORITATIVE_ACCEPTANCE_REQUIRED', cue: null });
  }

  return deepFreeze({
    ok: true,
    reason: 'FEEDBACK_CUE_PROJECTED',
    cue: {
      schema: FEEDBACK_SCHEMA,
      stage,
      formalSfxKey: audioEnabled ? spec.formalSfxKey : null,
      hapticClass: hapticsEnabled ? spec.hapticClass : null,
      visualCue: visualEnabled ? spec.visualCue : null,
      intensity: spec.intensity,
      motionProfile: motionProfile({ visualEnabled, reducedMotion, lowPerformance }),
      semanticGuard: spec.semanticGuard ?? null,
      blocksInput: false,
      gameStateWrite: false,
      gameplayAuthority: false,
      resultAuthority: false,
      legalityAuthority: false,
      targetAuthority: false,
      randomizedCue: false,
      probabilityCue: false,
      numericHapticTimingOwned: false,
    },
  });
}

export const BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT = Object.freeze({
  schema: FEEDBACK_SCHEMA,
  formalSfxKeys: FORMAL_SFX_KEYS,
  hapticClasses: HAPTIC_CLASSES,
  supportedStages: Object.freeze(Object.keys(STAGE_SPECS)),
  soundAssetRegistryOwned: false,
  numericHapticTimingOwned: false,
  browserHapticApiOwned: false,
  gameplayAuthority: false,
  gameStateWrite: false,
  resultAuthority: false,
  targetAuthority: false,
  legalityAuthority: false,
  randomization: false,
  probabilityOrExpectationSignaling: false,
  blocksInput: false,
  liveRuntimeWiringIncluded: false,
});

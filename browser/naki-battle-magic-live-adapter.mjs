import {
  createNakiBattleMagicMotionController,
  NAKI_BATTLE_MAGIC_MOTION_RUNTIME,
} from './naki-battle-magic-motion-core.mjs';

function exactNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function isExactNakiBattleCharacterMatch(characterId, nakiCharacterId) {
  const character = exactNonEmptyString(characterId);
  const naki = exactNonEmptyString(nakiCharacterId);
  return Boolean(character && naki && character === naki);
}

const SOURCE_CAUSAL_STATE = Object.freeze({
  stance: 'IDLE_HEART_MOON',
  anticipation: 'MIC_SPELLCAST',
  release_attack: 'SLASH_TURN',
  release_ability: 'HEART_RELEASE',
  impact: 'IMPACT_HEART',
  reaction: 'IDLE_HEART_MOON',
  return: 'IDLE_HEART_MOON',
  static: 'IDLE_HEART_MOON',
});

const TARGET_CAUSAL_STATE = Object.freeze({
  stance: 'IDLE_HEART_MOON',
  anticipation: 'IDLE_HEART_MOON',
  release: 'IDLE_HEART_MOON',
  impact: 'IDLE_HEART_MOON',
  reaction: 'HIT_RECOIL',
  return: 'IDLE_HEART_MOON',
  static: 'IDLE_HEART_MOON',
});

export function resolveNakiBattleMagicCausalState({
  causalPhase = 'stance',
  role = 'source',
  actionPhase = 'attack',
} = {}) {
  const normalizedCausalPhase = typeof causalPhase === 'string' ? causalPhase : 'stance';
  if (role === 'target') {
    return TARGET_CAUSAL_STATE[normalizedCausalPhase] ?? 'IDLE_HEART_MOON';
  }
  if (normalizedCausalPhase === 'release') {
    return actionPhase === 'ability'
      ? SOURCE_CAUSAL_STATE.release_ability
      : SOURCE_CAUSAL_STATE.release_attack;
  }
  return SOURCE_CAUSAL_STATE[normalizedCausalPhase] ?? 'IDLE_HEART_MOON';
}

export function createNakiBattleMagicLiveAdapter({
  doc,
  host,
  characterHost = null,
  characterId = null,
  nakiCharacterId = null,
  role = 'source',
  motion = 'normal',
  phase = 'idle',
  transition = 'CONTINUE',
  motionState = null,
  setTimeoutFn = null,
  clearTimeoutFn = null,
  createMotionController = createNakiBattleMagicMotionController,
} = {}) {
  if (!isExactNakiBattleCharacterMatch(characterId, nakiCharacterId)) return null;
  if (typeof createMotionController !== 'function') return null;

  const controller = createMotionController({
    doc,
    host,
    characterHost,
    characterIdentityVerified: true,
    role,
    motion,
    phase,
    transition,
    motionState,
    setTimeoutFn,
    clearTimeoutFn,
  });
  if (!controller) return null;

  if (host?.dataset) {
    host.dataset.nakiBattleLiveAdapter = 'true';
    host.dataset.nakiBattleCharacterId = characterId;
    host.dataset.nakiBattleLiveAuthority = 'presentation-only';
  }

  const applyCausalPhase = (input = {}) => {
    if (typeof controller.setState !== 'function') return null;
    const causalRole = input.role ?? role;
    const actionPhase = input.actionPhase ?? phase;
    const motionStateForPhase = resolveNakiBattleMagicCausalState({
      causalPhase: input.causalPhase,
      role: causalRole,
      actionPhase,
    });
    return controller.setState({
      role: causalRole,
      phase: actionPhase,
      motionState: motionStateForPhase,
    });
  };

  const clearAdapterData = () => {
    if (!host?.dataset) return;
    delete host.dataset.nakiBattleLiveAdapter;
    delete host.dataset.nakiBattleCharacterId;
    delete host.dataset.nakiBattleLiveAuthority;
  };

  const destroy = () => {
    try {
      if (typeof controller.destroy === 'function') controller.destroy();
      else if (typeof controller.clear === 'function') controller.clear();
    } finally {
      clearAdapterData();
    }
  };

  const clear = () => {
    try {
      if (typeof controller.clear === 'function') controller.clear();
      else if (typeof controller.destroy === 'function') controller.destroy();
    } finally {
      clearAdapterData();
    }
  };

  return Object.freeze({
    setState: typeof controller.setState === 'function'
      ? (input = {}) => controller.setState(input)
      : undefined,
    playSequence: typeof controller.playSequence === 'function'
      ? (input = {}) => controller.playSequence(input)
      : undefined,
    applyCausalPhase,
    snapshot: typeof controller.snapshot === 'function'
      ? () => Object.freeze({
          ...controller.snapshot(),
          characterId,
          nakiCharacterId,
          identityVerified: true,
          presentationOnly: true,
        })
      : () => Object.freeze({
          characterId,
          nakiCharacterId,
          identityVerified: true,
          presentationOnly: true,
        }),
    clear,
    destroy,
  });
}

export const NAKI_BATTLE_MAGIC_LIVE_ADAPTER_RUNTIME = Object.freeze({
  schema: 'gameroad.naki-battle-magic-live-adapter.v1',
  identityPolicy: 'CALLER_EXPLICIT_EXACT_CHARACTER_ID_MATCH_ONLY',
  identityInference: false,
  trimsOrNormalizesIdentity: false,
  presentationOnly: true,
  gameplayAuthority: false,
  boardAuthority: false,
  saveAuthority: false,
  networkAuthority: false,
  saasunaMotionReuse: false,
  motionRuntime: NAKI_BATTLE_MAGIC_MOTION_RUNTIME.schema,
  causalTimelineCompatible: true,
  causalPhaseOrder: Object.freeze(['stance', 'anticipation', 'release', 'impact', 'reaction', 'return']),
  passthrough: Object.freeze([
    'role',
    'motion',
    'phase',
    'transition',
    'motionState',
    'setTimeoutFn',
    'clearTimeoutFn',
  ]),
});

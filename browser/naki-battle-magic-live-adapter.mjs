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

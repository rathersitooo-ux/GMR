import { BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT } from './battle-interaction-feedback-cue-core.mjs';

const SCHEMA = 'gameroad.battle-formal-sfx-provider.v1';
const FORMAL_KEYS = BATTLE_INTERACTION_FEEDBACK_CUE_CONTRACT.formalSfxKeys;

const ASSETS = Object.freeze({
  [FORMAL_KEYS.CLICK]: Object.freeze({
    formalSfxKey: FORMAL_KEYS.CLICK,
    publicPath: './click_002.ogg',
    sourcePath: 'assets/audio/sfx/click_002.ogg',
  }),
  [FORMAL_KEYS.CARD_SLIDE]: Object.freeze({
    formalSfxKey: FORMAL_KEYS.CARD_SLIDE,
    publicPath: './cardSlide6.ogg',
    sourcePath: 'assets/audio/sfx/cardSlide6.ogg',
  }),
  [FORMAL_KEYS.CARD_PLACE]: Object.freeze({
    formalSfxKey: FORMAL_KEYS.CARD_PLACE,
    publicPath: './cardPlace1.ogg',
    sourcePath: 'assets/audio/sfx/cardPlace1.ogg',
  }),
});

function exactKey(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    ? value
    : null;
}

export function resolveBattleFormalSfxAsset(formalSfxKey) {
  const key = exactKey(formalSfxKey);
  if (!key) return null;
  return ASSETS[key] ?? null;
}

export function createBattleFormalSfxProvider({ playAsset } = {}) {
  if (typeof playAsset !== 'function') {
    throw new TypeError('playAsset must be a function owned by the existing audio runtime');
  }

  function playFormalSfx(formalSfxKey) {
    const asset = resolveBattleFormalSfxAsset(formalSfxKey);
    if (!asset) throw new RangeError('BATTLE_FORMAL_SFX_KEY_UNMAPPED');

    return playAsset(asset.publicPath, Object.freeze({
      schema: SCHEMA,
      formalSfxKey: asset.formalSfxKey,
      sourcePath: asset.sourcePath,
      formalAsset: true,
      presentationOnly: true,
      gameStateWrite: false,
      settingsAuthority: false,
      playbackAuthority: false,
    }));
  }

  return Object.freeze({
    schema: SCHEMA,
    playFormalSfx,
    resolve: resolveBattleFormalSfxAsset,
  });
}

export const BATTLE_FORMAL_SFX_ASSETS = ASSETS;

export const BATTLE_FORMAL_SFX_PROVIDER_CONTRACT = Object.freeze({
  schema: SCHEMA,
  acceptedFormalKeys: Object.freeze(Object.keys(ASSETS)),
  assetRoutingOnly: true,
  publicPackagePaths: true,
  createsNewSfxVocabulary: false,
  audioSettingsAuthority: false,
  playbackAuthority: false,
  muteAuthority: false,
  volumeAuthority: false,
  gameplayAuthority: false,
  resultAuthority: false,
  legalityAuthority: false,
  targetAuthority: false,
  gameStateWrite: false,
  requiresInjectedAssetPlayer: true,
});

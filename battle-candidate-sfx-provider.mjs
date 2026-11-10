// 対戦の候補効果音の置き場所（正式ではない）。
// 正式な効果音は battle-formal-sfx-provider.mjs の3つ（click・cardSlide・
// cardPlace）だけで、ここはそれを置き換えない。ここにあるのは、
// tools/sfx-synth/generate_candidate_sfx.py で手元合成した候補音
// （出どころは assets/audio/sfx/candidate/SOURCES.md）。
// 人の受理が済むまでは候補のまま。再生そのものは呼び出し側が渡す
// playAsset にまかせ、この部品は音量・消音・設定の権限を持たない。
// 対戦の状態・勝敗・合法性は変えない（表示だけ）。
const SCHEMA = 'gameroad.battle-candidate-sfx-provider.v1';

export const BATTLE_CANDIDATE_SFX_KEYS = Object.freeze({
  BATTLE_START: 'battleStart',
  TURN_START: 'turnStart',
  CARD_REVEAL: 'cardReveal',
  ATTACK: 'attack',
  DAMAGE: 'damage',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  GOAL_OPEN: 'goalOpen',
  INVALID: 'invalid',
});

const KEYS = BATTLE_CANDIDATE_SFX_KEYS;

const ASSETS = Object.freeze({
  [KEYS.BATTLE_START]: Object.freeze({
    candidateSfxKey: KEYS.BATTLE_START,
    publicPath: './battleStart.ogg',
    sourcePath: 'assets/audio/sfx/candidate/battleStart.ogg',
    baseVolume: 0.9,
    durationMs: 1400,
    label: '対戦開始（BATTLE STARTの題0.6秒＋入り0.8秒に合わせた候補）',
  }),
  [KEYS.TURN_START]: Object.freeze({
    candidateSfxKey: KEYS.TURN_START,
    publicPath: './turnStart.ogg',
    sourcePath: 'assets/audio/sfx/candidate/turnStart.ogg',
    baseVolume: 0.6,
    durationMs: 350,
    label: '巡の開始',
  }),
  [KEYS.CARD_REVEAL]: Object.freeze({
    candidateSfxKey: KEYS.CARD_REVEAL,
    publicPath: './cardReveal.ogg',
    sourcePath: 'assets/audio/sfx/candidate/cardReveal.ogg',
    baseVolume: 0.7,
    durationMs: 450,
    label: 'カードの公開',
  }),
  [KEYS.ATTACK]: Object.freeze({
    candidateSfxKey: KEYS.ATTACK,
    publicPath: './attack.ogg',
    sourcePath: 'assets/audio/sfx/candidate/attack.ogg',
    baseVolume: 0.9,
    durationMs: 400,
    label: '攻撃',
  }),
  [KEYS.DAMAGE]: Object.freeze({
    candidateSfxKey: KEYS.DAMAGE,
    publicPath: './damage.ogg',
    sourcePath: 'assets/audio/sfx/candidate/damage.ogg',
    baseVolume: 0.85,
    durationMs: 350,
    label: '当たったとき',
  }),
  [KEYS.VICTORY]: Object.freeze({
    candidateSfxKey: KEYS.VICTORY,
    publicPath: './victory.ogg',
    sourcePath: 'assets/audio/sfx/candidate/victory.ogg',
    baseVolume: 0.85,
    durationMs: 1200,
    label: '勝利',
  }),
  [KEYS.DEFEAT]: Object.freeze({
    candidateSfxKey: KEYS.DEFEAT,
    publicPath: './defeat.ogg',
    sourcePath: 'assets/audio/sfx/candidate/defeat.ogg',
    baseVolume: 0.6,
    durationMs: 800,
    label: '敗北',
  }),
  [KEYS.GOAL_OPEN]: Object.freeze({
    candidateSfxKey: KEYS.GOAL_OPEN,
    publicPath: './goalOpen.ogg',
    sourcePath: 'assets/audio/sfx/candidate/goalOpen.ogg',
    baseVolume: 0.8,
    durationMs: 1000,
    label: 'ゲート解放・ゴール到達',
  }),
  [KEYS.INVALID]: Object.freeze({
    candidateSfxKey: KEYS.INVALID,
    publicPath: './invalid.ogg',
    sourcePath: 'assets/audio/sfx/candidate/invalid.ogg',
    baseVolume: 0.5,
    durationMs: 250,
    label: 'できない操作',
  }),
});

// 対戦の出来事と候補音の対応（仮置き。正式な対応付けは受理のときに決める）。
// すでにある正式3音が担う出来事（入力・カードを滑らせる・カードを置く＝決定）には
// 候補を重ねない。
export const BATTLE_CANDIDATE_SFX_EVENT_MAP = Object.freeze({
  BATTLE_START: KEYS.BATTLE_START,
  TURN_START: KEYS.TURN_START,
  PUBLIC_REVEAL: KEYS.CARD_REVEAL,
  ATTACK_RELEASE: KEYS.ATTACK,
  DAMAGE_APPLIED: KEYS.DAMAGE,
  MATCH_VICTORY: KEYS.VICTORY,
  MATCH_DEFEAT: KEYS.DEFEAT,
  GATE_OPENED: KEYS.GOAL_OPEN,
  GOAL_REACHED: KEYS.GOAL_OPEN,
  INVALID_ACTION: KEYS.INVALID,
});

function exactKey(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    ? value
    : null;
}

export function resolveBattleCandidateSfxAsset(candidateSfxKey) {
  const key = exactKey(candidateSfxKey);
  if (!key) return null;
  return ASSETS[key] ?? null;
}

export function resolveBattleCandidateSfxKeyForEvent(event) {
  const key = exactKey(event);
  if (!key) return null;
  return BATTLE_CANDIDATE_SFX_EVENT_MAP[key] ?? null;
}

export function createBattleCandidateSfxProvider({ playAsset } = {}) {
  if (typeof playAsset !== 'function') {
    throw new TypeError('playAsset must be a function owned by the existing audio runtime');
  }

  function playCandidateSfx(candidateSfxKey) {
    const asset = resolveBattleCandidateSfxAsset(candidateSfxKey);
    if (!asset) throw new RangeError('BATTLE_CANDIDATE_SFX_KEY_UNMAPPED');

    return playAsset(asset.publicPath, Object.freeze({
      schema: SCHEMA,
      candidateSfxKey: asset.candidateSfxKey,
      sourcePath: asset.sourcePath,
      baseVolume: asset.baseVolume,
      formalAsset: false,
      candidateAsset: true,
      humanAcceptance: '未確認',
      presentationOnly: true,
      gameStateWrite: false,
      settingsAuthority: false,
      playbackAuthority: false,
    }));
  }

  function playCandidateEvent(event) {
    const key = resolveBattleCandidateSfxKeyForEvent(event);
    if (!key) throw new RangeError('BATTLE_CANDIDATE_SFX_EVENT_UNMAPPED');
    return playCandidateSfx(key);
  }

  return Object.freeze({
    schema: SCHEMA,
    playCandidateSfx,
    playCandidateEvent,
    resolve: resolveBattleCandidateSfxAsset,
    resolveEvent: resolveBattleCandidateSfxKeyForEvent,
  });
}

export const BATTLE_CANDIDATE_SFX_ASSETS = ASSETS;

export const BATTLE_CANDIDATE_SFX_PROVIDER_CONTRACT = Object.freeze({
  schema: SCHEMA,
  candidateKeys: Object.freeze(Object.keys(ASSETS)),
  candidateEvents: Object.freeze(Object.keys(BATTLE_CANDIDATE_SFX_EVENT_MAP)),
  formalAsset: false,
  candidateAsset: true,
  humanAcceptance: '未確認',
  replacesFormalProvider: false,
  formalKeysOwnedElsewhere: Object.freeze(['click', 'cardSlide', 'cardPlace']),
  assetRoutingOnly: true,
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

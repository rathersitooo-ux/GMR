export const TUTORIAL_EXPERIENCE_PROFILE_SCHEMA = 'gameroad.tutorial-experience-profile.v1';
export const TUTORIAL_EXPERIENCE_HELP_SCHEMA = 'gameroad.tutorial-experience-help.v1';
export const TUTORIAL_EXPERIENCE_PROMPT_SCHEMA = 'gameroad.tutorial-experience-prompt.v1';

const AUDIENCE_BEGINNER = 'beginner';
const AUDIENCE_EXPERIENCED = 'experienced';
const TRANSLATION_BEGINNER = 'plain-beginner';
const TRANSLATION_SOURCE_GAME = 'source-game-bridge';
const TRANSLATION_GENERAL_EXPERIENCED = 'general-experienced';

export const TUTORIAL_EXPERIENCE_AUDIENCES = Object.freeze([
  Object.freeze({ id: AUDIENCE_BEGINNER, label: 'カードゲーム初心者' }),
  Object.freeze({ id: AUDIENCE_EXPERIENCED, label: 'カードゲーム経験者' }),
]);

export const TUTORIAL_EXPERIENCE_SOURCE_GAMES = Object.freeze([
  Object.freeze({
    id: 'shadowverse',
    label: 'シャドウバース／シャドウバース ワールズビヨンド',
    bridge: 'シャドウバースで「このターンに何を使うか」を決める感覚は使える',
    difference: 'ただしPPやフォロワーをそのまま置き換える操作ではなく、GAMEROADではロードとバトルを別に決める',
  }),
  Object.freeze({
    id: 'master-duel',
    label: '遊戯王 マスターデュエル',
    bridge: '遊戯王で役割の違うカードを見分ける感覚は使える',
    difference: 'ただし召喚・魔法・罠のどれかと1対1対応する操作ではない',
  }),
  Object.freeze({
    id: 'pokemon-pocket',
    label: 'Pokémon Trading Card Game Pocket（ポケポケ）',
    bridge: 'ポケポケで今の盤面から次の1手を決める感覚は使える',
    difference: 'ただしエネルギーを付ける操作やワザを使う操作の置き換えではない',
  }),
  Object.freeze({
    id: 'mtg-arena',
    label: 'マジック：ザ・ギャザリング アリーナ',
    bridge: 'MTG Arenaで今使うカードと後に残すカードを分けて考える感覚は使える',
    difference: 'ただし土地からマナを得て呪文を使う手順を置き換えたものではない',
  }),
  Object.freeze({
    id: 'hearthstone',
    label: 'ハースストーン',
    bridge: 'ハースストーンで今のターンに使う手段を選ぶ感覚は使える',
    difference: 'ただしマナクリスタルを支払ってカードを使う操作の置き換えではない',
  }),
  Object.freeze({
    id: 'duel-masters-plays',
    label: 'デュエル・マスターズ プレイス',
    bridge: 'デュエプレでカードの役割を分けて見る感覚は使える',
    difference: 'ただしカードをマナゾーンへ置く操作の置き換えではない',
  }),
  Object.freeze({
    id: 'one-piece-card-game',
    label: 'ONE PIECEカードゲーム',
    bridge: 'ONE PIECEカードゲームで今の役割に合わせてカードを選ぶ感覚は使える',
    difference: 'ただしドン!!を付与したり支払ったりする操作の置き換えではない',
  }),
  Object.freeze({
    id: 'marvel-snap',
    label: 'MARVEL SNAP',
    bridge: 'MARVEL SNAPで短い判断単位ごとにカードの置き先を決める感覚は使える',
    difference: 'ただしロケーションへカードを配置する操作の置き換えではない',
  }),
  Object.freeze({
    id: 'other',
    label: 'その他',
    bridge: null,
    difference: null,
  }),
]);

const SOURCE_GAME_BY_ID = new Map(TUTORIAL_EXPERIENCE_SOURCE_GAMES.map((game) => [game.id, game]));
const AUDIENCE_IDS = new Set(TUTORIAL_EXPERIENCE_AUDIENCES.map((audience) => audience.id));

function exactToken(value, maxLength = 160) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > maxLength) return null;
  return token;
}

function profileSnapshot(audience, sourceGameId) {
  const game = sourceGameId ? SOURCE_GAME_BY_ID.get(sourceGameId) || null : null;
  const requiresSourceGame = audience === AUDIENCE_EXPERIENCED && !game;
  const ready = audience === AUDIENCE_BEGINNER || (audience === AUDIENCE_EXPERIENCED && Boolean(game));
  const translationMode = !ready
    ? null
    : audience === AUDIENCE_BEGINNER
      ? TRANSLATION_BEGINNER
      : game?.id === 'other'
        ? TRANSLATION_GENERAL_EXPERIENCED
        : TRANSLATION_SOURCE_GAME;

  return Object.freeze({
    schema: TUTORIAL_EXPERIENCE_PROFILE_SCHEMA,
    audience,
    sourceGameId: game?.id ?? null,
    sourceGameLabel: game?.label ?? null,
    ready,
    requiresSourceGame,
    translationMode,
    persistenceOwned: false,
    tutorialRunOwned: false,
    gameplayAuthorityMutated: false,
  });
}

function normalizedReadyProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const audience = exactToken(value.audience);
  if (!AUDIENCE_IDS.has(audience)) return null;
  const sourceGameId = value.sourceGameId == null ? null : exactToken(value.sourceGameId);
  const profile = profileSnapshot(audience, sourceGameId);
  return profile.ready ? profile : null;
}

function normalizedProfileStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return profileSnapshot(null, null);
  const audience = exactToken(value.audience);
  if (!AUDIENCE_IDS.has(audience)) return profileSnapshot(null, null);
  if (audience === AUDIENCE_BEGINNER) return profileSnapshot(audience, null);
  const sourceGameId = exactToken(value.sourceGameId);
  return profileSnapshot(audience, SOURCE_GAME_BY_ID.has(sourceGameId) ? sourceGameId : null);
}

export function createTutorialExperienceProfileControl({ onChange } = {}) {
  if (onChange !== undefined && typeof onChange !== 'function') {
    throw new TypeError('onChange must be a function when provided');
  }

  let audience = null;
  let sourceGameId = null;
  const changed = () => { if (typeof onChange === 'function') onChange(); };

  return Object.freeze({
    chooseAudience(nextAudience) {
      const next = exactToken(nextAudience);
      if (!AUDIENCE_IDS.has(next)) return false;
      audience = next;
      sourceGameId = null;
      changed();
      return true;
    },
    chooseSourceGame(nextSourceGameId) {
      if (audience !== AUDIENCE_EXPERIENCED) return false;
      const next = exactToken(nextSourceGameId);
      if (!SOURCE_GAME_BY_ID.has(next)) return false;
      sourceGameId = next;
      changed();
      return true;
    },
    reset() {
      audience = null;
      sourceGameId = null;
      changed();
      return true;
    },
    status() {
      return profileSnapshot(audience, sourceGameId);
    },
    profile() {
      const current = profileSnapshot(audience, sourceGameId);
      return current.ready ? current : null;
    },
  });
}

export function projectTutorialExperiencePrompt(experienceStatus = null) {
  const status = normalizedProfileStatus(experienceStatus);
  let stage;
  let question;
  let options;
  let summary = null;

  if (!status.audience) {
    stage = 'audience';
    question = 'カードゲームの経験は？';
    options = TUTORIAL_EXPERIENCE_AUDIENCES;
  } else if (status.audience === AUDIENCE_EXPERIENCED && !status.ready) {
    stage = 'source-game';
    question = '一番慣れているカードゲームは？';
    options = TUTORIAL_EXPERIENCE_SOURCE_GAMES;
  } else {
    stage = 'ready';
    question = null;
    options = Object.freeze([]);
    summary = status.audience === AUDIENCE_BEGINNER
      ? '初心者向けに、操作しながら短く説明します'
      : status.sourceGameId === 'other'
        ? 'カードゲーム経験を前提に、GAMEROAD固有の違いだけ説明します'
        : `${status.sourceGameLabel}との違いを中心に説明します`;
  }

  return Object.freeze({
    schema: TUTORIAL_EXPERIENCE_PROMPT_SCHEMA,
    stage,
    question,
    options,
    summary,
    ready: status.ready,
    canShowContextualHelp: status.ready,
    audience: status.audience,
    sourceGameId: status.sourceGameId,
    sourceGameLabel: status.sourceGameLabel,
    changeAvailable: status.ready,
    presentationOnly: true,
    persistenceOwned: false,
    tutorialRunOwned: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
  });
}

function beginnerSuffix(focusRole) {
  if (focusRole === 'road' || focusRole === 'battle') {
    return 'まずは光っている場所から1枚選べばOK。細かい用語は後で覚えればいい';
  }
  if (focusRole === 'ready') return 'ここでは選んだ2枚だけ確認すればOK';
  return '分からない所だけ、その場でサースナーに聞けばいい';
}

function generalExperiencedSuffix() {
  return 'カードゲーム経験は前提にして進める。ただし別作品のルールへ無理に置き換えず、GAMEROAD固有の違いだけ確認する';
}

export function projectTutorialExperienceHelp({
  canonicalMessage,
  focusRole = null,
  experienceProfile = null,
} = {}) {
  const base = exactToken(canonicalMessage, 320);
  const role = focusRole == null ? null : exactToken(focusRole, 64);
  if (!base) {
    return Object.freeze({
      schema: TUTORIAL_EXPERIENCE_HELP_SCHEMA,
      active: false,
      reason: 'CANONICAL_MESSAGE_REQUIRED',
      canonicalMessage: null,
      message: null,
      focusRole: role,
      adapted: false,
      audience: null,
      sourceGameId: null,
      sourceGameLabel: null,
      presentationOnly: true,
      autoExecute: false,
      saveMutated: false,
      gameplayAuthorityMutated: false,
    });
  }

  const profile = normalizedReadyProfile(experienceProfile);
  if (!profile) {
    return Object.freeze({
      schema: TUTORIAL_EXPERIENCE_HELP_SCHEMA,
      active: true,
      reason: null,
      canonicalMessage: base,
      message: base,
      focusRole: role,
      adapted: false,
      audience: null,
      sourceGameId: null,
      sourceGameLabel: null,
      presentationOnly: true,
      autoExecute: false,
      saveMutated: false,
      gameplayAuthorityMutated: false,
    });
  }

  let suffix;
  if (profile.audience === AUDIENCE_BEGINNER) {
    suffix = beginnerSuffix(role);
  } else if (profile.sourceGameId === 'other') {
    suffix = generalExperiencedSuffix();
  } else {
    const game = SOURCE_GAME_BY_ID.get(profile.sourceGameId);
    suffix = `${game.bridge}。${game.difference}`;
  }

  return Object.freeze({
    schema: TUTORIAL_EXPERIENCE_HELP_SCHEMA,
    active: true,
    reason: null,
    canonicalMessage: base,
    message: `${base}。${suffix}。`,
    focusRole: role,
    adapted: true,
    audience: profile.audience,
    sourceGameId: profile.sourceGameId,
    sourceGameLabel: profile.sourceGameLabel,
    presentationOnly: true,
    autoExecute: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
  });
}

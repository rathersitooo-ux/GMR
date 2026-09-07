export const TUTORIAL_EXPERIENCE_PROFILE_SCHEMA = 'gameroad.tutorial-experience-profile.v1';
export const TUTORIAL_EXPERIENCE_HELP_SCHEMA = 'gameroad.tutorial-experience-help.v1';
export const TUTORIAL_EXPERIENCE_PROMPT_SCHEMA = 'gameroad.tutorial-experience-prompt.v1';
export const TUTORIAL_EXPERIENCE_CONVERSATION_SCHEMA = 'gameroad.tutorial-experience-conversation.v1';
export const TUTORIAL_SHARED_CONTEXT_SCHEMA = 'gameroad.tutorial-shared-context.v1';

const AUDIENCE_BEGINNER = 'beginner';
const AUDIENCE_EXPERIENCED = 'experienced';
const TRANSLATION_BEGINNER = 'plain-beginner';
const TRANSLATION_SOURCE_GAME = 'source-game-bridge';
const TRANSLATION_GENERAL_EXPERIENCED = 'general-experienced';
const RELATIONSHIP_FRAME = 'familiar-peer';

export const TUTORIAL_EXPERIENCE_AUDIENCES = Object.freeze([
  Object.freeze({ id: AUDIENCE_BEGINNER, label: 'カードゲームはほとんどやらない' }),
  Object.freeze({ id: AUDIENCE_EXPERIENCED, label: 'カードゲームをやる' }),
]);

export const TUTORIAL_EXPERIENCE_SOURCE_GAMES = Object.freeze([
  Object.freeze({
    id: 'master-duel',
    label: '遊戯王／マスターデュエル',
    bridge: '遊戯王で役割の違うカードを見分ける感覚は使える',
    difference: 'ただし召喚・魔法・罠のどれかと1対1対応する操作ではない',
  }),
  Object.freeze({
    id: 'duel-masters-plays',
    label: 'デュエル・マスターズ／デュエプレ',
    bridge: 'デュエマでカードの役割や今使う札を分けて見る感覚は使える',
    difference: 'ただしカードをマナゾーンへ置く操作やシールドの仕組みをそのまま置き換えたものではない',
  }),
  Object.freeze({
    id: 'pokemon-pocket',
    label: 'ポケモンカードゲーム／ポケポケ',
    bridge: 'ポケカで今の盤面から次の1手を決める感覚は使える',
    difference: 'ただしエネルギーを付ける操作やワザを使う操作、サイドを取る勝ち方の置き換えではない',
  }),
  Object.freeze({
    id: 'shadowverse',
    label: 'シャドウバース／ワールズビヨンド',
    bridge: 'シャドバで「このターンに何を使うか」を決める感覚は使える',
    difference: 'ただしPPやフォロワーをそのまま置き換える操作ではなく、GAMEROADではロードとバトルを別に決める',
  }),
  Object.freeze({
    id: 'other',
    label: 'その他のカードゲーム',
    bridge: null,
    difference: null,
  }),
]);

export const TUTORIAL_SHARED_INTERESTS = Object.freeze([
  Object.freeze({ id: 'pachinko-slots', label: 'パチンコ／スロット', commonGroundOnly: true }),
  Object.freeze({ id: 'horse-racing', label: '競馬', commonGroundOnly: true }),
  Object.freeze({ id: 'mahjong', label: '麻雀', commonGroundOnly: true }),
  Object.freeze({ id: 'video-games', label: 'ゲーム全般', commonGroundOnly: true }),
  Object.freeze({ id: 'other', label: 'ほかにある', commonGroundOnly: true }),
  Object.freeze({ id: 'none', label: '特にない', commonGroundOnly: true }),
]);

const SOURCE_GAME_BY_ID = new Map(TUTORIAL_EXPERIENCE_SOURCE_GAMES.map((game) => [game.id, game]));
const SHARED_INTEREST_BY_ID = new Map(TUTORIAL_SHARED_INTERESTS.map((interest) => [interest.id, interest]));
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

function sharedContextSnapshot(sharedInterestId) {
  const interest = sharedInterestId ? SHARED_INTEREST_BY_ID.get(sharedInterestId) || null : null;
  return Object.freeze({
    schema: TUTORIAL_SHARED_CONTEXT_SCHEMA,
    sharedInterestId: interest?.id ?? null,
    sharedInterestLabel: interest?.label ?? null,
    commonGroundOnly: Boolean(interest?.commonGroundOnly),
    relationshipFrame: RELATIONSHIP_FRAME,
    relationshipQuestionnaireRequired: false,
    requiredForTutorial: false,
    persistenceOwned: false,
    tutorialRunOwned: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
  });
}

function normalizedSharedContext(value) {
  if (value == null) return sharedContextSnapshot(null);
  if (typeof value === 'string') {
    const id = exactToken(value);
    return sharedContextSnapshot(SHARED_INTEREST_BY_ID.has(id) ? id : null);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sharedContextSnapshot(null);
  const id = exactToken(value.sharedInterestId);
  return sharedContextSnapshot(SHARED_INTEREST_BY_ID.has(id) ? id : null);
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

export function createTutorialSharedContextControl({ onChange } = {}) {
  if (onChange !== undefined && typeof onChange !== 'function') {
    throw new TypeError('onChange must be a function when provided');
  }
  let sharedInterestId = null;
  const changed = () => { if (typeof onChange === 'function') onChange(); };

  return Object.freeze({
    chooseSharedInterest(nextSharedInterestId) {
      const next = exactToken(nextSharedInterestId);
      if (!SHARED_INTEREST_BY_ID.has(next)) return false;
      sharedInterestId = next;
      changed();
      return true;
    },
    clear() {
      sharedInterestId = null;
      changed();
      return true;
    },
    status() {
      return sharedContextSnapshot(sharedInterestId);
    },
  });
}

function conversationOption(id, label) {
  return Object.freeze({ id, label });
}

const CONVERSATION_AUDIENCE_OPTIONS = Object.freeze([
  conversationOption(AUDIENCE_EXPERIENCED, 'やるよ'),
  conversationOption(AUDIENCE_BEGINNER, 'ほとんどやらない'),
]);

export function projectTutorialExperienceConversation({
  experienceStatus = null,
  sharedContext = null,
} = {}) {
  const status = normalizedProfileStatus(experienceStatus);
  const context = normalizedSharedContext(sharedContext);
  let stage;
  let partnerText;
  let options;
  let optional = false;

  if (!status.audience) {
    stage = 'experience-opener';
    partnerText = 'そういえば、カードゲームって普段やる？';
    options = CONVERSATION_AUDIENCE_OPTIONS;
  } else if (status.audience === AUDIENCE_EXPERIENCED && !status.ready) {
    stage = 'source-game-follow-up';
    partnerText = '何やってる？ いちばん話が通じるやつに合わせて説明するよ。';
    options = TUTORIAL_EXPERIENCE_SOURCE_GAMES;
  } else if (status.audience === AUDIENCE_BEGINNER && !context.sharedInterestId) {
    stage = 'common-ground-optional';
    partnerText = 'カードゲームはあんまりなんだ。普段は何やる？ 近い話があればそこから説明できるよ。';
    options = TUTORIAL_SHARED_INTERESTS;
    optional = true;
  } else {
    stage = 'ready';
    options = Object.freeze([]);
    if (status.audience === AUDIENCE_BEGINNER) {
      partnerText = context.sharedInterestLabel && context.sharedInterestId !== 'none'
        ? `${context.sharedInterestLabel}の話なら通じそうだね。無理にカードゲーム用語へ寄せず、触りながら説明するよ。`
        : 'じゃあカードゲーム用語は前提にしないで、触りながら一緒に見ていこ。';
    } else if (status.sourceGameId === 'other') {
      partnerText = 'カードゲームは分かるんだね。作品ごとのルールを決めつけず、GAMEROADで違うところから見ていこ。';
    } else {
      partnerText = `${status.sourceGameLabel}やってるなら話は早いね。似てるところは使って、違うところだけ先に見よ。`;
    }
  }

  return Object.freeze({
    schema: TUTORIAL_EXPERIENCE_CONVERSATION_SCHEMA,
    stage,
    partnerText,
    options,
    optional,
    readyForGameplayExplanation: status.ready,
    canContinueWithoutSharedInterest: status.ready,
    audience: status.audience,
    sourceGameId: status.sourceGameId,
    sourceGameLabel: status.sourceGameLabel,
    sharedInterestId: context.sharedInterestId,
    sharedInterestLabel: context.sharedInterestLabel,
    commonGroundOnly: context.commonGroundOnly,
    relationshipFrame: RELATIONSHIP_FRAME,
    relationshipQuestionnaireRequired: false,
    presentationOnly: true,
    persistenceOwned: false,
    tutorialRunOwned: false,
    saveMutated: false,
    gameplayAuthorityMutated: false,
    autoExecute: false,
  });
}

// Compatibility surface for existing callers. New first-Tutorial presentation should prefer
// projectTutorialExperienceConversation so the same state is expressed as dialogue, not a survey screen.
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

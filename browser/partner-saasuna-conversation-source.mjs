const PARTNER_ID = 'partner.saasuna';
const DIALOGUE_VERSION = 'saasuna.dialogue.current.r1.20260810';
const SOURCE_ID = 'SOURCE-DIALOGUE-SAASUNA-20260810';
const CHARACTER_UTTERANCE = 'character_utterance';

const FALLBACK_LINES = Object.freeze([
  '優秀なんですよ、私。',
  'がっぽり。',
  '大氷結',
  'ゆるしてヒヤシンス',
]);

const PERSONA_GUIDANCE = Object.freeze([
  '冷静で戦略的だが、食べ物や妹の話では平静が崩れることがある。',
  '礼儀と自信を保ち、単なる無機質なクール役にはしない。',
  '人物設定にない事実・親密イベント・ゲーム結果を作らない。',
]);

const BATTLE_UTTERANCES = Object.freeze({
  battle_start: Object.freeze({ candidates: Object.freeze(['ご主人様が心配する事はございません、全て片付けてしまいます']) }),
  initial_hand_intro: Object.freeze({ candidates: Object.freeze(['初手は…']) }),
  duplicate_numbers: Object.freeze({ candidates: Object.freeze(['…ステキ、ポーカーなら勝っていましたわ']) }),
  honey_gained: Object.freeze({ candidates: Object.freeze(['あま…あま…']) }),
  first_turn_start: Object.freeze({ candidates: Object.freeze(['デリート・オーダー。']) }),
  load_submit: Object.freeze({ candidates: Object.freeze(['ロード']) }),
  battle_card_submit: Object.freeze({ candidates: Object.freeze(['バトルカード、セット']) }),
  load_reveal: Object.freeze({ candidates: Object.freeze(['ロード！{カード名}']), requiredFields: Object.freeze(['cardName']) }),
  royal_reveal: Object.freeze({ candidates: Object.freeze(['刻は来た']) }),
  effect_activation: Object.freeze({ candidates: Object.freeze(['{カード名}の効果発動！']), requiredFields: Object.freeze(['cardName']) }),
  delegate_normal: Object.freeze({ candidates: Object.freeze(['かしこまりました']) }),
  game_result_first: Object.freeze({ candidates: Object.freeze(['これにて終演', 'ふう…戦略通り']) }),
  game_result_non_first: Object.freeze({ candidates: Object.freeze(['よくがんばりました、いいこいいこしてあげましょうね']) }),
  attack_side_win: Object.freeze({ candidates: Object.freeze(['お見通しだよ']) }),
  attack_side_loss: Object.freeze({ candidates: Object.freeze(['随分と良いカードをお持ちのようで']) }),
  attack_side_loss_opponent_royal_nonlethal: Object.freeze({ candidates: Object.freeze(['切りましたね？']) }),
  attack_side_loss_opponent_max_lane_unchanged_2p: Object.freeze({ candidates: Object.freeze(['流せた']) }),
  defense_side_nonlethal_loss: Object.freeze({ candidates: Object.freeze(['気は済みましたか？']) }),
  defense_side_win: Object.freeze({ candidates: Object.freeze(['あら、運がお悪い']) }),
});

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function exactToken(value, max = 160) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

function stableIndex(seed, length) {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return length === 0 ? 0 : hash % length;
}

function battleField(value, max = 160) {
  return exactToken(value, max);
}

function renderBattleCandidate(candidate, fields) {
  let text = candidate;
  if (text.includes('{カード名}')) {
    const cardName = battleField(fields.cardName);
    if (!cardName) return null;
    text = text.replaceAll('{カード名}', cardName);
  }
  return text.includes('{') || text.includes('}') ? null : text;
}

export function getSaasunaConversationSource(input = {}) {
  const partnerId = exactToken(input.partnerId ?? PARTNER_ID);
  const dialogueVersion = exactToken(input.dialogueVersion ?? DIALOGUE_VERSION);
  const sourceId = exactToken(input.sourceId ?? SOURCE_ID);
  if (partnerId !== PARTNER_ID || dialogueVersion !== DIALOGUE_VERSION || sourceId !== SOURCE_ID) {
    return null;
  }

  return freezeDeep({
    partnerId: PARTNER_ID,
    dialogueVersion: DIALOGUE_VERSION,
    sourceId: SOURCE_ID,
    sourceState: 'approved_current',
    personaGuidance: [...PERSONA_GUIDANCE],
    approvedFallbackLines: [...FALLBACK_LINES],
    approvedBattleTriggerIds: Object.keys(BATTLE_UTTERANCES),
    battleSpeechAct: CHARACTER_UTTERANCE,
    highIntimacyEnabled: false,
    unresolvedDialogueEnabled: false,
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
  });
}

export function selectSaasunaFallback(seed = 'default') {
  const token = exactToken(seed, 256) ?? 'default';
  return FALLBACK_LINES[stableIndex(token, FALLBACK_LINES.length)];
}

export function selectSaasunaBattleUtterance(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const partnerId = exactToken(input.partnerId);
  const dialogueVersion = exactToken(input.dialogueVersion);
  const sourceId = exactToken(input.sourceId);
  const speechAct = exactToken(input.speechAct);
  const triggerId = exactToken(input.triggerId);
  if (
    partnerId !== PARTNER_ID ||
    dialogueVersion !== DIALOGUE_VERSION ||
    sourceId !== SOURCE_ID ||
    speechAct !== CHARACTER_UTTERANCE ||
    !triggerId
  ) {
    return null;
  }

  const entry = BATTLE_UTTERANCES[triggerId];
  if (!entry) return null;
  const fields = input.fields && typeof input.fields === 'object' && !Array.isArray(input.fields) ? input.fields : {};
  for (const requiredField of entry.requiredFields ?? []) {
    if (!battleField(fields[requiredField])) return null;
  }
  const seed = exactToken(input.seed ?? triggerId, 256) ?? triggerId;
  const candidate = entry.candidates[stableIndex(seed, entry.candidates.length)];
  const text = renderBattleCandidate(candidate, fields);
  if (!text) return null;

  return freezeDeep({
    partnerId: PARTNER_ID,
    dialogueVersion: DIALOGUE_VERSION,
    sourceId: SOURCE_ID,
    speechAct: CHARACTER_UTTERANCE,
    triggerId,
    text,
    sourceState: 'approved_current',
    automaticCanonMutationAllowed: false,
    automaticRelationshipMutationAllowed: false,
    automaticGameMutationAllowed: false,
  });
}

export const SAASUNA_PARTNER_ID = PARTNER_ID;
export const SAASUNA_DIALOGUE_VERSION = DIALOGUE_VERSION;
export const SAASUNA_DIALOGUE_SOURCE_ID = SOURCE_ID;
export const SAASUNA_BATTLE_SPEECH_ACT = CHARACTER_UTTERANCE;

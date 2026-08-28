const PARTNER_ID = 'partner.saasuna';
const DIALOGUE_VERSION = 'saasuna.dialogue.current.r1.20260810';
const SOURCE_ID = 'SOURCE-DIALOGUE-SAASUNA-20260810';

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

export const SAASUNA_PARTNER_ID = PARTNER_ID;
export const SAASUNA_DIALOGUE_VERSION = DIALOGUE_VERSION;
export const SAASUNA_DIALOGUE_SOURCE_ID = SOURCE_ID;

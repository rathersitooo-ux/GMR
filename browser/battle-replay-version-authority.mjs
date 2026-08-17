import { BATTLE_REPLAY_LIVE_ADAPTER } from './battle-replay-live-adapter.mjs';

const CONTENT_VERSION_PREFIX = 'GAMEROAD_CARD_CONTENT_FNV1A64';
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('CONTENT_NON_FINITE_NUMBER');
      return JSON.stringify(value);
    case 'object': {
      const entries = Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
      return `{${entries.join(',')}}`;
    }
    default:
      throw new TypeError('CONTENT_NON_JSON_VALUE');
  }
}

function fnv1a64(text) {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & FNV_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

export function battleReplayRulesVersion(deckRule) {
  if (!deckRule || !nonEmptyString(deckRule.id) || !Number.isSafeInteger(deckRule.revision) || deckRule.revision < 1) {
    throw new TypeError('DECK_RULE_AUTHORITY_INVALID');
  }
  return `${deckRule.id}@${deckRule.revision}`;
}

export function battleReplayContentVersion(cardData) {
  if (!Array.isArray(cardData) || cardData.length === 0) throw new TypeError('CARD_CONTENT_AUTHORITY_INVALID');
  const canonical = canonicalJson(cardData);
  return `${CONTENT_VERSION_PREFIX}:${cardData.length}:${fnv1a64(canonical)}`;
}

export function createBattleReplayVersionAuthority({
  deckRule,
  cardData,
  stateSchema = BATTLE_REPLAY_LIVE_ADAPTER.schema
}) {
  if (!nonEmptyString(stateSchema)) throw new TypeError('STATE_SCHEMA_AUTHORITY_INVALID');
  return Object.freeze({
    rules: battleReplayRulesVersion(deckRule),
    content: battleReplayContentVersion(cardData),
    state: stateSchema
  });
}

export const BATTLE_REPLAY_VERSION_AUTHORITY = Object.freeze({
  contentVersionPrefix: CONTENT_VERSION_PREFIX,
  stateSchema: BATTLE_REPLAY_LIVE_ADAPTER.schema
});

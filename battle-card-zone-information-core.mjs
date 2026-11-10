export const BATTLE_CARD_ZONE_INFORMATION_SCHEMA = 'gameroad.battle.card-zone-information.v1';

const HIDDEN_MODEL = Object.freeze({
  schema: BATTLE_CARD_ZONE_INFORMATION_SCHEMA,
  visible: false,
  entryVisible: false,
  countVisible: false,
  count: null,
  recentVisible: false,
  recentCardId: null,
  listVisible: false,
  cardIds: Object.freeze([]),
  detailEnabled: false,
  gameplayAuthority: false,
  gameStateWrite: false,
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeCardIds(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    if (!nonEmptyString(raw)) return null;
    const id = raw.trim();
    if (seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function projectBattleCardZoneInformation(snapshot) {
  if (!snapshot || snapshot.viewerSafe !== true) return HIDDEN_MODEL;
  if (!nonEmptyString(snapshot.zoneId) || !nonEmptyString(snapshot.generation)) return HIDDEN_MODEL;

  const permissions = snapshot.permissions;
  if (!permissions || typeof permissions !== 'object') return HIDDEN_MODEL;

  const countAllowed = permissions.count === true;
  const recentAllowed = permissions.recent === true;
  const listAllowed = permissions.list === true;
  const detailAllowed = permissions.detail === true;

  const count = snapshot.count;
  if (countAllowed && (!Number.isSafeInteger(count) || count < 0)) return HIDDEN_MODEL;

  const cardIds = listAllowed ? safeCardIds(snapshot.cardIds) : [];
  if (listAllowed && cardIds === null) return HIDDEN_MODEL;
  if (listAllowed && countAllowed && cardIds.length !== count) return HIDDEN_MODEL;

  let recentCardId = null;
  if (recentAllowed) {
    if (snapshot.recentCardId == null) {
      recentCardId = null;
    } else if (!nonEmptyString(snapshot.recentCardId)) {
      return HIDDEN_MODEL;
    } else {
      recentCardId = snapshot.recentCardId.trim();
      if (listAllowed && !cardIds.includes(recentCardId)) return HIDDEN_MODEL;
    }
  }

  const entryVisible = countAllowed || recentAllowed || listAllowed;
  if (!entryVisible) return HIDDEN_MODEL;

  return Object.freeze({
    schema: BATTLE_CARD_ZONE_INFORMATION_SCHEMA,
    visible: true,
    entryVisible: true,
    countVisible: countAllowed,
    count: countAllowed ? count : null,
    recentVisible: recentAllowed,
    recentCardId: recentAllowed ? recentCardId : null,
    listVisible: listAllowed,
    cardIds: Object.freeze(listAllowed ? [...cardIds] : []),
    detailEnabled: detailAllowed && listAllowed,
    gameplayAuthority: false,
    gameStateWrite: false,
  });
}

export function requestBattleCardZoneDetail(model, cardId) {
  if (!model || model.schema !== BATTLE_CARD_ZONE_INFORMATION_SCHEMA) return null;
  if (model.visible !== true || model.detailEnabled !== true || model.listVisible !== true) return null;
  if (!nonEmptyString(cardId)) return null;
  const normalized = cardId.trim();
  return Array.isArray(model.cardIds) && model.cardIds.includes(normalized) ? normalized : null;
}

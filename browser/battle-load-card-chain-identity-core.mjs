const SCHEMA = 'GAMEROAD_BATTLE_LOAD_CARD_CHAIN_IDENTITY_V1';

const JANKEN_GLYPHS = Object.freeze({
  rock: '✊',
  scissors: '✌',
  paper: '✋'
});

const BATTLE_CARD_ORIGINS = Object.freeze([
  'active_submission',
  'auto_defense',
  'ability_active_addition'
]);
const BATTLE_CARD_ORIGIN_SET = new Set(BATTLE_CARD_ORIGINS);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalText(value) {
  return nonEmptyString(value) ? value : null;
}

function requireViewerPlayerId(value) {
  if (!nonEmptyString(value)) throw new TypeError('VIEWER_PLAYER_ID_REQUIRED');
  return value;
}

function projectLoadCard(loadCard, loadJanken) {
  if (loadCard == null) return null;
  if (!loadCard || typeof loadCard !== 'object' || Array.isArray(loadCard)) {
    throw new TypeError('LOAD_CARD_INVALID');
  }
  if (!nonEmptyString(loadCard.cardId)) throw new TypeError('LOAD_CARD_ID_REQUIRED');

  const key = Object.prototype.hasOwnProperty.call(JANKEN_GLYPHS, loadJanken)
    ? loadJanken
    : null;
  return deepFreeze({
    cardId: loadCard.cardId,
    label: optionalText(loadCard.label),
    janken: deepFreeze({
      key,
      glyph: key ? JANKEN_GLYPHS[key] : '?',
      resolved: key !== null
    })
  });
}

function replayEvents(replay) {
  if (replay == null) return [];
  if (!replay || typeof replay !== 'object' || Array.isArray(replay)) {
    throw new TypeError('REPLAY_INVALID');
  }
  if (!Array.isArray(replay.events)) throw new TypeError('REPLAY_EVENTS_INVALID');
  return replay.events;
}

function publicPlayerForViewer(publicData, viewerPlayerId) {
  if (!publicData || typeof publicData !== 'object' || Array.isArray(publicData)) {
    throw new TypeError('BATTLE_RESOLUTION_PUBLIC_DATA_INVALID');
  }
  if (!Array.isArray(publicData.players)) throw new TypeError('BATTLE_RESOLUTION_PLAYERS_INVALID');
  const matches = publicData.players.filter(player => player?.id === viewerPlayerId);
  if (matches.length > 1) throw new TypeError('BATTLE_RESOLUTION_VIEWER_DUPLICATE');
  return matches[0] ?? null;
}

function projectPlayedCards(replay, viewerPlayerId) {
  const out = [];
  for (const [eventIndex, event] of replayEvents(replay).entries()) {
    if (event?.kind !== 'battle_resolution') continue;
    const publicData = event.publicData;
    const player = publicPlayerForViewer(publicData, viewerPlayerId);
    if (!player) continue;
    if (!Array.isArray(player.cards)) throw new TypeError('BATTLE_RESOLUTION_CARDS_INVALID');

    for (const [cardIndex, card] of player.cards.entries()) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) {
        throw new TypeError('BATTLE_RESOLUTION_CARD_INVALID');
      }
      if (!BATTLE_CARD_ORIGIN_SET.has(card.origin)) continue;
      if (!nonEmptyString(card.cardId)) throw new TypeError('BATTLE_RESOLUTION_CARD_ID_REQUIRED');
      out.push(deepFreeze({
        cardId: card.cardId,
        label: optionalText(card.label),
        origin: card.origin,
        round: Number.isSafeInteger(publicData.round) && publicData.round >= 1 ? publicData.round : null,
        serial: Number.isSafeInteger(publicData.serial) && publicData.serial >= 1 ? publicData.serial : null,
        eventIndex,
        cardIndex
      }));
    }
  }
  return deepFreeze(out);
}

export function projectBattleLoadCardChain({
  viewerPlayerId,
  loadCard = null,
  loadJanken = null,
  replay = null
} = {}) {
  const viewerId = requireViewerPlayerId(viewerPlayerId);
  const load = projectLoadCard(loadCard, loadJanken);
  const playedCards = projectPlayedCards(replay, viewerId);

  return deepFreeze({
    schema: SCHEMA,
    ok: true,
    viewerPlayerId: viewerId,
    load,
    playedCards,
    unresolved: deepFreeze({
      load: load === null,
      janken: load !== null && load.janken.resolved === false
    })
  });
}

export const BATTLE_LOAD_CARD_CHAIN_IDENTITY = deepFreeze({
  schema: SCHEMA,
  authority: 'NONE_PRESENTATION_PROJECTION_ONLY',
  gameStateWrite: false,
  cardIdentityPolicy: 'CALLER_LOAD_CARD_ID_PLUS_ACCEPTED_PUBLIC_REPLAY_CARD_ID_ONLY',
  opponentPrivateReservationRead: false,
  playedCardOrigins: BATTLE_CARD_ORIGINS,
  excludedOrigins: Object.freeze(['road']),
  jankenKeys: Object.freeze(Object.keys(JANKEN_GLYPHS)),
  unresolvedJankenGlyph: '?',
  forbiddenJankenGlyphs: Object.freeze(['♥']),
  dedupePlayedCards: false,
  orderPolicy: 'ACCEPTED_REPLAY_EVENT_ORDER_THEN_PUBLIC_PLAYER_CARD_ORDER'
});

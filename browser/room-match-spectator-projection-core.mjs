const SPECTATOR_VIEWER_SCHEMA = 'GAMEROAD_ROOM_MATCH_SPECTATOR_VIEWER_V1';
const SPECTATOR_PLAYER_SCHEMA = 'GAMEROAD_ROOM_MATCH_SPECTATOR_PLAYER_V1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The viewer identity a spectator passes to replay reads.
 * A spectator is never authenticated as a player, so replay reads
 * return public data only and never attach another player's private data.
 */
export function normalizeSpectatorViewer() {
  return deepFreeze({
    schema: SPECTATOR_VIEWER_SCHEMA,
    authenticated: false,
    id: null,
    viewerRole: 'spectator'
  });
}

export function isSpectatorViewer(viewer) {
  return Boolean(
    viewer
    && typeof viewer === 'object'
    && viewer.viewerRole === 'spectator'
    && viewer.authenticated !== true
  );
}

/**
 * Projects one player for a spectator: the same public shape the
 * friend-room guest projection uses for other players (viewer null),
 * so hands, decks, shields, janken assignments and plans never leak.
 * The hand is emptied as well, because the spectator owns no hand and
 * the battle screen renders players[0].hand as the local hand.
 */
export function buildSpectatorPlayer(player) {
  if (!player || typeof player !== 'object' || !nonEmptyString(player.id)) {
    throw new TypeError('SPECTATOR_PLAYER_REQUIRED');
  }
  const hiddenCount = (value) => (Array.isArray(value) ? value.length : 0);
  return deepFreeze({
    schema: SPECTATOR_PLAYER_SCHEMA,
    id: player.id,
    name: player.name ?? player.id,
    human: false,
    roomHuman: true,
    character: player.character ?? null,
    team: typeof player.team === 'string' ? player.team : null,
    position: player.position ?? null,
    manaCurrent: Number(player.manaCurrent) || 0,
    manaMax: Number(player.manaMax) || 10,
    honey: Number(player.honey) || 0,
    chip: Array.from({ length: hiddenCount(player.chip) }, () => '__PUBLIC_COUNT__'),
    lanes: cloneJson(player.lanes || { L: [], C: [], R: [] }),
    deck: Array.from({ length: hiddenCount(player.deck) }, () => '__HIDDEN__'),
    hand: [],
    shields: { L: '__HIDDEN__', C: '__HIDDEN__', R: '__HIDDEN__' },
    plan: null,
    nextCostReduction: Number(player.nextCostReduction) || 0,
    battleBlockedRound: Number(player.battleBlockedRound) || 0,
    sourceDeckIds: [],
    sourceDeckSize: Number(player.sourceDeckSize) || 0
  });
}

export function isSpectatorProjection(projection) {
  return Boolean(
    projection
    && typeof projection === 'object'
    && projection.viewerRole === 'spectator'
  );
}

/**
 * Public replay events carried inside a room projection for a
 * spectator (or guest) result screen. Only already-public events are
 * accepted; anything carrying private fields is refused.
 */
export function spectatorReplayEventsFromProjection(projection) {
  if (!projection || typeof projection !== 'object') return [];
  const events = projection.replayEvents;
  if (!Array.isArray(events)) return [];
  const publicEvents = [];
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (!nonEmptyString(event.kind)) continue;
    if ('privateData' in event || 'privateByViewer' in event || 'authorityOnly' in event) continue;
    if (event.publicData == null || typeof event.publicData !== 'object') continue;
    publicEvents.push(cloneJson(event));
  }
  return deepFreeze(publicEvents);
}

export const ROOM_MATCH_SPECTATOR_PROJECTION = Object.freeze({
  viewerRole: 'spectator',
  authenticated: false,
  handVisible: false,
  deckVisible: false,
  shieldsVisible: false,
  jankenVisible: false,
  planVisible: false,
  gameplayAuthority: false,
  gameStateWrite: false
});

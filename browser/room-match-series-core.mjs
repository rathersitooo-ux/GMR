/**
 * Room series win counting (hon-aka item 4, 2026-11-08).
 *
 * The room rule already carries the series choice (BO1 / BO3, see
 * room-match-completion-profile-core.mjs), but until now nothing counted
 * match wins across a series: the room forgot every result as soon as the
 * next match started. This module is the counting place. It is pure: it
 * never decides who won a match, never touches the GOAL flow, and never
 * mutates its input.
 *
 * Provisional shape (仮置き, Raika's decision still pending): BO3 is
 * "first to two match wins". BO1 is first to one, so the first match
 * decides the series. If Raika later chooses a different shape (for
 * example a fixed three matches with a points tiebreak), only
 * winsNeededForSeries and the decided check need to change.
 */

const SERIES_SCHEMA = 'GAMEROAD_ROOM_MATCH_SERIES_V1';
const SERIES_SNAPSHOT_SCHEMA = 'GAMEROAD_ROOM_MATCH_SERIES_SNAPSHOT_V1';

export const ROOM_SERIES_WINS_NEEDED = Object.freeze({ 1: 1, 3: 2 });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function winsNeededForSeries(seriesBestOf) {
  const needed = ROOM_SERIES_WINS_NEEDED[seriesBestOf];
  if (needed == null) throw new RangeError('ROOM_SERIES_CHOICE_REQUIRED');
  return needed;
}

function validSeriesBestOf(value) {
  return value === 3 ? 3 : 1;
}

function cleanWins(raw) {
  const wins = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return wins;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string' || key.length === 0) continue;
    const n = Math.floor(Number(value));
    if (Number.isFinite(n) && n > 0) wins[key] = n;
  }
  return wins;
}

function cleanMatchIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of raw) {
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function buildState({ seriesBestOf, wins, matchesPlayed, countedMatchIds }) {
  const needed = winsNeededForSeries(seriesBestOf);
  let seriesWinnerKey = null;
  for (const [key, count] of Object.entries(wins)) {
    if (count >= needed) { seriesWinnerKey = key; break; }
  }
  return deepFreeze({
    schema: SERIES_SCHEMA,
    seriesBestOf,
    winsNeeded: needed,
    wins,
    matchesPlayed,
    countedMatchIds,
    decided: seriesWinnerKey != null,
    seriesWinnerKey
  });
}

/**
 * A fresh series: no wins yet. BO1 by default, matching the room rule.
 */
export function createRoomSeriesState(seriesBestOf = 1) {
  return buildState({
    seriesBestOf: validSeriesBestOf(seriesBestOf),
    wins: {},
    matchesPlayed: 0,
    countedMatchIds: []
  });
}

/**
 * Rebuilds a valid series state from stored or received data (room state,
 * a lobby message, a projection). Anything unusable falls back to a fresh
 * state for the given series instead of breaking the room.
 */
export function resolveRoomSeriesState(input = null, seriesBestOfFallback = 1) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createRoomSeriesState(seriesBestOfFallback);
  }
  const seriesBestOf = (input.seriesBestOf === 3 || input.seriesBestOf === 1)
    ? input.seriesBestOf
    : validSeriesBestOf(seriesBestOfFallback);
  return buildState({
    seriesBestOf,
    wins: cleanWins(input.wins),
    matchesPlayed: Math.max(0, Math.floor(Number(input.matchesPlayed)) || 0),
    countedMatchIds: cleanMatchIds(input.countedMatchIds)
  });
}

/**
 * Resolves the series keys that won one match.
 *
 * FFA matches: the winner player ids themselves are the keys.
 * 2v2 matches: the winning side is one team, so the team letter is the
 * single key. Callers pass the match's players so a winner player id can
 * be resolved to its team; a winner that is already a team letter of one
 * of the playing teams is accepted as-is. Winners that match neither a
 * player nor a team are ignored, so an unrelated token can never score.
 */
export function seriesWinnerKeysForMatch(match = null, winners = []) {
  const players = Array.isArray(match?.players)
    ? match.players.filter((p) => p && typeof p.id === 'string')
    : [];
  const list = Array.isArray(winners) ? winners : [];
  if (match?.mode === '2v2') {
    const teams = new Set(players.map((p) => p.team).filter((t) => typeof t === 'string' && t));
    for (const winner of list) {
      if (typeof winner !== 'string') continue;
      if (teams.has(winner)) return [winner];
      const player = players.find((p) => p.id === winner);
      if (player && typeof player.team === 'string' && player.team) return [player.team];
    }
    return [];
  }
  const ids = new Set(players.map((p) => p.id));
  const keys = [];
  for (const winner of list) {
    if (typeof winner !== 'string') continue;
    if (ids.size > 0 && !ids.has(winner)) continue;
    if (!keys.includes(winner)) keys.push(winner);
  }
  return keys;
}

/**
 * Records one finished match. The same matchId is never counted twice,
 * so a replayed result broadcast or a double end call cannot inflate the
 * count. Once the series is decided, later matches are not counted; the
 * room starts a new series by resetting instead. Returns the next state
 * plus whether this call actually counted.
 */
export function recordRoomSeriesMatch(input = null, record = {}) {
  const state = resolveRoomSeriesState(input, record?.seriesBestOf);
  const matchId = typeof record?.matchId === 'string' ? record.matchId : '';
  if (!matchId) return deepFreeze({ ...state, counted: false, countReason: 'MATCH_ID_REQUIRED' });
  if (state.countedMatchIds.includes(matchId)) {
    return deepFreeze({ ...state, counted: false, countReason: 'ALREADY_COUNTED' });
  }
  if (state.decided) {
    return deepFreeze({ ...state, counted: false, countReason: 'SERIES_ALREADY_DECIDED' });
  }
  const keys = Array.isArray(record?.winnerKeys)
    ? [...new Set(record.winnerKeys.filter((k) => typeof k === 'string' && k.length > 0))]
    : [];
  if (keys.length === 0) {
    return deepFreeze({ ...state, counted: false, countReason: 'WINNER_KEY_REQUIRED' });
  }
  const wins = { ...state.wins };
  for (const key of keys) wins[key] = (wins[key] || 0) + 1;
  const next = buildState({
    seriesBestOf: state.seriesBestOf,
    wins,
    matchesPlayed: state.matchesPlayed + 1,
    countedMatchIds: [...state.countedMatchIds, matchId]
  });
  return deepFreeze({ ...next, counted: true, countReason: null });
}

/**
 * A plain serializable snapshot for the room to hold and to send to
 * guests and spectators, so every screen shows the same win count.
 */
export function roomSeriesSnapshot(input = null) {
  const state = resolveRoomSeriesState(input);
  return deepFreeze({
    schema: SERIES_SNAPSHOT_SCHEMA,
    seriesBestOf: state.seriesBestOf,
    seriesLabel: `BO${state.seriesBestOf}`,
    winsNeeded: state.winsNeeded,
    wins: { ...state.wins },
    winnerKey: state.seriesWinnerKey,
    matchesPlayed: state.matchesPlayed,
    decided: state.decided,
    countedMatchIds: [...state.countedMatchIds]
  });
}

export function describeRoomSeries(input = null, keys = []) {
  const state = resolveRoomSeriesState(input);
  const ordered = [];
  for (const key of keys) if (!ordered.includes(key)) ordered.push(key);
  for (const key of Object.keys(state.wins)) if (!ordered.includes(key)) ordered.push(key);
  const parts = ordered.map((key) => `${key} ${state.wins[key] || 0}勝`);
  return deepFreeze({
    schema: SERIES_SNAPSHOT_SCHEMA,
    seriesLabel: `BO${state.seriesBestOf}`,
    winsNeeded: state.winsNeeded,
    decided: state.decided,
    seriesWinnerKey: state.seriesWinnerKey,
    scoreText: parts.join(' ・ '),
    text: state.decided
      ? `シリーズ決定：${state.seriesWinnerKey} が先に${state.winsNeeded}勝`
      : `あと${Math.max(0, state.winsNeeded - Math.max(0, ...Object.values(state.wins)))}勝でシリーズ決定`
  });
}

export const ROOM_MATCH_SERIES = Object.freeze({
  schema: SERIES_SCHEMA,
  winsNeededByBestOf: ROOM_SERIES_WINS_NEEDED,
  provisional: 'BO3_IS_FIRST_TO_TWO_WINS',
  countingOwner: 'host_friend_room',
  goalFlowTouched: false
});

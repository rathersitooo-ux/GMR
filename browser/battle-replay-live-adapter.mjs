import {
  appendAcceptedEvent,
  createReplayLog,
  readReplay,
  validateReplayLog
} from './battle-replay-core.mjs';

const LIVE_ADAPTER_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_LIVE_ADAPTER_V1';
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const CONTENT_VERSION_PREFIX = 'GAMEROAD_CARD_CONTENT_FNV1A64';
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

function cloneJson(value) {
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

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
      const entries = Object.keys(value).sort().map(
        key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
      );
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

function exactVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new TypeError('VERSIONS_REQUIRED');
  }
  const out = {};
  for (const key of VERSION_KEYS) {
    if (!nonEmptyString(versions[key])) throw new TypeError(`VERSION_REQUIRED:${key}`);
    out[key] = versions[key];
  }
  return deepFreeze(out);
}

export function battleReplayRulesVersion(deckRule) {
  if (!deckRule || !nonEmptyString(deckRule.id) ||
      !Number.isSafeInteger(deckRule.revision) || deckRule.revision < 1) {
    throw new TypeError('DECK_RULE_AUTHORITY_INVALID');
  }
  return `${deckRule.id}@${deckRule.revision}`;
}

export function battleReplayContentVersion(cardData) {
  if (!Array.isArray(cardData) || cardData.length === 0) {
    throw new TypeError('CARD_CONTENT_AUTHORITY_INVALID');
  }
  return `${CONTENT_VERSION_PREFIX}:${cardData.length}:${fnv1a64(canonicalJson(cardData))}`;
}

export function createBattleReplayVersionAuthority({
  deckRule,
  cardData,
  stateSchema = LIVE_ADAPTER_SCHEMA
}) {
  if (!nonEmptyString(stateSchema)) throw new TypeError('STATE_SCHEMA_AUTHORITY_INVALID');
  return deepFreeze({
    rules: battleReplayRulesVersion(deckRule),
    content: battleReplayContentVersion(cardData),
    state: stateSchema
  });
}

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label}_INVALID`);
  return value;
}

function maybeString(value) {
  return nonEmptyString(value) ? value : null;
}

function stringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label}_INVALID`);
  const out = value.map(item => {
    if (!nonEmptyString(item)) throw new TypeError(`${label}_INVALID`);
    return item;
  });
  return out;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label}_INVALID`);
  return number;
}

function publicCards(cards) {
  if (!Array.isArray(cards)) throw new TypeError('RESOLUTION_CARDS_INVALID');
  return cards.map(card => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw new TypeError('RESOLUTION_CARD_INVALID');
    }
    const cardId = maybeString(card.cardId);
    if (!cardId) throw new TypeError('RESOLUTION_CARD_ID_INVALID');
    return {
      cardId,
      label: maybeString(card.label),
      value: finiteNumber(card.value, 'RESOLUTION_CARD_VALUE'),
      origin: maybeString(card.origin)
    };
  });
}

function publicPlayers(players) {
  if (!Array.isArray(players)) throw new TypeError('RESOLUTION_PLAYERS_INVALID');
  return players.map(player => {
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      throw new TypeError('RESOLUTION_PLAYER_INVALID');
    }
    const id = maybeString(player.id);
    if (!id) throw new TypeError('RESOLUTION_PLAYER_ID_INVALID');
    return {
      id,
      name: maybeString(player.name),
      team: maybeString(player.team),
      score: finiteNumber(player.score, 'RESOLUTION_PLAYER_SCORE'),
      winner: player.winner === true,
      cards: publicCards(player.cards)
    };
  });
}

function publicLaneGains(rows) {
  if (!Array.isArray(rows)) throw new TypeError('RESOLUTION_LANE_GAINS_INVALID');
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('RESOLUTION_LANE_GAIN_INVALID');
    }
    const id = maybeString(row.id);
    const lane = maybeString(row.lane);
    if (!id || !lane) throw new TypeError('RESOLUTION_LANE_GAIN_ID_INVALID');
    return {
      id,
      lane,
      before: safeInteger(row.before, 'RESOLUTION_LANE_BEFORE'),
      after: safeInteger(row.after, 'RESOLUTION_LANE_AFTER'),
      added: safeInteger(row.added, 'RESOLUTION_LANE_ADDED')
    };
  });
}

function publicMaxLaneProgress(rows) {
  if (!Array.isArray(rows)) throw new TypeError('RESOLUTION_MAX_LANE_PROGRESS_INVALID');
  return rows.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('RESOLUTION_MAX_LANE_ROW_INVALID');
    }
    const id = maybeString(row.id);
    if (!id) throw new TypeError('RESOLUTION_MAX_LANE_ID_INVALID');
    return {
      id,
      before: safeInteger(row.before, 'RESOLUTION_MAX_LANE_BEFORE'),
      after: safeInteger(row.after, 'RESOLUTION_MAX_LANE_AFTER')
    };
  });
}

function publicTeamTotals(teamTotals) {
  if (teamTotals == null) return null;
  if (!teamTotals || typeof teamTotals !== 'object' || Array.isArray(teamTotals)) {
    throw new TypeError('RESOLUTION_TEAM_TOTALS_INVALID');
  }
  return {
    A: finiteNumber(teamTotals.A, 'RESOLUTION_TEAM_TOTAL_A'),
    B: finiteNumber(teamTotals.B, 'RESOLUTION_TEAM_TOTAL_B')
  };
}

export function projectAcceptedBattleResolution(resolution) {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    throw new TypeError('RESOLUTION_REQUIRED');
  }
  const mode = maybeString(resolution.mode);
  const attackerId = maybeString(resolution.attackerId);
  const defenderId = maybeString(resolution.defenderId);
  const lane = maybeString(resolution.lane);
  if (!mode || !attackerId || !defenderId || !lane) throw new TypeError('RESOLUTION_IDENTITY_INVALID');
  return deepFreeze({
    serial: safeInteger(resolution.serial, 'RESOLUTION_SERIAL', 1),
    round: safeInteger(resolution.round, 'RESOLUTION_ROUND', 1),
    mode,
    attackerId,
    defenderId,
    lane,
    shield: resolution.shield == null ? null : cloneJson(resolution.shield),
    winnerIds: stringArray(resolution.winnerIds, 'RESOLUTION_WINNER_IDS'),
    winningTeam: maybeString(resolution.winningTeam),
    teamTotals: publicTeamTotals(resolution.teamTotals),
    players: publicPlayers(resolution.players),
    laneGains: publicLaneGains(resolution.laneGains),
    maxLaneProgress: publicMaxLaneProgress(resolution.maxLaneProgress)
  });
}

function assertSession(session) {
  if (!session || session.schema !== LIVE_ADAPTER_SCHEMA || !nonEmptyString(session.matchId)) {
    throw new TypeError('LIVE_REPLAY_SESSION_INVALID');
  }
  const validation = validateReplayLog(session.log);
  if (!validation.ok || session.log.matchId !== session.matchId) {
    throw new TypeError(`LIVE_REPLAY_LOG_INVALID:${validation.reason || 'IDENTITY'}`);
  }
  return session;
}

export function createLiveReplaySession({ matchId, versions }) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  const normalizedVersions = exactVersions(versions);
  return deepFreeze({
    schema: LIVE_ADAPTER_SCHEMA,
    matchId,
    versions: normalizedVersions,
    lastResolutionSerial: 0,
    ended: false,
    log: createReplayLog({ matchId, versions: normalizedVersions })
  });
}

export function appendAcceptedBattleResolution(session, resolution) {
  assertSession(session);
  if (session.ended) throw new TypeError('LIVE_REPLAY_ALREADY_ENDED');
  const projected = projectAcceptedBattleResolution(resolution);
  if (projected.serial !== session.lastResolutionSerial + 1) {
    throw new TypeError('RESOLUTION_SERIAL_GAP_OR_REORDER');
  }
  const log = appendAcceptedEvent(session.log, {
    kind: 'battle_resolution',
    publicData: projected
  });
  return deepFreeze({
    ...cloneJson(session),
    lastResolutionSerial: projected.serial,
    log
  });
}

export function appendAcceptedMatchEnd(session, { winnerIds, round, mode }) {
  assertSession(session);
  if (session.ended) throw new TypeError('LIVE_REPLAY_ALREADY_ENDED');
  const publicData = deepFreeze({
    winnerIds: stringArray(winnerIds, 'MATCH_END_WINNER_IDS'),
    round: safeInteger(round, 'MATCH_END_ROUND', 1),
    mode: maybeString(mode)
  });
  if (!publicData.mode) throw new TypeError('MATCH_END_MODE_INVALID');
  const log = appendAcceptedEvent(session.log, {
    kind: 'match_ended',
    publicData
  });
  return deepFreeze({
    ...cloneJson(session),
    ended: true,
    log
  });
}

export function readLiveReplay(session, { viewer = null } = {}) {
  assertSession(session);
  const supportedVersions = Object.fromEntries(
    VERSION_KEYS.map(key => [key, [session.versions[key]]])
  );
  return readReplay(session.log, { viewer, supportedVersions });
}

export const BATTLE_REPLAY_LIVE_ADAPTER = Object.freeze({
  schema: LIVE_ADAPTER_SCHEMA,
  versionKeys: VERSION_KEYS,
  contentVersionPrefix: CONTENT_VERSION_PREFIX,
  versionAuthoritySources: Object.freeze({
    rules: 'DECK_RULE.id+revision',
    content: 'window.__CARD_DATA__ canonical JSON fingerprint',
    state: 'LIVE_ADAPTER_SCHEMA'
  })
});

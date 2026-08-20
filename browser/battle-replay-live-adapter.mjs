import {
  appendAcceptedEvent,
  createReplayLog,
  readReplay,
  validateReplayLog
} from './battle-replay-core.mjs';
import {
  applyCardPresentationEvent,
  createCardPresentationSession
} from './card-presentation-core.mjs';
import { planBattleConveyor } from './battle-conveyor-presentation-core.mjs';

const LIVE_ADAPTER_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_LIVE_ADAPTER_V1';
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const CONTENT_VERSION_PREFIX = 'GAMEROAD_CARD_CONTENT_FNV1A64';
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const CARD_PRESENTATION_STYLE_ID = 'gameroad-card-presentation-runtime-r7-style';
const CARD_PRESENTATION_HOLD_MS = 400;

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

function publicFree4pFormalRanking(value, winnerIds) {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new TypeError('MATCH_END_FORMAL_RANKING_INVALID');
  }
  const rows = value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('MATCH_END_FORMAL_RANKING_ROW_INVALID');
    }
    const id = maybeString(row.id);
    if (!id) throw new TypeError('MATCH_END_FORMAL_RANKING_ID_INVALID');
    const rank = safeInteger(row.rank, 'MATCH_END_FORMAL_RANK', 1);
    const maxColumn = safeInteger(row.maxColumn, 'MATCH_END_FORMAL_MAX_COLUMN');
    if (maxColumn > 7) throw new TypeError('MATCH_END_FORMAL_MAX_COLUMN_INVALID');
    return { id, rank, maxColumn };
  });

  const ids = rows.map(row => row.id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('MATCH_END_FORMAL_RANKING_DUPLICATE_ID');
  }
  if (!Array.isArray(winnerIds) || winnerIds.length === 0 || new Set(winnerIds).size !== winnerIds.length) {
    throw new TypeError('MATCH_END_FORMAL_WINNER_IDS_INVALID');
  }
  const idSet = new Set(ids);
  if (winnerIds.some(id => !idSet.has(id))) {
    throw new TypeError('MATCH_END_FORMAL_WINNER_UNKNOWN');
  }

  const winnerSet = new Set(winnerIds);
  const reachedSeven = rows.filter(row => row.maxColumn === 7).map(row => row.id);
  if (reachedSeven.length !== winnerSet.size || reachedSeven.some(id => !winnerSet.has(id))) {
    throw new TypeError('MATCH_END_FORMAL_WINNER_MISMATCH');
  }

  for (const row of rows) {
    const expectedRank = 1 + rows.reduce(
      (count, other) => count + (other.maxColumn > row.maxColumn ? 1 : 0),
      0
    );
    if (row.rank !== expectedRank) {
      throw new TypeError(`MATCH_END_FORMAL_RANK_MISMATCH:${row.id}`);
    }
  }
  return deepFreeze(rows);
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
  const shield = resolution.shield == null ? null : maybeString(resolution.shield);
  if (resolution.shield != null && !shield) throw new TypeError('RESOLUTION_SHIELD_INVALID');
  if (!mode || !attackerId || !defenderId || !lane) throw new TypeError('RESOLUTION_IDENTITY_INVALID');
  return deepFreeze({
    serial: safeInteger(resolution.serial, 'RESOLUTION_SERIAL', 1),
    round: safeInteger(resolution.round, 'RESOLUTION_ROUND', 1),
    mode,
    attackerId,
    defenderId,
    lane,
    shield,
    winnerIds: stringArray(resolution.winnerIds, 'RESOLUTION_WINNER_IDS'),
    winningTeam: maybeString(resolution.winningTeam),
    teamTotals: publicTeamTotals(resolution.teamTotals),
    players: publicPlayers(resolution.players),
    laneGains: publicLaneGains(resolution.laneGains),
    maxLaneProgress: publicMaxLaneProgress(resolution.maxLaneProgress)
  });
}

function browserGlobal(name) {
  return typeof globalThis === 'object' ? globalThis[name] : undefined;
}

function environmentValue(environment, name) {
  return Object.prototype.hasOwnProperty.call(environment, name)
    ? environment[name]
    : browserGlobal(name);
}

function settingToggleOn(documentRef, id) {
  const text = documentRef?.getElementById?.(id)?.textContent;
  return typeof text === 'string' && /\bON\b/i.test(text);
}

export function readBattleReplayCardPresentationPreferences(environment = {}) {
  const documentRef = environmentValue(environment, 'document');
  const matchMediaRef = environmentValue(environment, 'matchMedia');
  let systemReducedMotion = false;
  try {
    systemReducedMotion = typeof matchMediaRef === 'function' &&
      matchMediaRef('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    systemReducedMotion = false;
  }
  return deepFreeze({
    reducedMotion: systemReducedMotion || settingToggleOn(documentRef, 'reduceMotion'),
    lowPerf: settingToggleOn(documentRef, 'lowPerf'),
    audioEnabled: false
  });
}

function ensureBattleReplayCardPresentationStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(CARD_PRESENTATION_STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = CARD_PRESENTATION_STYLE_ID;
  style.textContent = `
#battleResolution.grCardPresentationFallback .resolutionWinner{filter:brightness(1.08);text-shadow:0 0 14px rgba(255,218,126,.48)}
#battleResolution.grCardPresentationFallback.grCardPresentationMotion .resolutionWinner{animation:grCardPresentationFallbackPulse .35s ease-out}
@keyframes grCardPresentationFallbackPulse{0%{opacity:1;text-shadow:0 0 14px rgba(255,218,126,.48)}36%{opacity:1;text-shadow:0 0 22px rgba(255,218,126,.76)}100%{opacity:1;text-shadow:0 0 14px rgba(255,218,126,.48)}}
#battleResolution.noMotion.grCardPresentationFallback .resolutionWinner,body.low-perf #battleResolution.grCardPresentationFallback .resolutionWinner{animation:none!important;transform:none!important;filter:none!important}
@media(prefers-reduced-motion:reduce){#battleResolution.grCardPresentationFallback .resolutionWinner{animation:none!important;transform:none!important}}
`;
  documentRef.head.appendChild(style);
  return true;
}

export function renderBattleReplayCardPresentationPlan(plan, environment = {}) {
  if (!plan || plan.presentationOnly !== true || plan.visual?.source !== 'fallback') return false;
  const documentRef = environmentValue(environment, 'document');
  const box = documentRef?.getElementById?.('battleResolution');
  if (!box?.classList || !box.dataset) return false;
  ensureBattleReplayCardPresentationStyle(documentRef);

  box.dataset.cardPresentation = 'fallback';
  box.dataset.cardPresentationEvent = plan.eventId;
  box.dataset.cardPresentationMotion = plan.visual.motion;
  box.classList.add('grCardPresentationFallback');
  box.classList.toggle('grCardPresentationMotion', plan.visual.motion === 'allowed');

  const setTimeoutRef = environmentValue(environment, 'setTimeout');
  if (typeof setTimeoutRef === 'function') {
    setTimeoutRef(() => {
      if (box.dataset.cardPresentationEvent !== plan.eventId) return;
      box.classList.remove('grCardPresentationFallback', 'grCardPresentationMotion');
      delete box.dataset.cardPresentation;
      delete box.dataset.cardPresentationEvent;
      delete box.dataset.cardPresentationMotion;
    }, CARD_PRESENTATION_HOLD_MS);
  }
  return true;
}

export function createBattleReplayCardPresentationBridge(environment = {}) {
  const sessions = new Map();
  const renderPlan = typeof environment.renderPlan === 'function'
    ? environment.renderPlan
    : plan => renderBattleReplayCardPresentationPlan(plan, environment);

  function begin(matchId) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    const runtime = {
      state: createCardPresentationSession({ sessionId: matchId }),
      lastPlan: null,
      lastFinisherPlan: null
    };
    sessions.set(matchId, runtime);
    return runtime.state;
  }

  function acceptAcceptedResolution({ matchId, serial }) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    safeInteger(serial, 'RESOLUTION_SERIAL', 1);
    const current = sessions.get(matchId) || {
      state: createCardPresentationSession({ sessionId: matchId }),
      lastPlan: null,
      lastFinisherPlan: null
    };
    const result = applyCardPresentationEvent(current.state, {
      sessionId: matchId,
      eventId: `battle-resolution:${serial}`,
      authorized: true,
      visibility: 'public',
      kind: 'vfx',
      assets: {}
    }, readBattleReplayCardPresentationPreferences(environment));

    if (!result.accepted) return result;
    sessions.set(matchId, {
      state: result.state,
      lastPlan: result.duplicate ? current.lastPlan : result.plan,
      lastFinisherPlan: current.lastFinisherPlan
    });
    if (!result.duplicate && result.plan) {
      try {
        renderPlan(result.plan);
      } catch {
        // Presentation is strictly fail-soft and never owns replay/gameplay success.
      }
    }
    return result;
  }

  function acceptAcceptedMatchEnd({ matchId, winnerId, loserIds }) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    if (!nonEmptyString(winnerId)) throw new TypeError('FINISHER_WINNER_ID_REQUIRED');
    const normalizedLoserIds = stringArray(loserIds, 'FINISHER_LOSER_IDS');
    if (normalizedLoserIds.length !== 3 ||
        new Set(normalizedLoserIds).size !== 3 ||
        normalizedLoserIds.includes(winnerId)) {
      throw new TypeError('FINISHER_LOSER_IDS_INVALID');
    }
    const current = sessions.get(matchId) || {
      state: createCardPresentationSession({ sessionId: matchId }),
      lastPlan: null,
      lastFinisherPlan: null
    };
    const preferences = readBattleReplayCardPresentationPreferences(environment);
    const timeline = planBattleConveyor([{
      accepted: true,
      eventId: `match-end-finisher:${matchId}`,
      kind: 'finisher',
      publicData: {
        winnerId,
        loserIds: normalizedLoserIds
      }
    }], {
      reducedMotion: preferences.reducedMotion,
      lowPerf: preferences.lowPerf
    });
    const plan = timeline.plans[0] || null;
    sessions.set(matchId, {
      state: current.state,
      lastPlan: current.lastPlan,
      lastFinisherPlan: plan
    });
    if (plan) {
      try {
        renderPlan(plan);
      } catch {
        // Presentation is strictly fail-soft and never owns replay/gameplay success.
      }
    }
    return deepFreeze({ accepted: plan != null, plan });
  }

  function snapshot(matchId) {
    const runtime = sessions.get(matchId);
    if (!runtime) return null;
    return deepFreeze(cloneJson({
      matchId,
      seenEventIds: runtime.state.seenEventIds,
      lastPlan: runtime.lastPlan,
      lastFinisherPlan: runtime.lastFinisherPlan
    }));
  }

  return Object.freeze({ begin, acceptAcceptedResolution, acceptAcceptedMatchEnd, snapshot });
}

const liveCardPresentationBridge = createBattleReplayCardPresentationBridge();

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

export function createLiveReplaySession(
  { matchId, versions },
  { presentationBridge = liveCardPresentationBridge } = {}
) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  const normalizedVersions = exactVersions(versions);
  const session = deepFreeze({
    schema: LIVE_ADAPTER_SCHEMA,
    matchId,
    versions: normalizedVersions,
    lastResolutionSerial: 0,
    ended: false,
    log: createReplayLog({ matchId, versions: normalizedVersions })
  });
  try {
    presentationBridge?.begin?.(matchId);
  } catch {
    // Replay session creation must survive presentation-only failures.
  }
  return session;
}

export function appendAcceptedBattleResolution(
  session,
  resolution,
  { presentationBridge = liveCardPresentationBridge } = {}
) {
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
  const next = deepFreeze({
    ...cloneJson(session),
    lastResolutionSerial: projected.serial,
    log
  });
  try {
    presentationBridge?.acceptAcceptedResolution?.({
      matchId: session.matchId,
      serial: projected.serial
    });
  } catch {
    // Accepted replay/gameplay state is authoritative; presentation never blocks it.
  }
  return next;
}

export function appendAcceptedMatchEnd(
  session,
  { winnerIds, round, mode, formalRanking = null },
  { presentationBridge = liveCardPresentationBridge } = {}
) {
  assertSession(session);
  if (session.ended) throw new TypeError('LIVE_REPLAY_ALREADY_ENDED');
  const normalizedWinnerIds = stringArray(winnerIds, 'MATCH_END_WINNER_IDS');
  const normalizedMode = maybeString(mode);
  if (!normalizedMode) throw new TypeError('MATCH_END_MODE_INVALID');
  if (formalRanking != null && normalizedMode !== '4p') {
    throw new TypeError('MATCH_END_FORMAL_RANKING_MODE_INVALID');
  }
  const publicData = {
    winnerIds: normalizedWinnerIds,
    round: safeInteger(round, 'MATCH_END_ROUND', 1),
    mode: normalizedMode
  };
  if (formalRanking != null) {
    publicData.formalRanking = publicFree4pFormalRanking(formalRanking, normalizedWinnerIds);
  }
  const log = appendAcceptedEvent(session.log, {
    kind: 'match_ended',
    publicData: deepFreeze(publicData)
  });
  const next = deepFreeze({
    ...cloneJson(session),
    ended: true,
    log
  });
  if (normalizedMode === '4p' &&
      normalizedWinnerIds.length === 1 &&
      Array.isArray(publicData.formalRanking) &&
      publicData.formalRanking.length === 4) {
    const winnerId = normalizedWinnerIds[0];
    const loserIds = publicData.formalRanking
      .map(row => row.id)
      .filter(id => id !== winnerId);
    if (loserIds.length === 3) {
      try {
        presentationBridge?.acceptAcceptedMatchEnd?.({
          matchId: session.matchId,
          winnerId,
          loserIds
        });
      } catch {
        // Accepted replay/gameplay state is authoritative; presentation never blocks it.
      }
    }
  }
  return next;
}

export function readLiveReplay(session, { viewer = null } = {}) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'LOG_INVALID' });
  }
  if (session.schema !== LIVE_ADAPTER_SCHEMA) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'SCHEMA_UNKNOWN' });
  }
  if (!nonEmptyString(session.matchId)) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' });
  }

  const validation = validateReplayLog(session.log);
  if (!validation.ok) return deepFreeze(validation);
  if (session.log.matchId !== session.matchId) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' });
  }

  let normalizedVersions;
  try {
    normalizedVersions = exactVersions(session.versions);
  } catch {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'VERSION_INVALID' });
  }
  const supportedVersions = Object.fromEntries(
    VERSION_KEYS.map(key => [key, [normalizedVersions[key]]])
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
  }),
  cardPresentation: Object.freeze({
    source: 'accepted_public_battle_resolution',
    kind: 'vfx',
    assetAuthority: 'fallback_only',
    audio: 'silent'
  }),
  matchEndFinisher: Object.freeze({
    source: 'accepted_free4p_single_winner_formal_ranking',
    kind: 'finisher',
    transition: 'FINISHER_GATHER',
    authority: 'presentation_only_no_game_state_write'
  })
});

const BATTLE_MOVIE_SURFACE_SCHEMA = 'GAMEROAD_BATTLE_MOVIE_SURFACE_BINDING_V1';
const BATTLE_START_LIVE_SCHEMA = 'gameroad.battle-start-live-handoff.v1';
const PLAYER_PROJECTION_SCHEMA = 'GAMEROAD_REPLAY_PLAYER_PRESENTATION_PROJECTION_V1';
const BATTLE_MOVIE_PHASES = new Set([
  'PREWARM', 'TITLE', 'ENTRY', 'BRIDGE', 'HANDOFF', 'FALLBACK_REQUIRED', 'CANCELLED'
]);
const BATTLE_MOVIE_PLAYER_MODES = Object.freeze({
  'BOARD_PRIMARY+ANIM_WIPE': Object.freeze({
    primarySurface: 'BOARD', wipeSurface: 'ANIMATION', wipeEnabled: true
  }),
  'ANIMATION_PRIMARY+BOARD_WIPE': Object.freeze({
    primarySurface: 'ANIMATION', wipeSurface: 'BOARD', wipeEnabled: true
  }),
  'BOARD_ONLY(WIPE_OFF)': Object.freeze({
    primarySurface: 'BOARD', wipeSurface: null, wipeEnabled: false
  })
});

function owns(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateBattleMovieSurfaceInputs(liveState, playerProjection, viewerRole) {
  if (!liveState ||
      liveState.schema !== BATTLE_START_LIVE_SCHEMA ||
      liveState.presentationOnly !== true ||
      liveState.gameplayAuthority !== false ||
      liveState.gameStateWrite !== false ||
      liveState.loadingBlocksGameplay !== false ||
      !nonEmptyString(liveState.generationId) ||
      !BATTLE_MOVIE_PHASES.has(liveState.phase)) {
    throw new TypeError('BATTLE_MOVIE_LIVE_STATE_INVALID');
  }
  if (!playerProjection ||
      playerProjection.schema !== PLAYER_PROJECTION_SCHEMA ||
      playerProjection.presentationOnly !== true) {
    throw new TypeError('BATTLE_MOVIE_PLAYER_PROJECTION_INVALID');
  }
  for (const key of [
    'publicData', 'privateData', 'privateByViewer', 'authorityOnly', 'selectedScore', 'considered'
  ]) {
    if (owns(playerProjection, key)) {
      throw new TypeError('BATTLE_MOVIE_PLAYER_PROJECTION_NOT_PUBLIC_MINIMAL');
    }
  }
  const layout = BATTLE_MOVIE_PLAYER_MODES[playerProjection.mode];
  if (!layout ||
      playerProjection.primarySurface !== layout.primarySurface ||
      playerProjection.wipeSurface !== layout.wipeSurface ||
      playerProjection.wipeEnabled !== layout.wipeEnabled) {
    throw new TypeError('BATTLE_MOVIE_PLAYER_PROJECTION_LAYOUT_INVALID');
  }
  if (viewerRole !== 'player' && viewerRole !== 'spectator') {
    throw new TypeError('BATTLE_MOVIE_VIEWER_ROLE_INVALID');
  }
  if (viewerRole === 'spectator' &&
      playerProjection.mode !== 'ANIMATION_PRIMARY+BOARD_WIPE') {
    throw new TypeError('BATTLE_MOVIE_SPECTATOR_MODE_INVALID');
  }
  return layout;
}

export function projectBattleMovieSurface({
  liveState,
  playerProjection,
  viewerRole
} = {}) {
  const layout = validateBattleMovieSurfaceInputs(liveState, playerProjection, viewerRole);
  const movieHandoff = liveState.phase === 'HANDOFF';
  const fallbackToBoard = liveState.phase === 'FALLBACK_REQUIRED' || liveState.phase === 'CANCELLED';
  const overlayKind = liveState.phase === 'TITLE'
    ? 'BATTLE_START_TITLE'
    : liveState.phase === 'ENTRY'
      ? 'BATTLE_START_ENTRY'
      : liveState.phase === 'BRIDGE'
        ? 'MOVIE_READY_BRIDGE'
        : null;

  return deepFreeze({
    schema: BATTLE_MOVIE_SURFACE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    loadingBlocksGameplay: false,
    generationId: liveState.generationId,
    phase: liveState.phase,
    viewerRole,
    mode: playerProjection.mode,
    decisionSerial: playerProjection.decisionSerial,
    selectedEventId: playerProjection.selectedEventId,
    overlayKind,
    movieHandoff,
    fallbackToBoard,
    primarySurface: movieHandoff ? layout.primarySurface : 'BOARD',
    wipeSurface: movieHandoff ? layout.wipeSurface : null,
    wipeEnabled: movieHandoff ? layout.wipeEnabled : false,
    motion: liveState.reducedMotion === true || liveState.lowPerf === true
      ? 'static_only'
      : 'allowed'
  });
}

export function renderBattleMovieSurfacePlan(plan, environment = {}) {
  if (!plan ||
      plan.schema !== BATTLE_MOVIE_SURFACE_SCHEMA ||
      plan.presentationOnly !== true ||
      plan.gameplayAuthority !== false ||
      plan.gameStateWrite !== false) {
    return false;
  }
  const documentRef = environmentValue(environment, 'document');
  const box = documentRef?.getElementById?.('battleResolution');
  if (!box?.classList || !box.dataset) return false;

  box.dataset.battleMoviePhase = plan.phase;
  box.dataset.battleMovieViewerRole = plan.viewerRole;
  box.dataset.battleMovieMode = plan.mode;
  box.dataset.battleMoviePrimary = plan.primarySurface;
  box.dataset.battleMovieWipe = plan.wipeSurface || 'OFF';
  box.dataset.battleMovieMotion = plan.motion;
  if (plan.overlayKind) box.dataset.battleMovieOverlay = plan.overlayKind;
  else delete box.dataset.battleMovieOverlay;
  box.classList.toggle('grBattleMovieHandoff', plan.movieHandoff === true);
  box.classList.toggle('grBattleMovieFallback', plan.fallbackToBoard === true);
  return true;
}

export function createBattleMovieSurfaceBridge(environment = {}) {
  let lastPlan = null;

  function accept(input) {
    const plan = projectBattleMovieSurface(input);
    let rendered = false;
    try {
      rendered = renderBattleMovieSurfacePlan(plan, environment);
    } catch {
      rendered = false;
    }
    lastPlan = plan;
    return deepFreeze({ plan, rendered });
  }

  function snapshot() {
    return lastPlan ? deepFreeze(cloneJson(lastPlan)) : null;
  }

  return Object.freeze({ accept, snapshot });
}

export const BATTLE_MOVIE_SURFACE_BINDING = Object.freeze({
  schema: BATTLE_MOVIE_SURFACE_SCHEMA,
  liveStateSchema: BATTLE_START_LIVE_SCHEMA,
  playerProjectionSchema: PLAYER_PROJECTION_SCHEMA,
  viewerRoles: Object.freeze(['player', 'spectator']),
  spectatorMode: 'ANIMATION_PRIMARY+BOARD_WIPE',
  authority: 'presentation_only_no_game_state_write',
  actualDomSurface: 'battleResolution'
});
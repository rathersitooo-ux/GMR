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
import {
  planBattleConveyor,
  planBattleConveyorEnvironmentFrame
} from './battle-conveyor-presentation-core.mjs';
import { createBattleScreenModel } from './battle-screen-presentation-core.mjs';
import { mountBattleScreenExternalSurface } from './battle-screen-runtime-mount.mjs';
import {
  PARTNER_BATTLE_EVENT_PROJECTION,
  createPartnerBattleEventLogConsumerAdapter
} from './partner-battle-event-log-projection.mjs';

const LIVE_ADAPTER_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_LIVE_ADAPTER_V1';
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const CONTENT_VERSION_PREFIX = 'GAMEROAD_CARD_CONTENT_FNV1A64';
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;
const CARD_PRESENTATION_STYLE_ID = 'gameroad-card-presentation-runtime-r7-style';
const CARD_PRESENTATION_HOLD_MS = 400;
const BATTLE_CONVEYOR_ENV_STYLE_ID = 'gameroad-battle-conveyor-environment-r37-style';
const BATTLE_CONVEYOR_ENV_HOST_ATTR = 'data-battle-conveyor-environment';
const BATTLE_CONVEYOR_ENV_SEGMENT_ATTR = 'data-battle-conveyor-segment';
const BATTLE_CONVEYOR_ENV_SEGMENT_COUNT = 8;
const BATTLE_CONVEYOR_ENV_TRAVEL_STEP = 0.16;
const BATTLE_CONVEYOR_ENV_SETTLE_MS = 260;
const PARTNER_BATTLE_LOG_HOST_ATTR = 'data-partner-battle-event-log';
const PARTNER_BATTLE_LOG_ROW_ATTR = 'data-partner-battle-event-log-row';

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
  const reachedSeven = rows.filter(row => row.maxColumn >= 7).map(row => row.id);
  if (reachedSeven.length !== winnerSet.size || reachedSeven.some(id => !winnerSet.has(id))) {
    throw new TypeError('MATCH_END_FORMAL_WINNER_MISMATCH');
  }

  for (const row of rows) {
    const expectedRank = winnerSet.has(row.id)
      ? 1
      : 1 + winnerSet.size + rows.reduce(
        (count, other) => count + (!winnerSet.has(other.id) && other.maxColumn > row.maxColumn ? 1 : 0),
        0
      );
    if (row.rank !== expectedRank) {
      throw new TypeError(`MATCH_END_FORMAL_RANK_MISMATCH:${row.id}`);
    }
  }
  return deepFreeze(rows);
}

function deriveFree4pFormalRankingFromAcceptedReplay(log, winnerIds, terminalRound) {
  if (!log || !Array.isArray(log.events)) return null;
  for (let index = log.events.length - 1; index >= 0; index -= 1) {
    const event = log.events[index];
    if (event?.kind !== 'battle_resolution') continue;
    if (event.publicData?.mode !== '4p') return null;
    if (event.publicData?.round !== terminalRound) return null;
    const progress = event.publicData?.maxLaneProgress;
    if (!Array.isArray(progress) || progress.length !== 4) return null;
    try {
      const rows = progress.map(row => ({
        id: maybeString(row?.id),
        maxColumn: safeInteger(row?.after, 'MATCH_END_DERIVED_MAX_COLUMN')
      }));
      if (rows.some(row => !row.id) || new Set(rows.map(row => row.id)).size !== 4) return null;
      const winnerSet = new Set(winnerIds);
      const candidate = rows.map(row => ({
        id: row.id,
        rank: winnerSet.has(row.id)
          ? 1
          : 1 + winnerSet.size + rows.reduce(
            (count, other) => count + (!winnerSet.has(other.id) && other.maxColumn > row.maxColumn ? 1 : 0),
            0
          ),
        maxColumn: row.maxColumn
      }));
      return publicFree4pFormalRanking(candidate, winnerIds);
    } catch {
      return null;
    }
  }
  return null;
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

function fourParticipantBattleScreenStartParticipants(players) {
  if (!Array.isArray(players) || players.length !== 4) return null;
  const participants = players.map((player, index) => {
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      throw new TypeError('BATTLE_SCREEN_START_PARTICIPANT_INVALID');
    }
    const id = maybeString(player.id);
    if (!id) throw new TypeError('BATTLE_SCREEN_START_PARTICIPANT_ID_INVALID');
    return {
      id,
      label: maybeString(player.label) || maybeString(player.name) || `P${index + 1}`,
      team: maybeString(player.team),
      character: maybeString(player.character)
    };
  });
  if (new Set(participants.map(row => row.id)).size !== 4) {
    throw new TypeError('BATTLE_SCREEN_START_PARTICIPANT_IDS_NOT_UNIQUE');
  }
  return deepFreeze(participants);
}

function fourParticipantBattleScreenState(publicResolution) {
  if (!publicResolution || typeof publicResolution !== 'object' || Array.isArray(publicResolution)) return null;
  if (!Array.isArray(publicResolution.players) || publicResolution.players.length !== 4 ||
      !Array.isArray(publicResolution.maxLaneProgress) || publicResolution.maxLaneProgress.length !== 4) {
    return null;
  }
  const participants = publicResolution.players.map((player, index) => ({
    id: maybeString(player?.id),
    label: maybeString(player?.name) || `P${index + 1}`,
    team: maybeString(player?.team)
  }));
  if (participants.some(row => !row.id) || new Set(participants.map(row => row.id)).size !== 4) {
    throw new TypeError('BATTLE_SCREEN_LIVE_PARTICIPANTS_INVALID');
  }
  const participantIds = new Set(participants.map(row => row.id));
  const progress = publicResolution.maxLaneProgress.map(row => ({
    id: maybeString(row?.id),
    after: safeInteger(row?.after, 'BATTLE_SCREEN_LIVE_PROGRESS')
  }));
  if (progress.some(row => !row.id) || new Set(progress.map(row => row.id)).size !== 4 ||
      progress.some(row => !participantIds.has(row.id))) {
    throw new TypeError('BATTLE_SCREEN_LIVE_PROGRESS_SET_INVALID');
  }
  return deepFreeze({
    participants,
    persistentAfterstate: progress.map(row => ({
      id: `max-lane-${row.id}`,
      participantId: row.id,
      text: `進行 ${row.after}/7`
    }))
  });
}

function exactBattleScreenParticipantSet(participants, ids) {
  if (!Array.isArray(participants) || participants.length !== 4 || !Array.isArray(ids) || ids.length !== 4) return false;
  const expected = new Set(participants.map(row => row.id));
  return new Set(ids).size === 4 && ids.every(id => expected.has(id));
}

export function createBattleScreenLivePresentationBridge(environment = {}) {
  const sessions = new Map();
  let runtime = environment.runtime && typeof environment.runtime.render === 'function'
    ? environment.runtime
    : null;
  const renderModel = typeof environment.renderModel === 'function' ? environment.renderModel : null;

  function ensureRuntime() {
    if (runtime) return runtime;
    const documentRef = environmentValue(environment, 'document');
    const phaseSurface = documentRef?.getElementById?.('battlePhaseSurface');
    if (!phaseSurface) return null;
    const shell = environment.battleScreenShell ?? phaseSurface.parentNode;
    const root = environment.battleScreenRoot ?? shell;
    if (!shell || !root || typeof shell.appendChild !== 'function' || typeof root.appendChild !== 'function') return null;
    const resolutionSurface = documentRef?.getElementById?.('battleResolution') ?? null;
    runtime = mountBattleScreenExternalSurface({ document: documentRef }, {
      root,
      shell,
      phaseSurface,
      resolutionSurface
    });
    return runtime;
  }

  function renderFailSoft(model) {
    try {
      if (renderModel) return renderModel(model) !== false;
      const target = ensureRuntime();
      if (!target) return false;
      target.render(model);
      return true;
    } catch {
      return false;
    }
  }

  function begin(matchId, players = null) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    const participants = fourParticipantBattleScreenStartParticipants(players);
    let lastModel = null;
    let rendered = false;
    if (participants) {
      const preferences = readBattleReplayCardPresentationPreferences(environment);
      lastModel = createBattleScreenModel({
        participants,
        persistentAfterstate: [],
        returnIntent: 'MATCH_PLAN',
        reducedMotion: preferences.reducedMotion,
        lowPerf: preferences.lowPerf
      });
      rendered = renderFailSoft(lastModel);
    }
    sessions.set(matchId, {
      participants,
      persistentAfterstate: [],
      lastModel,
      rendered
    });
    return true;
  }

  function acceptAcceptedResolution({ matchId, publicResolution }) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    const screenState = fourParticipantBattleScreenState(publicResolution);
    if (!screenState) {
      return deepFreeze({ accepted: false, reason: 'FOUR_PARTICIPANTS_UNAVAILABLE', model: null, rendered: false });
    }
    const current = sessions.get(matchId);
    const resolutionIds = screenState.participants.map(row => row.id);
    const participants = current?.participants && exactBattleScreenParticipantSet(current.participants, resolutionIds)
      ? current.participants
      : screenState.participants;
    const participantIds = new Set(participants.map(row => row.id));
    const sourceId = maybeString(publicResolution.attackerId);
    const targetId = maybeString(publicResolution.defenderId);
    if (!sourceId || !targetId || sourceId === targetId ||
        !participantIds.has(sourceId) || !participantIds.has(targetId)) {
      throw new TypeError('BATTLE_SCREEN_LIVE_ATTACK_IDS_INVALID');
    }
    const serial = safeInteger(publicResolution.serial, 'RESOLUTION_SERIAL', 1);
    const preferences = readBattleReplayCardPresentationPreferences(environment);
    const timeline = planBattleConveyor([{
      accepted: true,
      eventId: `battle-screen-resolution:${matchId}:${serial}`,
      kind: 'attack',
      publicData: {
        sourceId,
        targetIds: [targetId]
      }
    }], preferences);
    const plan = timeline.plans[0] || null;
    const model = createBattleScreenModel({
      participants,
      plan,
      persistentAfterstate: screenState.persistentAfterstate,
      returnIntent: 'MATCH_PLAN',
      reducedMotion: preferences.reducedMotion,
      lowPerf: preferences.lowPerf
    });
    const rendered = renderFailSoft(model);
    sessions.set(matchId, {
      participants,
      persistentAfterstate: screenState.persistentAfterstate,
      lastModel: model,
      rendered
    });
    return deepFreeze({ accepted: true, reason: 'OK', model, rendered });
  }

  function acceptAcceptedMatchEnd({ matchId, publicMatchEnd }) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    const current = sessions.get(matchId);
    if (!current?.participants) {
      return deepFreeze({ accepted: false, reason: 'FOUR_PARTICIPANTS_UNAVAILABLE', model: null, rendered: false });
    }
    if (!publicMatchEnd || typeof publicMatchEnd !== 'object' || Array.isArray(publicMatchEnd)) {
      throw new TypeError('BATTLE_SCREEN_LIVE_MATCH_END_INVALID');
    }
    const participantIds = current.participants.map(row => row.id);
    const winnerIds = stringArray(publicMatchEnd.winnerIds, 'BATTLE_SCREEN_LIVE_MATCH_END_WINNER_IDS');
    if (winnerIds.length === 0 || new Set(winnerIds).size !== winnerIds.length ||
        winnerIds.some(id => !participantIds.includes(id))) {
      throw new TypeError('BATTLE_SCREEN_LIVE_MATCH_END_WINNER_IDS_INVALID');
    }
    const preferences = readBattleReplayCardPresentationPreferences(environment);
    let event;
    if (winnerIds.length === 1 && Array.isArray(publicMatchEnd.formalRanking) && publicMatchEnd.formalRanking.length === 4) {
      const winnerId = winnerIds[0];
      const loserIds = publicMatchEnd.formalRanking.map(row => maybeString(row?.id)).filter(id => id && id !== winnerId);
      if (!exactBattleScreenParticipantSet(current.participants, [winnerId, ...loserIds])) {
        throw new TypeError('BATTLE_SCREEN_LIVE_FINISHER_SET_INVALID');
      }
      event = {
        accepted: true,
        eventId: `battle-screen-match-end:${matchId}`,
        kind: 'finisher',
        publicData: { winnerId, loserIds }
      };
    } else {
      event = {
        accepted: true,
        eventId: `battle-screen-match-end:${matchId}`,
        kind: 'compare4',
        publicData: { playerIds: participantIds, winnerIds }
      };
    }
    const plan = planBattleConveyor([event], preferences).plans[0] || null;
    const model = createBattleScreenModel({
      participants: current.participants,
      plan,
      persistentAfterstate: current.persistentAfterstate,
      returnIntent: 'RESULT',
      reducedMotion: preferences.reducedMotion,
      lowPerf: preferences.lowPerf
    });
    const rendered = renderFailSoft(model);
    sessions.set(matchId, { ...current, lastModel: model, rendered });
    return deepFreeze({ accepted: true, reason: 'OK', model, rendered });
  }

  function snapshot(matchId) {
    const current = sessions.get(matchId);
    if (!current) return null;
    return deepFreeze(cloneJson({
      matchId,
      participants: current.participants,
      persistentAfterstate: current.persistentAfterstate,
      lastModel: current.lastModel,
      rendered: current.rendered
    }));
  }

  return Object.freeze({ begin, acceptAcceptedResolution, acceptAcceptedMatchEnd, snapshot });
}

function ensureBattleReplayConveyorEnvironmentStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(BATTLE_CONVEYOR_ENV_STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = BATTLE_CONVEYOR_ENV_STYLE_ID;
  style.textContent = `
#battlePhaseSurface{isolation:isolate}
#battlePhaseSurface [data-battle-conveyor-environment]{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1;opacity:.86}
#battlePhaseSurface [data-battle-conveyor-environment]::before{content:"";position:absolute;inset:5% 0 0;background:radial-gradient(ellipse at 50% 11%,rgba(176,255,233,.18) 0,rgba(55,128,112,.07) 17%,transparent 38%),linear-gradient(180deg,transparent 8%,rgba(16,54,49,.12) 52%,rgba(5,20,18,.38) 100%)}
#battlePhaseSurface [data-battle-conveyor-segment]{position:absolute;left:50%;height:clamp(8px,2.4vh,22px);transform:translate(-50%,-50%);border-radius:50%;background:linear-gradient(90deg,transparent 0%,rgba(63,139,117,.12) 16%,rgba(163,244,213,.23) 50%,rgba(63,139,117,.12) 84%,transparent 100%);box-shadow:0 1px 0 rgba(200,255,236,.08),0 8px 18px rgba(3,16,13,.14);transition:top 220ms cubic-bezier(.2,.7,.2,1),width 220ms cubic-bezier(.2,.7,.2,1),opacity 180ms ease}
#battlePhaseSurface [data-battle-conveyor-segment]::before,#battlePhaseSurface [data-battle-conveyor-segment]::after{content:"";position:absolute;top:-140%;width:14%;height:380%;border-radius:50%;background:radial-gradient(ellipse,rgba(46,112,83,.27),rgba(14,48,39,.08) 58%,transparent 72%);filter:blur(1px)}
#battlePhaseSurface [data-battle-conveyor-segment]::before{left:-3%}
#battlePhaseSurface [data-battle-conveyor-segment]::after{right:-3%}
#battlePhaseSurface [data-battle-conveyor-environment][data-motion-suppressed="true"] [data-battle-conveyor-segment]{transition:none!important}
@media(prefers-reduced-motion:reduce){#battlePhaseSurface [data-battle-conveyor-segment]{transition:none!important}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function battleReplayConveyorEnvironmentSegments(host) {
  if (!host || typeof host.querySelectorAll !== 'function') return [];
  return Array.from(host.querySelectorAll(`[${BATTLE_CONVEYOR_ENV_SEGMENT_ATTR}]`));
}

function ensureBattleReplayConveyorEnvironmentHost(documentRef, segmentCount) {
  const surface = documentRef?.getElementById?.('battlePhaseSurface');
  if (!surface || typeof documentRef?.createElement !== 'function') return null;
  ensureBattleReplayConveyorEnvironmentStyle(documentRef);
  let host = typeof surface.querySelector === 'function'
    ? surface.querySelector(`[${BATTLE_CONVEYOR_ENV_HOST_ATTR}]`)
    : null;
  if (!host) {
    host = documentRef.createElement('div');
    if (!host || typeof host.setAttribute !== 'function') return null;
    host.setAttribute(BATTLE_CONVEYOR_ENV_HOST_ATTR, '');
    host.setAttribute('aria-hidden', 'true');
    if (typeof surface.insertBefore === 'function') surface.insertBefore(host, surface.firstChild || null);
    else if (typeof surface.appendChild === 'function') surface.appendChild(host);
    else return null;
  }
  let segments = battleReplayConveyorEnvironmentSegments(host);
  if (segments.length !== segmentCount) {
    if (typeof host.replaceChildren === 'function') host.replaceChildren();
    else host.textContent = '';
    segments = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = documentRef.createElement('i');
      if (!segment || typeof segment.setAttribute !== 'function') return null;
      segment.setAttribute(BATTLE_CONVEYOR_ENV_SEGMENT_ATTR, `visual-segment-${index}`);
      segment.setAttribute('aria-hidden', 'true');
      if (typeof host.appendChild !== 'function') return null;
      host.appendChild(segment);
      segments.push(segment);
    }
  }
  return { surface, host, segments };
}

export function renderBattleReplayConveyorEnvironmentFrame(frame, environment = {}, eventId = null) {
  if (!frame || frame.presentationOnly !== true ||
      frame.schema !== 'gameroad.battle-conveyor-environment.v1' ||
      frame.environmentAuthority !== 'decorative_visual_loop_only' ||
      frame.gameStateWrite !== false || frame.position109Write !== false ||
      frame.targetWrite !== false || frame.orderWrite !== false ||
      !Array.isArray(frame.segments)) return false;
  const documentRef = environmentValue(environment, 'document');
  const mounted = ensureBattleReplayConveyorEnvironmentHost(documentRef, frame.segments.length);
  if (!mounted?.host?.dataset || mounted.segments.length !== frame.segments.length) return false;
  const { host, segments } = mounted;
  host.dataset.battleConveyorAuthority = frame.environmentAuthority;
  host.dataset.battleConveyorPhase = frame.phase;
  host.dataset.battleConveyorMotion = frame.motionIntent;
  host.dataset.motionSuppressed = frame.motionSuppressed ? 'true' : 'false';
  host.dataset.battleConveyorTravel = String(frame.effectiveTravel);
  if (nonEmptyString(eventId)) host.dataset.battleConveyorEvent = eventId;
  for (let index = 0; index < segments.length; index += 1) {
    const node = segments[index];
    const segment = frame.segments[index];
    if (!node?.dataset || !node.style || !segment || segment.segmentId !== `visual-segment-${index}`) return false;
    node.dataset.battleConveyorSegment = segment.segmentId;
    node.dataset.recycleCycle = String(segment.recycleCycle);
    node.dataset.normalizedDepth = segment.normalizedDepth.toFixed(6);
    node.style.top = `${(segment.screenY * 100).toFixed(3)}%`;
    node.style.width = `${(22 + (76 * segment.scale)).toFixed(3)}%`;
    node.style.opacity = segment.opacity.toFixed(4);
  }
  return true;
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
#resultHeadline.grMatchEndFinisher{filter:brightness(1.08);text-shadow:0 0 18px rgba(255,218,126,.62)}
#resultHeadline.grMatchEndFinisher.grMatchEndFinisherMotion{animation:grMatchEndFinisherPulse .72s ease-out}
@keyframes grMatchEndFinisherPulse{0%{transform:scale(1);text-shadow:0 0 18px rgba(255,218,126,.62)}38%{transform:scale(1.045);text-shadow:0 0 34px rgba(255,218,126,.86)}100%{transform:scale(1);text-shadow:0 0 18px rgba(255,218,126,.62)}}
body.low-perf #resultHeadline.grMatchEndFinisher{animation:none!important;transform:none!important}
@media(prefers-reduced-motion:reduce){#resultHeadline.grMatchEndFinisher{animation:none!important;transform:none!important}}
`;
  documentRef.head.appendChild(style);
  return true;
}

export function renderBattleReplayCardPresentationPlan(plan, environment = {}) {
  if (!plan || plan.presentationOnly !== true) return false;
  const documentRef = environmentValue(environment, 'document');
  ensureBattleReplayCardPresentationStyle(documentRef);

  if (plan.kind === 'finisher' &&
      plan.transition === 'FINISHER_GATHER' &&
      plan.authorityBoundary === 'accepted_public_event_only') {
    const winnerId = maybeString(plan.publicData?.winnerId);
    const loserIds = Array.isArray(plan.publicData?.loserIds) ? plan.publicData.loserIds : null;
    const holdMs = Number.isFinite(plan.timing?.duration) && plan.timing.duration > 0
      ? plan.timing.duration
      : null;
    if (!winnerId ||
        !loserIds || loserIds.length !== 3 ||
        loserIds.some(id => !nonEmptyString(id)) ||
        new Set(loserIds).size !== 3 || loserIds.includes(winnerId) ||
        holdMs == null) {
      return false;
    }
    const resultHeadline = documentRef?.getElementById?.('resultHeadline');
    if (!resultHeadline?.classList || !resultHeadline.dataset) return false;
    const motionAllowed = plan.reducedMotion !== true && plan.lowPerf !== true;
    resultHeadline.dataset.matchEndFinisher = 'FINISHER_GATHER';
    resultHeadline.dataset.matchEndFinisherEvent = plan.eventId;
    resultHeadline.dataset.matchEndFinisherWinner = winnerId;
    resultHeadline.dataset.matchEndFinisherMotion = motionAllowed ? 'allowed' : 'static_only';
    resultHeadline.classList.add('grMatchEndFinisher');
    resultHeadline.classList.toggle('grMatchEndFinisherMotion', motionAllowed);

    const setTimeoutRef = environmentValue(environment, 'setTimeout');
    if (typeof setTimeoutRef === 'function') {
      setTimeoutRef(() => {
        if (resultHeadline.dataset.matchEndFinisherEvent !== plan.eventId) return;
        resultHeadline.classList.remove('grMatchEndFinisher', 'grMatchEndFinisherMotion');
        delete resultHeadline.dataset.matchEndFinisher;
        delete resultHeadline.dataset.matchEndFinisherEvent;
        delete resultHeadline.dataset.matchEndFinisherWinner;
        delete resultHeadline.dataset.matchEndFinisherMotion;
      }, holdMs);
    }
    return true;
  }

  if (plan.visual?.source !== 'fallback') return false;
  const box = documentRef?.getElementById?.('battleResolution');
  if (!box?.classList || !box.dataset) return false;

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
  const renderEnvironment = typeof environment.renderEnvironment === 'function'
    ? environment.renderEnvironment
    : (frame, eventId) => renderBattleReplayConveyorEnvironmentFrame(frame, environment, eventId);

  function environmentFrame(travel, phase, preferences = readBattleReplayCardPresentationPreferences(environment)) {
    return planBattleConveyorEnvironmentFrame({
      segmentCount: BATTLE_CONVEYOR_ENV_SEGMENT_COUNT,
      travel,
      phase,
      reducedMotion: preferences.reducedMotion,
      lowPerf: preferences.lowPerf
    });
  }

  function renderEnvironmentFailSoft(frame, eventId) {
    try {
      renderEnvironment(frame, eventId);
    } catch {
      // Decorative environment is presentation-only and never owns replay/gameplay success.
    }
  }

  function createRuntime(matchId, preferences = readBattleReplayCardPresentationPreferences(environment)) {
    const frame = environmentFrame(0, 'IDLE_READ', preferences);
    return {
      state: createCardPresentationSession({ sessionId: matchId }),
      lastPlan: null,
      lastFinisherPlan: null,
      environmentTravel: 0,
      environmentEventId: `battle-environment:${matchId}:idle`,
      lastEnvironmentFrame: frame
    };
  }

  function begin(matchId) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    const runtime = createRuntime(matchId);
    sessions.set(matchId, runtime);
    renderEnvironmentFailSoft(runtime.lastEnvironmentFrame, runtime.environmentEventId);
    return runtime.state;
  }

  function acceptAcceptedResolution({ matchId, serial }) {
    if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
    safeInteger(serial, 'RESOLUTION_SERIAL', 1);
    const preferences = readBattleReplayCardPresentationPreferences(environment);
    const current = sessions.get(matchId) || createRuntime(matchId, preferences);
    const result = applyCardPresentationEvent(current.state, {
      sessionId: matchId,
      eventId: `battle-resolution:${serial}`,
      authorized: true,
      visibility: 'public',
      kind: 'vfx',
      assets: {}
    }, preferences);

    if (!result.accepted) return result;
    const nextTravel = result.duplicate
      ? current.environmentTravel
      : current.environmentTravel + ((preferences.reducedMotion || preferences.lowPerf) ? 0 : BATTLE_CONVEYOR_ENV_TRAVEL_STEP);
    const nextEnvironmentFrame = result.duplicate
      ? current.lastEnvironmentFrame
      : environmentFrame(nextTravel, 'RESOLVE', preferences);
    const nextEnvironmentEventId = result.duplicate
      ? current.environmentEventId
      : result.plan?.eventId || `battle-resolution:${serial}`;
    sessions.set(matchId, {
      ...current,
      state: result.state,
      lastPlan: result.duplicate ? current.lastPlan : result.plan,
      environmentTravel: nextTravel,
      environmentEventId: nextEnvironmentEventId,
      lastEnvironmentFrame: nextEnvironmentFrame
    });
    if (!result.duplicate && result.plan) {
      try {
        renderPlan(result.plan);
      } catch {
        // Presentation is strictly fail-soft and never owns replay/gameplay success.
      }
      renderEnvironmentFailSoft(nextEnvironmentFrame, nextEnvironmentEventId);
      const setTimeoutRef = environmentValue(environment, 'setTimeout');
      if (typeof setTimeoutRef === 'function') {
        setTimeoutRef(() => {
const latest = sessions.get(matchId);
if (!latest || latest.environmentEventId !== nextEnvironmentEventId) return;
const settleFrame = environmentFrame(
  latest.environmentTravel,
  'SETTLE_AFTERMATH',
  readBattleReplayCardPresentationPreferences(environment)
);
sessions.set(matchId, { ...latest, lastEnvironmentFrame: settleFrame });
renderEnvironmentFailSoft(settleFrame, nextEnvironmentEventId);
        }, BATTLE_CONVEYOR_ENV_SETTLE_MS);
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
    const current = sessions.get(matchId) || createRuntime(matchId);
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
      ...current,
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
      lastFinisherPlan: runtime.lastFinisherPlan,
      environmentTravel: runtime.environmentTravel,
      environmentEventId: runtime.environmentEventId,
      lastEnvironmentFrame: runtime.lastEnvironmentFrame
    }));
  }

  return Object.freeze({ begin, acceptAcceptedResolution, acceptAcceptedMatchEnd, snapshot });
}
function formatPartnerBattleEventLogRow(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.kind === 'battle_resolution') {
    const data = event.data;
    if (!data || !Number.isSafeInteger(data.round) || !nonEmptyString(data.lane)) return null;
    const totals = data.teamTotals && Number.isFinite(data.teamTotals.A) && Number.isFinite(data.teamTotals.B)
      ? `・A ${data.teamTotals.A} / B ${data.teamTotals.B}`
      : '';
    return `第${data.round}ラウンド・${data.lane}列${totals}・勝者${Number(data.winnerCount) || 0}人`;
  }
  if (event.kind === 'match_ended') {
    const data = event.data;
    if (!data || !Number.isSafeInteger(data.round)) return null;
    return `対戦終了・第${data.round}ラウンド・勝者${Number(data.winnerCount) || 0}人`;
  }
  return Number.isSafeInteger(event.sequence) ? `対戦イベント ${event.sequence}` : null;
}

function ensurePartnerBattleEventLogHost(environment = {}) {
  const documentRef = environmentValue(environment, 'document');
  const shell = documentRef?.getElementById?.('battleLog');
  if (!shell || typeof documentRef?.createElement !== 'function') return null;
  let host = typeof shell.querySelector === 'function'
    ? shell.querySelector(`[${PARTNER_BATTLE_LOG_HOST_ATTR}]`)
    : null;
  if (!host) {
    host = documentRef.createElement('div');
    if (!host || typeof host.setAttribute !== 'function' || typeof shell.appendChild !== 'function') return null;
    host.setAttribute(PARTNER_BATTLE_LOG_HOST_ATTR, '');
    host.setAttribute('role', 'log');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    host.setAttribute('aria-relevant', 'additions text');
    host.setAttribute('aria-label', '対戦ログ');
    if (host.style) host.style.whiteSpace = 'pre-line';
    shell.appendChild(host);
  }
  return host;
}

function partnerBattleEventLogChildren(host) {
  if (!host?.children || typeof host.children.length !== 'number') return null;
  return Array.from(host.children);
}

function resetPartnerBattleEventLogHost(host) {
  if (!host?.dataset) return false;
  if (typeof host.replaceChildren === 'function') host.replaceChildren();
  else host.textContent = '';
  host.dataset.partnerBattleEventCount = '0';
  return true;
}

export function renderPartnerBattleEventLogProjection(projection, environment = {}) {
  if (!projection ||
      projection.ok !== true ||
      projection.schema !== PARTNER_BATTLE_EVENT_PROJECTION.schema ||
      !Array.isArray(projection.events)) {
    return false;
  }
  const rows = projection.events.map(formatPartnerBattleEventLogRow);
  if (rows.some(row => row == null)) return false;
  const host = ensurePartnerBattleEventLogHost(environment);
  const documentRef = environmentValue(environment, 'document');
  const children = partnerBattleEventLogChildren(host);
  if (!host?.dataset || !children || typeof host.appendChild !== 'function' ||
      typeof documentRef?.createElement !== 'function') {
    return false;
  }

  const acceptedCount = Number(host.dataset.partnerBattleEventCount ?? 0);
  if (!Number.isSafeInteger(acceptedCount) || acceptedCount < 0 ||
      acceptedCount !== children.length || acceptedCount > rows.length) {
    return false;
  }
  for (let index = 0; index < acceptedCount; index += 1) {
    const child = children[index];
    if (!child ||
        child.getAttribute?.(PARTNER_BATTLE_LOG_ROW_ATTR) !== String(index + 1) ||
        child.textContent !== rows[index]) {
      return false;
    }
  }

  const additions = [];
  for (let index = acceptedCount; index < rows.length; index += 1) {
    const row = documentRef.createElement('div');
    if (!row || typeof row.setAttribute !== 'function') return false;
    row.setAttribute(PARTNER_BATTLE_LOG_ROW_ATTR, String(index + 1));
    row.textContent = rows[index];
    additions.push(row);
  }
  for (const row of additions) host.appendChild(row);
  host.dataset.partnerBattleEventCount = String(rows.length);
  return true;
}

export function createPartnerBattleEventLogPresentationBridge(environment = {}) {
  function begin() {
    const host = ensurePartnerBattleEventLogHost(environment);
    return resetPartnerBattleEventLogHost(host);
  }

  function acceptSession(session) {
    return createPartnerBattleEventLogConsumerAdapter({
      readReplay: () => readLiveReplay(session),
      consumeProjection(projection) {
        if (!renderPartnerBattleEventLogProjection(projection, environment)) {
          throw new Error('PARTNER_BATTLE_LOG_SURFACE_UNAVAILABLE');
        }
      }
    })();
  }

  return Object.freeze({ begin, acceptSession });
}

const liveCardPresentationBridge = createBattleReplayCardPresentationBridge();
const liveBattleScreenPresentationBridge = createBattleScreenLivePresentationBridge();
const livePartnerBattleEventLogBridge = createPartnerBattleEventLogPresentationBridge();

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
  { matchId, versions, participants = null },
  {
    presentationBridge = liveCardPresentationBridge,
    battleScreenPresentationBridge = liveBattleScreenPresentationBridge,
    partnerBattleEventLogBridge = livePartnerBattleEventLogBridge
  } = {}
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
  try {
    battleScreenPresentationBridge?.begin?.(matchId, participants);
  } catch {
    // Battle screen is presentation-only and never owns replay/gameplay success.
  }
  try {
    partnerBattleEventLogBridge?.begin?.(matchId);
  } catch {
    // Partner log is presentation-only and never owns replay/gameplay success.
  }
  return session;
}

export function appendAcceptedBattleResolution(
  session,
  resolution,
  {
    presentationBridge = liveCardPresentationBridge,
    battleScreenPresentationBridge = liveBattleScreenPresentationBridge,
    partnerBattleEventLogBridge = livePartnerBattleEventLogBridge
  } = {}
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
  try {
    battleScreenPresentationBridge?.acceptAcceptedResolution?.({
      matchId: session.matchId,
      publicResolution: projected
    });
  } catch {
    // Accepted replay/gameplay state is authoritative; Battle screen never blocks it.
  }
  try {
    partnerBattleEventLogBridge?.acceptSession?.(next);
  } catch {
    // Accepted replay/gameplay state is authoritative; Partner log never blocks it.
  }
  return next;
}

export function appendAcceptedMatchEnd(
  session,
  { winnerIds, round, mode, formalRanking = null },
  {
    presentationBridge = liveCardPresentationBridge,
    battleScreenPresentationBridge = liveBattleScreenPresentationBridge,
    partnerBattleEventLogBridge = livePartnerBattleEventLogBridge
  } = {}
) {
  assertSession(session);
  if (session.ended) throw new TypeError('LIVE_REPLAY_ALREADY_ENDED');
  const normalizedWinnerIds = stringArray(winnerIds, 'MATCH_END_WINNER_IDS');
  const normalizedMode = maybeString(mode);
  if (!normalizedMode) throw new TypeError('MATCH_END_MODE_INVALID');
  if (normalizedMode === '4p' &&
      (normalizedWinnerIds.length === 0 || new Set(normalizedWinnerIds).size !== normalizedWinnerIds.length)) {
    throw new TypeError('MATCH_END_FORMAL_WINNER_IDS_INVALID');
  }
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
  } else if (normalizedMode === '4p') {
    const derivedRanking = deriveFree4pFormalRankingFromAcceptedReplay(session.log, normalizedWinnerIds, publicData.round);
    if (!derivedRanking) throw new TypeError('MATCH_END_FORMAL_RANKING_UNAVAILABLE');
    publicData.formalRanking = derivedRanking;
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
  try {
    battleScreenPresentationBridge?.acceptAcceptedMatchEnd?.({
      matchId: session.matchId,
      publicMatchEnd: publicData
    });
  } catch {
    // Accepted replay/gameplay state is authoritative; Battle screen never blocks it.
  }
  try {
    partnerBattleEventLogBridge?.acceptSession?.(next);
  } catch {
    // Accepted replay/gameplay state is authoritative; Partner log never blocks it.
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
  battleScreen: Object.freeze({
    source: 'accepted_public_battle_resolution_and_match_end',
    actualDomSurface: 'battlePhaseSurface',
    laneCount: 4,
    runtime: 'battle-screen-runtime-mount.mjs',
    authority: 'presentation_only_no_game_state_write'
  }),
  battleConveyorEnvironment: Object.freeze({
  source: 'accepted_public_battle_resolution',
  actualDomSurface: 'battlePhaseSurface',
  segmentCount: BATTLE_CONVEYOR_ENV_SEGMENT_COUNT,
  authority: 'presentation_only_no_game_state_write'
}),
  matchEndFinisher: Object.freeze({    source: 'accepted_free4p_single_winner_formal_ranking',
    kind: 'finisher',
    transition: 'FINISHER_GATHER',
    authority: 'presentation_only_no_game_state_write'
  }),
  partnerBattleEventLog: Object.freeze({
    source: 'viewer_authorized_public_replay_read',
    projectionSchema: PARTNER_BATTLE_EVENT_PROJECTION.schema,
    actualDomSurface: 'battleLog',
    identityPolicy: PARTNER_BATTLE_EVENT_PROJECTION.identityPolicy,
    privateDataPolicy: PARTNER_BATTLE_EVENT_PROJECTION.privateDataPolicy,
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

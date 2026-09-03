import './battle-board-naki-4p-visual-binding.mjs';

const PROJECTION_SCHEMA = 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1';
const REPLAY_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const R75_HUD_STYLE_ID = 'gameroad-r75-battle-hud-summary-style';
const R75_HUD_HOST_ATTR = 'data-battle-r75-hud-summary';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function safeVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) return null;
  const projected = {};
  for (const key of VERSION_KEYS) {
    if (!nonEmptyString(versions[key])) return null;
    projected[key] = versions[key];
  }
  return projected;
}

function safeCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
  if (!nonEmptyString(card.cardId)) return null;
  const value = finiteNumber(card.value);
  if (value === null) return null;
  return {
    cardId: card.cardId,
    value,
    ...(nonEmptyString(card.origin) ? { origin: card.origin } : {})
  };
}

function safePlayer(player) {
  if (!player || typeof player !== 'object' || Array.isArray(player)) return null;
  const score = finiteNumber(player.score);
  if (score === null || !Array.isArray(player.cards)) return null;
  const cards = player.cards.map(safeCard);
  if (cards.some(card => card === null)) return null;
  return {
    ...(nonEmptyString(player.team) ? { team: player.team } : {}),
    score,
    winner: player.winner === true,
    cards
  };
}

function safeLaneGain(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || !nonEmptyString(row.lane)) return null;
  const before = safeInteger(row.before);
  const after = safeInteger(row.after);
  const added = safeInteger(row.added);
  if (before === null || after === null || added === null) return null;
  return { lane: row.lane, before, after, added };
}

function safeMaxLaneProgress(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const before = safeInteger(row.before);
  const after = safeInteger(row.after);
  if (before === null || after === null) return null;
  return { before, after };
}

function safeTeamTotals(teamTotals) {
  if (teamTotals == null) return null;
  if (!teamTotals || typeof teamTotals !== 'object' || Array.isArray(teamTotals)) return null;
  const A = finiteNumber(teamTotals.A);
  const B = finiteNumber(teamTotals.B);
  return A === null || B === null ? null : { A, B };
}

function projectBattleResolution(publicData) {
  if (!publicData || typeof publicData !== 'object' || Array.isArray(publicData)) return null;
  const serial = safeInteger(publicData.serial, 1);
  const round = safeInteger(publicData.round, 1);
  if (serial === null || round === null || !nonEmptyString(publicData.mode) || !nonEmptyString(publicData.lane)) {
    return null;
  }
  if (!Array.isArray(publicData.players) || !Array.isArray(publicData.laneGains) ||
      !Array.isArray(publicData.maxLaneProgress) || !Array.isArray(publicData.winnerIds)) {
    return null;
  }
  const players = publicData.players.map(safePlayer);
  const laneGains = publicData.laneGains.map(safeLaneGain);
  const maxLaneProgress = publicData.maxLaneProgress.map(safeMaxLaneProgress);
  if (players.some(value => value === null) || laneGains.some(value => value === null) ||
      maxLaneProgress.some(value => value === null)) return null;
  const teamTotals = safeTeamTotals(publicData.teamTotals);
  if (publicData.teamTotals != null && teamTotals === null) return null;
  return {
    serial,
    round,
    mode: publicData.mode,
    lane: publicData.lane,
    shieldUsed: nonEmptyString(publicData.shield),
    winnerCount: publicData.winnerIds.length,
    ...(nonEmptyString(publicData.winningTeam) ? { winningTeam: publicData.winningTeam } : {}),
    ...(teamTotals ? { teamTotals } : {}),
    players,
    laneGains,
    maxLaneProgress
  };
}

function projectMatchEnded(publicData) {
  if (!publicData || typeof publicData !== 'object' || Array.isArray(publicData)) return null;
  const round = safeInteger(publicData.round, 1);
  if (round === null || !nonEmptyString(publicData.mode) || !Array.isArray(publicData.winnerIds)) return null;
  return { round, mode: publicData.mode, winnerCount: publicData.winnerIds.length };
}

function projectEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const sequence = safeInteger(event.sequence, 1);
  if (sequence === null || !nonEmptyString(event.kind)) return null;
  if (event.kind === 'battle_resolution') {
    const data = projectBattleResolution(event.publicData);
    return data ? { sequence, kind: event.kind, data } : null;
  }
  if (event.kind === 'match_ended') {
    const data = projectMatchEnded(event.publicData);
    return data ? { sequence, kind: event.kind, data } : null;
  }
  return { sequence, kind: event.kind };
}

export function projectPartnerBattleEventLog(replayRead) {
  if (!replayRead || typeof replayRead !== 'object' || Array.isArray(replayRead)) {
    return deepFreeze({ ok: false, reason: 'REPLAY_READ_INVALID' });
  }
  if (replayRead.ok !== true || replayRead.status !== 'ready') {
    return deepFreeze({ ok: false, reason: 'REPLAY_NOT_READY' });
  }
  if (replayRead.schema !== REPLAY_SCHEMA || !nonEmptyString(replayRead.matchId)) {
    return deepFreeze({ ok: false, reason: 'REPLAY_AUTHORITY_INVALID' });
  }
  const versions = safeVersions(replayRead.versions);
  if (!versions || !Array.isArray(replayRead.events)) {
    return deepFreeze({ ok: false, reason: 'REPLAY_VERSION_OR_EVENTS_INVALID' });
  }
  const events = replayRead.events.map(projectEvent);
  if (events.some(event => event === null)) {
    return deepFreeze({ ok: false, reason: 'REPLAY_EVENT_INVALID' });
  }
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].sequence !== index + 1) {
      return deepFreeze({ ok: false, reason: 'REPLAY_SEQUENCE_INVALID' });
    }
  }
  return deepFreeze({
    ok: true,
    schema: PROJECTION_SCHEMA,
    sourceSchema: REPLAY_SCHEMA,
    matchId: replayRead.matchId,
    versions,
    eventCount: events.length,
    events
  });
}

function latestBattleResolution(projection) {
  if (!projection || projection.ok !== true || projection.schema !== PROJECTION_SCHEMA || !Array.isArray(projection.events)) {
    return null;
  }
  for (let index = projection.events.length - 1; index >= 0; index -= 1) {
    if (projection.events[index]?.kind === 'battle_resolution') return projection.events[index];
  }
  return null;
}

export function projectR75BattleHudSummary(projection) {
  const event = latestBattleResolution(projection);
  if (!event?.data || !Number.isSafeInteger(event.data.round) || event.data.round < 1) {
    return deepFreeze({ ok: false, reason: 'R75_ACCEPTED_BATTLE_STATE_UNAVAILABLE' });
  }
  const teamTotals = safeTeamTotals(event.data.teamTotals);
  return deepFreeze({
    ok: true,
    presentationOnly: true,
    matchId: projection.matchId,
    sourceSequence: event.sequence,
    turn: event.data.round,
    score: teamTotals,
    selfCardHistory: null,
    opponentHate: null,
    unresolved: Object.freeze([
      'SELF_CARD_HISTORY_NEEDS_VIEWER_IDENTITY_AUTHORITY',
      'OPPONENT_HATE_NOT_IN_PUBLIC_REPLAY_PROJECTION'
    ])
  });
}

function ensureR75HudStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(R75_HUD_STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = R75_HUD_STYLE_ID;
  style.textContent = `
#battlePhaseSurface [${R75_HUD_HOST_ATTR}]{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:18;display:flex;align-items:center;gap:10px;pointer-events:none;font:800 12px/1.1 system-ui,sans-serif;letter-spacing:.08em}
#battlePhaseSurface [${R75_HUD_HOST_ATTR}]>span{display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:999px;background:rgba(7,16,24,.72);border:1px solid rgba(255,255,255,.2);box-shadow:0 4px 14px rgba(0,0,0,.18);backdrop-filter:blur(6px)}
@media (max-width:720px){#battlePhaseSurface [${R75_HUD_HOST_ATTR}]{top:7px;gap:6px;font-size:10px}#battlePhaseSurface [${R75_HUD_HOST_ATTR}]>span{min-height:24px;padding:0 8px}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function findR75HudHost(surface) {
  return typeof surface?.querySelector === 'function'
    ? surface.querySelector(`[${R75_HUD_HOST_ATTR}]`)
    : null;
}

export function renderR75BattleHudSummary(projection, { document: documentRef = globalThis?.document } = {}) {
  const summary = projectR75BattleHudSummary(projection);
  if (!summary.ok || !documentRef || typeof documentRef.createElement !== 'function') return false;
  const surface = documentRef.getElementById?.('battlePhaseSurface');
  if (!surface || typeof surface.appendChild !== 'function') return false;
  ensureR75HudStyle(documentRef);

  let host = findR75HudHost(surface);
  if (!host) {
    host = documentRef.createElement('div');
    if (!host || typeof host.setAttribute !== 'function') return false;
    host.setAttribute(R75_HUD_HOST_ATTR, '');
    host.setAttribute('aria-label', 'Battle turn and score');
    surface.appendChild(host);
  }
  if (!host.dataset || typeof host.replaceChildren !== 'function') return false;

  const turn = documentRef.createElement('span');
  turn.setAttribute?.('data-r75-hud-turn', '');
  turn.textContent = `TURN ${summary.turn}`;
  const children = [turn];
  if (summary.score) {
    const score = documentRef.createElement('span');
    score.setAttribute?.('data-r75-hud-score', '');
    score.textContent = `SCORE A ${summary.score.A} / B ${summary.score.B}`;
    children.push(score);
  }
  host.replaceChildren(...children);
  host.dataset.matchId = summary.matchId;
  host.dataset.sourceSequence = String(summary.sourceSequence);
  host.dataset.presentationOnly = 'true';
  host.dataset.selfCardHistory = 'unresolved';
  host.dataset.opponentHate = 'unresolved';
  return true;
}

export function createPartnerBattleEventLogConsumerAdapter({
  readReplay,
  consumeProjection,
  renderHud = renderR75BattleHudSummary
} = {}) {
  if (typeof readReplay !== 'function') throw new TypeError('readReplay must be a function');
  if (typeof consumeProjection !== 'function') throw new TypeError('consumeProjection must be a function');

  return function consumePartnerBattleEventLog() {
    let replayRead;
    try {
      replayRead = readReplay();
    } catch {
      return deepFreeze({ ok: false, consumed: false, reason: 'REPLAY_READ_FAILED' });
    }

    const projection = projectPartnerBattleEventLog(replayRead);
    if (!projection.ok) {
      return deepFreeze({ ok: false, consumed: false, reason: projection.reason });
    }

    try {
      consumeProjection(projection);
    } catch {
      return deepFreeze({ ok: false, consumed: false, reason: 'PARTNER_CONSUMER_FAILED' });
    }

    try {
      if (typeof renderHud === 'function') renderHud(projection);
    } catch {
      // R75 HUD is presentation-only and never owns accepted replay/gameplay success.
    }

    return deepFreeze({
      ok: true,
      consumed: true,
      schema: projection.schema,
      matchId: projection.matchId,
      versions: projection.versions,
      eventCount: projection.eventCount
    });
  };
}

export const PARTNER_BATTLE_EVENT_PROJECTION = Object.freeze({
  schema: PROJECTION_SCHEMA,
  sourceSchema: REPLAY_SCHEMA,
  sourceAuthority: 'viewer-authorized BattleReplay read result',
  storageAuthority: 'NONE',
  identityPolicy: 'DROP_PLAYER_IDS_AND_NAMES',
  privateDataPolicy: 'NEVER_PROJECT_PRIVATE_DATA',
  provenancePolicy: 'PRESERVE_EXACT_REPLAY_VERSIONS',
  r75Hud: Object.freeze({
    source: 'latest accepted public battle_resolution',
    surface: 'battlePhaseSurface',
    fields: Object.freeze(['TURN', 'A_B_SCORE_IF_AVAILABLE']),
    selfCardHistory: 'UNRESOLVED_WITHOUT_VIEWER_IDENTITY',
    opponentHate: 'UNRESOLVED_NOT_PROJECTED',
    authority: 'presentation_only_no_game_state_write'
  })
});
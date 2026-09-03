import './battle-board-naki-4p-visual-binding.mjs';

const PROJECTION_SCHEMA = 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1';
const REPLAY_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);
const R75_HUD_SCHEMA = 'gameroad.battle-r75-self-hud-runtime.v2';
const R75_HUD_STYLE_ID = 'gameroad-battle-r75-self-hud-runtime-r2-style';
const R75_HUD_ATTR = 'data-battle-r75-self-hud';
const R75_ACCEPTED_STAGES = new Set(['settle', 'result']);

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

export function createPartnerBattleEventLogConsumerAdapter({
  readReplay,
  consumeProjection
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

function r75Text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function r75PositiveTurn(value) {
  const raw = r75Text(String(value ?? ''));
  const number = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function r75FiniteScore(value) {
  const number = Number(r75Text(String(value ?? '')));
  return Number.isFinite(number) ? number : null;
}

function r75BattleCardLabel(cardNode) {
  const direct = Array.from(cardNode?.childNodes || [])
    .filter(node => node?.nodeType === 3)
    .map(node => r75Text(node.textContent))
    .filter(Boolean)
    .join(' ')
    .trim();
  if (direct) return direct;
  let fallback = r75Text(cardNode?.textContent);
  for (const selector of ['em', 'b', 'small']) {
    const childText = r75Text(cardNode?.querySelector?.(selector)?.textContent);
    if (childText) fallback = fallback.replace(childText, ' ');
  }
  return fallback.replace(/\s+/g, ' ').trim();
}

export function projectBattleR75SelfResolution({ round, localPlayerId, playerIds, resolutionRows, stage } = {}) {
  const turn = r75PositiveTurn(round);
  const localId = r75Text(localPlayerId);
  const ids = Array.isArray(playerIds) ? playerIds.map(r75Text) : [];
  const rows = Array.isArray(resolutionRows) ? resolutionRows : [];
  if (!turn || !localId || !R75_ACCEPTED_STAGES.has(r75Text(stage))) return null;
  if (ids.length === 0 || ids.length !== rows.length) return null;
  const localIndex = ids.indexOf(localId);
  if (localIndex < 0 || ids.indexOf(localId, localIndex + 1) >= 0) return null;
  const row = rows[localIndex];
  const score = r75FiniteScore(row?.score);
  if (score === null) return null;
  const cards = (Array.isArray(row?.cards) ? row.cards : []).flatMap(card => {
    if (r75Text(card?.origin) !== 'バトル') return [];
    const label = r75Text(card?.label);
    const value = r75FiniteScore(card?.value);
    if (!label || value === null) return [];
    return [{ label, value }];
  });
  return deepFreeze({
    schema: R75_HUD_SCHEMA,
    turn,
    playerId: localId,
    score,
    cards,
    fingerprint: `${turn}|${score}|${cards.map(card => `${card.label}:${card.value}`).join('>')}`
  });
}

export function emptyBattleR75SelfHudState() {
  return deepFreeze({ schema: R75_HUD_SCHEMA, turn: null, score: null, cards: [], fingerprints: [] });
}

export function reduceBattleR75SelfHudState(previous, { turn, resolution = null, reset = false } = {}) {
  const current = previous?.schema === R75_HUD_SCHEMA ? previous : emptyBattleR75SelfHudState();
  const nextTurn = r75PositiveTurn(turn);
  const shouldReset = reset === true || (nextTurn !== null && current.turn !== null && nextTurn < current.turn);
  const base = shouldReset ? emptyBattleR75SelfHudState() : current;
  const fingerprints = [...base.fingerprints];
  const cards = [...base.cards];
  let score = base.score;
  if (resolution?.schema === R75_HUD_SCHEMA && resolution.fingerprint && !fingerprints.includes(resolution.fingerprint)) {
    fingerprints.push(resolution.fingerprint);
    score = resolution.score;
    for (const card of resolution.cards) cards.push({ ...card, turn: resolution.turn });
  }
  return deepFreeze({ schema: R75_HUD_SCHEMA, turn: nextTurn ?? base.turn, score, cards, fingerprints });
}

export function readBattleR75SelfHudDom(documentRef) {
  if (!documentRef?.querySelector || !documentRef?.querySelectorAll) {
    return deepFreeze({ turn: null, resolution: null, reason: 'DOCUMENT_UNAVAILABLE' });
  }
  const turn = r75PositiveTurn(documentRef.getElementById?.('roundNo')?.textContent);
  if (documentRef.body?.classList?.contains?.('friend-room-match')) {
    return deepFreeze({ turn, resolution: null, reason: 'FRIEND_ROOM_IDENTITY_UNRESOLVED' });
  }
  const resolutionRoot = documentRef.getElementById?.('battleResolution');
  const localChip = documentRef.querySelector('#publicPlayerStrip .publicPlayerChip.you[data-player-id]');
  const chips = [...documentRef.querySelectorAll('#publicPlayerStrip .publicPlayerChip')];
  const rows = [...documentRef.querySelectorAll('#battleResolution .resolutionPlayer')];
  const playerIds = chips.map(chip => r75Text(chip?.dataset?.playerId));
  const resolutionRows = rows.map(row => ({
    score: r75Text(row?.querySelector?.('.resolutionScore')?.textContent),
    cards: [...(row?.querySelectorAll?.('.resolutionCard') || [])].map(card => ({
      origin: r75Text(card?.querySelector?.('em')?.textContent),
      label: r75BattleCardLabel(card),
      value: r75Text(card?.querySelector?.('b')?.textContent)
    }))
  }));
  return deepFreeze({
    turn,
    resolution: projectBattleR75SelfResolution({
      round: turn,
      localPlayerId: localChip?.dataset?.playerId,
      playerIds,
      resolutionRows,
      stage: resolutionRoot?.dataset?.stage
    }),
    reason: null
  });
}

function ensureBattleR75Style(documentRef) {
  if (!documentRef?.head || !documentRef.createElement || documentRef.getElementById?.(R75_HUD_STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = R75_HUD_STYLE_ID;
  style.textContent = `
[${R75_HUD_ATTR}="1"]{position:absolute;z-index:44;left:50%;top:4px;transform:translateX(-50%);min-height:38px;max-width:min(52vw,420px);display:flex;align-items:flex-start;justify-content:center;gap:6px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7fff9}
[${R75_HUD_ATTR}="1"][hidden]{display:none!important}
[${R75_HUD_ATTR}="1"] .grR75Metric{min-width:42px;height:36px;padding:3px 6px;display:grid;place-items:center;border:1px solid rgba(231,249,241,.38);border-radius:11px;background:rgba(3,24,19,.88);box-shadow:0 7px 18px rgba(0,0,0,.28);font-variant-numeric:tabular-nums}
[${R75_HUD_ATTR}="1"] .grR75Metric span{font-size:6px;line-height:1;font-weight:950;letter-spacing:.12em;color:#a8c8bd}
[${R75_HUD_ATTR}="1"] .grR75Metric b{font-size:16px;line-height:1;font-weight:1000}
[${R75_HUD_ATTR}="1"] .grR75Chain{min-width:0;max-width:330px;height:40px;display:flex;align-items:flex-start;justify-content:center;gap:1px;overflow:hidden}
[${R75_HUD_ATTR}="1"] .grR75Card{--gr-r75-arc:0px;width:28px;height:36px;flex:0 1 28px;min-width:20px;padding:2px;transform:translateY(var(--gr-r75-arc));display:grid;grid-template-rows:1fr auto;place-items:center;border:1px solid rgba(255,239,199,.72);border-radius:5px;background:linear-gradient(160deg,rgba(250,246,229,.97),rgba(183,174,151,.96));color:#16221d;box-shadow:0 5px 12px rgba(0,0,0,.24);overflow:hidden}
[${R75_HUD_ATTR}="1"] .grR75Card small{max-width:100%;font-size:5.5px;line-height:1.05;font-weight:900;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${R75_HUD_ATTR}="1"] .grR75Card b{font-size:10px;line-height:1;font-weight:1000}
[${R75_HUD_ATTR}="1"] .grR75Arrow{align-self:center;margin:0 -1px 2px;font-size:8px;font-weight:1000;color:#ffe2a0;text-shadow:0 1px 3px #000}
@media(max-width:540px) and (orientation:portrait){[${R75_HUD_ATTR}="1"]{top:3px;max-width:calc(100% - 150px);gap:3px}[${R75_HUD_ATTR}="1"] .grR75Metric{min-width:35px;height:32px;padding:2px 4px}[${R75_HUD_ATTR}="1"] .grR75Metric b{font-size:13px}[${R75_HUD_ATTR}="1"] .grR75Chain{height:34px;max-width:180px}[${R75_HUD_ATTR}="1"] .grR75Card{width:22px;height:31px;min-width:15px;flex-basis:22px}}
@media(max-height:430px) and (orientation:landscape){[${R75_HUD_ATTR}="1"]{top:2px;max-width:46vw}[${R75_HUD_ATTR}="1"] .grR75Metric{height:31px;min-width:38px}[${R75_HUD_ATTR}="1"] .grR75Chain{height:34px}[${R75_HUD_ATTR}="1"] .grR75Card{height:31px}}
html.r10LowPerf [${R75_HUD_ATTR}="1"] .grR75Metric{box-shadow:none}
@media(prefers-reduced-motion:reduce){[${R75_HUD_ATTR}="1"] .grR75Card{transform:none}}
`;
  documentRef.head.appendChild(style);
}

function ensureBattleR75Host(documentRef) {
  const battleMap = documentRef?.getElementById?.('battleMap');
  if (!battleMap || !documentRef.createElement) return null;
  let host = battleMap.querySelector?.(`[${R75_HUD_ATTR}="1"]`);
  if (host) return host;
  host = documentRef.createElement('section');
  host.setAttribute(R75_HUD_ATTR, '1');
  host.setAttribute('aria-label', '自分のTurn・Battle SCORE・使用済みBattle Card');
  host.innerHTML = '<div class="grR75Metric grR75Turn"><span>TURN</span><b></b></div><div class="grR75Metric grR75Score" hidden><span>SCORE</span><b></b></div><div class="grR75Chain" aria-label="使用済みBattle Card"></div>';
  battleMap.appendChild(host);
  return host;
}

function renderBattleR75Host(documentRef, host, state) {
  if (!host) return;
  if (!state?.turn) { host.hidden = true; return; }
  host.hidden = false;
  const turnNode = host.querySelector?.('.grR75Turn b');
  if (turnNode) turnNode.textContent = String(state.turn);
  const scoreBox = host.querySelector?.('.grR75Score');
  const scoreNode = scoreBox?.querySelector?.('b');
  const hasScore = Number.isFinite(state.score);
  if (scoreBox) scoreBox.hidden = !hasScore;
  if (scoreNode) scoreNode.textContent = hasScore ? String(state.score) : '';
  const chain = host.querySelector?.('.grR75Chain');
  if (!chain) return;
  chain.replaceChildren?.();
  const cards = Array.isArray(state.cards) ? state.cards : [];
  const midpoint = (cards.length - 1) / 2;
  cards.forEach((card, index) => {
    if (index > 0) {
      const arrow = documentRef.createElement('span');
      arrow.className = 'grR75Arrow';
      arrow.textContent = '▷';
      chain.appendChild(arrow);
    }
    const node = documentRef.createElement('span');
    node.className = 'grR75Card';
    node.style?.setProperty?.('--gr-r75-arc', `${Math.round(Math.abs(index - midpoint) * 1.5)}px`);
    node.setAttribute?.('aria-label', `Turn ${card.turn} Battle Card ${card.label} ${card.value}`);
    const label = documentRef.createElement('small');
    label.textContent = card.label;
    const value = documentRef.createElement('b');
    value.textContent = String(card.value);
    node.appendChild(label);
    node.appendChild(value);
    chain.appendChild(node);
  });
  chain.setAttribute?.('aria-label', cards.length
    ? `使用済みBattle Card ${cards.map(card => `${card.label} ${card.value}`).join(' ▷ ')}`
    : '使用済みBattle Card なし');
}

export function mountBattleR75SelfHudRuntime(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef?.querySelector) return null;
  let state = emptyBattleR75SelfHudState();
  let destroyed = false;
  let observer = null;
  let host = null;

  function reset() {
    state = emptyBattleR75SelfHudState();
    renderBattleR75Host(documentRef, host, state);
  }

  function sync() {
    if (destroyed) return false;
    ensureBattleR75Style(documentRef);
    host = ensureBattleR75Host(documentRef);
    const read = readBattleR75SelfHudDom(documentRef);
    if (read.reason === 'FRIEND_ROOM_IDENTITY_UNRESOLVED') {
      if (host) host.hidden = true;
      return false;
    }
    state = reduceBattleR75SelfHudState(state, { turn: read.turn, resolution: read.resolution });
    renderBattleR75Host(documentRef, host, state);
    return true;
  }

  function install() {
    if (destroyed) return;
    sync();
    const watchTargets = ['roundNo', 'publicPlayerStrip', 'battleResolution']
      .map(id => documentRef.getElementById?.(id)).filter(Boolean);
    if (watchTargets.length && typeof globalRef.MutationObserver === 'function') {
      observer = new globalRef.MutationObserver(() => {
        if (typeof globalRef.queueMicrotask === 'function') globalRef.queueMicrotask(sync);
        else Promise.resolve().then(sync);
      });
      for (const target of watchTargets) observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    for (const id of ['startMatch', 'rematch']) documentRef.getElementById?.(id)?.addEventListener?.('click', reset);
  }

  if (documentRef.readyState === 'loading') documentRef.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();

  const runtime = Object.freeze({
    schema: R75_HUD_SCHEMA,
    sync,
    reset,
    snapshot: () => state,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      host?.remove?.();
      return true;
    }
  });
  globalRef.__GAMEROAD_BATTLE_R75_SELF_HUD__ = runtime;
  return runtime;
}

export const PARTNER_BATTLE_EVENT_PROJECTION = Object.freeze({
  schema: PROJECTION_SCHEMA,
  sourceSchema: REPLAY_SCHEMA,
  sourceAuthority: 'viewer-authorized BattleReplay read result',
  storageAuthority: 'NONE',
  identityPolicy: 'DROP_PLAYER_IDS_AND_NAMES',
  privateDataPolicy: 'NEVER_PROJECT_PRIVATE_DATA',
  provenancePolicy: 'PRESERVE_EXACT_REPLAY_VERSIONS',
  r75HudAuthority: 'CURRENT_VISIBLE_LOCAL_PLAYER_AND_ACCEPTED_RESOLUTION_DOM_ONLY',
  r75HudOpponentHateAuthority: 'NONE_FAIL_CLOSED',
  r75HudLoadJankenAuthority: 'NONE_FAIL_CLOSED'
});

export const BATTLE_R75_SELF_HUD_RUNTIME = Object.freeze({
  schema: R75_HUD_SCHEMA,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  selfIdentityPolicy: 'CURRENT_VISIBLE_LOCAL_PLAYER_ONLY',
  friendRoomIdentityPolicy: 'FAIL_CLOSED',
  opponentHateAuthority: 'NONE',
  loadJankenAuthority: 'NONE'
});

if (typeof globalThis === 'object' && globalThis.document) mountBattleR75SelfHudRuntime(globalThis);

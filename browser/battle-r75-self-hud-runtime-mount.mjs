export const BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA = 'gameroad.battle-r75-self-hud-runtime.v1';

const STYLE_ID = 'gameroad-battle-r75-self-hud-runtime-r1-style';
const HOST_ATTR = 'data-battle-r75-self-hud';
const ACCEPTED_STAGES = new Set(['settle', 'result']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function positiveTurn(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 ? number : null;
}

function finiteScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function battleCardLabel(cardNode) {
  const direct = safeList(Array.from(cardNode?.childNodes || []))
    .filter(node => node?.nodeType === 3)
    .map(node => text(node.textContent))
    .filter(Boolean)
    .join(' ')
    .trim();
  if (direct) return direct;

  let fallback = text(cardNode?.textContent);
  for (const selector of ['em', 'b', 'small']) {
    const childText = text(cardNode?.querySelector?.(selector)?.textContent);
    if (childText) fallback = fallback.replace(childText, ' ');
  }
  return fallback.replace(/\s+/g, ' ').trim();
}

export function projectBattleR75SelfResolution({
  round,
  localPlayerId,
  playerIds,
  resolutionRows,
  stage,
} = {}) {
  const turn = positiveTurn(round);
  const localId = text(localPlayerId);
  const ids = safeList(playerIds).map(text);
  const rows = safeList(resolutionRows);
  if (!turn || !localId || !ACCEPTED_STAGES.has(text(stage))) return null;
  if (ids.length === 0 || ids.length !== rows.length) return null;
  const localIndex = ids.indexOf(localId);
  if (localIndex < 0 || ids.indexOf(localId, localIndex + 1) >= 0) return null;
  const row = rows[localIndex];
  const score = finiteScore(row?.score);
  if (score === null) return null;

  const cards = safeList(row?.cards).flatMap(card => {
    if (text(card?.origin) !== 'バトル') return [];
    const label = text(card?.label);
    const value = finiteScore(card?.value);
    if (!label || value === null) return [];
    return [{ label, value }];
  });

  return deepFreeze({
    schema: BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
    turn,
    playerId: localId,
    score,
    cards: deepFreeze(cards),
    fingerprint: `${turn}|${score}|${cards.map(card => `${card.label}:${card.value}`).join('>')}`,
  });
}

export function emptyBattleR75SelfHudState() {
  return deepFreeze({
    schema: BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
    turn: null,
    score: null,
    cards: deepFreeze([]),
    fingerprints: deepFreeze([]),
  });
}

export function reduceBattleR75SelfHudState(previous, {
  turn,
  resolution = null,
  reset = false,
} = {}) {
  const current = previous?.schema === BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA
    ? previous
    : emptyBattleR75SelfHudState();
  const nextTurn = positiveTurn(turn);
  const shouldReset = reset === true || (
    nextTurn !== null && current.turn !== null && nextTurn < current.turn
  );
  const base = shouldReset ? emptyBattleR75SelfHudState() : current;
  const fingerprints = [...base.fingerprints];
  const cards = [...base.cards];
  let score = base.score;

  if (resolution?.schema === BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA &&
      resolution.fingerprint && !fingerprints.includes(resolution.fingerprint)) {
    fingerprints.push(resolution.fingerprint);
    score = resolution.score;
    for (const card of resolution.cards) cards.push({ ...card, turn: resolution.turn });
  }

  return deepFreeze({
    schema: BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
    turn: nextTurn ?? base.turn,
    score,
    cards: deepFreeze(cards),
    fingerprints: deepFreeze(fingerprints),
  });
}

export function readBattleR75SelfHudDom(documentRef) {
  if (!documentRef?.querySelector || !documentRef?.querySelectorAll) {
    return deepFreeze({ turn: null, resolution: null, reason: 'DOCUMENT_UNAVAILABLE' });
  }
  if (documentRef.body?.classList?.contains?.('friend-room-match')) {
    return deepFreeze({ turn: positiveTurn(documentRef.getElementById?.('roundNo')?.textContent), resolution: null, reason: 'FRIEND_ROOM_IDENTITY_UNRESOLVED' });
  }

  const turn = positiveTurn(documentRef.getElementById?.('roundNo')?.textContent);
  const resolutionRoot = documentRef.getElementById?.('battleResolution');
  const localChip = documentRef.querySelector('#publicPlayerStrip .publicPlayerChip.you[data-player-id]');
  const chips = [...documentRef.querySelectorAll('#publicPlayerStrip .publicPlayerChip')];
  const rows = [...documentRef.querySelectorAll('#battleResolution .resolutionPlayer')];
  const playerIds = chips.map(chip => text(chip?.dataset?.playerId));
  const resolutionRows = rows.map(row => ({
    score: text(row?.querySelector?.('.resolutionScore')?.textContent),
    cards: [...(row?.querySelectorAll?.('.resolutionCard') || [])].map(card => ({
      origin: text(card?.querySelector?.('em')?.textContent),
      label: battleCardLabel(card),
      value: text(card?.querySelector?.('b')?.textContent),
    })),
  }));

  return deepFreeze({
    turn,
    resolution: projectBattleR75SelfResolution({
      round: turn,
      localPlayerId: localChip?.dataset?.playerId,
      playerIds,
      resolutionRows,
      stage: resolutionRoot?.dataset?.stage,
    }),
    reason: null,
  });
}

function ensureStyle(documentRef) {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${HOST_ATTR}="1"]{position:absolute;z-index:44;left:50%;top:4px;transform:translateX(-50%);min-height:38px;max-width:min(52vw,420px);display:flex;align-items:flex-start;justify-content:center;gap:6px;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7fff9}
[${HOST_ATTR}="1"][hidden]{display:none!important}
[${HOST_ATTR}="1"] .grR75Metric{min-width:42px;height:36px;padding:3px 6px;display:grid;place-items:center;border:1px solid rgba(231,249,241,.38);border-radius:11px;background:rgba(3,24,19,.88);box-shadow:0 7px 18px rgba(0,0,0,.28);backdrop-filter:blur(5px);font-variant-numeric:tabular-nums}
[${HOST_ATTR}="1"] .grR75Metric span{font-size:6px;line-height:1;font-weight:950;letter-spacing:.12em;color:#a8c8bd}
[${HOST_ATTR}="1"] .grR75Metric b{font-size:16px;line-height:1;font-weight:1000}
[${HOST_ATTR}="1"] .grR75Score[hidden]{display:none!important}
[${HOST_ATTR}="1"] .grR75Chain{min-width:0;max-width:330px;height:40px;display:flex;align-items:flex-start;justify-content:center;gap:1px;overflow:hidden}
[${HOST_ATTR}="1"] .grR75Card{--gr-r75-arc:0px;width:28px;height:36px;flex:0 1 28px;min-width:20px;padding:2px 2px 3px;transform:translateY(var(--gr-r75-arc));display:grid;grid-template-rows:1fr auto;place-items:center;border:1px solid rgba(255,239,199,.72);border-radius:5px;background:linear-gradient(160deg,rgba(250,246,229,.97),rgba(183,174,151,.96));color:#16221d;box-shadow:0 5px 12px rgba(0,0,0,.24);overflow:hidden}
[${HOST_ATTR}="1"] .grR75Card small{max-width:100%;font-size:5.5px;line-height:1.05;font-weight:900;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[${HOST_ATTR}="1"] .grR75Card b{font-size:10px;line-height:1;font-weight:1000}
[${HOST_ATTR}="1"] .grR75Arrow{align-self:center;margin:0 -1px 2px;font-size:8px;font-weight:1000;color:#ffe2a0;text-shadow:0 1px 3px #000}
@media(max-width:540px) and (orientation:portrait){[${HOST_ATTR}="1"]{top:3px;max-width:calc(100% - 150px);gap:3px}[${HOST_ATTR}="1"] .grR75Metric{min-width:35px;height:32px;padding:2px 4px;border-radius:9px}[${HOST_ATTR}="1"] .grR75Metric b{font-size:13px}[${HOST_ATTR}="1"] .grR75Chain{height:34px;max-width:180px}[${HOST_ATTR}="1"] .grR75Card{width:22px;height:31px;min-width:15px;flex-basis:22px}[${HOST_ATTR}="1"] .grR75Card small{font-size:4.8px}[${HOST_ATTR}="1"] .grR75Card b{font-size:8px}[${HOST_ATTR}="1"] .grR75Arrow{font-size:6px}}
@media(max-height:430px) and (orientation:landscape){[${HOST_ATTR}="1"]{top:2px;max-width:46vw}[${HOST_ATTR}="1"] .grR75Metric{height:31px;min-width:38px}[${HOST_ATTR}="1"] .grR75Metric b{font-size:13px}[${HOST_ATTR}="1"] .grR75Chain{height:34px}[${HOST_ATTR}="1"] .grR75Card{height:31px}}
html.r10LowPerf [${HOST_ATTR}="1"] .grR75Metric{backdrop-filter:none;box-shadow:none}
@media(prefers-reduced-motion:reduce){[${HOST_ATTR}="1"] .grR75Card{transform:none}}
`;
  documentRef.head.appendChild(style);
}

function ensureHost(documentRef) {
  const battleMap = documentRef?.getElementById?.('battleMap');
  if (!battleMap || !documentRef.createElement) return null;
  let host = battleMap.querySelector?.(`[${HOST_ATTR}="1"]`);
  if (host) return host;
  host = documentRef.createElement('section');
  host.setAttribute(HOST_ATTR, '1');
  host.setAttribute('aria-label', '自分のTurn・Battle SCORE・使用済みBattle Card');
  host.innerHTML = '<div class="grR75Metric grR75Turn"><span>TURN</span><b></b></div><div class="grR75Metric grR75Score" hidden><span>SCORE</span><b></b></div><div class="grR75Chain" aria-label="使用済みBattle Card"></div>';
  battleMap.appendChild(host);
  return host;
}

function renderHost(documentRef, host, state) {
  if (!host) return;
  if (!state?.turn) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const turn = host.querySelector('.grR75Turn b');
  if (turn) turn.textContent = String(state.turn);
  const scoreBox = host.querySelector('.grR75Score');
  const scoreValue = scoreBox?.querySelector?.('b');
  const hasScore = Number.isFinite(state.score);
  if (scoreBox) scoreBox.hidden = !hasScore;
  if (scoreValue) scoreValue.textContent = hasScore ? String(state.score) : '';

  const chain = host.querySelector('.grR75Chain');
  if (!chain) return;
  chain.replaceChildren();
  const cards = safeList(state.cards);
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
    node.style.setProperty('--gr-r75-arc', `${Math.round(Math.abs(index - midpoint) * 1.5)}px`);
    node.title = `Turn ${card.turn} / ${card.label} / ${card.value}`;
    node.setAttribute('aria-label', `Turn ${card.turn} Battle Card ${card.label} ${card.value}`);
    const label = documentRef.createElement('small');
    label.textContent = card.label;
    const value = documentRef.createElement('b');
    value.textContent = String(card.value);
    node.appendChild(label);
    node.appendChild(value);
    chain.appendChild(node);
  });
  chain.setAttribute('aria-label', cards.length
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
    if (host) renderHost(documentRef, host, state);
  }

  function sync() {
    if (destroyed) return false;
    ensureStyle(documentRef);
    host = ensureHost(documentRef);
    const read = readBattleR75SelfHudDom(documentRef);
    if (read.reason === 'FRIEND_ROOM_IDENTITY_UNRESOLVED') {
      if (host) host.hidden = true;
      return false;
    }
    state = reduceBattleR75SelfHudState(state, { turn: read.turn, resolution: read.resolution });
    renderHost(documentRef, host, state);
    return true;
  }

  function install() {
    if (destroyed) return;
    sync();
    const map = documentRef.getElementById?.('battleMap');
    const MutationObserverRef = globalRef.MutationObserver;
    if (map && typeof MutationObserverRef === 'function') {
      observer = new MutationObserverRef(() => {
        if (typeof globalRef.queueMicrotask === 'function') globalRef.queueMicrotask(sync);
        else Promise.resolve().then(sync);
      });
      observer.observe(map, { subtree: true, childList: true, characterData: true, attributes: true });
    }
    for (const id of ['startMatch', 'rematch']) {
      documentRef.getElementById?.(id)?.addEventListener?.('click', reset);
    }
  }

  if (documentRef.readyState === 'loading') documentRef.addEventListener?.('DOMContentLoaded', install, { once: true });
  else install();

  const runtime = Object.freeze({
    schema: BATTLE_R75_SELF_HUD_RUNTIME_SCHEMA,
    sync,
    reset,
    snapshot: () => state,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      host?.remove?.();
      return true;
    },
  });
  globalRef.__GAMEROAD_BATTLE_R75_SELF_HUD__ = runtime;
  return runtime;
}

if (typeof globalThis === 'object' && globalThis.document) {
  mountBattleR75SelfHudRuntime(globalThis);
}

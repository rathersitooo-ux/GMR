import {
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckForViewer,
} from './battle-self-deck-inspect-core.mjs';

export const BATTLE_SELF_DECK_INSPECT_RUNTIME_MOUNT_SCHEMA = 'gameroad.battle-self-deck-inspect-runtime-mount.v1';

const HOST_ID = 'gameroadSelfDeckInspect';
const PANEL_ID = 'gameroadSelfDeckInspectPanel';

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function unavailable(reason) {
  return Object.freeze({ ok: false, status: 'unavailable', reason });
}

/**
 * Reads only the local human player's live remaining deck from the existing
 * Browser match authority. sourceDeckIds is deliberately ignored because it
 * is the immutable match-start snapshot, not the remaining draw pile.
 */
export function readCurrentSelfRemainingDeck(runtime) {
  const match = runtime?.state?.match;
  if (!match || typeof match !== 'object') return unavailable('MATCH_UNAVAILABLE');
  if (!nonEmptyString(match.id)) return unavailable('MATCH_ID_INVALID');
  if (!Array.isArray(match.players)) return unavailable('PLAYERS_UNAVAILABLE');

  const humans = match.players.filter((player) => player?.human === true);
  if (humans.length !== 1) return unavailable('LOCAL_OWNER_AMBIGUOUS');
  const owner = humans[0];
  if (!nonEmptyString(owner.id)) return unavailable('OWNER_PLAYER_ID_INVALID');
  if (!Array.isArray(owner.deck)) return unavailable('REMAINING_DECK_UNAVAILABLE');
  if (!owner.deck.every(nonEmptyString)) return unavailable('REMAINING_DECK_INVALID');

  return Object.freeze({
    ok: true,
    status: 'ready',
    matchId: match.id,
    ownerPlayerId: owner.id,
    remainingCardIds: Object.freeze([...owner.deck]),
  });
}

function projectionFingerprint(source) {
  // The UI exposes a multiset only. Keep order out of the freshness identity too,
  // so an internal shuffle cannot become an observable side channel.
  const sorted = [...source.remainingCardIds].sort();
  return `${source.matchId}\u001e${source.ownerPlayerId}\u001e${sorted.join('\u001f')}`;
}

function cardLabel(cardId, cardData) {
  if (Array.isArray(cardData)) {
    const card = cardData.find((entry) => entry?.id === cardId);
    const label = card?.display_name ?? card?.name ?? card?.canonical_name;
    if (nonEmptyString(label)) return label;
  }
  return cardId;
}

function setStyles(node, cssText) {
  if (node?.style) node.style.cssText = cssText;
}

function createSurface(documentRef) {
  const existing = documentRef.getElementById?.(HOST_ID);
  if (existing) return existing;
  const battle = documentRef.querySelector?.('section[data-screen="battle"]');
  if (!battle || typeof battle.appendChild !== 'function') return null;

  const host = documentRef.createElement('div');
  host.id = HOST_ID;
  host.dataset.gameroadSelfDeckInspect = 'owner_only_projection';
  setStyles(host, 'position:absolute;top:10px;right:10px;z-index:38;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:min(82vw,360px);font-family:inherit;');

  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.selfDeckInspectToggle = 'true';
  button.setAttribute('aria-controls', PANEL_ID);
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '残り札 --';
  setStyles(button, 'min-width:88px;min-height:44px;padding:8px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.34);background:rgba(13,18,30,.88);color:#fff;font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation;');

  const panel = documentRef.createElement('div');
  panel.id = PANEL_ID;
  panel.dataset.selfDeckInspectPanel = 'true';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', '自分の残り札');
  panel.hidden = true;
  setStyles(panel, 'box-sizing:border-box;width:min(82vw,360px);max-height:min(62vh,460px);overflow:auto;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.28);background:rgba(8,12,22,.94);color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.38);');

  host.appendChild(button);
  host.appendChild(panel);
  battle.appendChild(host);
  return host;
}

function surfaceParts(host) {
  const button = host?.querySelector?.('[data-self-deck-inspect-toggle]') ?? host?.children?.[0] ?? null;
  const panel = host?.querySelector?.('[data-self-deck-inspect-panel]') ?? host?.children?.[1] ?? null;
  return { button, panel };
}

function clearChildren(node) {
  if (!node) return;
  if (typeof node.replaceChildren === 'function') node.replaceChildren();
  else while (node.firstChild) node.removeChild(node.firstChild);
}

function renderProjection({ documentRef, host, projection, cardData }) {
  const { button, panel } = surfaceParts(host);
  if (!button || !panel) return false;
  button.textContent = `残り札 ${projection.total}`;
  host.dataset.matchId = projection.matchId;
  host.dataset.ownerPlayerId = projection.ownerPlayerId;
  host.dataset.projectionRevision = String(projection.revision);
  host.hidden = false;

  clearChildren(panel);
  const summary = documentRef.createElement('div');
  summary.dataset.selfDeckInspectSummary = 'true';
  summary.textContent = `残り ${projection.total}枚 / ${projection.typeCount ?? 0}種類`;
  setStyles(summary, 'font-weight:800;margin-bottom:8px;');
  panel.appendChild(summary);

  for (const entry of projection.cardCounts ?? []) {
    const row = documentRef.createElement('div');
    row.dataset.selfDeckInspectRow = 'true';
    row.dataset.cardId = entry.cardId;
    setStyles(row, 'display:flex;justify-content:space-between;gap:16px;padding:6px 4px;border-top:1px solid rgba(255,255,255,.12);');
    const name = documentRef.createElement('span');
    name.textContent = cardLabel(entry.cardId, cardData);
    const count = documentRef.createElement('strong');
    count.textContent = `×${entry.count}`;
    row.appendChild(name);
    row.appendChild(count);
    panel.appendChild(row);
  }
  return true;
}

export function createBattleSelfDeckInspectRuntimeMount({
  documentRef = globalThis.document,
  runtimeRef = () => globalThis.__GAMEROAD_TEST__,
  cardDataRef = () => globalThis.__CARD_DATA__,
  schedule = (fn, ms) => globalThis.setInterval(fn, ms),
  cancelSchedule = (handle) => globalThis.clearInterval(handle),
  intervalMs = 250,
} = {}) {
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new TypeError('DOCUMENT_REQUIRED');
  }
  if (typeof runtimeRef !== 'function' || typeof cardDataRef !== 'function') {
    throw new TypeError('RUNTIME_REFS_REQUIRED');
  }
  if (typeof schedule !== 'function' || typeof cancelSchedule !== 'function') {
    throw new TypeError('SCHEDULER_REQUIRED');
  }
  if (!Number.isFinite(intervalMs) || intervalMs < 100) throw new TypeError('INTERVAL_INVALID');

  let destroyed = false;
  let host = null;
  let timer = null;
  let currentMatchId = null;
  let fingerprint = null;
  let revision = 0;
  let lastProjection = null;

  const close = () => {
    if (!host) return false;
    const { button, panel } = surfaceParts(host);
    if (!button || !panel) return false;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    return true;
  };

  const setOpen = (open) => {
    if (!host) return false;
    const { button, panel } = surfaceParts(host);
    if (!button || !panel) return false;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    return true;
  };

  const onToggle = () => {
    if (!host || host.hidden) return;
    const { panel } = surfaceParts(host);
    if (panel) setOpen(panel.hidden);
  };
  const onDocumentPointer = (event) => {
    if (!host || host.hidden || host.contains?.(event?.target)) return;
    close();
  };
  const onDocumentKey = (event) => {
    if (event?.key === 'Escape') close();
  };

  const bindSurface = () => {
    if (host && host.isConnected !== false) return host;
    host = createSurface(documentRef);
    if (!host) return null;
    const { button } = surfaceParts(host);
    button?.addEventListener?.('click', onToggle);
    return host;
  };

  const sync = () => {
    if (destroyed) return unavailable('DESTROYED');
    const source = readCurrentSelfRemainingDeck(runtimeRef());
    const surface = bindSurface();
    if (!surface) return unavailable('BATTLE_SURFACE_UNAVAILABLE');
    const battle = documentRef.querySelector?.('section[data-screen="battle"]');
    if (!source.ok || (battle?.classList && !battle.classList.contains('active'))) {
      surface.hidden = true;
      close();
      lastProjection = null;
      return source.ok ? unavailable('BATTLE_NOT_ACTIVE') : source;
    }

    const nextFingerprint = projectionFingerprint(source);
    if (source.matchId !== currentMatchId) {
      currentMatchId = source.matchId;
      fingerprint = null;
      revision = 0;
    } else if (fingerprint !== null && fingerprint !== nextFingerprint) {
      revision += 1;
    }
    fingerprint = nextFingerprint;

    const snapshot = createAuthoritativeRemainingDeckSnapshot({
      matchId: source.matchId,
      ownerPlayerId: source.ownerPlayerId,
      revision,
      remainingCardIds: source.remainingCardIds,
    });
    const projection = projectRemainingDeckForViewer(snapshot, {
      viewer: { authenticated: true, id: source.ownerPlayerId },
    });
    if (!projection.ok || !Array.isArray(projection.cardCounts)) {
      surface.hidden = true;
      close();
      lastProjection = null;
      return unavailable('OWNER_PROJECTION_UNAVAILABLE');
    }
    renderProjection({ documentRef, host: surface, projection, cardData: cardDataRef() });
    lastProjection = projection;
    return projection;
  };

  documentRef.addEventListener?.('pointerdown', onDocumentPointer, true);
  documentRef.addEventListener?.('keydown', onDocumentKey, true);
  sync();
  timer = schedule(sync, intervalMs);

  const destroy = () => {
    if (destroyed) return false;
    destroyed = true;
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    documentRef.removeEventListener?.('pointerdown', onDocumentPointer, true);
    documentRef.removeEventListener?.('keydown', onDocumentKey, true);
    const { button } = surfaceParts(host);
    button?.removeEventListener?.('click', onToggle);
    host?.remove?.();
    host = null;
    lastProjection = null;
    return true;
  };

  return Object.freeze({
    schema: BATTLE_SELF_DECK_INSPECT_RUNTIME_MOUNT_SCHEMA,
    authority: 'read_only_projection_of_existing_match_player_deck',
    sync,
    close,
    destroy,
    snapshot: () => cloneJson(lastProjection),
  });
}

function autoMountBrowserRuntime() {
  if (!globalThis.document || globalThis.__GAMEROAD_BATTLE_SELF_DECK_INSPECT_RUNTIME__) return;
  const start = () => {
    if (globalThis.__GAMEROAD_BATTLE_SELF_DECK_INSPECT_RUNTIME__) return;
    try {
      globalThis.__GAMEROAD_BATTLE_SELF_DECK_INSPECT_RUNTIME__ = createBattleSelfDeckInspectRuntimeMount();
    } catch {
      // Presentation fails soft; Battle/gameplay authority remains untouched.
    }
  };
  if (globalThis.document.readyState === 'loading') {
    globalThis.document.addEventListener('DOMContentLoaded', start, { once: true });
  } else if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(start);
  } else {
    Promise.resolve().then(start);
  }
}

autoMountBrowserRuntime();

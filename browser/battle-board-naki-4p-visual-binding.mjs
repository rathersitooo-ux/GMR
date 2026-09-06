import './battle-board-visual-explanation-runtime-mount.mjs';

const NAKI_CHARACTER_ID = 'partner.naki';
const STYLE_ID = 'gameroad-naki-4p-board-visuals-style';
const SURFACE_ATTR = 'data-naki-4p-board-character';
const ACTIVE_ATTR = 'data-naki-4p-board-active';
const MARKER_SELECTOR = '.boardPlayerToken[data-player]';
const BATTLE_FOCUS_CHROME_SELECTOR = 'body:has(.battle.active) .top';
const PARTICIPANT_IDS = Object.freeze(['P1', 'P2', 'P3', 'P4']);

function asParticipantId(value) {
  const id = String(value ?? '').trim();
  return PARTICIPANT_IDS.includes(id) ? id : null;
}

export function projectFourParticipantNakiBoardMarkers(markers) {
  if (!Array.isArray(markers) || markers.length !== 4) return Object.freeze([]);
  const rows = markers.map(marker => {
    const participantId = asParticipantId(marker?.participantId ?? marker?.dataset?.player);
    if (!participantId) return null;
    return Object.freeze({
      participantId,
      characterId: NAKI_CHARACTER_ID,
      visible: true
    });
  });
  if (rows.some(row => row === null)) return Object.freeze([]);
  if (new Set(rows.map(row => row.participantId)).size !== 4) return Object.freeze([]);
  rows.sort((a, b) => PARTICIPANT_IDS.indexOf(a.participantId) - PARTICIPANT_IDS.indexOf(b.participantId));
  return Object.freeze(rows);
}

function toggleOn(documentRef, id) {
  return /\bON\b/i.test(documentRef?.getElementById?.(id)?.textContent || '');
}

function lowPerformance(globalRef, documentRef) {
  let reduced = false;
  try {
    reduced = globalRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    reduced = false;
  }
  return reduced || toggleOn(documentRef, 'reduceMotion') || toggleOn(documentRef, 'lowPerf');
}

function ensureStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${BATTLE_FOCUS_CHROME_SELECTOR}{display:none!important}
#boardPlayers ${MARKER_SELECTOR}{overflow:visible}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{position:absolute;left:50%;top:50%;width:72px;height:92px;transform:translate(-50%,-82%);display:flex;align-items:flex-end;justify-content:center;pointer-events:none;overflow:visible;filter:drop-shadow(0 7px 10px rgba(0,0,0,.45))}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}] .grtc-image{display:block;width:auto;height:100%;max-width:100%;object-fit:contain;opacity:1;visibility:visible}
#boardPlayers ${MARKER_SELECTOR} .grNaki4pFallback{width:56px;height:72px;display:grid;place-items:end center;padding:0 4px 7px;border:1px solid rgba(255,255,255,.5);border-radius:48% 48% 22% 22%;background:linear-gradient(180deg,rgba(232,218,170,.92),rgba(67,82,77,.95));box-shadow:0 7px 18px rgba(0,0,0,.36);color:#fff;font-size:9px;font-weight:900;letter-spacing:.08em;text-shadow:0 1px 3px #000}
[${ACTIVE_ATTR}="1"] #boardPlayers{z-index:12}
@media(max-width:900px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:62px;height:78px}#boardPlayers ${MARKER_SELECTOR} .grNaki4pFallback{width:48px;height:62px}}
@media(max-height:420px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:54px;height:70px}#boardPlayers ${MARKER_SELECTOR} .grNaki4pFallback{width:43px;height:55px}}
@media(max-width:540px) and (orientation:portrait){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:60px;height:76px}#boardPlayers ${MARKER_SELECTOR} .grNaki4pFallback{width:46px;height:60px}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function failVisible(documentRef, surface) {
  if (surface.querySelector?.('.grtc-image,.grNaki4pFallback')) return;
  const fallback = documentRef.createElement('div');
  fallback.className = 'grNaki4pFallback';
  fallback.textContent = 'ナキ';
  fallback.dataset.fallback = 'visible-silhouette';
  surface.appendChild(fallback);
  surface.dataset.visualState = 'fallback-visible';
}

async function mountNaki(globalRef, documentRef, surface) {
  if (surface.dataset.mountState === 'mounted' || surface.dataset.mountState === 'mounting') return;
  surface.dataset.mountState = 'mounting';
  const runtime = globalRef?.GameRoadThreeCharRuntime;
  if (!runtime || typeof runtime.mount !== 'function') {
    failVisible(documentRef, surface);
    surface.dataset.mountState = 'fallback';
    return;
  }
  try {
    await runtime.mount(surface, {
      characterId: NAKI_CHARACTER_ID,
      state: 'idle',
      assetMode: 'embedded',
      performance: lowPerformance(globalRef, documentRef) ? 'low' : 'normal',
      allowNetwork: false
    });
    if (!surface.querySelector?.('.grtc-image')) failVisible(documentRef, surface);
    surface.dataset.visualState = surface.querySelector?.('.grtc-image') ? 'naki-idle' : 'fallback-visible';
    surface.dataset.mountState = 'mounted';
  } catch {
    surface.replaceChildren?.();
    failVisible(documentRef, surface);
    surface.dataset.mountState = 'fallback';
  }
}

function ensureSurface(globalRef, documentRef, marker, row) {
  let surface = marker.querySelector?.(`[${SURFACE_ATTR}="${row.participantId}"]`);
  if (!surface) {
    surface = documentRef.createElement('div');
    surface.setAttribute(SURFACE_ATTR, row.participantId);
    surface.dataset.participantId = row.participantId;
    surface.dataset.characterId = NAKI_CHARACTER_ID;
    surface.dataset.positionAuthority = 'parent-board-marker';
    surface.setAttribute('aria-hidden', 'true');
    marker.appendChild(surface);
    void mountNaki(globalRef, documentRef, surface);
  }
  surface.hidden = false;
  return surface;
}

function suppressLegacySingleActor(actor, active) {
  if (!actor?.style || !actor?.dataset) return;
  if (active) {
    if (actor.dataset.naki4pHiddenByBinding !== '1') {
      actor.dataset.naki4pPreviousVisibility = actor.style.visibility || '';
      actor.dataset.naki4pHiddenByBinding = '1';
    }
    actor.style.visibility = 'hidden';
    return;
  }
  if (actor.dataset.naki4pHiddenByBinding === '1') {
    actor.style.visibility = actor.dataset.naki4pPreviousVisibility || '';
    delete actor.dataset.naki4pPreviousVisibility;
    delete actor.dataset.naki4pHiddenByBinding;
  }
}

export function installNaki4pBoardVisualBinding(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof documentRef.createElement !== 'function') return null;
  const battleMap = documentRef.getElementById?.('battleMap');
  const markerRoot = documentRef.getElementById?.('boardPlayers');
  if (!battleMap || !markerRoot) return null;
  ensureStyle(documentRef);
  const actor = documentRef.getElementById?.('battleRuntime');
  let destroyed = false;

  function sync() {
    if (destroyed) return Object.freeze({ active: false, participantIds: [] });
    const markers = Array.from(markerRoot.querySelectorAll?.(MARKER_SELECTOR) || []);
    const rows = projectFourParticipantNakiBoardMarkers(markers);
    const active = rows.length === 4;
    battleMap.setAttribute(ACTIVE_ATTR, active ? '1' : '0');
    suppressLegacySingleActor(actor, active);
    const surfaces = () => Array.from(markerRoot.querySelectorAll?.(`[${SURFACE_ATTR}]`) || []);
    if (!active) {
      for (const surface of surfaces()) surface.hidden = true;
      return Object.freeze({ active: false, participantIds: [] });
    }

    const markerByParticipant = new Map(
      markers.map(marker => [asParticipantId(marker?.dataset?.player), marker])
    );
    const live = new Set(rows.map(row => row.participantId));
    for (const row of rows) {
      const marker = markerByParticipant.get(row.participantId);
      if (marker) ensureSurface(globalRef, documentRef, marker, row);
    }
    for (const surface of surfaces()) {
      const ownerId = asParticipantId(surface.parentNode?.dataset?.player);
      if (!live.has(surface.dataset.participantId) || ownerId !== surface.dataset.participantId) surface.remove?.();
    }
    return Object.freeze({
      active: true,
      participantIds: rows.map(row => row.participantId),
      characterIds: rows.map(row => row.characterId),
      visibleCount: rows.length
    });
  }

  const observer = typeof globalRef.MutationObserver === 'function'
    ? new globalRef.MutationObserver(() => queueMicrotask(sync))
    : null;
  observer?.observe(markerRoot, { childList: true, subtree: false });
  sync();

  const controller = Object.freeze({
    sync,
    snapshot: sync,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      suppressLegacySingleActor(actor, false);
      battleMap.setAttribute(ACTIVE_ATTR, '0');
      for (const surface of Array.from(markerRoot.querySelectorAll?.(`[${SURFACE_ATTR}]`) || [])) surface.remove?.();
      return true;
    }
  });
  globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__ = controller;
  return controller;
}

function autoInstall(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef) return;
  const install = () => {
    if (!globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__) installNaki4pBoardVisualBinding(globalRef);
  };
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

autoInstall();

export const NAKI_4P_BOARD_VISUAL_BINDING = Object.freeze({
  characterId: NAKI_CHARACTER_ID,
  participantIds: PARTICIPANT_IDS,
  actualBoardMarkerRoot: '#boardPlayers',
  actualBoardMarkerSelector: MARKER_SELECTOR,
  battleFocusChromeSelector: BATTLE_FOCUS_CHROME_SELECTOR,
  battleFocusChromePolicy: 'SUPPRESS_GLOBAL_BANNER_DURING_ACTIVE_BATTLE_ONLY',
  positionAuthority: 'PARENT_BOARD_PLAYER_MARKER',
  coordinateProjection: 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER',
  presentationOnly: true,
  gameplayAuthority: false,
  failVisible: true
});

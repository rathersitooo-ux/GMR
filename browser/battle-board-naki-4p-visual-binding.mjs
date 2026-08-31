const NAKI_CHARACTER_ID = 'partner.naki';
const HOST_ID = 'gameroad-naki-4p-board-visuals';
const STYLE_ID = 'gameroad-naki-4p-board-visuals-style';
const SURFACE_ATTR = 'data-naki-4p-board-character';
const ACTIVE_ATTR = 'data-naki-4p-board-active';
const PARTICIPANT_IDS = Object.freeze(['P1', 'P2', 'P3', 'P4']);

function asParticipantId(value) {
  const id = String(value ?? '').trim();
  return PARTICIPANT_IDS.includes(id) ? id : null;
}

function pxOffset(value) {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)px$/);
  return match ? Number(match[1]) : 0;
}

export function projectFourParticipantNakiBoardMarkers(markers) {
  if (!Array.isArray(markers) || markers.length !== 4) return Object.freeze([]);
  const rows = markers.map(marker => {
    const participantId = asParticipantId(marker?.participantId ?? marker?.dataset?.player);
    if (!participantId) return null;
    const groupCount = Number(marker?.groupCount ?? marker?.dataset?.groupCount) || 1;
    const left = String(marker?.left ?? marker?.style?.left ?? '').trim();
    const top = String(marker?.top ?? marker?.style?.top ?? '').trim();
    if (!left || !top) return null;
    const ox = pxOffset(marker?.ox ?? marker?.style?.getPropertyValue?.('--ox'));
    const oy = pxOffset(marker?.oy ?? marker?.style?.getPropertyValue?.('--oy'));
    const spread = groupCount > 1 ? 1.35 : 1;
    return Object.freeze({
      participantId,
      characterId: NAKI_CHARACTER_ID,
      left,
      top,
      offsetX: Math.round(ox * spread),
      offsetY: Math.round(oy * spread),
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
#${HOST_ID}{position:absolute;inset:3% 3% 18%;z-index:9;pointer-events:none;overflow:visible}
#${HOST_ID}[hidden]{display:none!important}
#${HOST_ID} [${SURFACE_ATTR}]{--naki-seat-x:0px;--naki-seat-y:0px;position:absolute;width:72px;height:92px;transform:translate(calc(-50% + var(--naki-seat-x)),calc(-82% + var(--naki-seat-y)));display:flex;align-items:flex-end;justify-content:center;pointer-events:none;overflow:visible;filter:drop-shadow(0 7px 10px rgba(0,0,0,.45))}
#${HOST_ID} [${SURFACE_ATTR}] .grtc-image{display:block;width:auto;height:100%;max-width:100%;object-fit:contain;opacity:1;visibility:visible}
#${HOST_ID} .grNaki4pFallback{width:56px;height:72px;display:grid;place-items:end center;padding:0 4px 7px;border:1px solid rgba(255,255,255,.5);border-radius:48% 48% 22% 22%;background:linear-gradient(180deg,rgba(232,218,170,.92),rgba(67,82,77,.95));box-shadow:0 7px 18px rgba(0,0,0,.36);color:#fff;font-size:9px;font-weight:900;letter-spacing:.08em;text-shadow:0 1px 3px #000}
[${ACTIVE_ATTR}="1"] #boardPlayers{z-index:12}
@media(max-width:900px){#${HOST_ID} [${SURFACE_ATTR}]{width:62px;height:78px}#${HOST_ID} .grNaki4pFallback{width:48px;height:62px}}
@media(max-height:420px){#${HOST_ID} [${SURFACE_ATTR}]{width:54px;height:70px}#${HOST_ID} .grNaki4pFallback{width:43px;height:55px}}
@media(max-width:540px) and (orientation:portrait){#${HOST_ID} [${SURFACE_ATTR}]{width:60px;height:76px}#${HOST_ID} .grNaki4pFallback{width:46px;height:60px}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function ensureHost(documentRef, battleMap) {
  let host = documentRef.getElementById?.(HOST_ID);
  if (host) return host;
  host = documentRef.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  host.hidden = true;
  battleMap.appendChild(host);
  return host;
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

function ensureSurface(globalRef, documentRef, host, row) {
  let surface = host.querySelector?.(`[${SURFACE_ATTR}="${row.participantId}"]`);
  if (!surface) {
    surface = documentRef.createElement('div');
    surface.setAttribute(SURFACE_ATTR, row.participantId);
    surface.dataset.participantId = row.participantId;
    surface.dataset.characterId = NAKI_CHARACTER_ID;
    surface.setAttribute('aria-hidden', 'true');
    host.appendChild(surface);
    void mountNaki(globalRef, documentRef, surface);
  }
  surface.style.left = row.left;
  surface.style.top = row.top;
  surface.style.setProperty('--naki-seat-x', `${row.offsetX}px`);
  surface.style.setProperty('--naki-seat-y', `${row.offsetY}px`);
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
  const host = ensureHost(documentRef, battleMap);
  const actor = documentRef.getElementById?.('battleRuntime');
  let destroyed = false;

  function sync() {
    if (destroyed) return Object.freeze({ active: false, participantIds: [] });
    const markers = Array.from(markerRoot.querySelectorAll?.('.boardPlayerToken[data-player]') || []);
    const rows = projectFourParticipantNakiBoardMarkers(markers);
    const active = rows.length === 4;
    battleMap.setAttribute(ACTIVE_ATTR, active ? '1' : '0');
    host.hidden = !active;
    suppressLegacySingleActor(actor, active);
    if (!active) {
      for (const surface of Array.from(host.querySelectorAll?.(`[${SURFACE_ATTR}]`) || [])) surface.hidden = true;
      return Object.freeze({ active: false, participantIds: [] });
    }
    const live = new Set(rows.map(row => row.participantId));
    for (const row of rows) ensureSurface(globalRef, documentRef, host, row);
    for (const surface of Array.from(host.querySelectorAll?.(`[${SURFACE_ATTR}]`) || [])) {
      if (!live.has(surface.dataset.participantId)) surface.remove?.();
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
  observer?.observe(markerRoot, { childList: true, subtree: false, attributes: true, attributeFilter: ['style', 'data-player', 'data-group-count'] });
  globalRef.addEventListener?.('resize', sync);
  sync();

  const controller = Object.freeze({
    sync,
    snapshot: sync,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      globalRef.removeEventListener?.('resize', sync);
      suppressLegacySingleActor(actor, false);
      battleMap.setAttribute(ACTIVE_ATTR, '0');
      host.remove?.();
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
  presentationOnly: true,
  gameplayAuthority: false,
  failVisible: true
});

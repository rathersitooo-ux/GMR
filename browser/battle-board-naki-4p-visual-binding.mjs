import './battle-board-visual-explanation-runtime-mount.mjs';

const STYLE_ID = 'gameroad-controlled-character-4p-board-visuals-style';
const SURFACE_ATTR = 'data-board-controlled-character';
const ACTIVE_ATTR = 'data-controlled-character-4p-board-active';
const MARKER_SELECTOR = '.boardPlayerToken[data-player]';
const BATTLE_FOCUS_CHROME_SELECTOR = 'body:has(.battle.active) .top';
const PARTICIPANT_IDS = Object.freeze(['P1', 'P2', 'P3', 'P4']);
const VISUAL_FOOTPRINT = Object.freeze({
  desktop: Object.freeze({ surfaceWidth: 44, surfaceHeight: 56, fallbackWidth: 34, fallbackHeight: 44 }),
  compact: Object.freeze({ surfaceWidth: 38, surfaceHeight: 48, fallbackWidth: 30, fallbackHeight: 38 }),
  shortLandscape: Object.freeze({ surfaceWidth: 32, surfaceHeight: 40, fallbackWidth: 26, fallbackHeight: 32 }),
  portrait: Object.freeze({ surfaceWidth: 34, surfaceHeight: 44, fallbackWidth: 28, fallbackHeight: 36 })
});

function asParticipantId(value) {
  const id = String(value ?? '').trim();
  return PARTICIPANT_IDS.includes(id) ? id : null;
}

function asCharacterId(value) {
  const id = String(value ?? '').trim();
  return id && id.length <= 160 ? id : null;
}

function markerCharacterId(marker) {
  return asCharacterId(marker?.dataset?.character ?? marker?.dataset?.characterId ?? marker?.dataset?.playerCharacterId);
}

export function projectFourParticipantControlledCharacters(markers) {
  if (!Array.isArray(markers) || markers.length !== 4) return Object.freeze([]);
  const rows = markers.map(marker => {
    const participantId = asParticipantId(marker?.participantId ?? marker?.dataset?.player);
    if (!participantId) return null;
    const characterId = markerCharacterId(marker);
    return Object.freeze({
      participantId,
      characterId,
      identityState: characterId ? 'authoritative-marker-character' : 'participant-generic',
      visible: true
    });
  });
  if (rows.some(row => row === null)) return Object.freeze([]);
  if (new Set(rows.map(row => row.participantId)).size !== 4) return Object.freeze([]);
  rows.sort((a, b) => PARTICIPANT_IDS.indexOf(a.participantId) - PARTICIPANT_IDS.indexOf(b.participantId));
  return Object.freeze(rows);
}

// Compatibility export for existing imports. Semantics are no longer Naki-specific.
export const projectFourParticipantNakiBoardMarkers = projectFourParticipantControlledCharacters;

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
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{position:absolute;left:50%;top:50%;width:${VISUAL_FOOTPRINT.desktop.surfaceWidth}px;height:${VISUAL_FOOTPRINT.desktop.surfaceHeight}px;transform:translate(-50%,-82%);display:flex;align-items:flex-end;justify-content:center;pointer-events:none;overflow:visible;filter:drop-shadow(0 6px 8px rgba(0,0,0,.42))}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}] .grtc-image{display:block;width:auto;height:100%;max-width:100%;object-fit:contain;opacity:1;visibility:visible}
#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.desktop.fallbackWidth}px;height:${VISUAL_FOOTPRINT.desktop.fallbackHeight}px;display:grid;place-items:end center;padding:0 4px 6px;border:1px solid rgba(255,255,255,.5);border-radius:48% 48% 22% 22%;background:linear-gradient(180deg,rgba(136,187,199,.92),rgba(43,67,70,.95));box-shadow:0 6px 14px rgba(0,0,0,.34);color:#fff;font-size:8px;font-weight:900;letter-spacing:.08em;text-shadow:0 1px 3px #000}
[${ACTIVE_ATTR}="1"] #boardPlayers{z-index:12}
@media(max-width:900px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.compact.surfaceWidth}px;height:${VISUAL_FOOTPRINT.compact.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.compact.fallbackWidth}px;height:${VISUAL_FOOTPRINT.compact.fallbackHeight}px}}
@media(max-height:420px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.shortLandscape.surfaceWidth}px;height:${VISUAL_FOOTPRINT.shortLandscape.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.shortLandscape.fallbackWidth}px;height:${VISUAL_FOOTPRINT.shortLandscape.fallbackHeight}px}}
@media(max-width:540px) and (orientation:portrait){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.portrait.surfaceWidth}px;height:${VISUAL_FOOTPRINT.portrait.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.portrait.fallbackWidth}px;height:${VISUAL_FOOTPRINT.portrait.fallbackHeight}px}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function failVisible(documentRef, surface, participantId) {
  if (surface.querySelector?.('.grtc-image,.grControlledCharacterFallback')) return;
  const fallback = documentRef.createElement('div');
  fallback.className = 'grControlledCharacterFallback';
  fallback.textContent = participantId;
  fallback.dataset.fallback = 'controlled-character-identity-unresolved';
  surface.appendChild(fallback);
  surface.dataset.visualState = 'participant-generic';
}

async function mountControlledCharacter(globalRef, documentRef, surface, row) {
  if (surface.dataset.mountState === 'mounted' || surface.dataset.mountState === 'mounting') return;
  const characterId = asCharacterId(row?.characterId);
  if (!characterId) {
    failVisible(documentRef, surface, row.participantId);
    surface.dataset.mountState = 'fallback';
    return;
  }
  surface.dataset.mountState = 'mounting';
  const runtime = globalRef?.GameRoadThreeCharRuntime;
  if (!runtime || typeof runtime.mount !== 'function') {
    failVisible(documentRef, surface, row.participantId);
    surface.dataset.mountState = 'fallback';
    return;
  }
  try {
    await runtime.mount(surface, {
      characterId,
      state: 'idle',
      assetMode: 'embedded',
      performance: lowPerformance(globalRef, documentRef) ? 'low' : 'normal',
      allowNetwork: false
    });
    if (!surface.querySelector?.('.grtc-image')) failVisible(documentRef, surface, row.participantId);
    surface.dataset.visualState = surface.querySelector?.('.grtc-image') ? 'controlled-character-idle' : 'participant-generic';
    surface.dataset.mountState = 'mounted';
  } catch {
    surface.replaceChildren?.();
    failVisible(documentRef, surface, row.participantId);
    surface.dataset.mountState = 'fallback';
  }
}

function ensureSurface(globalRef, documentRef, marker, row) {
  let surface = marker.querySelector?.(`[${SURFACE_ATTR}="${row.participantId}"]`);
  const expectedCharacterId = row.characterId || '';
  if (surface && surface.dataset.characterId !== expectedCharacterId) {
    surface.remove?.();
    surface = null;
  }
  if (!surface) {
    surface = documentRef.createElement('div');
    surface.setAttribute(SURFACE_ATTR, row.participantId);
    surface.dataset.participantId = row.participantId;
    surface.dataset.characterId = expectedCharacterId;
    surface.dataset.identityState = row.identityState;
    surface.dataset.positionAuthority = 'parent-board-marker';
    surface.dataset.role = 'controlled-character';
    surface.setAttribute('aria-hidden', 'true');
    marker.appendChild(surface);
    void mountControlledCharacter(globalRef, documentRef, surface, row);
  }
  surface.hidden = false;
  return surface;
}

function suppressLegacySingleActor(actor, active) {
  if (!actor?.style || !actor?.dataset) return;
  if (active) {
    if (actor.dataset.controlled4pHiddenByBinding !== '1') {
      actor.dataset.controlled4pPreviousVisibility = actor.style.visibility || '';
      actor.dataset.controlled4pHiddenByBinding = '1';
    }
    actor.style.visibility = 'hidden';
    return;
  }
  if (actor.dataset.controlled4pHiddenByBinding === '1') {
    actor.style.visibility = actor.dataset.controlled4pPreviousVisibility || '';
    delete actor.dataset.controlled4pPreviousVisibility;
    delete actor.dataset.controlled4pHiddenByBinding;
  }
}

export function installControlledCharacter4pBoardVisualBinding(globalRef = globalThis) {
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
    const rows = projectFourParticipantControlledCharacters(markers);
    const active = rows.length === 4;
    const authoritativeCharacterCount = rows.filter(row => row.characterId).length;
    battleMap.setAttribute(ACTIVE_ATTR, active ? '1' : '0');
    suppressLegacySingleActor(actor, active && authoritativeCharacterCount === 4);
    const surfaces = () => Array.from(markerRoot.querySelectorAll?.(`[${SURFACE_ATTR}]`) || []);
    if (!active) {
      for (const surface of surfaces()) surface.hidden = true;
      return Object.freeze({ active: false, participantIds: [], authoritativeCharacterCount: 0 });
    }

    const markerByParticipant = new Map(markers.map(marker => [asParticipantId(marker?.dataset?.player), marker]));
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
      authoritativeCharacterCount,
      visibleCount: rows.length
    });
  }

  const observer = typeof globalRef.MutationObserver === 'function'
    ? new globalRef.MutationObserver(() => queueMicrotask(sync))
    : null;
  observer?.observe(markerRoot, { childList: true, subtree: false, attributes: true, attributeFilter: ['data-character'] });
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
  globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__ = controller;
  globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__ = controller;
  return controller;
}

export const installNaki4pBoardVisualBinding = installControlledCharacter4pBoardVisualBinding;

function autoInstall(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef) return;
  const install = () => {
    if (!globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__) installControlledCharacter4pBoardVisualBinding(globalRef);
  };
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

autoInstall();

export const CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING = Object.freeze({
  role: 'CONTROLLED_CHARACTER',
  participantIds: PARTICIPANT_IDS,
  actualBoardMarkerRoot: '#boardPlayers',
  actualBoardMarkerSelector: MARKER_SELECTOR,
  markerCharacterDataset: 'data-character',
  battleFocusChromeSelector: BATTLE_FOCUS_CHROME_SELECTOR,
  battleFocusChromePolicy: 'SUPPRESS_GLOBAL_BANNER_DURING_ACTIVE_BATTLE_ONLY',
  positionAuthority: 'PARENT_BOARD_PLAYER_MARKER',
  coordinateProjection: 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER',
  identityAuthority: 'AUTHORITATIVE_BOARD_MARKER_CHARACTER',
  advicePartnerRole: 'SEPARATE_NOT_A_FALLBACK',
  presentationOnly: true,
  gameplayAuthority: false,
  failVisible: true,
  visualFootprint: VISUAL_FOOTPRINT
});

export const NAKI_4P_BOARD_VISUAL_BINDING = CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING;

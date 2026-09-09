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
  portrait: Object.freeze({ surfaceWidth: 34, surfaceHeight: 44, fallbackWidth: 28, fallbackHeight: 36 }),
});

function canonicalString(value, maximum = 160) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed === value && trimmed.length <= maximum ? trimmed : null;
}

function asParticipantId(value) {
  const id = canonicalString(value, 8);
  return id && PARTICIPANT_IDS.includes(id) ? id : null;
}

function asCharacterId(value) {
  return canonicalString(value, 160);
}

function asNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeMotion(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const phase = canonicalString(source.phase, 32);
  const facing = canonicalString(source.facing, 32);
  const motionSerial = asNonNegativeInteger(source.motionSerial);
  if (!phase || !facing || motionSerial === null) return null;
  const durationNumber = Number(source.durationMs);
  const durationMs = Number.isFinite(durationNumber) && durationNumber >= 0
    ? Math.min(Math.round(durationNumber), 10_000)
    : 0;
  return Object.freeze({
    phase,
    animation: canonicalString(source.animation, 96),
    durationMs,
    easing: canonicalString(source.easing, 128),
    loop: source.loop === true,
    facing,
    reaction: source.reaction == null ? null : canonicalString(source.reaction, 64),
    motionSerial,
    reducedMotion: source.reducedMotion === true,
    lowPerformance: source.lowPerformance === true,
    positionKey: source.positionKey ?? null,
    failVisible: source.failVisible !== false,
  });
}

function normalizeProjectionRows(projectionRows) {
  if (!Array.isArray(projectionRows) || projectionRows.length !== PARTICIPANT_IDS.length) return null;
  const rows = projectionRows.map((source) => {
    const participantId = asParticipantId(source?.participantId);
    const characterId = asCharacterId(source?.characterId);
    const motion = normalizeMotion(source?.motion);
    if (!participantId || !characterId || !motion) return null;
    return Object.freeze({
      participantId,
      characterId,
      positionKey: source?.positionKey ?? motion.positionKey ?? null,
      motion,
    });
  });
  if (rows.some((row) => row === null)) return null;
  if (new Set(rows.map((row) => row.participantId)).size !== PARTICIPANT_IDS.length) return null;
  if (PARTICIPANT_IDS.some((participantId) => !rows.some((row) => row.participantId === participantId))) return null;
  rows.sort((left, right) => PARTICIPANT_IDS.indexOf(left.participantId) - PARTICIPANT_IDS.indexOf(right.participantId));
  return rows;
}

/**
 * Pair the four existing authoritative board markers with a caller-owned
 * controlled-character motion projection. The marker remains the position
 * authority; this function never derives character identity or movement from
 * DOM coordinates/offsets.
 */
export function projectFourParticipantControlledCharacters(markers, projectionRows) {
  if (!Array.isArray(markers) || markers.length !== PARTICIPANT_IDS.length) return Object.freeze([]);
  const markerIds = markers.map((marker) => asParticipantId(marker?.participantId ?? marker?.dataset?.player));
  if (markerIds.some((participantId) => participantId === null)) return Object.freeze([]);
  if (new Set(markerIds).size !== PARTICIPANT_IDS.length) return Object.freeze([]);

  const rows = normalizeProjectionRows(projectionRows);
  if (!rows) return Object.freeze([]);
  if (rows.some((row) => !markerIds.includes(row.participantId))) return Object.freeze([]);

  return Object.freeze(rows.map((row) => Object.freeze({
    participantId: row.participantId,
    characterId: row.characterId,
    positionKey: row.positionKey,
    motion: row.motion,
    visible: true,
  })));
}

// Compatibility export for old imports. Calling the legacy one-argument shape
// now fails closed instead of inventing partner.naki for every participant.
export function projectFourParticipantNakiBoardMarkers(markers, projectionRows = null) {
  return projectFourParticipantControlledCharacters(markers, projectionRows);
}

function ensureStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${BATTLE_FOCUS_CHROME_SELECTOR}{display:none!important}
#boardPlayers ${MARKER_SELECTOR}{overflow:visible}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{position:absolute;left:50%;top:50%;width:${VISUAL_FOOTPRINT.desktop.surfaceWidth}px;height:${VISUAL_FOOTPRINT.desktop.surfaceHeight}px;transform:translate(-50%,-82%);display:flex;align-items:flex-end;justify-content:center;pointer-events:none;overflow:visible;filter:drop-shadow(0 6px 8px rgba(0,0,0,.42));--grcc-facing-scale:1;--grcc-motion-duration:0ms}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}] .grtc-image{display:block;width:auto;height:100%;max-width:100%;object-fit:contain;opacity:1;visibility:visible;transform:scaleX(var(--grcc-facing-scale));transform-origin:50% 85%}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}][data-motion-phase="moving"][data-motion-reduced="0"][data-motion-lowperf="0"] .grtc-image{animation:grccAcceptedMove var(--grcc-motion-duration) ease-out 1}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}][data-motion-phase="selected"][data-motion-reduced="0"][data-motion-lowperf="0"] .grtc-image{animation:grccSelected var(--grcc-motion-duration) ease-out 1}
#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}][data-motion-phase="reacting"][data-motion-reduced="0"][data-motion-lowperf="0"] .grtc-image{animation:grccReact var(--grcc-motion-duration) ease-out 1}
#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.desktop.fallbackWidth}px;height:${VISUAL_FOOTPRINT.desktop.fallbackHeight}px;display:grid;place-items:end center;padding:0 4px 6px;border:1px solid rgba(255,255,255,.5);border-radius:48% 48% 22% 22%;background:linear-gradient(180deg,rgba(136,187,199,.92),rgba(43,67,70,.95));box-shadow:0 6px 14px rgba(0,0,0,.34);color:#fff;font-size:8px;font-weight:900;letter-spacing:.08em;text-shadow:0 1px 3px #000}
[${ACTIVE_ATTR}="1"] #boardPlayers{z-index:12}
@keyframes grccAcceptedMove{0%,100%{transform:scaleX(var(--grcc-facing-scale)) translateY(0)}45%{transform:scaleX(var(--grcc-facing-scale)) translateY(-3px)}}
@keyframes grccSelected{0%,100%{transform:scaleX(var(--grcc-facing-scale)) scale(1)}55%{transform:scaleX(var(--grcc-facing-scale)) scale(1.06)}}
@keyframes grccReact{0%,100%{transform:scaleX(var(--grcc-facing-scale)) translateX(0)}35%{transform:scaleX(var(--grcc-facing-scale)) translateX(-2px)}70%{transform:scaleX(var(--grcc-facing-scale)) translateX(2px)}}
@media(max-width:900px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.compact.surfaceWidth}px;height:${VISUAL_FOOTPRINT.compact.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.compact.fallbackWidth}px;height:${VISUAL_FOOTPRINT.compact.fallbackHeight}px}}
@media(max-height:420px){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.shortLandscape.surfaceWidth}px;height:${VISUAL_FOOTPRINT.shortLandscape.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.shortLandscape.fallbackWidth}px;height:${VISUAL_FOOTPRINT.shortLandscape.fallbackHeight}px}}
@media(max-width:540px) and (orientation:portrait){#boardPlayers ${MARKER_SELECTOR} [${SURFACE_ATTR}]{width:${VISUAL_FOOTPRINT.portrait.surfaceWidth}px;height:${VISUAL_FOOTPRINT.portrait.surfaceHeight}px}#boardPlayers ${MARKER_SELECTOR} .grControlledCharacterFallback{width:${VISUAL_FOOTPRINT.portrait.fallbackWidth}px;height:${VISUAL_FOOTPRINT.portrait.fallbackHeight}px}}
`;
  documentRef.head.appendChild(style);
  return true;
}

function facingScale(facing) {
  return ['left', 'up-left', 'down-left'].includes(facing) ? -1 : 1;
}

function applyMotionProjection(surface, motion) {
  if (!surface?.dataset || !motion) return;
  const previousSerial = surface.dataset.motionSerial;
  surface.dataset.motionPhase = motion.phase;
  surface.dataset.motionAnimation = motion.animation || '';
  surface.dataset.motionFacing = motion.facing;
  surface.dataset.motionSerial = String(motion.motionSerial);
  surface.dataset.motionReduced = motion.reducedMotion ? '1' : '0';
  surface.dataset.motionLowperf = motion.lowPerformance ? '1' : '0';
  surface.dataset.positionKey = motion.positionKey == null ? '' : String(motion.positionKey);
  surface.style?.setProperty?.('--grcc-facing-scale', String(facingScale(motion.facing)));
  surface.style?.setProperty?.('--grcc-motion-duration', `${motion.durationMs}ms`);
  if (previousSerial !== undefined && previousSerial !== surface.dataset.motionSerial) {
    const image = surface.querySelector?.('.grtc-image');
    if (image?.style) {
      image.style.animation = 'none';
      void image.offsetWidth;
      image.style.animation = '';
    }
  }
}

function failVisible(documentRef, surface, participantId) {
  if (surface.querySelector?.('.grtc-image,.grControlledCharacterFallback')) return;
  const fallback = documentRef.createElement('div');
  fallback.className = 'grControlledCharacterFallback';
  fallback.textContent = participantId;
  fallback.dataset.fallback = 'controlled-character-visual-unavailable';
  surface.appendChild(fallback);
  surface.dataset.visualState = 'participant-generic';
}

async function mountControlledCharacter(globalRef, documentRef, surface, row) {
  if (surface.dataset.mountState === 'mounted' || surface.dataset.mountState === 'mounting') return;
  surface.dataset.mountState = 'mounting';
  const runtime = globalRef?.GameRoadThreeCharRuntime;
  if (!runtime || typeof runtime.mount !== 'function') {
    failVisible(documentRef, surface, row.participantId);
    surface.dataset.mountState = 'fallback';
    return;
  }
  try {
    await runtime.mount(surface, {
      characterId: row.characterId,
      state: 'idle',
      assetMode: 'embedded',
      performance: row.motion.lowPerformance ? 'low' : 'normal',
      allowNetwork: false,
    });
    const fallback = surface.querySelector?.('.grControlledCharacterFallback');
    if (surface.querySelector?.('.grtc-image')) fallback?.remove?.();
    else failVisible(documentRef, surface, row.participantId);
    surface.dataset.visualState = surface.querySelector?.('.grtc-image')
      ? 'controlled-character-projected'
      : 'participant-generic';
    surface.dataset.mountState = 'mounted';
    applyMotionProjection(surface, row.motion);
  } catch {
    surface.replaceChildren?.();
    failVisible(documentRef, surface, row.participantId);
    surface.dataset.mountState = 'fallback';
  }
}

function ensureSurface(globalRef, documentRef, marker, row) {
  let surface = marker.querySelector?.(`[${SURFACE_ATTR}="${row.participantId}"]`);
  if (surface && surface.dataset.characterId !== row.characterId) {
    surface.remove?.();
    surface = null;
  }
  if (!surface) {
    surface = documentRef.createElement('div');
    surface.setAttribute(SURFACE_ATTR, row.participantId);
    surface.dataset.participantId = row.participantId;
    surface.dataset.characterId = row.characterId;
    surface.dataset.positionAuthority = 'parent-board-marker';
    surface.dataset.role = 'controlled-character';
    surface.setAttribute('aria-hidden', 'true');
    marker.appendChild(surface);
  }
  surface.hidden = false;
  applyMotionProjection(surface, row.motion);
  void mountControlledCharacter(globalRef, documentRef, surface, row);
  return surface;
}

function readGlobalProjection(globalRef) {
  const source = globalRef?.__GAMEROAD_CONTROLLED_CHARACTER_4P_PROJECTION__;
  if (typeof source === 'function') {
    try {
      const value = source();
      return value && typeof value.then === 'function' ? null : value;
    } catch {
      return null;
    }
  }
  return source ?? null;
}

export function installControlledCharacter4pBoardVisualBinding(globalRef = globalThis, { readProjection = null } = {}) {
  const documentRef = globalRef?.document;
  if (!documentRef || typeof documentRef.createElement !== 'function') return null;
  if (readProjection !== null && typeof readProjection !== 'function') {
    throw new TypeError('readProjection must be a function or null');
  }
  const battleMap = documentRef.getElementById?.('battleMap');
  const markerRoot = documentRef.getElementById?.('boardPlayers');
  if (!battleMap || !markerRoot) return null;
  ensureStyle(documentRef);
  let destroyed = false;
  let appliedProjection = null;

  function sourceProjection() {
    if (appliedProjection !== null) return appliedProjection;
    if (readProjection) {
      try {
        const value = readProjection();
        return value && typeof value.then === 'function' ? null : value;
      } catch {
        return null;
      }
    }
    return readGlobalProjection(globalRef);
  }

  function surfaces() {
    return Array.from(markerRoot.querySelectorAll?.(`[${SURFACE_ATTR}]`) || []);
  }

  function clearSurfaces() {
    for (const surface of surfaces()) surface.remove?.();
  }

  function sync() {
    if (destroyed) return Object.freeze({ active: false, participantIds: [], visibleCount: 0 });
    const markers = Array.from(markerRoot.querySelectorAll?.(MARKER_SELECTOR) || []);
    const rows = projectFourParticipantControlledCharacters(markers, sourceProjection());
    const active = rows.length === PARTICIPANT_IDS.length;
    battleMap.setAttribute(ACTIVE_ATTR, active ? '1' : '0');
    if (!active) {
      clearSurfaces();
      return Object.freeze({ active: false, participantIds: [], characterIds: [], visibleCount: 0 });
    }

    const markerByParticipant = new Map(
      markers.map((marker) => [asParticipantId(marker?.dataset?.player), marker]),
    );
    const live = new Set(rows.map((row) => row.participantId));
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
      participantIds: rows.map((row) => row.participantId),
      characterIds: rows.map((row) => row.characterId),
      motionSerials: rows.map((row) => row.motion.motionSerial),
      visibleCount: rows.length,
    });
  }

  const observer = typeof globalRef.MutationObserver === 'function'
    ? new globalRef.MutationObserver(() => queueMicrotask(sync))
    : null;
  observer?.observe(markerRoot, {
    childList: true,
    subtree: false,
    attributes: true,
    attributeFilter: ['data-player'],
  });

  const controller = Object.freeze({
    sync,
    snapshot: sync,
    applyProjection(projectionRows) {
      if (destroyed) return Object.freeze({ active: false, participantIds: [], visibleCount: 0 });
      appliedProjection = projectionRows;
      return sync();
    },
    clearProjection() {
      if (destroyed) return false;
      appliedProjection = null;
      sync();
      return true;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      observer?.disconnect?.();
      battleMap.setAttribute(ACTIVE_ATTR, '0');
      clearSurfaces();
      if (globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__ === controller) {
        delete globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__;
      }
      if (globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__ === controller) {
        delete globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__;
      }
      return true;
    },
  });
  globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__ = controller;
  // Compatibility alias only; the binding no longer manufactures Naki identity.
  globalRef.__GAMEROAD_NAKI_4P_BOARD_VISUAL_BINDING__ = controller;
  sync();
  return controller;
}

export const installNaki4pBoardVisualBinding = installControlledCharacter4pBoardVisualBinding;

function autoInstall(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  if (!documentRef) return;
  const install = () => {
    if (!globalRef.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__) {
      installControlledCharacter4pBoardVisualBinding(globalRef);
    }
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
  battleFocusChromeSelector: BATTLE_FOCUS_CHROME_SELECTOR,
  battleFocusChromePolicy: 'SUPPRESS_GLOBAL_BANNER_DURING_ACTIVE_BATTLE_ONLY',
  projectionInput: 'CALLER_FOUR_PARTICIPANT_MOTION_DIRECTOR_ROWS',
  identityAuthority: 'CALLER_SUPPLIED_OPAQUE_CHARACTER_ID',
  motionAuthority: 'CALLER_PROJECTED_CONTROLLED_CHARACTER_MOTION',
  positionAuthority: 'PARENT_BOARD_PLAYER_MARKER',
  coordinateProjection: 'NONE__VISUAL_IS_CHILD_OF_AUTHORITATIVE_MARKER',
  unknownIdentityPolicy: 'MARKER_ONLY_NO_FAKE_CHARACTER',
  advicePartnerCoupling: false,
  advicePartnerFallback: false,
  legacyBattleRuntimeSuppressed: false,
  syntheticMovementFromDom: false,
  requiresCompleteFourParticipantProjection: true,
  presentationOnly: true,
  gameplayAuthority: false,
  failVisible: true,
  visualFootprint: VISUAL_FOOTPRINT,
});

// Compatibility name retained for packaged/bootstrap consumers only.
export const NAKI_4P_BOARD_VISUAL_BINDING = CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING;

const SCHEMA = 'gameroad.new-base-goal-entry-gate-cue-runtime.v1';
const STYLE_ID = 'gameroad-new-base-goal-entry-gate-cue-style';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function nonEmptyString(value) { return typeof value === 'string' && value.trim().length > 0; }
function normalizeColor(value) {
  if (!nonEmptyString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length > 96 || /[;{}]/.test(trimmed)) return null;
  return trimmed;
}
function setAttr(node, name, value) {
  if (!node || value == null) return;
  node.setAttribute?.(name, String(value));
  if (name.startsWith('data-') && node.dataset) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    node.dataset[key] = String(value);
  }
}
function createNode(documentLike, tagName, className = '') {
  const node = documentLike.createElement(tagName);
  if (className) node.className = className;
  return node;
}
function removeNode(node) {
  if (!node) return;
  node.remove?.();
  if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}
function setCueColor(node, color) {
  if (!node || !color) return;
  if (node.style?.setProperty) node.style.setProperty('--gameroad-route-gate-color', color);
  else if (node.style) node.style['--gameroad-route-gate-color'] = color;
}
function resolveProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion === true) return 'reduced_motion';
  if (lowPerf === true) return 'low_perf';
  return 'standard';
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function' || documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
.grRouteGoalGate{--gameroad-route-gate-color:#e5d087;position:absolute;z-index:9;left:50%;top:50%;width:clamp(24px,3.9vw,46px);height:clamp(17px,2.8vw,34px);transform:translate(-50%,-50%);pointer-events:none;box-sizing:border-box}
.grRouteGoalGateFrame{position:absolute;inset:0;border:clamp(2px,.3vw,4px) solid color-mix(in srgb,var(--gameroad-route-gate-color) 68%,#d8c99a);border-radius:50%;background:rgba(22,39,35,.18);box-shadow:0 2px 5px rgba(0,0,0,.3),inset 0 0 5px rgba(255,255,255,.08);transition:box-shadow .2s ease,border-color .2s ease}
.grRouteGoalGateBlocker{position:absolute;z-index:3;left:-4%;right:-4%;top:10%;bottom:10%;border:1px solid rgba(86,37,35,.96);border-radius:22% 18% 23% 17%;background:linear-gradient(125deg,#6b2f35 0%,#8a3a3f 28%,#5b252d 62%,#7a3338 100%);box-shadow:inset 0 0 0 2px rgba(229,178,149,.08),inset 5px -4px 9px rgba(33,9,15,.28),0 3px 6px rgba(0,0,0,.34);transform:scale(1.03);transform-origin:center;opacity:1}
.grRouteGoalGateBlocker::before,.grRouteGoalGateBlocker::after{content:"";position:absolute;background:rgba(42,14,20,.32);border-radius:99px;transform:rotate(-18deg)}
.grRouteGoalGateBlocker::before{left:17%;top:12%;width:2px;height:72%}.grRouteGoalGateBlocker::after{right:24%;top:8%;width:2px;height:78%;transform:rotate(23deg)}
.grRouteGoalGateMembrane{position:absolute;z-index:2;inset:12%;border-radius:50%;background:radial-gradient(ellipse at 45% 42%,rgba(235,251,247,.22),rgba(147,211,201,.1) 52%,rgba(100,174,164,.04));box-shadow:inset 0 0 8px color-mix(in srgb,var(--gameroad-route-gate-color) 28%,transparent);opacity:0;transform:scale(.72);transition:opacity .22s ease,transform .22s ease}
.grRouteGoalGate[data-gate-state="OPEN"] .grRouteGoalGateFrame{border-color:color-mix(in srgb,var(--gameroad-route-gate-color) 78%,white);box-shadow:0 0 10px color-mix(in srgb,var(--gameroad-route-gate-color) 52%,transparent),inset 0 0 7px rgba(255,255,255,.16)}
.grRouteGoalGate[data-gate-state="OPEN"] .grRouteGoalGateBlocker{opacity:0;transform:scale(1.7);pointer-events:none}
.grRouteGoalGate[data-gate-state="OPEN"] .grRouteGoalGateMembrane{opacity:1;transform:scale(1)}
.grRouteGoalGate[data-gate-shatter="1"] .grRouteGoalGateBlocker{animation:grRouteGateShatter .44s cubic-bezier(.2,.72,.28,1) both}
@keyframes grRouteGateShatter{0%{opacity:1;transform:scale(1.03) rotate(0)}38%{opacity:1;transform:scale(1.13) rotate(-3deg);filter:brightness(1.5)}100%{opacity:0;transform:scale(1.75) rotate(8deg);filter:brightness(1.8)}}
[data-goal-entry-cue-profile="reduced_motion"] .grRouteGoalGate *,[data-goal-entry-cue-profile="low_perf"] .grRouteGoalGate *{animation:none!important;transition:none!important;filter:none!important}
`;
  documentLike.head.appendChild(style);
}

function validBoardSurface(runtime) {
  return Boolean(runtime && runtime.mounted === true && runtime.presentationOnly === true && runtime.gameplayAuthority === false && runtime.gameStateWrite === false && runtime.movementAuthority === false && typeof runtime.resolveGateAnchor === 'function' && typeof runtime.resolveGoalGuide === 'function' && typeof runtime.resolveGoal === 'function' && typeof runtime.resolveShield === 'function');
}
function validGoalPathPresentation(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.ok === true && value.sharedGoalCount === 1 && nonEmptyString(value.sharedGoalId) && value.presentationOnly === true && value.gameplayAuthority === false && value.gameStateWrite === false && value.movementAuthority === false && value.legalityAuthority === false && value.resultAuthority === false && value.terminalWin === false && Array.isArray(value.lanePresentations));
}
function failSoft(reason, profile) {
  return Object.freeze({ schema: SCHEMA, mounted: false, reason, profile, presentationOnly: true, gameplayAuthority: false, gameStateWrite: false, movementAuthority: false, legalityAuthority: false, resultAuthority: false });
}
function laneKey(participantId, laneIndex) { return `${participantId}:${laneIndex}`; }
function normalizeLaneStates(goalPathPresentation) {
  if (!validGoalPathPresentation(goalPathPresentation)) return null;
  const byKey = new Map();
  for (const lane of goalPathPresentation.lanePresentations) {
    if (!lane || !nonEmptyString(lane.participantId) || !Number.isSafeInteger(lane.laneIndex)) return null;
    const participantId = lane.participantId.trim();
    const key = nonEmptyString(lane.key) ? lane.key.trim() : laneKey(participantId, lane.laneIndex);
    if (key !== laneKey(participantId, lane.laneIndex) || byKey.has(key) || lane.sharedGoalId !== goalPathPresentation.sharedGoalId) return null;
    byKey.set(key, { key, participantId, laneIndex: lane.laneIndex, connectedToGoal: lane.connectedToGoal === true });
  }
  return byKey;
}

function createGate(documentLike, lane, anchor, profile) {
  setAttr(anchor, 'data-goal-entry-cue-profile', profile);
  const gate = createNode(documentLike, 'span', 'grRouteGoalGate');
  setAttr(gate, 'data-goal-entry-gate', lane.key);
  setAttr(gate, 'data-participant-id', lane.participantId);
  setAttr(gate, 'data-lane-index', lane.laneIndex);
  setAttr(gate, 'data-gate-state', 'CLOSED');
  setAttr(gate, 'data-goal-path-open', '0');
  setAttr(gate, 'data-gate-shatter', '0');
  setAttr(gate, 'aria-label', '閉鎖中のGOALゲート');
  const frame = createNode(documentLike, 'span', 'grRouteGoalGateFrame');
  const membrane = createNode(documentLike, 'span', 'grRouteGoalGateMembrane');
  const blocker = createNode(documentLike, 'span', 'grRouteGoalGateBlocker');
  gate.appendChild(frame); gate.appendChild(membrane); gate.appendChild(blocker); anchor.appendChild(gate);
  return { gate, frame, membrane, blocker };
}

function createDetachedArrowCompatibility(documentLike, profile, entryCellId) {
  const stack = createNode(documentLike, 'span', 'grDetachedLegacyGoalArrowCompatibility');
  setAttr(stack, 'data-visual-dom-mounted', 'false');
  setAttr(stack, 'data-entry-cell-id', entryCellId ?? '');
  setAttr(stack, 'data-reduced-motion', profile === 'reduced_motion' ? 'true' : 'false');
  setAttr(stack, 'data-low-perf', profile === 'low_perf' ? 'true' : 'false');
  for (let index = 0; index < 3; index += 1) {
    const arrow = createNode(documentLike, 'span', 'grDetachedLegacyGoalArrow');
    setAttr(arrow, 'data-arrow-index', index);
    stack.appendChild(arrow);
  }
  return stack;
}

export function mountNewBaseGoalEntryGateCue({ boardSurfaceRuntime, goalPathPresentation, participantColors = {}, documentLike = globalThis?.document, reducedMotion = false, lowPerf = false } = {}) {
  const profile = resolveProfile({ reducedMotion, lowPerf });
  if (!documentLike || typeof documentLike.createElement !== 'function') return failSoft('DOM_DOCUMENT_REQUIRED', profile);
  if (!validBoardSurface(boardSurfaceRuntime)) return failSoft('BOARD_SURFACE_RUNTIME_INVALID', profile);
  const initialLaneStates = normalizeLaneStates(goalPathPresentation);
  if (!initialLaneStates) return failSoft('GOAL_PATH_PRESENTATION_INVALID', profile);
  if (boardSurfaceRuntime.resolveGoal()?.dataset?.goalId !== goalPathPresentation.sharedGoalId) return failSoft('SHARED_GOAL_MISMATCH', profile);

  ensureStyle(documentLike);
  const mountedByLaneKey = new Map();
  let activeParticipantColors = participantColors && typeof participantColors === 'object' ? participantColors : {};
  let destroyed = false;
  let shatterTransitionCount = 0;

  for (const lane of initialLaneStates.values()) {
    const anchor = boardSurfaceRuntime.resolveGateAnchor(lane.participantId, lane.laneIndex);
    const guide = boardSurfaceRuntime.resolveGoalGuide(lane.participantId, lane.laneIndex);
    const shield = boardSurfaceRuntime.resolveShield(lane.participantId, lane.laneIndex);
    if (!anchor || !guide || !shield || typeof anchor.appendChild !== 'function') continue;
    const entryCellId = shield.dataset?.clearingEntryCellId ?? null;
    const parts = createGate(documentLike, lane, anchor, profile);
    const arrowStack = createDetachedArrowCompatibility(documentLike, profile, entryCellId);
    mountedByLaneKey.set(lane.key, {
      key: lane.key,
      participantId: lane.participantId,
      laneIndex: lane.laneIndex,
      anchor,
      guide,
      entryCellId,
      arrowStack,
      connectedToGoal: false,
      cueColor: null,
      ...parts,
    });
  }

  function snapshotState() {
    const records = [...mountedByLaneKey.values()];
    const open = records.filter((item) => item.connectedToGoal);
    const resolvedOpen = open.filter((item) => nonEmptyString(item.entryCellId));
    const unresolvedOpen = open.filter((item) => !nonEmptyString(item.entryCellId));
    return deepFreeze({
      laneGateCount: records.length,
      openLaneCount: open.length,
      closedLaneCount: records.length - open.length,
      shatterTransitionCount,
      activeArrowCount: resolvedOpen.length,
      unresolvedOpenLaneKeys: unresolvedOpen.map((item) => item.key),
      activeArrowEntryCellIds: resolvedOpen.map((item) => item.entryCellId),
      detachedCompatibilityArrowStackCount: records.length,
      visibleArrowCount: 0,
      profile,
      animationMode: profile === 'standard' ? 'UPWARD_ARROW_LOOP' : 'STATIC_UPWARD_ARROW',
      visibleAnimationMode: profile === 'standard' ? 'BLOCKER_SHATTER_TO_PORTAL' : 'STATIC_STATE_SWAP',
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      movementAuthority: false,
      legalityAuthority: false,
      resultAuthority: false,
    });
  }

  function syncGoalPathPresentation(nextGoalPathPresentation, { participantColors: nextParticipantColors } = {}) {
    if (destroyed) return Object.freeze({ ok: false, reason: 'RUNTIME_DESTROYED' });
    const nextLaneStates = normalizeLaneStates(nextGoalPathPresentation);
    if (!nextLaneStates) return Object.freeze({ ok: false, reason: 'GOAL_PATH_PRESENTATION_INVALID' });
    if (nextGoalPathPresentation.sharedGoalId !== goalPathPresentation.sharedGoalId || nextLaneStates.size !== mountedByLaneKey.size) return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
    for (const key of mountedByLaneKey.keys()) if (!nextLaneStates.has(key)) return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });

    const colors = nextParticipantColors && typeof nextParticipantColors === 'object' ? nextParticipantColors : activeParticipantColors;
    for (const [key, record] of mountedByLaneKey.entries()) {
      const lane = nextLaneStates.get(key);
      const nextOpen = lane.connectedToGoal === true;
      const wasOpen = record.connectedToGoal;
      const cueColor = normalizeColor(colors?.[record.participantId]);
      record.connectedToGoal = nextOpen;
      record.cueColor = cueColor;
      if (cueColor) setCueColor(record.gate, cueColor);
      setAttr(record.gate, 'data-gate-state', nextOpen ? 'OPEN' : 'CLOSED');
      setAttr(record.gate, 'data-goal-path-open', nextOpen ? '1' : '0');
      setAttr(record.guide, 'data-goal-path-open', nextOpen ? '1' : '0');
      setAttr(record.gate, 'aria-label', nextOpen ? '解放済みのGOALゲート' : '閉鎖中のGOALゲート');
      if (!wasOpen && nextOpen) {
        shatterTransitionCount += 1;
        setAttr(record.gate, 'data-gate-shatter', profile === 'standard' ? '1' : '0');
      } else if (!nextOpen) {
        setAttr(record.gate, 'data-gate-shatter', '0');
      }
    }
    activeParticipantColors = colors;
    return deepFreeze({ ok: true, reason: 'GOAL_ENTRY_GATES_SYNCED', ...snapshotState() });
  }

  const runtime = {
    schema: SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    profile,
    resolveLane(participantId, laneIndex) {
      if (!nonEmptyString(participantId) || !Number.isSafeInteger(laneIndex)) return null;
      return mountedByLaneKey.get(laneKey(participantId.trim(), laneIndex)) ?? null;
    },
    syncGoalPathPresentation,
    snapshot() { return snapshotState(); },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      for (const record of [...mountedByLaneKey.values()].reverse()) removeNode(record.gate);
      return true;
    },
  };
  const initialSync = syncGoalPathPresentation(goalPathPresentation, { participantColors: activeParticipantColors });
  if (initialSync.ok !== true) { runtime.destroy(); return failSoft(initialSync.reason, profile); }
  return Object.freeze(runtime);
}

export const NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT = deepFreeze({
  schema: SCHEMA,
  gateMeaning: 'SEVEN_CARD_ROUTE_TO_SHARED_GOAL_BOUNDARY',
  gatePlacement: 'AFTER_CARD_PATH_BEFORE_SHARED_GOAL',
  closedAppearance: 'SOLID_OPAQUE_HARD_BLOCKER',
  openingAppearance: 'BLOCKER_SHATTERS',
  openAppearance: 'RING_FRAME_WITH_TRANSLUCENT_MEMBRANE',
  preOpenGoalGuide: 'FAINT',
  openGoalGuide: 'EMPHASIZED',
  routeGateCount: 12,
  sharedGoalCount: 1,
  visibleArrowCount: 0,
  detachedLegacyArrowCompatibility: true,
  statefulGoalPathSync: true,
  repeatedSyncIdempotent: true,
  standardMotion: 'BLOCKER_SHATTER_TO_PORTAL',
  reducedMotion: 'STATIC_STATE_SWAP',
  lowPerf: 'STATIC_STATE_SWAP',
  computesSevenCardCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsCamera: false,
  secondMovementEngine: false,
});

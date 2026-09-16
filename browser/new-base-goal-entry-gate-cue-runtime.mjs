const SCHEMA = 'gameroad.new-base-goal-entry-gate-cue-runtime.v1';
const STYLE_ID = 'gameroad-new-base-goal-entry-gate-cue-style';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

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

function removeAttr(node, name) {
  node?.removeAttribute?.(name);
  if (name?.startsWith('data-') && node?.dataset) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    delete node.dataset[key];
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
  if (node.style?.setProperty) node.style.setProperty('--gameroad-goal-entry-cue-color', color);
  else if (node.style) node.style['--gameroad-goal-entry-cue-color'] = color;
}

function resolveProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion === true) return 'reduced_motion';
  if (lowPerf === true) return 'low_perf';
  return 'standard';
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function') return;
  if (documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[data-goal-entry-gate-cell="1"]{position:relative;isolation:isolate;overflow:visible!important}
.grGoalEntryGate{position:absolute;z-index:8;left:50%;bottom:-1px;width:86%;height:clamp(15px,2.7vh,24px);transform:translateX(-50%);pointer-events:none;overflow:visible;--gameroad-goal-entry-cue-color:rgba(255,229,139,.9)}
.grGoalEntryBarrier{position:absolute;left:5%;right:5%;bottom:0;height:72%;border:1px solid rgba(235,243,238,.75);border-radius:3px;background:linear-gradient(180deg,rgba(220,232,226,.92),rgba(63,86,77,.95));box-shadow:0 2px 5px rgba(0,0,0,.30),inset 0 0 0 1px rgba(255,255,255,.08);transform-origin:50% 80%;opacity:1}
.grGoalEntryBarrier::before,.grGoalEntryBarrier::after{content:"";position:absolute;top:8%;bottom:8%;width:1px;background:rgba(29,53,46,.45);transform:rotate(15deg)}
.grGoalEntryBarrier::before{left:35%}.grGoalEntryBarrier::after{right:34%;transform:rotate(-18deg)}
.grGoalEntryHoop{position:absolute;left:8%;right:8%;top:-2px;bottom:-2px;border:2px solid color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 68%,white);border-radius:50% 50% 42% 42%/60% 60% 40% 40%;background:color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 8%,transparent);box-shadow:0 0 10px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 36%,transparent),inset 0 0 8px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 14%,transparent);opacity:0;transform:scale(.82)}
.grGoalEntryMembrane{position:absolute;left:17%;right:17%;top:18%;bottom:10%;border-radius:50%;background:radial-gradient(ellipse at center,color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 12%,transparent),transparent 70%);opacity:0}
.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryBarrier{opacity:0;transform:scale(.55) rotate(3deg)}
.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryHoop,.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryMembrane{opacity:1;transform:scale(1)}
.grGoalEntryGate[data-gate-transition="shatter_to_open"] .grGoalEntryBarrier{animation:grGoalGateShatter .42s cubic-bezier(.2,.7,.25,1) both}
.grGoalEntryGate[data-gate-transition="shatter_to_open"] .grGoalEntryHoop{animation:grGoalGateOpen .34s .12s ease-out both}
@keyframes grGoalGateShatter{0%{opacity:1;transform:scale(1)}45%{opacity:.92;transform:scale(1.06) rotate(-2deg);filter:brightness(1.6)}100%{opacity:0;transform:scale(.52) rotate(8deg)}}
@keyframes grGoalGateOpen{0%{opacity:0;transform:scale(.72)}100%{opacity:1;transform:scale(1)}}
.grGoalEntryArrowStack{position:absolute;z-index:9;left:50%;top:-16px;transform:translateX(-50%);display:flex;flex-direction:column-reverse;align-items:center;gap:0;color:var(--gameroad-goal-entry-cue-color);text-shadow:0 0 5px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 60%,transparent);opacity:.9}
.grGoalEntryArrow{display:block;font-size:clamp(8px,1.2vw,13px);font-weight:950;line-height:.65;animation:grGoalEntryArrowRise 1.2s ease-in-out infinite}
.grGoalEntryArrow:nth-child(2){animation-delay:.24s}.grGoalEntryArrow:nth-child(3){animation-delay:.48s}
@keyframes grGoalEntryArrowRise{0%,100%{transform:translateY(3px);opacity:.25}45%{transform:translateY(-2px);opacity:1}}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryGate *,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryGate *{animation:none!important;filter:none!important;transition:none!important}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrow,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrow{display:none}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrow:first-child,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrow:first-child{display:block}
`;
  documentLike.head.appendChild(style);
}

function validBoardSurface(runtime) {
  return Boolean(
    runtime
      && runtime.mounted === true
      && runtime.presentationOnly === true
      && runtime.gameplayAuthority === false
      && runtime.gameStateWrite === false
      && runtime.movementAuthority === false
      && (typeof runtime.resolveRouteGate === 'function' || typeof runtime.resolveGoal === 'function')
      && typeof runtime.resolveSharedGoal === 'function'
  );
}

function validGoalPathPresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.ok === true
      && value.presentationOnly === true
      && value.gameplayAuthority === false
      && value.gameStateWrite === false
      && value.movementAuthority === false
      && value.legalityAuthority === false
      && value.resultAuthority === false
      && value.terminalWin === false
      && Array.isArray(value.lanePresentations)
  );
}

function failSoft(reason, profile) {
  return Object.freeze({
    schema: SCHEMA,
    mounted: false,
    reason,
    profile,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
  });
}

function laneKey(participantId, laneIndex) {
  return `${participantId}:${laneIndex}`;
}

function normalizeLaneStates(goalPathPresentation) {
  if (!validGoalPathPresentation(goalPathPresentation)) return null;
  const byKey = new Map();
  for (const lane of goalPathPresentation.lanePresentations) {
    if (!lane || !nonEmptyString(lane.participantId) || !Number.isSafeInteger(lane.laneIndex)) return null;
    const participantId = lane.participantId.trim();
    const key = nonEmptyString(lane.key) ? lane.key.trim() : laneKey(participantId, lane.laneIndex);
    if (key !== laneKey(participantId, lane.laneIndex) || byKey.has(key)) return null;
    byKey.set(key, {
      key,
      participantId,
      laneIndex: lane.laneIndex,
      connectedToGoal: lane.connectedToGoal === true,
      routeGateId: nonEmptyString(lane.routeGateId) ? lane.routeGateId.trim() : `goal-gate:${key}`,
      sharedGoalId: nonEmptyString(lane.sharedGoalId) ? lane.sharedGoalId.trim() : 'goal:shared',
    });
  }
  return byKey;
}

function createArrowStack(documentLike, key, cueColor) {
  const arrowStack = createNode(documentLike, 'span', 'grGoalEntryArrowStack');
  setAttr(arrowStack, 'data-goal-entry-arrow-stack', key);
  setAttr(arrowStack, 'data-cue-color-authority', 'caller-participant-color');
  setAttr(arrowStack, 'aria-label', '共有GOALへ接続済み');
  setCueColor(arrowStack, cueColor);
  for (let index = 0; index < 3; index += 1) {
    const arrow = createNode(documentLike, 'span', 'grGoalEntryArrow');
    arrow.textContent = '↑';
    setAttr(arrow, 'aria-hidden', 'true');
    arrowStack.appendChild(arrow);
  }
  return arrowStack;
}

function createGate(documentLike, lane) {
  const gate = createNode(documentLike, 'span', 'grGoalEntryGate');
  setAttr(gate, 'data-goal-entry-gate', lane.key);
  setAttr(gate, 'data-route-gate-id', lane.routeGateId);
  setAttr(gate, 'data-shared-goal-id', lane.sharedGoalId);
  setAttr(gate, 'data-participant-id', lane.participantId);
  setAttr(gate, 'data-lane-index', lane.laneIndex);
  setAttr(gate, 'data-goal-path-open', '0');
  setAttr(gate, 'aria-hidden', 'true');
  gate.appendChild(createNode(documentLike, 'span', 'grGoalEntryBarrier'));
  gate.appendChild(createNode(documentLike, 'span', 'grGoalEntryHoop'));
  gate.appendChild(createNode(documentLike, 'span', 'grGoalEntryMembrane'));
  return gate;
}

export function mountNewBaseGoalEntryGateCue({
  boardSurfaceRuntime,
  goalPathPresentation,
  participantColors = {},
  documentLike = globalThis?.document,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const profile = resolveProfile({ reducedMotion, lowPerf });
  if (!documentLike || typeof documentLike.createElement !== 'function') return failSoft('DOM_DOCUMENT_REQUIRED', profile);
  if (!validBoardSurface(boardSurfaceRuntime)) return failSoft('BOARD_SURFACE_RUNTIME_INVALID', profile);
  const initialLaneStates = normalizeLaneStates(goalPathPresentation);
  if (!initialLaneStates) return failSoft('GOAL_PATH_PRESENTATION_INVALID', profile);

  ensureStyle(documentLike);
  const mountedByLaneKey = new Map();
  let unresolvedOpenLaneKeys = new Set();
  let activeParticipantColors = participantColors && typeof participantColors === 'object' ? participantColors : {};
  let destroyed = false;

  const sharedGoal = boardSurfaceRuntime.resolveSharedGoal();
  if (!sharedGoal) return failSoft('SHARED_GOAL_REQUIRED', profile);

  for (const lane of initialLaneStates.values()) {
    const anchor = boardSurfaceRuntime.resolveRouteGate?.(lane.participantId, lane.laneIndex)
      ?? boardSurfaceRuntime.resolveGoal?.(lane.participantId, lane.laneIndex)
      ?? null;
    if (!anchor || typeof anchor.appendChild !== 'function') continue;
    setAttr(anchor, 'data-goal-entry-gate-cell', '1');
    setAttr(anchor, 'data-goal-entry-cue-profile', profile);
    const gate = createGate(documentLike, lane);
    anchor.appendChild(gate);
    mountedByLaneKey.set(lane.key, {
      ...lane,
      anchor,
      connectedToGoal: false,
      cueColor: null,
      gate,
      arrowStack: null,
      lastTransition: null,
    });
  }

  function snapshotState() {
    const records = [...mountedByLaneKey.values()];
    return deepFreeze({
      laneGateCount: records.length,
      sharedGoalCount: 1,
      openLaneCount: records.filter((item) => item.connectedToGoal).length,
      lockedBarrierCount: records.filter((item) => !item.connectedToGoal).length,
      openHoopCount: records.filter((item) => item.connectedToGoal).length,
      activeArrowCount: records.filter((item) => item.arrowStack !== null).length,
      unresolvedOpenLaneKeys: [...unresolvedOpenLaneKeys],
      activeRouteGateIds: records.filter((item) => item.connectedToGoal).map((item) => item.routeGateId),
      profile,
      animationMode: profile === 'standard' ? 'BARRIER_SHATTER_TO_OPEN_HOOP' : 'STATIC_GATE_STATE',
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
    if (nextLaneStates.size !== mountedByLaneKey.size) return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
    for (const key of mountedByLaneKey.keys()) {
      if (!nextLaneStates.has(key)) return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
    }

    const colors = nextParticipantColors && typeof nextParticipantColors === 'object'
      ? nextParticipantColors
      : activeParticipantColors;
    const desired = [];
    for (const [key, record] of mountedByLaneKey.entries()) {
      const lane = nextLaneStates.get(key);
      desired.push({ record, connectedToGoal: lane.connectedToGoal === true, cueColor: normalizeColor(colors?.[record.participantId]) });
    }

    const nextUnresolved = new Set();
    for (const { record, connectedToGoal, cueColor } of desired) {
      const openingNow = connectedToGoal && !record.connectedToGoal;
      record.connectedToGoal = connectedToGoal;
      record.cueColor = cueColor;
      record.lastTransition = openingNow ? 'shatter_to_open' : null;
      setAttr(record.gate, 'data-goal-path-open', connectedToGoal ? '1' : '0');
      if (openingNow && profile === 'standard') setAttr(record.gate, 'data-gate-transition', 'shatter_to_open');
      else removeAttr(record.gate, 'data-gate-transition');
      setAttr(record.anchor, 'data-connected-to-goal', connectedToGoal ? 'true' : 'false');

      if (cueColor) setCueColor(record.gate, cueColor);
      if (connectedToGoal && cueColor) {
        if (!record.arrowStack) {
          record.arrowStack = createArrowStack(documentLike, record.key, cueColor);
          record.anchor.appendChild(record.arrowStack);
        } else {
          setCueColor(record.arrowStack, cueColor);
        }
      } else {
        if (record.arrowStack) {
          removeNode(record.arrowStack);
          record.arrowStack = null;
        }
        if (connectedToGoal && !cueColor) nextUnresolved.add(record.key);
      }
    }

    activeParticipantColors = colors;
    unresolvedOpenLaneKeys = nextUnresolved;
    setAttr(sharedGoal, 'data-connected-route-count', [...mountedByLaneKey.values()].filter((item) => item.connectedToGoal).length);
    return deepFreeze({ ok: true, reason: 'GOAL_ENTRY_CUES_SYNCED', ...snapshotState() });
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
    snapshot: () => snapshotState(),
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      for (const record of [...mountedByLaneKey.values()].reverse()) {
        removeNode(record.arrowStack);
        record.arrowStack = null;
        removeNode(record.gate);
      }
      return true;
    },
  };

  const initialSync = syncGoalPathPresentation(goalPathPresentation, { participantColors: activeParticipantColors });
  if (initialSync.ok !== true) {
    runtime.destroy();
    return failSoft(initialSync.reason, profile);
  }
  return Object.freeze(runtime);
}

export const NEW_BASE_GOAL_ENTRY_GATE_CUE_CONTRACT = deepFreeze({
  schema: SCHEMA,
  gateMeaning: 'ROUTE_SPECIFIC_BOUNDARY_BEFORE_ONE_SHARED_GOAL',
  gateVisibility: 'PERSISTENT_WORLD_SPACE_AFFORDANCE',
  gateCount: 12,
  sharedGoalCount: 1,
  closedGateVisual: 'SOLID_LOCKED_BARRIER',
  openGateVisual: 'OPEN_HOOP_WITH_TRANSPARENT_MEMBRANE',
  standardOpeningTransition: 'BARRIER_SHATTER_TO_OPEN_HOOP',
  gatePlacement: 'EXACT_ROUTE_GATE_ANCHOR_BELOW_SHARED_GOAL',
  activeArrowAuthority: 'CALLER_GOAL_PATH_PRESENTATION_CONNECTED_TO_GOAL',
  activeArrowColorAuthority: 'CALLER_PARTICIPANT_COLOR',
  closedLaneArrowVisible: false,
  multipleOpenLanesSupported: true,
  statefulGoalPathSync: true,
  repeatedSyncIdempotent: true,
  standardMotion: 'BARRIER_SHATTER_TO_OPEN_HOOP',
  reducedMotion: 'STATIC_GATE_STATE',
  lowPerf: 'STATIC_GATE_STATE',
  computesSevenCardCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsCamera: false,
  secondMovementEngine: false,
});

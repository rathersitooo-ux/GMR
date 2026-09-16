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
.grGoalEntryGate{position:absolute;z-index:8;left:50%;bottom:-2px;width:94%;height:clamp(18px,3.25vh,29px);transform:translateX(-50%);pointer-events:none;overflow:visible;--gameroad-goal-entry-cue-color:rgba(255,229,139,.9)}
.grGoalEntryBarrier{position:absolute;left:1%;right:1%;bottom:1px;height:76%;border:1px solid rgba(236,250,255,.96);border-radius:2px;background:linear-gradient(165deg,transparent 0 16%,rgba(255,255,255,.42) 17% 20%,transparent 21% 44%,rgba(195,235,246,.36) 45% 49%,transparent 50%),linear-gradient(180deg,rgba(239,252,255,.98),rgba(154,205,220,.96) 48%,rgba(72,119,133,.98));clip-path:polygon(0 26%,7% 8%,26% 4%,34% 13%,52% 5%,64% 15%,83% 6%,100% 24%,97% 83%,78% 94%,62% 86%,46% 96%,29% 87%,11% 94%,2% 78%);box-shadow:0 3px 0 rgba(29,66,77,.34),0 0 10px rgba(201,243,255,.24),inset 0 0 0 1px rgba(255,255,255,.2),inset 0 -4px 8px rgba(44,90,103,.18);transform-origin:50% 80%;opacity:1}
.grGoalEntryBarrier::before,.grGoalEntryBarrier::after{content:"";position:absolute;width:1px;background:rgba(35,86,101,.66);box-shadow:0 0 2px rgba(255,255,255,.65)}
.grGoalEntryBarrier::before{left:38%;top:4%;height:94%;transform:rotate(18deg)}
.grGoalEntryBarrier::after{right:34%;top:8%;height:86%;transform:rotate(-21deg)}
.grGoalEntryHoop{position:absolute;left:10%;right:10%;top:-4px;bottom:-4px;border:2px solid color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 72%,white);border-radius:50%;background:transparent;box-shadow:0 0 12px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 40%,transparent),inset 0 0 9px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 16%,transparent);opacity:0;transform:scale(.74)}
.grGoalEntryMembrane{position:absolute;left:20%;right:20%;top:16%;bottom:12%;border-radius:50%;border:1px solid color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 22%,transparent);background:radial-gradient(ellipse at 45% 38%,rgba(255,255,255,.08),color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 10%,transparent) 42%,transparent 74%);backdrop-filter:blur(.2px);opacity:0;transform:scale(.82)}
.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryBarrier{opacity:0;transform:scale(.45) rotate(8deg)}
.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryHoop,.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryMembrane{opacity:1;transform:scale(1)}
.grGoalEntryGate[data-gate-transition="shatter_to_open"] .grGoalEntryBarrier{animation:grGoalGateShatter .46s cubic-bezier(.2,.72,.2,1) both}
.grGoalEntryGate[data-gate-transition="shatter_to_open"] .grGoalEntryHoop{animation:grGoalGateOpen .34s .13s ease-out both}
.grGoalEntryGate[data-gate-transition="shatter_to_open"] .grGoalEntryMembrane{animation:grGoalGateMembrane .3s .18s ease-out both}
@keyframes grGoalGateShatter{0%{opacity:1;transform:scale(1)}32%{opacity:1;transform:scale(1.07) rotate(-2deg);filter:brightness(1.75)}62%{opacity:.62;transform:scale(.86) rotate(4deg)}100%{opacity:0;transform:scale(.42) rotate(11deg)}}
@keyframes grGoalGateOpen{0%{opacity:0;transform:scale(.7)}100%{opacity:1;transform:scale(1)}}
@keyframes grGoalGateMembrane{0%{opacity:0;transform:scale(.78)}100%{opacity:1;transform:scale(1)}}
.grGoalEntryArrowStack{position:absolute;z-index:9;left:50%;top:-17px;transform:translateX(-50%);display:flex;flex-direction:column-reverse;align-items:center;gap:0;color:var(--gameroad-goal-entry-cue-color);text-shadow:0 0 5px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 60%,transparent);opacity:.88}
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
  setAttr(gate, 'data-closed-gate-material', 'hard-ice-bar');
  setAttr(gate, 'data-open-gate-form', 'hoop-with-transparent-membrane');
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
  closedGateMaterial: 'HARD_ICE_BAR',
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

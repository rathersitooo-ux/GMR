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

function createNode(documentLike, tagName, className = '') {
  const node = documentLike.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function removeNode(node) {
  if (!node) return;
  node.remove?.();
  if (node.parentNode && typeof node.parentNode.removeChild === 'function') {
    node.parentNode.removeChild(node);
  }
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
.grGoalEntryGate{position:absolute;z-index:5;left:50%;top:-42%;width:82%;height:72%;transform:translateX(-50%) perspective(120px) rotateX(-52deg);transform-origin:50% 100%;pointer-events:none;filter:drop-shadow(0 3px 3px rgba(0,0,0,.3))}
.grGoalEntryGatePost,.grGoalEntryGateLintel{position:absolute;display:block;border:1px solid rgba(239,247,242,.72);background:linear-gradient(180deg,rgba(238,247,241,.74),rgba(50,78,70,.8));box-sizing:border-box}
.grGoalEntryGatePost{bottom:0;width:17%;height:74%;border-radius:4px 4px 2px 2px}
.grGoalEntryGatePost[data-gate-side="left"]{left:4%}
.grGoalEntryGatePost[data-gate-side="right"]{right:4%}
.grGoalEntryGateLintel{left:4%;right:4%;top:0;height:24%;border-radius:6px 6px 3px 3px}
.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryGatePost,.grGoalEntryGate[data-goal-path-open="1"] .grGoalEntryGateLintel{box-shadow:0 0 7px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 46%,transparent);border-color:color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 74%,white)}
.grGoalEntryArrowStack{position:absolute;z-index:7;left:50%;bottom:7%;width:74%;height:122%;transform:translateX(-50%);pointer-events:none;overflow:visible;color:var(--gameroad-goal-entry-cue-color);text-shadow:0 0 6px color-mix(in srgb,var(--gameroad-goal-entry-cue-color) 65%,transparent)}
.grGoalEntryArrow{position:absolute;left:50%;bottom:0;display:block;font-size:clamp(13px,2.3vw,25px);font-weight:950;line-height:1;transform:translate(-50%,0);opacity:0;animation:grGoalEntryArrowRise 1.35s cubic-bezier(.18,.72,.26,1) infinite}
.grGoalEntryArrow:nth-child(2){animation-delay:.34s}.grGoalEntryArrow:nth-child(3){animation-delay:.68s}
@keyframes grGoalEntryArrowRise{0%{transform:translate(-50%,10px) scale(.86);opacity:0}18%{opacity:.96}72%{opacity:.82}100%{transform:translate(-50%,-34px) scale(1.03);opacity:0}}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrow,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrow{animation:none!important;filter:none!important;text-shadow:none!important}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrowStack,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrowStack{height:auto;bottom:18%;display:grid;place-items:center}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrow,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrow{position:static;display:none;opacity:1;transform:none;font-size:clamp(16px,2.8vw,27px)}
[data-goal-entry-cue-profile="reduced_motion"] .grGoalEntryArrow:first-child,[data-goal-entry-cue-profile="low_perf"] .grGoalEntryArrow:first-child{display:block}
[data-goal-entry-cue-profile="low_perf"] .grGoalEntryGate{filter:none}
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
      && typeof runtime.resolveShield === 'function'
      && typeof runtime.resolveClearingCell === 'function'
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
    });
  }
  return byKey;
}

function createArrowStack(documentLike, key, entryCellId, cueColor) {
  const arrowStack = createNode(documentLike, 'span', 'grGoalEntryArrowStack');
  setAttr(arrowStack, 'data-goal-entry-arrow-stack', key);
  setAttr(arrowStack, 'data-clearing-entry-cell-id', entryCellId);
  setAttr(arrowStack, 'data-cue-color-authority', 'caller-participant-color');
  setAttr(arrowStack, 'aria-label', '上方向へ進める入口');
  setCueColor(arrowStack, cueColor);
  for (let index = 0; index < 3; index += 1) {
    const arrow = createNode(documentLike, 'span', 'grGoalEntryArrow');
    arrow.textContent = '↑';
    setAttr(arrow, 'aria-hidden', 'true');
    arrowStack.appendChild(arrow);
  }
  return arrowStack;
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
  if (!documentLike || typeof documentLike.createElement !== 'function') {
    return failSoft('DOM_DOCUMENT_REQUIRED', profile);
  }
  if (!validBoardSurface(boardSurfaceRuntime)) {
    return failSoft('BOARD_SURFACE_RUNTIME_INVALID', profile);
  }
  const initialLaneStates = normalizeLaneStates(goalPathPresentation);
  if (!initialLaneStates) {
    return failSoft('GOAL_PATH_PRESENTATION_INVALID', profile);
  }

  ensureStyle(documentLike);
  const mountedByLaneKey = new Map();
  let unresolvedOpenLaneKeys = new Set();
  let activeParticipantColors = participantColors && typeof participantColors === 'object'
    ? participantColors
    : {};
  let destroyed = false;

  for (const lane of initialLaneStates.values()) {
    const shieldNode = boardSurfaceRuntime.resolveShield(lane.participantId, lane.laneIndex);
    const entryCellId = shieldNode?.dataset?.clearingEntryCellId
      ?? shieldNode?.getAttribute?.('data-clearing-entry-cell-id')
      ?? null;
    const entryCell = nonEmptyString(entryCellId)
      ? boardSurfaceRuntime.resolveClearingCell(entryCellId)
      : null;
    if (!shieldNode || !entryCell || typeof entryCell.appendChild !== 'function') continue;

    setAttr(entryCell, 'data-goal-entry-gate-cell', '1');
    setAttr(entryCell, 'data-goal-entry-cue-profile', profile);

    const gate = createNode(documentLike, 'span', 'grGoalEntryGate');
    setAttr(gate, 'data-goal-entry-gate', lane.key);
    setAttr(gate, 'data-participant-id', lane.participantId);
    setAttr(gate, 'data-lane-index', lane.laneIndex);
    setAttr(gate, 'data-clearing-entry-cell-id', entryCellId);
    setAttr(gate, 'data-goal-path-open', '0');
    setAttr(gate, 'aria-hidden', 'true');

    const leftPost = createNode(documentLike, 'span', 'grGoalEntryGatePost');
    const rightPost = createNode(documentLike, 'span', 'grGoalEntryGatePost');
    const lintel = createNode(documentLike, 'span', 'grGoalEntryGateLintel');
    setAttr(leftPost, 'data-gate-side', 'left');
    setAttr(rightPost, 'data-gate-side', 'right');
    gate.appendChild(leftPost);
    gate.appendChild(rightPost);
    gate.appendChild(lintel);
    entryCell.appendChild(gate);

    mountedByLaneKey.set(lane.key, {
      key: lane.key,
      participantId: lane.participantId,
      laneIndex: lane.laneIndex,
      entryCellId,
      entryCell,
      connectedToGoal: false,
      cueColor: null,
      gate,
      arrowStack: null,
    });
  }

  function snapshotState() {
    const records = [...mountedByLaneKey.values()];
    return deepFreeze({
      laneGateCount: records.length,
      openLaneCount: records.filter((item) => item.connectedToGoal).length,
      activeArrowCount: records.filter((item) => item.arrowStack !== null).length,
      unresolvedOpenLaneKeys: [...unresolvedOpenLaneKeys],
      activeArrowEntryCellIds: records.filter((item) => item.arrowStack !== null).map((item) => item.entryCellId),
      profile,
      animationMode: profile === 'standard' ? 'UPWARD_SCROLL_FADE' : 'STATIC_UPWARD_ARROW',
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
    if (nextLaneStates.size !== mountedByLaneKey.size) {
      return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
    }
    for (const key of mountedByLaneKey.keys()) {
      if (!nextLaneStates.has(key)) return Object.freeze({ ok: false, reason: 'GOAL_PATH_LANE_SET_MISMATCH' });
    }

    const colors = nextParticipantColors && typeof nextParticipantColors === 'object'
      ? nextParticipantColors
      : activeParticipantColors;
    const desired = [];
    for (const [key, record] of mountedByLaneKey.entries()) {
      const lane = nextLaneStates.get(key);
      desired.push({
        record,
        connectedToGoal: lane.connectedToGoal === true,
        cueColor: normalizeColor(colors?.[record.participantId]),
      });
    }

    const nextUnresolved = new Set();
    for (const item of desired) {
      const { record, connectedToGoal, cueColor } = item;
      record.connectedToGoal = connectedToGoal;
      record.cueColor = cueColor;
      setAttr(record.gate, 'data-goal-path-open', connectedToGoal ? '1' : '0');

      if (connectedToGoal && cueColor) {
        setCueColor(record.gate, cueColor);
        if (!record.arrowStack) {
          record.arrowStack = createArrowStack(documentLike, record.key, record.entryCellId, cueColor);
          record.entryCell.appendChild(record.arrowStack);
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
    return deepFreeze({
      ok: true,
      reason: 'GOAL_ENTRY_CUES_SYNCED',
      ...snapshotState(),
    });
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
    snapshot() {
      return snapshotState();
    },
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
  gateMeaning: 'SHARED_FIELD_TO_SHIELD_PROGRESS_BOUNDARY',
  gateVisibility: 'PERSISTENT_WORLD_SPACE_AFFORDANCE',
  activeArrowAuthority: 'CALLER_GOAL_PATH_PRESENTATION_CONNECTED_TO_GOAL',
  activeArrowPlacement: 'EXACT_LANE_CLEARING_ENTRY_CELL_ID',
  activeArrowColorAuthority: 'CALLER_PARTICIPANT_COLOR',
  closedLaneArrowVisible: false,
  multipleOpenLanesSupported: true,
  statefulGoalPathSync: true,
  repeatedSyncIdempotent: true,
  standardMotion: 'UPWARD_SCROLL_FADE',
  reducedMotion: 'STATIC_UPWARD_ARROW',
  lowPerf: 'STATIC_UPWARD_ARROW',
  computesSevenCardCompletion: false,
  computesMovementLegality: false,
  computesResult: false,
  writesGameState: false,
  ownsCamera: false,
  secondMovementEngine: false,
});

import { createFlanoraMapLayout } from './new-base-flanora-map-layout-core.mjs';
import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v1';
const LAYOUT_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';
const STYLE_ID = 'gameroad-new-base-flanora-board-surface-style';
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);
const ROAD_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function requireLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new TypeError('FLANORA_LAYOUT_REQUIRED');
  }
  if (layout.schema !== LAYOUT_SCHEMA) throw new TypeError('FLANORA_LAYOUT_SCHEMA_INVALID');
  if (layout.clearingOwnership !== 'SHARED') throw new TypeError('FLANORA_SHARED_CLEARING_REQUIRED');
  if (layout.clearingLoopShape !== 'HORIZONTAL_ZERO') throw new TypeError('FLANORA_HORIZONTAL_ZERO_REQUIRED');
  if (layout.clearingConnectivity !== 'SINGLE_CLOSED_LOOP') throw new TypeError('FLANORA_CLOSED_LOOP_REQUIRED');
  if (layout.geometryIsMovementAuthority !== false) throw new TypeError('FLANORA_GEOMETRY_MUST_NOT_OWN_MOVEMENT');
  if (layout.optionalRuleGeometryIncluded !== false) throw new TypeError('FLANORA_OPTIONAL_RULE_GEOMETRY_FORBIDDEN');
  if (!Array.isArray(layout.participantIds) || layout.participantIds.length !== 4) {
    throw new TypeError('FLANORA_FOUR_PARTICIPANTS_REQUIRED');
  }
  if (!Array.isArray(layout.laneRootConnections) || layout.laneRootConnections.length !== 12) {
    throw new TypeError('FLANORA_TWELVE_LANE_ROOTS_REQUIRED');
  }
  if (!Array.isArray(layout.clearingCells) || layout.clearingCells.length !== 26) {
    throw new TypeError('FLANORA_TWENTY_SIX_CLEARING_CELLS_REQUIRED');
  }
  return layout;
}

function laneKey(participantId, laneIndex) {
  return `${participantId}:${laneIndex}`;
}

export function projectFlanoraBoardSurfaceModel(layoutValue) {
  const layout = requireLayout(layoutValue);
  const minColumn = layout.clearingLoopColumnSpan?.minColumnIndex;
  const maxColumn = layout.clearingLoopColumnSpan?.maxColumnIndex;
  if (!Number.isSafeInteger(minColumn) || !Number.isSafeInteger(maxColumn) || maxColumn - minColumn + 1 !== 12) {
    throw new TypeError('FLANORA_TWELVE_COLUMN_SPAN_REQUIRED');
  }

  const laneRoots = [...layout.laneRootConnections].sort((left, right) => left.columnIndex - right.columnIndex);
  const lanes = laneRoots.map((root) => {
    if (!nonEmptyString(root.participantId) || !Number.isSafeInteger(root.laneIndex) || root.laneIndex < 0 || root.laneIndex > 2) {
      throw new TypeError('FLANORA_LANE_ROOT_IDENTITY_INVALID');
    }
    if (!Number.isSafeInteger(root.columnIndex) || root.columnIndex < minColumn || root.columnIndex > maxColumn) {
      throw new TypeError('FLANORA_LANE_ROOT_COLUMN_INVALID');
    }
    const key = laneKey(root.participantId, root.laneIndex);
    return {
      key,
      participantId: root.participantId,
      laneIndex: root.laneIndex,
      laneLabel: LANE_LABELS[root.laneIndex],
      columnIndex: root.columnIndex,
      relativeColumn: root.columnIndex - minColumn,
      goalId: `goal:${key}`,
      shieldId: `shield:${key}`,
      clearingEntryCellId: root.clearingEntryCellId,
      roadSteps: ROAD_STEPS.map((roadIndex) => ({
        id: `road:${key}:${roadIndex}`,
        roadIndex,
        rowIndex: layout.rowIndex?.[`ROAD_${roadIndex}`],
      })),
    };
  });

  const startParticipantsByCellId = {};
  for (const participantId of layout.participantIds) {
    const cellId = layout.startCellByParticipant?.[participantId]?.id;
    if (!nonEmptyString(cellId)) throw new TypeError('FLANORA_START_CELL_REQUIRED');
    startParticipantsByCellId[cellId] ??= [];
    startParticipantsByCellId[cellId].push(participantId);
  }

  const clearingCells = layout.clearingCells.map((cell) => ({
    id: cell.id,
    kind: cell.kind,
    rowIndex: cell.rowIndex,
    columnIndex: cell.columnIndex,
    relativeColumn: cell.columnIndex - minColumn,
    clearingRow: cell.rowIndex - layout.rowIndex.CLEARING_TOP,
    startParticipantIds: startParticipantsByCellId[cell.id] ?? [],
  }));

  return deepFreeze({
    schema: RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    sourceLayoutSchema: layout.schema,
    participantIds: [...layout.participantIds],
    columnSpan: { minColumnIndex: minColumn, maxColumnIndex: maxColumn, columnCount: 12 },
    lanes,
    clearingCells,
    clearingCycleCellIds: [...layout.clearingCycleCellIds],
    optionalRuleGeometryIncluded: false,
    upperProgressIsPrebuiltMovementField: layout.upperProgressIsPrebuiltMovementField === true,
  });
}

export function createFlanoraBoardSurfaceModel(layoutInput = {}) {
  return projectFlanoraBoardSurfaceModel(createFlanoraMapLayout(layoutInput));
}

function createNode(documentLike, tagName, className = '') {
  const node = documentLike.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function setAttr(node, name, value) {
  if (value == null) return;
  node.setAttribute?.(name, String(value));
  if (name.startsWith('data-') && node.dataset) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    node.dataset[key] = String(value);
  }
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function') return;
  if (documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[data-new-base-flanora-board-surface="1"]{position:relative;display:grid;grid-template-rows:minmax(0,1fr) minmax(72px,28%);gap:clamp(5px,1vh,10px);width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;padding:clamp(5px,1vw,10px);isolation:isolate;overflow:hidden}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:clamp(2px,.35vw,6px);min-width:0;min-height:0;align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:3px;min-width:0;min-height:0;align-items:stretch;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoal{display:grid;place-items:center;width:min(100%,34px);aspect-ratio:1;border:1px solid rgba(255,235,154,.78);border-radius:50%;background:rgba(88,70,23,.78);font-size:clamp(7px,.7vw,10px);font-weight:900;line-height:1;color:#fff6c4}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:grid;grid-template-rows:repeat(7,minmax(3px,1fr));gap:2px;width:100%;min-height:0;align-items:center;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;top:3%;bottom:3%;left:50%;width:2px;transform:translateX(-50%);border-radius:99px;background:rgba(231,244,229,.42)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:1;width:clamp(5px,.75vw,10px);height:clamp(5px,.75vw,10px);border:1px solid rgba(244,250,238,.62);border-radius:50%;background:rgba(24,64,54,.92);box-shadow:0 0 0 2px rgba(9,30,25,.24)}
/* BATTLE_PROGRESSION_LATENT_LIVE_R3: established progress is visually distinct from future/unresolved slots without granting interaction */
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep[data-progression-stage-state="UNRESOLVED"]{width:clamp(3px,.42vw,6px);height:clamp(3px,.42vw,6px);border-style:dotted;background:transparent;box-shadow:none;opacity:.28}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep[data-progression-stage-state="LATENT"]{width:clamp(4px,.55vw,7px);height:clamp(4px,.55vw,7px);border-style:dashed;background:transparent;box-shadow:none;opacity:.44}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep[data-progression-stage-state="BUILT"]{width:clamp(7px,.9vw,12px);height:clamp(7px,.9vw,12px);border-width:2px;border-style:solid;background:rgba(224,241,218,.92);box-shadow:0 0 0 2px rgba(9,30,25,.28),0 0 8px rgba(224,241,218,.26);opacity:1}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{display:grid;place-items:center;width:min(100%,38px);min-height:clamp(15px,2.4vh,23px);border:1px solid rgba(188,229,241,.78);border-radius:8px;background:rgba(26,68,83,.88);font-size:clamp(8px,.8vw,11px);font-weight:950;color:#e8f8ff}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:clamp(3px,.5vw,7px);min-width:0;min-height:0;padding:clamp(2px,.4vw,5px)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{place-self:center;width:clamp(15px,2.6vw,30px);height:clamp(15px,2.6vw,30px);border:1px solid rgba(238,247,232,.7);border-radius:50%;background:rgba(47,91,66,.88);box-shadow:0 2px 7px rgba(0,0,0,.22)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(255,224,134,.88);outline-offset:2px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,1fr) minmax(58px,26%);gap:3px;padding:4px}[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{gap:2px}}
@media(max-width:540px) and (orientation:portrait){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,1fr) minmax(110px,30%)}[data-new-base-flanora-board-surface="1"] .grFlanoraGoal{font-size:7px}}
`;
  documentLike.head.appendChild(style);
}

function performanceProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion === true) return 'reduced_motion';
  if (lowPerf === true) return 'low_perf';
  return 'standard';
}

function writeProgressionStagePresentation(node, { state, stageIndex, established, latent }) {
  setAttr(node, 'data-progression-stage-state', state);
  setAttr(node, 'data-progression-established', established ? 'true' : 'false');
  setAttr(node, 'data-progression-latent', latent ? 'true' : 'false');
  setAttr(node, 'data-progression-actionable', 'false');
  setAttr(node, 'data-progression-traversable', 'false');
  setAttr(node, 'data-progression-authority', 'presentation-only');
  const label = state === 'BUILT'
    ? `進行済み ${stageIndex}/7`
    : state === 'LATENT'
      ? `未成立 ${stageIndex}/7`
      : `進行状態未確定 ${stageIndex}/7`;
  setAttr(node, 'aria-label', label);
}

function primeUnresolvedProgressionStage(node, stageIndex) {
  writeProgressionStagePresentation(node, {
    state: 'UNRESOLVED',
    stageIndex,
    established: false,
    latent: false,
  });
}

function syncProgressionLanePresentationToRoadSteps(presentation, roadStepsByKey) {
  if (!isNewBaseProgressionLanePresentation(presentation) || presentation.ok !== true) {
    return deepFreeze({
      applied: false,
      reason: 'PROGRESSION_PRESENTATION_REQUIRED',
      builtStageCount: null,
      latentStageCount: null,
      presentationOnly: true,
      gameplayAuthority: false,
      movementAuthority: false,
      legalityAuthority: false,
      gameStateWrite: false,
    });
  }

  const assignments = [];
  const seenRoadStepIds = new Set();
  for (const lane of presentation.lanePresentations) {
    if (!Array.isArray(lane?.stages) || lane.stages.length !== ROAD_STEPS.length) {
      return deepFreeze({ applied: false, reason: 'PROGRESSION_STAGE_SET_INVALID', presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
    }
    for (const stage of lane.stages) {
      const node = roadStepsByKey.get(stage?.roadStepId);
      const built = stage?.visualState === 'BUILT';
      const latent = stage?.visualState === 'LATENT';
      if (!node || seenRoadStepIds.has(stage?.roadStepId) || (!built && !latent)
          || stage?.established !== built || stage?.latent !== latent
          || stage?.actionable !== false || stage?.traversable !== false
          || stage?.legalityAuthority !== false || stage?.movementAuthority !== false) {
        return deepFreeze({ applied: false, reason: 'PROGRESSION_STAGE_ASSIGNMENT_INVALID', presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
      }
      seenRoadStepIds.add(stage.roadStepId);
      assignments.push({
        node,
        state: stage.visualState,
        stageIndex: stage.stageIndex,
        established: built,
        latent,
      });
    }
  }

  if (assignments.length !== roadStepsByKey.size || seenRoadStepIds.size !== roadStepsByKey.size) {
    return deepFreeze({ applied: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED', presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
  }

  for (const assignment of assignments) writeProgressionStagePresentation(assignment.node, assignment);
  return deepFreeze({
    applied: true,
    reason: 'PROGRESSION_PRESENTATION_APPLIED',
    builtStageCount: presentation.totalBuiltStageCount,
    latentStageCount: presentation.totalLatentStageCount,
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  });
}

export function mountFlanoraBoardSurface({
  host,
  documentLike = globalThis?.document,
  layoutInput = null,
  layout = null,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  if (!host || typeof host.appendChild !== 'function' || !documentLike || typeof documentLike.createElement !== 'function') {
    return Object.freeze({
      schema: RUNTIME_SCHEMA,
      mounted: false,
      presentationOnly: true,
      gameplayAuthority: false,
      reason: 'DOM_HOST_REQUIRED',
    });
  }

  const model = layout
    ? projectFlanoraBoardSurfaceModel(layout)
    : createFlanoraBoardSurfaceModel(layoutInput ?? {});
  ensureStyle(documentLike);

  const root = createNode(documentLike, 'section', 'grFlanoraBoardSurface');
  setAttr(root, 'data-new-base-flanora-board-surface', '1');
  setAttr(root, 'data-performance-profile', performanceProfile({ reducedMotion, lowPerf }));
  setAttr(root, 'data-presentation-only', 'true');
  setAttr(root, 'data-gameplay-authority', 'false');
  setAttr(root, 'aria-label', '共有移動フィールド、Shield、7段進行、GOAL');

  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-flanora-clearing-loop', 'horizontal-zero');
  root.appendChild(upper);
  root.appendChild(clearing);

  const goalsByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();

  for (const lane of model.lanes) {
    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    laneNode.style.gridColumn = String(lane.relativeColumn + 1);

    const goal = createNode(documentLike, 'span', 'grFlanoraGoal');
    goal.textContent = 'GOAL';
    setAttr(goal, 'data-flanora-goal', lane.key);
    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    for (const step of lane.roadSteps) {
      const stepNode = createNode(documentLike, 'span', 'grFlanoraRoadStep');
      setAttr(stepNode, 'data-flanora-road-step', step.roadIndex);
      setAttr(stepNode, 'data-flanora-road-step-id', step.id);
      setAttr(stepNode, 'data-row-index', step.rowIndex);
      primeUnresolvedProgressionStage(stepNode, step.roadIndex);
      road.appendChild(stepNode);
      roadStepsByKey.set(step.id, stepNode);
    }
    const shield = createNode(documentLike, 'span', 'grFlanoraShield');
    shield.textContent = `S ${lane.laneLabel}`;
    setAttr(shield, 'data-flanora-shield', lane.key);
    setAttr(shield, 'data-clearing-entry-cell-id', lane.clearingEntryCellId);

    laneNode.appendChild(goal);
    laneNode.appendChild(road);
    laneNode.appendChild(shield);
    upper.appendChild(laneNode);
    goalsByLaneKey.set(lane.key, goal);
    shieldsByLaneKey.set(lane.key, shield);
  }

  for (const cell of model.clearingCells) {
    const cellNode = createNode(documentLike, 'span', 'grFlanoraClearingCell');
    setAttr(cellNode, 'data-flanora-clearing-cell-id', cell.id);
    setAttr(cellNode, 'data-clearing-kind', cell.kind);
    cellNode.style.gridColumn = String(cell.relativeColumn + 1);
    cellNode.style.gridRow = String(cell.clearingRow + 1);
    if (cell.startParticipantIds.length) {
      setAttr(cellNode, 'data-start-participant', cell.startParticipantIds.join(' '));
      setAttr(cellNode, 'aria-label', `開始 ${cell.startParticipantIds.join('・')}`);
    }
    clearing.appendChild(cellNode);
    clearingByCellId.set(cell.id, cellNode);
  }

  host.appendChild(root);
  let destroyed = false;

  function resolveLaneKey(participantId, laneIndex) {
    if (!nonEmptyString(participantId) || !Number.isSafeInteger(laneIndex)) return null;
    return laneKey(participantId, laneIndex);
  }

  const runtime = {
    schema: RUNTIME_SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    model,
    root,
    upper,
    clearing,
    resolveGoal(participantId, laneIndex) {
      return goalsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
    resolveShield(participantId, laneIndex) {
      return shieldsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
    resolveRoadStep(participantId, laneIndex, roadIndex) {
      if (!ROAD_STEPS.includes(roadIndex)) return null;
      return roadStepsByKey.get(`road:${resolveLaneKey(participantId, laneIndex)}:${roadIndex}`) ?? null;
    },
    syncProgressionPresentation(presentation) {
      if (destroyed) return deepFreeze({ applied: false, reason: 'RUNTIME_DESTROYED', presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
      return syncProgressionLanePresentationToRoadSteps(presentation, roadStepsByKey);
    },
    resolveClearingCell(cellId) {
      return nonEmptyString(cellId) ? clearingByCellId.get(cellId) ?? null : null;
    },
    snapshot() {
      return deepFreeze({
        laneCount: model.lanes.length,
        goalCount: goalsByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepsByKey.size,
        clearingCellCount: clearingByCellId.size,
        clearingCycleCellIds: [...model.clearingCycleCellIds],
        performanceProfile: root.dataset?.performanceProfile ?? performanceProfile({ reducedMotion, lowPerf }),
        movementAuthority: false,
      });
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      root.remove?.();
      if (root.parentNode && typeof root.parentNode.removeChild === 'function') root.parentNode.removeChild(root);
      return true;
    },
  };
  return Object.freeze(runtime);
}

export const FLANORA_BOARD_SURFACE_RUNTIME_CONTRACT = deepFreeze({
  schema: RUNTIME_SCHEMA,
  mount: 'explicit_caller_mount_only',
  sourceGeometry: 'new-base-flanora-map-layout-core',
  presentationOnly: true,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  secondBoardEngine: false,
  optionalRuleGeometryIncluded: false,
  clearingShape: 'HORIZONTAL_ZERO',
  clearingCellCount: 26,
  laneCount: 12,
  roadStepsPerLane: 7,
  progressionPresentationSource: 'EXISTING_NEW_BASE_PROGRESSION_LANE_PRESENTATION',
  unresolvedStageDefault: 'VISUALLY_SUBDUED_NOT_OPEN',
  progressionSyncWritesGameState: false,
  goalEndpointCount: 12,
});

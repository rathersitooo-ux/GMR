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
[data-new-base-flanora-board-surface="1"]{position:relative;display:grid;grid-template-rows:minmax(0,1fr) minmax(64px,22%);gap:clamp(4px,.8vh,8px);width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;padding:clamp(4px,.7vw,8px);isolation:isolate;overflow:hidden}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr));column-gap:clamp(10px,1.4vw,18px);row-gap:clamp(3px,.5vh,6px);min-width:0;min-height:0;align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{display:grid;grid-template-columns:clamp(28px,4.6vw,42px) minmax(0,1fr) clamp(32px,5.4vw,48px);grid-template-rows:minmax(0,1fr);gap:clamp(3px,.55vw,7px);min-width:0;min-height:0;align-items:center;justify-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoal{display:grid;place-items:center;justify-self:start;width:clamp(24px,3.8vh,34px);height:clamp(24px,3.8vh,34px);border:1px solid rgba(255,235,154,.78);border-radius:50%;background:rgba(88,70,23,.78);font-size:clamp(7px,.7vw,10px);font-weight:900;line-height:1;color:#fff6c4;box-shadow:0 0 12px rgba(255,224,120,.16)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:grid;grid-template-columns:repeat(7,minmax(4px,1fr));grid-template-rows:minmax(0,1fr);direction:rtl;gap:2px;width:100%;height:100%;min-width:0;min-height:0;align-items:center;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;left:3%;right:3%;top:50%;height:2px;transform:translateY(-50%);border-radius:99px;background:linear-gradient(90deg,rgba(255,236,152,.48),rgba(231,244,229,.5) 26%,rgba(231,244,229,.26));box-shadow:0 0 7px rgba(229,244,220,.12)}
/* Only authority-established progress becomes a discrete card-shaped object. Future stages remain the continuous road itself. */
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:1;width:clamp(8px,1vw,13px);aspect-ratio:.72;border:1px solid rgba(239,248,232,.9);border-radius:2px;background:linear-gradient(145deg,rgba(236,246,228,.96),rgba(104,145,112,.95));box-shadow:0 2px 5px rgba(0,0,0,.28),0 0 7px rgba(224,241,218,.2);transform:translateY(-1px);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep::after{content:"";position:absolute;inset:2px;border:1px solid rgba(31,74,56,.42);border-radius:1px}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{display:grid;place-items:center;justify-self:end;width:clamp(32px,5vw,44px);min-height:clamp(15px,2.4vh,23px);border:1px solid rgba(188,229,241,.78);border-radius:8px;background:rgba(26,68,83,.88);font-size:clamp(8px,.8vw,11px);font-weight:950;color:#e8f8ff}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:clamp(3px,.5vw,7px);min-width:0;min-height:0;padding:clamp(2px,.4vw,5px)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{place-self:center;width:clamp(15px,2.6vw,30px);height:clamp(15px,2.6vw,30px);border:1px solid rgba(238,247,232,.7);border-radius:50%;background:rgba(47,91,66,.88);box-shadow:0 2px 7px rgba(0,0,0,.22)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(255,224,134,.88);outline-offset:2px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,1fr) minmax(52px,20%);gap:3px;padding:3px}[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{column-gap:8px;row-gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraLane{grid-template-columns:24px minmax(0,1fr) 28px;gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraGoal{width:19px;height:19px;font-size:6px}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{width:27px;min-height:15px;font-size:7px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{gap:2px;padding:1px}}
@media(max-width:540px) and (orientation:portrait){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,1fr) minmax(110px,30%)}[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(12,minmax(0,1fr));column-gap:0;row-gap:clamp(2px,.35vh,4px)}[data-new-base-flanora-board-surface="1"] .grFlanoraLane{grid-column:1!important;grid-row:auto!important;grid-template-columns:28px minmax(0,1fr) 34px;gap:3px}[data-new-base-flanora-board-surface="1"] .grFlanoraGoal{width:24px;height:24px;font-size:7px}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{width:32px}}
`;
  documentLike.head.appendChild(style);
}

function performanceProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion === true) return 'reduced_motion';
  if (lowPerf === true) return 'low_perf';
  return 'standard';
}

function failProgression(reason) {
  return deepFreeze({
    applied: false,
    reason,
    builtStageCount: null,
    latentStageCount: null,
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  });
}

function writeBuiltProgressionStagePresentation(node, stageIndex) {
  setAttr(node, 'data-progression-stage-state', 'BUILT');
  setAttr(node, 'data-progression-established', 'true');
  setAttr(node, 'data-progression-latent', 'false');
  setAttr(node, 'data-progression-actionable', 'false');
  setAttr(node, 'data-progression-traversable', 'false');
  setAttr(node, 'data-progression-authority', 'presentation-only');
  setAttr(node, 'aria-label', `進行済み ${stageIndex}/7`);
}

function validateProgressionPresentation(presentation, roadsByLaneKey, roadStepMetaById) {
  if (!isNewBaseProgressionLanePresentation(presentation) || presentation.ok !== true) {
    return { ok: false, reason: 'PROGRESSION_PRESENTATION_REQUIRED' };
  }
  if (presentation.lanePresentations.length !== roadsByLaneKey.size) {
    return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  }

  const seenLaneKeys = new Set();
  const seenRoadStepIds = new Set();
  const builtAssignments = [];
  const laneCounts = new Map();

  for (const lane of presentation.lanePresentations) {
    const road = roadsByLaneKey.get(lane?.key);
    if (!road || seenLaneKeys.has(lane.key) || !Array.isArray(lane?.stages) || lane.stages.length !== ROAD_STEPS.length) {
      return { ok: false, reason: 'PROGRESSION_STAGE_SET_INVALID' };
    }
    seenLaneKeys.add(lane.key);
    let builtCount = 0;
    let latentCount = 0;

    for (const stage of lane.stages) {
      const meta = roadStepMetaById.get(stage?.roadStepId);
      const built = stage?.visualState === 'BUILT';
      const latent = stage?.visualState === 'LATENT';
      if (!meta || meta.laneKey !== lane.key || meta.roadIndex !== stage?.stageIndex
          || seenRoadStepIds.has(stage?.roadStepId) || (!built && !latent)
          || stage?.established !== built || stage?.latent !== latent
          || stage?.actionable !== false || stage?.traversable !== false
          || stage?.legalityAuthority !== false || stage?.movementAuthority !== false) {
        return { ok: false, reason: 'PROGRESSION_STAGE_ASSIGNMENT_INVALID' };
      }
      seenRoadStepIds.add(stage.roadStepId);
      if (built) {
        builtCount += 1;
        builtAssignments.push({ road, meta });
      } else {
        latentCount += 1;
      }
    }
    laneCounts.set(lane.key, { builtCount, latentCount });
  }

  if (seenLaneKeys.size !== roadsByLaneKey.size || seenRoadStepIds.size !== roadStepMetaById.size) {
    return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  }
  return { ok: true, builtAssignments, laneCounts };
}

function syncProgressionLanePresentation({
  presentation,
  documentLike,
  roadsByLaneKey,
  roadStepMetaById,
  roadStepsByKey,
}) {
  const validated = validateProgressionPresentation(presentation, roadsByLaneKey, roadStepMetaById);
  if (!validated.ok) return failProgression(validated.reason);

  const nextBuiltIds = new Set(validated.builtAssignments.map(({ meta }) => meta.id));
  for (const [roadStepId, node] of [...roadStepsByKey]) {
    if (nextBuiltIds.has(roadStepId)) continue;
    node.remove?.();
    if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
    roadStepsByKey.delete(roadStepId);
  }

  for (const { road, meta } of validated.builtAssignments) {
    let node = roadStepsByKey.get(meta.id);
    if (!node) {
      node = createNode(documentLike, 'span', 'grFlanoraRoadStep');
      setAttr(node, 'data-flanora-road-step', meta.roadIndex);
      setAttr(node, 'data-flanora-road-step-id', meta.id);
      setAttr(node, 'data-row-index', meta.rowIndex);
      road.appendChild(node);
      roadStepsByKey.set(meta.id, node);
    }
    writeBuiltProgressionStagePresentation(node, meta.roadIndex);
  }

  for (const [key, road] of roadsByLaneKey) {
    const counts = validated.laneCounts.get(key);
    setAttr(road, 'data-progression-built-count', counts.builtCount);
    setAttr(road, 'data-progression-latent-count', counts.latentCount);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', `成立済み ${counts.builtCount}/7。未成立位置は連続した道として表示`);
  }

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
  setAttr(root, 'data-goal-edge', 'left');
  setAttr(root, 'data-road-entry-edge', 'right');
  setAttr(root, 'data-progression-direction', 'right-to-left');
  setAttr(root, 'data-central-world-layout', 'participant-groups-2x2');
  setAttr(root, 'data-future-discrete-progression-slots', 'false');
  setAttr(root, 'aria-label', '4人×各3レーン。GOAL左端、ROAD開始側右端。成立済み進行だけをカード状に表示し、未成立位置は連続した道で示す');

  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-flanora-clearing-loop', 'horizontal-zero');
  root.appendChild(upper);
  root.appendChild(clearing);

  const goalsByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const roadStepMetaById = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();

  for (const lane of model.lanes) {
    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    const participantSlot = model.participantIds.indexOf(lane.participantId);
    if (participantSlot < 0) throw new TypeError('FLANORA_LANE_PARTICIPANT_REQUIRED');
    const participantGroupColumn = (participantSlot % 2) + 1;
    const participantGroupRow = Math.floor(participantSlot / 2) + 1;
    setAttr(laneNode, 'data-participant-slot', participantSlot);
    setAttr(laneNode, 'data-participant-group-column', participantGroupColumn);
    setAttr(laneNode, 'data-participant-group-row', participantGroupRow);
    laneNode.style.gridColumn = String(participantGroupColumn);
    laneNode.style.gridRow = String(((participantGroupRow - 1) * 3) + lane.laneIndex + 1);

    const goal = createNode(documentLike, 'span', 'grFlanoraGoal');
    goal.textContent = 'GOAL';
    setAttr(goal, 'data-flanora-goal', lane.key);
    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', ROAD_STEPS.length);
    setAttr(road, 'data-progression-built-count', 0);
    setAttr(road, 'data-progression-latent-count', ROAD_STEPS.length);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', '成立済み 0/7。未成立位置は連続した道として表示');
    for (const step of lane.roadSteps) roadStepMetaById.set(step.id, { ...step, laneKey: lane.key });

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
    roadsByLaneKey.set(lane.key, road);
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
      if (destroyed) return failProgression('RUNTIME_DESTROYED');
      return syncProgressionLanePresentation({ presentation, documentLike, roadsByLaneKey, roadStepMetaById, roadStepsByKey });
    },
    resolveClearingCell(cellId) {
      return nonEmptyString(cellId) ? clearingByCellId.get(cellId) ?? null : null;
    },
    snapshot() {
      return deepFreeze({
        laneCount: model.lanes.length,
        goalCount: goalsByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepMetaById.size,
        visibleBuiltRoadStepCount: roadStepsByKey.size,
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
  unresolvedStageDefault: 'NO_DISCRETE_NODE_CONTINUOUS_TRACK_ONLY',
  futureDiscreteStageNodes: false,
  progressionSyncWritesGameState: false,
  goalEndpointCount: 12,
});

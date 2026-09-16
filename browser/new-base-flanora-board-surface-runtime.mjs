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
[data-new-base-flanora-board-surface="1"]{position:relative;display:grid;grid-template-rows:minmax(0,62%) minmax(96px,38%);gap:clamp(6px,1.1vh,12px);width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;padding:clamp(5px,.8vw,10px);isolation:isolate;overflow:hidden;background:linear-gradient(180deg,rgba(9,22,27,.18),rgba(12,41,30,.12))}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{position:relative;display:grid;grid-template-rows:clamp(28px,5.2vh,46px) minmax(0,1fr);gap:clamp(4px,.7vh,8px);min-width:0;min-height:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalBand{position:relative;display:grid;place-items:center;min-width:0;min-height:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalLabel{position:relative;z-index:2;display:grid;place-items:center;min-width:clamp(74px,12vw,150px);height:clamp(24px,4.3vh,38px);padding:0 clamp(12px,2vw,24px);box-sizing:border-box;border:1px solid rgba(255,232,143,.82);border-radius:999px;background:linear-gradient(180deg,rgba(107,82,24,.92),rgba(61,51,22,.92));box-shadow:0 0 16px rgba(255,224,120,.16);font-size:clamp(9px,1vw,14px);font-weight:950;letter-spacing:.08em;color:#fff5bd}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalBand::after{content:"";position:absolute;left:3%;right:3%;bottom:1px;height:2px;border-radius:99px;background:linear-gradient(90deg,transparent,rgba(255,229,139,.42) 8%,rgba(255,229,139,.42) 92%,transparent)}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalEndpoints{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));height:7px;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalEndpoint{place-self:end center;width:62%;height:3px;border-radius:99px;background:rgba(255,235,157,.16);opacity:.16;transition:opacity .16s ease,box-shadow .16s ease}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalEndpoint[data-connected-to-goal="true"]{opacity:1;background:rgba(255,235,157,.95);box-shadow:0 0 10px rgba(255,224,120,.7)}
[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(9px,1.5vw,22px);min-width:0;min-height:0;align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(3px,.55vw,8px);min-width:0;min-height:0;padding:0 clamp(1px,.25vw,4px);align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(2),[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(4){transform:translateY(clamp(2px,.5vh,5px))}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:clamp(3px,.55vh,6px);min-width:0;min-height:0;align-items:stretch;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:flex;flex-direction:column-reverse;align-items:center;justify-content:flex-start;gap:clamp(1px,.28vh,3px);width:100%;height:100%;min-width:0;min-height:0;padding:clamp(2px,.4vh,4px) 0;box-sizing:border-box}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;left:50%;top:1%;bottom:1%;width:2px;transform:translateX(-50%);border-radius:99px;background:linear-gradient(180deg,rgba(255,235,154,.4),rgba(229,244,220,.18) 58%,rgba(229,244,220,.38));box-shadow:0 0 7px rgba(229,244,220,.09)}
/* Only authority-established progress becomes a discrete card-shaped object. Future stages stay non-discrete on the vertical route. */
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:1;width:min(84%,clamp(26px,4vw,54px));height:clamp(12px,2.55vh,23px);flex:0 1 auto;min-height:8px;border:1px solid rgba(239,248,232,.88);border-radius:4px;background:linear-gradient(145deg,rgba(229,241,222,.96),rgba(87,128,97,.96));box-shadow:0 2px 5px rgba(0,0,0,.25),0 0 7px rgba(224,241,218,.14);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad[data-connected-to-goal="true"]::before{background:linear-gradient(180deg,rgba(255,232,142,.88),rgba(236,245,219,.36));box-shadow:0 0 9px rgba(255,225,129,.24)}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{display:grid;place-items:center;width:clamp(26px,4.5vw,52px);height:clamp(19px,3.7vh,34px);clip-path:polygon(50% 0,100% 25%,82% 100%,18% 100%,0 25%);background:linear-gradient(180deg,rgba(40,99,117,.96),rgba(21,62,78,.96));border:0;font-size:clamp(7px,.72vw,10px);font-weight:950;color:#e9f9ff;filter:drop-shadow(0 2px 3px rgba(0,0,0,.26))}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:clamp(3px,.5vw,7px);min-width:0;min-height:0;padding:clamp(12px,2.1vh,20px) clamp(10px,1.4vw,18px);box-sizing:border-box;border-radius:clamp(26px,6vw,70px);background:radial-gradient(ellipse at center,rgba(84,123,75,.22),rgba(28,65,50,.08) 67%,transparent 70%);overflow:hidden}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing::before{content:"";position:absolute;inset:clamp(14px,2.4vh,22px) clamp(18px,2.4vw,34px);border:2px solid rgba(219,238,210,.24);border-radius:50%/38%;box-shadow:0 0 16px rgba(204,232,196,.05);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{position:relative;z-index:1;place-self:center;width:clamp(16px,2.45vw,29px);height:clamp(16px,2.45vw,29px);border:1px solid rgba(238,247,232,.72);border-radius:50%;background:rgba(47,91,66,.9);box-shadow:0 2px 7px rgba(0,0,0,.22)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(255,224,134,.9);outline-offset:2px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,60%) minmax(78px,40%);gap:4px;padding:3px}[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{grid-template-rows:24px minmax(0,1fr);gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{gap:6px}[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster{gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{gap:1px;padding:1px 0}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{width:min(82%,34px);height:9px;min-height:6px;border-radius:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{width:28px;height:17px;font-size:6px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{padding:8px 7px;gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{width:14px;height:14px}}
@media(max-width:540px) and (orientation:portrait){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,64%) minmax(126px,36%)}[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:6px 10px}[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(2),[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(4){transform:none}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{height:9px}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{width:27px;height:18px}}
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
    laneCounts.set(lane.key, {
      builtCount,
      latentCount,
      connectedToGoal: lane.connectedToGoal === true,
    });
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
  goalsByLaneKey,
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
    setAttr(road, 'data-connected-to-goal', counts.connectedToGoal);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', `成立済み ${counts.builtCount}/7。未成立位置は開放マスとして表示しない`);
    const goal = goalsByLaneKey.get(key);
    if (goal) setAttr(goal, 'data-connected-to-goal', counts.connectedToGoal);
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
  setAttr(root, 'data-goal-edge', 'top');
  setAttr(root, 'data-road-entry-edge', 'bottom');
  setAttr(root, 'data-progression-direction', 'bottom-to-top');
  setAttr(root, 'data-central-world-layout', 'shared-field-below-four-three-lane-clusters');
  setAttr(root, 'data-future-discrete-progression-slots', 'false');
  setAttr(root, 'aria-label', '下側の共有フィールドから盾を経て、成立済みの進行カードが上側GOALへ伸びる4人×各3レーン。未成立位置は開放マスとして表示しない');

  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const goalBand = createNode(documentLike, 'div', 'grFlanoraGoalBand');
  setAttr(goalBand, 'data-shared-goal-visual', '1');
  setAttr(goalBand, 'aria-label', '上側GOAL。レーン接続の表示であり勝敗判定ではない');
  const goalLabel = createNode(documentLike, 'span', 'grFlanoraGoalLabel');
  goalLabel.textContent = 'GOAL';
  const goalEndpoints = createNode(documentLike, 'div', 'grFlanoraGoalEndpoints');
  const progressionGrid = createNode(documentLike, 'div', 'grFlanoraProgressionGrid');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-flanora-clearing-loop', 'horizontal-zero');
  setAttr(clearing, 'data-shared-main-field', 'true');
  setAttr(clearing, 'aria-label', '4人が移動する共有フィールド');

  goalBand.appendChild(goalLabel);
  goalBand.appendChild(goalEndpoints);
  upper.appendChild(goalBand);
  upper.appendChild(progressionGrid);
  root.appendChild(upper);
  root.appendChild(clearing);

  const goalsByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const roadStepMetaById = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();
  const participantClusters = new Map();

  for (const [participantSlot, participantId] of model.participantIds.entries()) {
    const cluster = createNode(documentLike, 'section', 'grFlanoraParticipantCluster');
    setAttr(cluster, 'data-participant-id', participantId);
    setAttr(cluster, 'data-participant-slot', participantSlot);
    cluster.style.gridColumn = String(participantSlot + 1);
    progressionGrid.appendChild(cluster);
    participantClusters.set(participantId, cluster);
  }

  for (const lane of model.lanes) {
    const participantSlot = model.participantIds.indexOf(lane.participantId);
    const cluster = participantClusters.get(lane.participantId);
    if (participantSlot < 0 || !cluster) throw new TypeError('FLANORA_LANE_PARTICIPANT_REQUIRED');

    const goal = createNode(documentLike, 'span', 'grFlanoraGoalEndpoint');
    setAttr(goal, 'data-flanora-goal', lane.key);
    setAttr(goal, 'data-connected-to-goal', 'false');
    goal.style.gridColumn = String(lane.relativeColumn + 1);
    goalEndpoints.appendChild(goal);
    goalsByLaneKey.set(lane.key, goal);

    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-participant-slot', participantSlot);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    laneNode.style.gridColumn = String(lane.laneIndex + 1);

    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', ROAD_STEPS.length);
    setAttr(road, 'data-progression-built-count', 0);
    setAttr(road, 'data-progression-latent-count', ROAD_STEPS.length);
    setAttr(road, 'data-connected-to-goal', 'false');
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', '成立済み 0/7。未成立位置は開放マスとして表示しない');
    for (const step of lane.roadSteps) roadStepMetaById.set(step.id, { ...step, laneKey: lane.key });

    const shield = createNode(documentLike, 'span', 'grFlanoraShield');
    shield.textContent = '盾';
    setAttr(shield, 'data-flanora-shield', lane.key);
    setAttr(shield, 'data-clearing-entry-cell-id', lane.clearingEntryCellId);

    laneNode.appendChild(road);
    laneNode.appendChild(shield);
    cluster.appendChild(laneNode);
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
    goalBand,
    goalEndpoints,
    progressionGrid,
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
      return syncProgressionLanePresentation({
        presentation,
        documentLike,
        roadsByLaneKey,
        goalsByLaneKey,
        roadStepMetaById,
        roadStepsByKey,
      });
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
  sharedGoalVisualCount: 1,
  progressionDirection: 'BOTTOM_TO_TOP',
  centralWorldLayout: 'SHARED_FIELD_BELOW_FOUR_THREE_LANE_CLUSTERS',
});

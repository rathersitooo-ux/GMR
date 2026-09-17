import { createFlanoraMapLayout } from './new-base-flanora-map-layout-core.mjs';
import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v1';
const LAYOUT_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';
const STYLE_ID = 'gameroad-new-base-flanora-board-surface-style';
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);
const ROAD_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const SHARED_GOAL_ID = 'goal:shared';
const FIXED_TARGET_LANE_X_PCT = Object.freeze([7.1419, 13.6458, 20.2214, 31.0286, 37.7214, 44.4401, 55.3646, 61.9466, 68.6523, 79.5182, 86.1589, 92.7409]);
const GOAL_BRANCH_START_X_PCT = Object.freeze([45.2, 46.1, 47.0, 47.9, 48.8, 49.7, 50.3, 51.2, 52.1, 53.0, 53.9, 54.8]);
const GOAL_BRANCH_START_Y_PCT = 17.2;
const GOAL_BRANCH_END_Y_PCT = 27.0;
const TARGET_BOTTOM_CELL_POSITIONS = Object.freeze([
  { x: 12.10, y: 60.1 }, { x: 19.34, y: 71.3 }, { x: 12.98, y: 85.3 }, { x: 22.53, y: 85.3 },
  { x: 30.20, y: 85.3 }, { x: 40.50, y: 85.3 }, { x: 49.87, y: 85.3 }, { x: 59.18, y: 85.3 },
  { x: 69.50, y: 85.3 }, { x: 77.27, y: 85.3 }, { x: 80.42, y: 71.3 }, { x: 87.75, y: 60.1 },
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function requireLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new TypeError('FLANORA_LAYOUT_REQUIRED');
  if (layout.schema !== LAYOUT_SCHEMA) throw new TypeError('FLANORA_LAYOUT_SCHEMA_INVALID');
  if (layout.clearingOwnership !== 'SHARED') throw new TypeError('FLANORA_SHARED_CLEARING_REQUIRED');
  if (layout.clearingLoopShape !== 'HORIZONTAL_ZERO') throw new TypeError('FLANORA_HORIZONTAL_ZERO_REQUIRED');
  if (layout.clearingConnectivity !== 'SINGLE_CLOSED_LOOP') throw new TypeError('FLANORA_CLOSED_LOOP_REQUIRED');
  if (layout.geometryIsMovementAuthority !== false) throw new TypeError('FLANORA_GEOMETRY_MUST_NOT_OWN_MOVEMENT');
  if (layout.optionalRuleGeometryIncluded !== false) throw new TypeError('FLANORA_OPTIONAL_RULE_GEOMETRY_FORBIDDEN');
  if (!Array.isArray(layout.participantIds) || layout.participantIds.length !== 4) throw new TypeError('FLANORA_FOUR_PARTICIPANTS_REQUIRED');
  if (!Array.isArray(layout.laneRootConnections) || layout.laneRootConnections.length !== 12) throw new TypeError('FLANORA_TWELVE_LANE_ROOTS_REQUIRED');
  if (!Array.isArray(layout.clearingCells) || layout.clearingCells.length !== 26) throw new TypeError('FLANORA_TWENTY_SIX_CLEARING_CELLS_REQUIRED');
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
      goalId: SHARED_GOAL_ID,
      routeGateId: `goal-gate:${key}`,
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
    sharedGoalId: SHARED_GOAL_ID,
    sharedGoalCount: 1,
    routeGateCount: 12,
  goalBranchCount: 12,
  goalBranchVisual: 'TWELVE_DISTINCT_LINE_ELEMENTS_NO_SHARED_TRUNK',
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

function createSvgNode(documentLike, tagName, className = '') {
  const node = typeof documentLike.createElementNS === 'function'
    ? documentLike.createElementNS('http://www.w3.org/2000/svg', tagName)
    : createNode(documentLike, tagName);
  if (className) node.setAttribute?.('class', className);
  if (className && !node.className) node.className = className;
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

function fieldPositionForSourceCell(cell) {
  if (!cell) return null;
  if (cell.kind === 'CLEARING_TOP') {
    const x = FIXED_TARGET_LANE_X_PCT[cell.relativeColumn];
    return Number.isFinite(x) ? { x, y: 0, kind: 'ENTRY' } : null;
  }
  if (cell.kind === 'CLEARING_MIDDLE') {
    if (cell.relativeColumn === 0) return { x: 9.44, y: 48.5, kind: 'SIDE' };
    if (cell.relativeColumn === 11) return { x: 90.46, y: 48.5, kind: 'SIDE' };
    return null;
  }
  if (cell.kind === 'CLEARING_BOTTOM') {
    const point = TARGET_BOTTOM_CELL_POSITIONS[cell.relativeColumn];
    return point ? { ...point, kind: 'BOTTOM' } : null;
  }
  return null;
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function') return;
  if (documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[data-new-base-flanora-board-surface="1"]{position:relative;display:block;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;isolation:isolate;overflow:hidden;background:transparent;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{position:absolute;z-index:2;inset:0;min-width:0;min-height:0;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{position:absolute;z-index:8;left:50%;top:11.5%;transform:translateX(-50%);display:grid;place-items:center;width:clamp(68px,9.4vw,112px);height:clamp(26px,4.8vh,38px);border:1px solid rgba(255,230,139,.76);border-radius:50% 50% 44% 44%/62% 62% 38% 38%;background:radial-gradient(ellipse at 50% 58%,rgba(255,237,168,.10),rgba(73,61,28,.46) 62%,rgba(24,46,35,.84));box-shadow:0 0 15px rgba(255,223,113,.13),inset 0 0 10px rgba(255,244,198,.07);font-size:clamp(9px,1vw,13px);font-weight:1000;letter-spacing:.12em;color:#fff1ad;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal[data-connected-route-count]:not([data-connected-route-count="0"]){box-shadow:0 0 34px rgba(255,221,102,.38),inset 0 0 18px rgba(255,244,198,.14)}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalBranches{position:absolute;z-index:6;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalBranch{fill:none;stroke:rgba(232,242,218,.46);stroke-width:1;vector-effect:non-scaling-stroke;opacity:.72}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalBranch[data-connected-to-goal="true"]{stroke:rgba(255,238,169,.94);stroke-width:2;opacity:1;filter:drop-shadow(0 0 3px rgba(255,226,137,.34))}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateLayer{position:absolute;z-index:7;left:0;right:0;top:59%;height:6.2%;min-width:0;min-height:0;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateAnchor{position:absolute;top:0;bottom:0;width:clamp(28px,5vw,58px);transform:translateX(-50%);min-width:0;min-height:0;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{position:absolute;z-index:4;left:0;right:0;top:27%;bottom:34.5%;min-width:0;min-height:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster{display:contents}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{position:absolute;top:0;bottom:0;width:clamp(24px,4.4vw,46px);transform:translateX(-50%);display:grid;grid-template-rows:minmax(0,1fr) auto;gap:clamp(2px,.4vh,4px);min-width:0;min-height:0;align-items:stretch;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:flex;flex-direction:column-reverse;align-items:center;justify-content:flex-start;gap:clamp(1px,.22vh,3px);width:100%;height:100%;min-width:0;min-height:0;padding:1px 0;box-sizing:border-box}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,229,139,.20),rgba(226,241,218,.10));opacity:.24}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad[data-progression-built-count]:not([data-progression-built-count="0"])::before{opacity:.46}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad[data-connected-to-goal="true"]::before{width:2px;opacity:.82;box-shadow:0 0 5px rgba(255,226,137,.20)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:2;display:grid;place-items:center;width:min(90%,clamp(20px,3.75vw,38px));aspect-ratio:1.48;border:1px solid rgba(238,247,230,.80);border-radius:3px;background:linear-gradient(150deg,rgba(238,245,226,.96),rgba(87,128,98,.94));box-shadow:0 2px 5px rgba(0,0,0,.25);overflow:hidden;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep[data-card-identity-resolved="true"]{border-color:rgba(255,239,177,.9);background:linear-gradient(150deg,rgba(252,245,216,.98),rgba(69,117,90,.96));box-shadow:0 2px 6px rgba(0,0,0,.30),0 0 7px rgba(255,225,132,.12)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadCardLabel{display:block;width:94%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:clamp(5px,.48vw,8px);font-weight:850;color:#18392e;text-shadow:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{position:relative;z-index:3;display:grid;place-items:center;width:min(88%,clamp(22px,3.8vw,38px));min-height:clamp(14px,2.35vh,20px);border:1px solid rgba(188,229,241,.58);border-radius:7px 7px 10px 10px;background:linear-gradient(180deg,rgba(38,84,95,.76),rgba(18,56,66,.86));font-size:clamp(6px,.62vw,9px);font-weight:950;color:#e8f8ff;box-shadow:0 2px 5px rgba(0,0,0,.16)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{position:absolute;z-index:0;left:0;right:0;top:62.5%;bottom:3.2%;min-width:0;min-height:0;background:transparent;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraFieldNodes{position:absolute;z-index:0;inset:0;pointer-events:none;opacity:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraFieldNode{position:absolute;transform:translate(-50%,-50%);width:1px;height:1px;opacity:0;pointer-events:none}
#battleMap[data-central-world-live="1"].decisionRoad #routeLine{opacity:.55!important}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{width:64px;height:24px;font-size:8px}[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateLayer{top:59%;height:6%}[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{top:27.5%;bottom:35%}[data-new-base-flanora-board-surface="1"] .grFlanoraLane{width:clamp(22px,4.4vw,36px)}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{width:min(90%,30px)}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{min-height:13px;font-size:6px}[data-new-base-flanora-board-surface="1"] .grFlanoraFieldNode{width:clamp(7px,1.2vw,12px);height:clamp(7px,1.2vw,12px)}}
@media(max-width:540px) and (orientation:portrait){[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{width:70px;height:28px}[data-new-base-flanora-board-surface="1"] .grFlanoraLane{width:clamp(20px,5.4vw,30px)}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{width:min(86%,26px)}}
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
    resolvedPhysicalCardIdentityCount: null,
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    gameStateWrite: false,
  });
}

function writeBuiltProgressionStagePresentation(node, stage) {
  setAttr(node, 'data-progression-stage-state', 'BUILT');
  setAttr(node, 'data-progression-established', 'true');
  setAttr(node, 'data-progression-latent', 'false');
  setAttr(node, 'data-progression-actionable', 'false');
  setAttr(node, 'data-progression-traversable', 'false');
  setAttr(node, 'data-progression-authority', 'presentation-only');
  const cardId = nonEmptyString(stage?.cardId) ? stage.cardId : null;
  setAttr(node, 'data-card-identity-resolved', cardId ? 'true' : 'false');
  if (cardId) {
    setAttr(node, 'data-card-id', cardId);
    setAttr(node, 'data-physical-card-id', cardId);
    node.textContent = '';
    const label = createNode(node.ownerDocument ?? { createElement: () => null }, 'span', 'grFlanoraRoadCardLabel');
    if (label) {
      label.textContent = cardId;
      node.appendChild(label);
    } else {
      node.textContent = cardId;
    }
  } else {
    node.textContent = '';
  }
  setAttr(node, 'aria-label', cardId ? `進行カード ${stage.stageIndex}/7 ${cardId}` : `進行済み ${stage.stageIndex}/7`);
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
    let resolvedIdentityCount = 0;

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
        if (nonEmptyString(stage?.cardId)) resolvedIdentityCount += 1;
        builtAssignments.push({ road, meta, stage });
      } else {
        latentCount += 1;
      }
    }
    laneCounts.set(lane.key, {
      builtCount,
      latentCount,
      resolvedIdentityCount,
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
  routeGatesByLaneKey,
  goalBranchesByLaneKey,
  sharedGoal,
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

  for (const { road, meta, stage } of validated.builtAssignments) {
    let node = roadStepsByKey.get(meta.id);
    if (!node) {
      node = createNode(documentLike, 'span', 'grFlanoraRoadStep');
      setAttr(node, 'data-flanora-road-step', meta.roadIndex);
      setAttr(node, 'data-flanora-road-step-id', meta.id);
      setAttr(node, 'data-row-index', meta.rowIndex);
      road.appendChild(node);
      roadStepsByKey.set(meta.id, node);
    }
    // Keep the existing node but replace its presentation identity from caller authority.
    node.textContent = '';
    setAttr(node, 'data-progression-stage-state', 'BUILT');
    setAttr(node, 'data-progression-established', 'true');
    setAttr(node, 'data-progression-latent', 'false');
    setAttr(node, 'data-progression-actionable', 'false');
    setAttr(node, 'data-progression-traversable', 'false');
    setAttr(node, 'data-progression-authority', 'presentation-only');
    const cardId = nonEmptyString(stage?.cardId) ? stage.cardId : null;
    setAttr(node, 'data-card-identity-resolved', cardId ? 'true' : 'false');
    if (cardId) {
      setAttr(node, 'data-card-id', cardId);
      setAttr(node, 'data-physical-card-id', cardId);
      const label = createNode(documentLike, 'span', 'grFlanoraRoadCardLabel');
      label.textContent = cardId;
      node.appendChild(label);
    }
    setAttr(node, 'aria-label', cardId ? `進行カード ${stage.stageIndex}/7 ${cardId}` : `進行済み ${stage.stageIndex}/7`);
  }

  let connectedRouteCount = 0;
  let resolvedPhysicalCardIdentityCount = 0;
  for (const [key, road] of roadsByLaneKey) {
    const counts = validated.laneCounts.get(key);
    if (counts.connectedToGoal) connectedRouteCount += 1;
    resolvedPhysicalCardIdentityCount += counts.resolvedIdentityCount;
    setAttr(road, 'data-progression-built-count', counts.builtCount);
    setAttr(road, 'data-progression-latent-count', counts.latentCount);
    setAttr(road, 'data-connected-to-goal', counts.connectedToGoal);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', `成立済み ${counts.builtCount}/7。未成立位置はカード枠として表示しない`);
    const gate = routeGatesByLaneKey.get(key);
    if (gate) setAttr(gate, 'data-connected-to-goal', counts.connectedToGoal);
    const branch = goalBranchesByLaneKey.get(key);
    if (branch) setAttr(branch, 'data-connected-to-goal', counts.connectedToGoal);
  }
  setAttr(sharedGoal, 'data-connected-route-count', connectedRouteCount);
  setAttr(sharedGoal, 'data-terminal-result-authority', 'false');

  return deepFreeze({
    applied: true,
    reason: 'PROGRESSION_PRESENTATION_APPLIED',
    builtStageCount: presentation.totalBuiltStageCount,
    latentStageCount: presentation.totalLatentStageCount,
    resolvedPhysicalCardIdentityCount,
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

  const model = layout ? projectFlanoraBoardSurfaceModel(layout) : createFlanoraBoardSurfaceModel(layoutInput ?? {});
  ensureStyle(documentLike);

  const root = createNode(documentLike, 'section', 'grFlanoraBoardSurface');
  setAttr(root, 'data-new-base-flanora-board-surface', '1');
  setAttr(root, 'data-performance-profile', performanceProfile({ reducedMotion, lowPerf }));
  setAttr(root, 'data-presentation-only', 'true');
  setAttr(root, 'data-gameplay-authority', 'false');
  setAttr(root, 'data-goal-edge', 'top-center');
  setAttr(root, 'data-road-entry-edge', 'bottom');
  setAttr(root, 'data-progression-direction', 'bottom-to-top');
  setAttr(root, 'data-central-world-layout', 'shared-field-shield-actual-card-road-route-gates-one-goal');
  setAttr(root, 'data-future-discrete-progression-slots', 'false');
  setAttr(root, 'aria-label', '下側の共有フィールドから盾、実際に成立したカードの道、12経路ゲートを通って上中央の1つのGOALへつながる盤面');

  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const sharedGoal = createNode(documentLike, 'div', 'grFlanoraSharedGoal');
  const goalBranches = createSvgNode(documentLike, 'svg', 'grFlanoraGoalBranches');
  setAttr(goalBranches, 'viewBox', '0 0 100 100');
  setAttr(goalBranches, 'preserveAspectRatio', 'none');
  setAttr(goalBranches, 'aria-hidden', 'true');
  sharedGoal.textContent = 'GOAL';
  setAttr(sharedGoal, 'data-flanora-shared-goal', SHARED_GOAL_ID);
  setAttr(sharedGoal, 'data-connected-route-count', 0);
  setAttr(sharedGoal, 'data-terminal-result-authority', 'false');
  setAttr(sharedGoal, 'aria-label', '上中央の共有GOAL。7枚接続だけでは勝敗を確定しない');
  const routeGateLayer = createNode(documentLike, 'div', 'grFlanoraRouteGateLayer');
  setAttr(routeGateLayer, 'data-route-gate-count', 12);
  const progressionGrid = createNode(documentLike, 'div', 'grFlanoraProgressionGrid');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-shared-main-field', 'true');
  setAttr(clearing, 'aria-label', '4人が移動する共有フィールド。利用者指定の分岐ネットワーク形状');

  upper.appendChild(goalBranches);
  upper.appendChild(sharedGoal);
  upper.appendChild(routeGateLayer);
  upper.appendChild(progressionGrid);
  root.appendChild(upper);
  root.appendChild(clearing);

  const goalBranchesByLaneKey = new Map();
  const routeGatesByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const roadStepMetaById = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();
  const fieldNodesById = new Map();
  const fieldNodes = createNode(documentLike, 'div', 'grFlanoraFieldNodes');
  clearing.appendChild(fieldNodes);
  const participantClusters = new Map();

  for (const [participantSlot, participantId] of model.participantIds.entries()) {
    const cluster = createNode(documentLike, 'section', 'grFlanoraParticipantCluster');
    setAttr(cluster, 'data-participant-id', participantId);
    setAttr(cluster, 'data-participant-slot', participantSlot);
    progressionGrid.appendChild(cluster);
    participantClusters.set(participantId, cluster);
  }

  for (const lane of model.lanes) {
    const cluster = participantClusters.get(lane.participantId);
    if (!cluster) throw new TypeError('FLANORA_LANE_PARTICIPANT_REQUIRED');

    const goalBranch = createSvgNode(documentLike, 'line', 'grFlanoraGoalBranch');
    setAttr(goalBranch, 'data-goal-branch-lane-key', lane.key);
    setAttr(goalBranch, 'data-shared-goal-id', SHARED_GOAL_ID);
    setAttr(goalBranch, 'data-connected-to-goal', 'false');
    setAttr(goalBranch, 'x1', GOAL_BRANCH_START_X_PCT[lane.relativeColumn]);
    setAttr(goalBranch, 'y1', GOAL_BRANCH_START_Y_PCT);
    setAttr(goalBranch, 'x2', FIXED_TARGET_LANE_X_PCT[lane.relativeColumn]);
    setAttr(goalBranch, 'y2', GOAL_BRANCH_END_Y_PCT);
    goalBranches.appendChild(goalBranch);
    goalBranchesByLaneKey.set(lane.key, goalBranch);

    const routeGate = createNode(documentLike, 'span', 'grFlanoraRouteGateAnchor');
    setAttr(routeGate, 'data-flanora-goal', lane.key);
    setAttr(routeGate, 'data-flanora-route-gate', lane.routeGateId);
    setAttr(routeGate, 'data-shared-goal-id', SHARED_GOAL_ID);
    setAttr(routeGate, 'data-connected-to-goal', 'false');
    routeGate.style.left = `${FIXED_TARGET_LANE_X_PCT[lane.relativeColumn]}%`;
    routeGateLayer.appendChild(routeGate);
    routeGatesByLaneKey.set(lane.key, routeGate);

    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    laneNode.style.left = `${FIXED_TARGET_LANE_X_PCT[lane.relativeColumn]}%`;

    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', ROAD_STEPS.length);
    setAttr(road, 'data-progression-built-count', 0);
    setAttr(road, 'data-progression-latent-count', ROAD_STEPS.length);
    setAttr(road, 'data-connected-to-goal', 'false');
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', '成立済み 0/7。未成立位置はカード枠として表示しない');
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

  const fieldPositionByCellId = new Map();
  for (const cell of model.clearingCells) {
    const position = fieldPositionForSourceCell(cell);
    if (!position) throw new TypeError(`FLANORA_SOURCE_CLEARING_POSITION_UNRESOLVED:${cell.id}`);
    const cellNode = createNode(documentLike, 'span', 'grFlanoraFieldNode');
    cellNode.style.left = `${position.x}%`;
    cellNode.style.top = `${position.y}%`;
    setAttr(cellNode, 'data-source-clearing-cell-id', cell.id);
    setAttr(cellNode, 'data-target-field-kind', position.kind);
    setAttr(cellNode, 'data-clearing-kind', cell.kind);
    if (cell.startParticipantIds.length) {
      setAttr(cellNode, 'data-start-participant', cell.startParticipantIds.join(' '));
      setAttr(cellNode, 'aria-label', `?? ${cell.startParticipantIds.join('?')}`);
    }
    fieldNodes.appendChild(cellNode);
    fieldNodesById.set(cell.id, cellNode);
    fieldPositionByCellId.set(cell.id, position);
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
    sharedGoal,
    goalBranches,
    routeGateLayer,
    progressionGrid,
    clearing,
    resolveSharedGoal() {
      return sharedGoal;
    },
    resolveGoalBranch(participantId, laneIndex) {
      return goalBranchesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
    resolveRouteGate(participantId, laneIndex) {
      return routeGatesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
    // Compatibility alias: callers that used resolveGoal get the route-specific
    // attachment point, while the visual GOAL itself is shared and singular.
    resolveGoal(participantId, laneIndex) {
      return routeGatesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
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
        routeGatesByLaneKey,
        goalBranchesByLaneKey,
        sharedGoal,
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
        goalCount: 1,
        sharedGoalCount: 1,
        routeGateCount: routeGatesByLaneKey.size,
        goalBranchCount: goalBranchesByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepMetaById.size,
        visibleBuiltRoadStepCount: roadStepsByKey.size,
        resolvedPhysicalCardIdentityCount: [...roadStepsByKey.values()].filter((node) => node.dataset?.cardIdentityResolved === 'true').length,
        sourceClearingBindingCount: clearingByCellId.size,
        clearingCellCount: clearingByCellId.size,
        visibleSharedFieldNodeCount: 0,
        visibleSharedFieldEdgeCount: 0,
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
  sharedGoalCount: 1,
  routeGateCount: 12,
  goalBranchCount: 12,
  goalBranchVisual: 'TWELVE_DISTINCT_LINE_ELEMENTS_NO_SHARED_TRUNK',
  sharedGoalPlacement: 'TOP_CENTER_WORLD_SPACE',
  progressionDirection: 'BOTTOM_TO_TOP',
  builtStageIdentity: 'CALLER_PHYSICAL_CARD_ID_WHEN_AVAILABLE',
  futureDiscreteStageNodes: false,
  unresolvedStageDefault: 'NO_DISCRETE_NODE_GUIDE_ONLY',
  visibleSharedFieldNodeCount: 0,
  visibleSharedFieldEdgeCount: 0,
  duplicateLowerPresentationGraph: false,
  sharedLowerFieldVisualAuthority: 'EXISTING_BATTLE_ACTUAL',
});

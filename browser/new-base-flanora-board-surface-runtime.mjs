import { createFlanoraMapLayout } from './new-base-flanora-map-layout-core.mjs';
import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v2';
const LAYOUT_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';
const STYLE_ID = 'gameroad-new-base-flanora-board-surface-style-v2';
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);
const ROAD_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

// Fixed directly to the user-provided visual actual. This is presentation geometry only.
// The image itself remains the comparison authority; these coordinates are not gameplay authority.
const FIXED_REFERENCE = Object.freeze({
  fileId: 'file_00000000dbf08211a12db264680e0d82',
  sha256: '8b5d3723d46101a7675921c058a5308347d7740318af43161be7e76459d47a97',
  width: 1536,
  height: 864,
  goal: Object.freeze({ x: 768, y: 50 }),
  laneTopY: 196,
  shieldTopY: 452,
  fieldRailY: 542,
  fieldBottomY: 789,
  laneX: Object.freeze([110, 210, 310, 477, 580, 682, 849, 952, 1054, 1221, 1323, 1425]),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function setAttr(node, name, value) {
  if (value == null) return;
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

function createSvgNode(documentLike, tagName, className = '') {
  const node = typeof documentLike.createElementNS === 'function'
    ? documentLike.createElementNS('http://www.w3.org/2000/svg', tagName)
    : documentLike.createElement(tagName);
  if (className) {
    node.className = className;
    setAttr(node, 'class', className);
  }
  return node;
}

function laneKey(participantId, laneIndex) {
  return `${participantId}:${laneIndex}`;
}

function pct(value, total) {
  return `${((value / total) * 100).toFixed(4)}%`;
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
    const relativeColumn = root.columnIndex - minColumn;
    return {
      key,
      participantId: root.participantId,
      laneIndex: root.laneIndex,
      laneLabel: LANE_LABELS[root.laneIndex],
      columnIndex: root.columnIndex,
      relativeColumn,
      referenceX: FIXED_REFERENCE.laneX[relativeColumn],
      goalId: 'goal:shared',
      goalLinkId: `goal-link:${key}`,
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
    sharedGoalId: 'goal:shared',
    fixedReference: FIXED_REFERENCE,
    lanes,
    clearingCells,
    clearingCycleCellIds: [...layout.clearingCycleCellIds],
    clearingGeometryEdges: [...layout.geometryEdges],
    optionalRuleGeometryIncluded: false,
    upperProgressIsPrebuiltMovementField: layout.upperProgressIsPrebuiltMovementField === true,
  });
}

export function createFlanoraBoardSurfaceModel(layoutInput = {}) {
  return projectFlanoraBoardSurfaceModel(createFlanoraMapLayout(layoutInput));
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function') return;
  if (documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[data-new-base-flanora-board-surface="1"]{position:relative;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;isolation:isolate;overflow:hidden}
[data-new-base-flanora-board-surface="1"] .grFlanoraReferenceStage{position:absolute;inset:0;min-width:0;min-height:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalLinks,[data-new-base-flanora-board-surface="1"] .grFlanoraFieldEdges{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalLinks line{stroke:rgba(229,243,234,.58);stroke-width:3;vector-effect:non-scaling-stroke}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalLinks line[data-goal-connected="true"]{stroke:rgba(255,222,120,.95);stroke-width:5}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalHub{position:absolute;display:grid;place-items:center;z-index:8;width:clamp(34px,4.2vw,62px);aspect-ratio:1;border:clamp(2px,.24vw,4px) solid rgba(255,234,154,.94);border-radius:50%;background:radial-gradient(circle,rgba(255,247,205,.95) 0 34%,rgba(113,87,24,.94) 38% 63%,rgba(30,46,37,.98) 67%);box-shadow:0 0 18px rgba(255,226,123,.3);font-size:clamp(6px,.55vw,9px);font-weight:1000;color:#fff2b8;transform:translate(-50%,-50%)}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{position:absolute;z-index:5;display:grid;grid-template-rows:minmax(0,1fr) 19%;gap:1.2%;width:clamp(34px,5.7%,88px);height:38.1%;transform:translateX(-50%);min-width:0;min-height:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:repeat(7,minmax(0,1fr));align-items:center;justify-items:center;min-width:0;min-height:0;border:1px solid rgba(221,240,231,.48);background:linear-gradient(180deg,rgba(12,43,34,.18),rgba(6,22,18,.38));box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:2;place-self:center;width:68%;height:78%;min-height:4px;max-height:36px;border:1px solid rgba(238,247,232,.9);border-radius:3px;background:linear-gradient(145deg,rgba(236,246,228,.96),rgba(104,145,112,.95));box-shadow:0 2px 5px rgba(0,0,0,.28);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep::after{content:"";position:absolute;inset:2px;border:1px solid rgba(31,74,56,.42);border-radius:1px}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{position:relative;display:grid;place-items:center;align-self:stretch;justify-self:center;width:74%;min-height:0;border:1px solid rgba(188,229,241,.82);background:linear-gradient(180deg,rgba(29,82,96,.94),rgba(12,47,57,.96));clip-path:polygon(7% 0,93% 0,100% 45%,50% 100%,0 45%);font-size:clamp(6px,.62vw,9px);font-weight:950;color:#e8f8ff}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{position:absolute;inset:0;z-index:3;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraFieldRail{position:absolute;z-index:1;height:clamp(5px,.75vh,10px);border:1px solid rgba(218,238,229,.52);background:repeating-linear-gradient(90deg,rgba(224,241,233,.20) 0 3%,rgba(8,28,23,.62) 3% 5%);transform:translateY(-50%);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraFieldEdges line{stroke:rgba(218,238,229,.48);stroke-width:3;vector-effect:non-scaling-stroke}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{position:absolute;z-index:3;width:clamp(12px,1.8vw,25px);height:clamp(12px,1.8vw,25px);transform:translate(-50%,-50%);border:2px solid rgba(238,247,232,.74);border-radius:50%;background:rgba(35,79,60,.94);box-shadow:0 2px 7px rgba(0,0,0,.22)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(255,224,134,.88);outline-offset:2px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"] .grFlanoraLane{width:clamp(28px,5.7%,50px)}[data-new-base-flanora-board-surface="1"] .grFlanoraGoalHub{width:30px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{width:13px;height:13px}}
`;
  documentLike.head.appendChild(style);
}

function performanceProfile({ reducedMotion = false, lowPerf = false } = {}) {
  if (reducedMotion === true) return 'reduced_motion';
  if (lowPerf === true) return 'low_perf';
  return 'standard';
}

function failProgression(reason) {
  return deepFreeze({ applied: false, reason, builtStageCount: null, latentStageCount: null, presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
}

function writeBuiltProgressionStagePresentation(node, stageIndex) {
  setAttr(node, 'data-progression-stage-state', 'BUILT');
  setAttr(node, 'data-progression-established', 'true');
  setAttr(node, 'data-progression-latent', 'false');
  setAttr(node, 'data-progression-actionable', 'false');
  setAttr(node, 'data-progression-traversable', 'false');
  setAttr(node, 'data-progression-authority', 'presentation-only');
  setAttr(node, 'aria-label', `進行済み ${stageIndex}/7`);
  node.style.gridRow = String(8 - stageIndex);
}

function validateProgressionPresentation(presentation, roadsByLaneKey, roadStepMetaById) {
  if (!isNewBaseProgressionLanePresentation(presentation) || presentation.ok !== true) return { ok: false, reason: 'PROGRESSION_PRESENTATION_REQUIRED' };
  if (presentation.lanePresentations.length !== roadsByLaneKey.size) return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  const seenLaneKeys = new Set();
  const seenRoadStepIds = new Set();
  const builtAssignments = [];
  const laneCounts = new Map();
  const connectedLaneKeys = new Set();

  for (const lane of presentation.lanePresentations) {
    const road = roadsByLaneKey.get(lane?.key);
    if (!road || seenLaneKeys.has(lane.key) || !Array.isArray(lane?.stages) || lane.stages.length !== ROAD_STEPS.length) return { ok: false, reason: 'PROGRESSION_STAGE_SET_INVALID' };
    seenLaneKeys.add(lane.key);
    let builtCount = 0;
    let latentCount = 0;
    if (lane.connectedToGoal === true) connectedLaneKeys.add(lane.key);
    for (const stage of lane.stages) {
      const meta = roadStepMetaById.get(stage?.roadStepId);
      const built = stage?.visualState === 'BUILT';
      const latent = stage?.visualState === 'LATENT';
      if (!meta || meta.laneKey !== lane.key || meta.roadIndex !== stage?.stageIndex || seenRoadStepIds.has(stage?.roadStepId) || (!built && !latent) || stage?.established !== built || stage?.latent !== latent || stage?.actionable !== false || stage?.traversable !== false || stage?.legalityAuthority !== false || stage?.movementAuthority !== false) {
        return { ok: false, reason: 'PROGRESSION_STAGE_ASSIGNMENT_INVALID' };
      }
      seenRoadStepIds.add(stage.roadStepId);
      if (built) { builtCount += 1; builtAssignments.push({ road, meta }); } else latentCount += 1;
    }
    laneCounts.set(lane.key, { builtCount, latentCount });
  }
  if (seenLaneKeys.size !== roadsByLaneKey.size || seenRoadStepIds.size !== roadStepMetaById.size) return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  return { ok: true, builtAssignments, laneCounts, connectedLaneKeys };
}

function syncProgressionLanePresentation({ presentation, documentLike, roadsByLaneKey, roadStepMetaById, roadStepsByKey, goalLinksByLaneKey }) {
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
    setAttr(road, 'aria-label', `成立済み ${counts.builtCount}/7。未成立位置は空のまま表示`);
    setAttr(goalLinksByLaneKey.get(key), 'data-goal-connected', validated.connectedLaneKeys.has(key) ? 'true' : 'false');
  }
  return deepFreeze({ applied: true, reason: 'PROGRESSION_PRESENTATION_APPLIED', builtStageCount: presentation.totalBuiltStageCount, latentStageCount: presentation.totalLatentStageCount, presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false, gameStateWrite: false });
}

function referenceClearingPoint(cell) {
  const x = FIXED_REFERENCE.laneX[Math.max(0, Math.min(11, cell.relativeColumn))];
  if (cell.clearingRow === 0) return { x, y: FIXED_REFERENCE.fieldRailY };
  if (cell.clearingRow === 1) return { x: cell.relativeColumn <= 5 ? 145 : 1390, y: 710 };
  return { x, y: FIXED_REFERENCE.fieldBottomY };
}

export function mountFlanoraBoardSurface({ host, documentLike = globalThis?.document, layoutInput = null, layout = null, reducedMotion = false, lowPerf = false } = {}) {
  if (!host || typeof host.appendChild !== 'function' || !documentLike || typeof documentLike.createElement !== 'function') {
    return Object.freeze({ schema: RUNTIME_SCHEMA, mounted: false, presentationOnly: true, gameplayAuthority: false, reason: 'DOM_HOST_REQUIRED' });
  }
  const model = layout ? projectFlanoraBoardSurfaceModel(layout) : createFlanoraBoardSurfaceModel(layoutInput ?? {});
  ensureStyle(documentLike);

  const root = createNode(documentLike, 'section', 'grFlanoraBoardSurface');
  setAttr(root, 'data-new-base-flanora-board-surface', '1');
  setAttr(root, 'data-performance-profile', performanceProfile({ reducedMotion, lowPerf }));
  setAttr(root, 'data-presentation-only', 'true');
  setAttr(root, 'data-gameplay-authority', 'false');
  setAttr(root, 'data-goal-topology', 'one-shared-goal');
  setAttr(root, 'data-goal-link-count', '12');
  setAttr(root, 'data-progression-direction', 'bottom-to-top');
  setAttr(root, 'data-central-world-layout', 'fixed-user-reference');
  setAttr(root, 'data-fixed-reference-file-id', FIXED_REFERENCE.fileId);
  setAttr(root, 'data-fixed-reference-sha256', FIXED_REFERENCE.sha256);
  setAttr(root, 'data-future-discrete-progression-slots', 'false');
  setAttr(root, 'aria-label', '固定参照画像に合わせた共有GOAL、4人×3列、Shield、共有フィールド。既存の盤面実体を再配置');

  const stage = createNode(documentLike, 'div', 'grFlanoraReferenceStage');
  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  const goalLinks = createSvgNode(documentLike, 'svg', 'grFlanoraGoalLinks');
  setAttr(goalLinks, 'viewBox', `0 0 ${FIXED_REFERENCE.width} ${FIXED_REFERENCE.height}`);
  setAttr(goalLinks, 'preserveAspectRatio', 'none');
  const fieldEdges = createSvgNode(documentLike, 'svg', 'grFlanoraFieldEdges');
  setAttr(fieldEdges, 'viewBox', `0 0 ${FIXED_REFERENCE.width} ${FIXED_REFERENCE.height}`);
  setAttr(fieldEdges, 'preserveAspectRatio', 'none');
  const goal = createNode(documentLike, 'span', 'grFlanoraGoalHub');
  goal.textContent = 'GOAL';
  goal.style.left = pct(FIXED_REFERENCE.goal.x, FIXED_REFERENCE.width);
  goal.style.top = pct(FIXED_REFERENCE.goal.y, FIXED_REFERENCE.height);
  setAttr(goal, 'data-flanora-goal', 'shared');
  setAttr(goal, 'data-shared-goal', 'true');

  stage.appendChild(goalLinks);
  stage.appendChild(fieldEdges);
  stage.appendChild(upper);
  stage.appendChild(clearing);
  stage.appendChild(goal);
  root.appendChild(stage);

  const rail = createNode(documentLike, 'span', 'grFlanoraFieldRail');
  rail.style.left = pct(16, FIXED_REFERENCE.width);
  rail.style.right = pct(16, FIXED_REFERENCE.width);
  rail.style.top = pct(FIXED_REFERENCE.fieldRailY, FIXED_REFERENCE.height);
  clearing.appendChild(rail);

  const goalsByLaneKey = new Map();
  const goalLinksByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const roadStepMetaById = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();
  const clearingPointById = new Map();

  for (const lane of model.lanes) {
    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    setAttr(laneNode, 'data-reference-column', lane.relativeColumn);
    laneNode.style.left = pct(lane.referenceX, FIXED_REFERENCE.width);
    laneNode.style.top = pct(FIXED_REFERENCE.laneTopY, FIXED_REFERENCE.height);

    const link = createSvgNode(documentLike, 'line', 'grFlanoraGoalLink');
    setAttr(link, 'data-flanora-goal-link', lane.key);
    setAttr(link, 'data-goal-connected', 'false');
    setAttr(link, 'x1', FIXED_REFERENCE.goal.x);
    setAttr(link, 'y1', FIXED_REFERENCE.goal.y);
    setAttr(link, 'x2', lane.referenceX);
    setAttr(link, 'y2', FIXED_REFERENCE.laneTopY);
    goalLinks.appendChild(link);
    goalLinksByLaneKey.set(lane.key, link);

    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', ROAD_STEPS.length);
    setAttr(road, 'data-progression-built-count', 0);
    setAttr(road, 'data-progression-latent-count', ROAD_STEPS.length);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'aria-label', '成立済み 0/7。未成立位置は空のまま表示');
    for (const step of lane.roadSteps) roadStepMetaById.set(step.id, { ...step, laneKey: lane.key });

    const shield = createNode(documentLike, 'span', 'grFlanoraShield');
    shield.textContent = `S ${lane.laneLabel}`;
    setAttr(shield, 'data-flanora-shield', lane.key);
    setAttr(shield, 'data-clearing-entry-cell-id', lane.clearingEntryCellId);

    laneNode.appendChild(road);
    laneNode.appendChild(shield);
    upper.appendChild(laneNode);
    goalsByLaneKey.set(lane.key, goal);
    shieldsByLaneKey.set(lane.key, shield);
    roadsByLaneKey.set(lane.key, road);
  }

  for (const lane of model.lanes) {
    const stem = createSvgNode(documentLike, 'line', 'grFlanoraShieldFieldStem');
    setAttr(stem, 'x1', lane.referenceX);
    setAttr(stem, 'x2', lane.referenceX);
    setAttr(stem, 'y1', 520);
    setAttr(stem, 'y2', FIXED_REFERENCE.fieldRailY);
    fieldEdges.appendChild(stem);
  }

  for (const cell of model.clearingCells) {
    const point = referenceClearingPoint(cell);
    clearingPointById.set(cell.id, point);
    const cellNode = createNode(documentLike, 'span', 'grFlanoraClearingCell');
    setAttr(cellNode, 'data-flanora-clearing-cell-id', cell.id);
    setAttr(cellNode, 'data-clearing-kind', cell.kind);
    cellNode.style.left = pct(point.x, FIXED_REFERENCE.width);
    cellNode.style.top = pct(point.y, FIXED_REFERENCE.height);
    if (cell.startParticipantIds.length) {
      setAttr(cellNode, 'data-start-participant', cell.startParticipantIds.join(' '));
      setAttr(cellNode, 'aria-label', `開始 ${cell.startParticipantIds.join('・')}`);
    }
    clearing.appendChild(cellNode);
    clearingByCellId.set(cell.id, cellNode);
  }

  for (const edge of model.clearingGeometryEdges) {
    const from = clearingPointById.get(edge.fromCellId);
    const to = clearingPointById.get(edge.toCellId);
    if (!from || !to) continue;
    const edgeNode = createSvgNode(documentLike, 'line', 'grFlanoraFieldEdge');
    setAttr(edgeNode, 'data-from-cell-id', edge.fromCellId);
    setAttr(edgeNode, 'data-to-cell-id', edge.toCellId);
    setAttr(edgeNode, 'x1', from.x);
    setAttr(edgeNode, 'y1', from.y);
    setAttr(edgeNode, 'x2', to.x);
    setAttr(edgeNode, 'y2', to.y);
    fieldEdges.appendChild(edgeNode);
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
    sharedGoal: goal,
    goalLinks,
    fieldEdges,
    resolveGoal(participantId, laneIndex) { return goalsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveGoalLink(participantId, laneIndex) { return goalLinksByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveShield(participantId, laneIndex) { return shieldsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveRoadStep(participantId, laneIndex, roadIndex) {
      if (!ROAD_STEPS.includes(roadIndex)) return null;
      return roadStepsByKey.get(`road:${resolveLaneKey(participantId, laneIndex)}:${roadIndex}`) ?? null;
    },
    syncProgressionPresentation(presentation) {
      if (destroyed) return failProgression('RUNTIME_DESTROYED');
      return syncProgressionLanePresentation({ presentation, documentLike, roadsByLaneKey, roadStepMetaById, roadStepsByKey, goalLinksByLaneKey });
    },
    resolveClearingCell(cellId) { return nonEmptyString(cellId) ? clearingByCellId.get(cellId) ?? null : null; },
    snapshot() {
      return deepFreeze({
        laneCount: model.lanes.length,
        goalCount: 1,
        goalLinkCount: goalLinksByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepMetaById.size,
        visibleBuiltRoadStepCount: roadStepsByKey.size,
        clearingCellCount: clearingByCellId.size,
        clearingCycleCellIds: [...model.clearingCycleCellIds],
        fixedReferenceFileId: FIXED_REFERENCE.fileId,
        fixedReferenceSha256: FIXED_REFERENCE.sha256,
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
  visualReference: 'FIXED_USER_VISUAL_FILE_AND_SHA256',
  fixedReferenceFileId: FIXED_REFERENCE.fileId,
  fixedReferenceSha256: FIXED_REFERENCE.sha256,
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
  sharedGoalCount: 1,
  goalLinkCount: 12,
  progressionPresentationSource: 'EXISTING_NEW_BASE_PROGRESSION_LANE_PRESENTATION',
  unresolvedStageDefault: 'NO_DISCRETE_NODE_EMPTY_TRACK_ONLY',
  futureDiscreteStageNodes: false,
  progressionSyncWritesGameState: false,
  goalEndpointCount: 1,
});
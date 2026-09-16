import { createFlanoraMapLayout } from './new-base-flanora-map-layout-core.mjs';
import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v1';
const LAYOUT_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';
const STYLE_ID = 'gameroad-new-base-flanora-board-surface-style';
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);
const ROAD_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const SHARED_GOAL_ID = 'goal:shared';

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
[data-new-base-flanora-board-surface="1"]{position:relative;display:grid;grid-template-rows:minmax(0,72%) minmax(72px,28%);gap:clamp(5px,.8vh,9px);width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;padding:clamp(4px,.65vw,8px);isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 50% 43%,rgba(34,86,63,.16),transparent 63%)}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{position:relative;display:grid;grid-template-rows:clamp(34px,7vh,58px) clamp(18px,3.2vh,28px) minmax(0,1fr);gap:clamp(2px,.45vh,5px);min-width:0;min-height:0;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{position:relative;z-index:5;place-self:start center;display:grid;place-items:center;width:clamp(68px,10vw,126px);height:clamp(28px,5.2vh,44px);border:2px solid rgba(255,230,135,.86);border-radius:52% 52% 46% 46%/62% 62% 38% 38%;background:radial-gradient(ellipse at 50% 55%,rgba(255,234,151,.17),rgba(70,57,20,.70) 68%,rgba(28,36,23,.9));box-shadow:0 0 20px rgba(255,220,104,.2),inset 0 0 12px rgba(255,242,185,.12);font-size:clamp(10px,1.2vw,16px);font-weight:1000;letter-spacing:.12em;color:#fff1ad;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal[data-connected-route-count]:not([data-connected-route-count="0"]){box-shadow:0 0 30px rgba(255,220,104,.42),inset 0 0 16px rgba(255,242,185,.18)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateLayer{position:relative;z-index:4;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));min-width:0;min-height:0;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateAnchor{position:relative;place-self:stretch center;width:72%;min-width:0;min-height:0;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateAnchor::before{content:"";position:absolute;left:50%;top:-26px;bottom:-5px;width:1px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,230,142,.16),rgba(226,241,218,.28));opacity:.42}
[data-new-base-flanora-board-surface="1"] .grFlanoraRouteGateAnchor[data-connected-to-goal="true"]::before{width:2px;opacity:.92;background:linear-gradient(180deg,rgba(255,238,171,.92),rgba(226,241,218,.54));box-shadow:0 0 7px rgba(255,226,137,.36)}
[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(7px,1.3vw,18px);min-width:0;min-height:0;align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(2px,.45vw,6px);min-width:0;min-height:0;align-items:stretch}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(2){transform:translateY(clamp(2px,.45vh,5px))}
[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(4){transform:translateY(clamp(3px,.65vh,7px))}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{display:grid;grid-template-rows:minmax(0,1fr) auto;gap:clamp(2px,.4vh,5px);min-width:0;min-height:0;align-items:stretch;justify-items:center}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:flex;flex-direction:column-reverse;align-items:center;justify-content:flex-start;gap:clamp(1px,.24vh,3px);width:100%;height:100%;min-width:0;min-height:0;padding:2px 0;box-sizing:border-box}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;left:50%;top:2%;bottom:1%;width:1px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,229,139,.30),rgba(226,241,218,.18));opacity:.7}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{position:relative;z-index:2;display:grid;place-items:center;width:min(92%,clamp(22px,4.3vw,56px));aspect-ratio:1.48;border:1px solid rgba(238,247,230,.84);border-radius:3px;background:linear-gradient(150deg,rgba(238,245,226,.96),rgba(87,128,98,.94));box-shadow:0 2px 5px rgba(0,0,0,.25);overflow:hidden;pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep[data-card-identity-resolved="true"]{border-color:rgba(255,239,177,.9);background:linear-gradient(150deg,rgba(252,245,216,.98),rgba(69,117,90,.96));box-shadow:0 2px 6px rgba(0,0,0,.30),0 0 7px rgba(255,225,132,.12)}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadCardLabel{display:block;width:94%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:clamp(5px,.48vw,8px);font-weight:850;color:#18392e;text-shadow:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{position:relative;z-index:2;display:grid;place-items:center;width:min(90%,clamp(26px,4.7vw,48px));min-height:clamp(15px,2.5vh,23px);border:1px solid rgba(188,229,241,.76);border-radius:8px 8px 11px 11px;background:linear-gradient(180deg,rgba(38,84,95,.90),rgba(18,56,66,.92));font-size:clamp(7px,.72vw,10px);font-weight:950;color:#e8f8ff;box-shadow:0 3px 7px rgba(0,0,0,.2)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:clamp(2px,.42vw,6px);min-width:0;min-height:0;padding:clamp(2px,.35vw,4px);border-radius:50% 46% 48% 44%/18% 22% 20% 17%;background:radial-gradient(ellipse at center,rgba(70,116,74,.18),rgba(26,74,56,.05) 72%,transparent)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{place-self:center;width:clamp(13px,2.3vw,26px);height:clamp(13px,2.3vw,26px);border:1px solid rgba(238,247,232,.58);border-radius:50%;background:rgba(47,91,66,.72);box-shadow:0 2px 6px rgba(0,0,0,.20)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(255,224,134,.74);outline-offset:1px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,75%) minmax(58px,25%);gap:2px;padding:3px}[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{grid-template-rows:28px 14px minmax(0,1fr);gap:1px}[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{width:68px;height:24px;font-size:8px}[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{gap:5px}[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster{gap:2px}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{width:min(94%,38px)}[data-new-base-flanora-board-surface="1"] .grFlanoraShield{min-height:13px;font-size:6px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{gap:1px;padding:1px}}
@media(max-width:540px) and (orientation:portrait){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,70%) minmax(120px,30%)}[data-new-base-flanora-board-surface="1"] .grFlanoraProgressionGrid{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));gap:5px}[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(2),[data-new-base-flanora-board-surface="1"] .grFlanoraParticipantCluster:nth-child(4){transform:none}[data-new-base-flanora-board-surface="1"] .grFlanoraRoadStep{width:min(90%,38px)}}
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
  sharedGoal.textContent = 'GOAL';
  setAttr(sharedGoal, 'data-flanora-shared-goal', SHARED_GOAL_ID);
  setAttr(sharedGoal, 'data-connected-route-count', 0);
  setAttr(sharedGoal, 'data-terminal-result-authority', 'false');
  setAttr(sharedGoal, 'aria-label', '上中央の共有GOAL。7枚接続だけでは勝敗を確定しない');
  const routeGateLayer = createNode(documentLike, 'div', 'grFlanoraRouteGateLayer');
  setAttr(routeGateLayer, 'data-route-gate-count', 12);
  const progressionGrid = createNode(documentLike, 'div', 'grFlanoraProgressionGrid');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-flanora-clearing-loop', 'horizontal-zero');
  setAttr(clearing, 'data-shared-main-field', 'true');
  setAttr(clearing, 'aria-label', '4人が移動する共有フィールド');

  upper.appendChild(sharedGoal);
  upper.appendChild(routeGateLayer);
  upper.appendChild(progressionGrid);
  root.appendChild(upper);
  root.appendChild(clearing);

  const routeGatesByLaneKey = new Map();
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
    progressionGrid.appendChild(cluster);
    participantClusters.set(participantId, cluster);
  }

  for (const lane of model.lanes) {
    const cluster = participantClusters.get(lane.participantId);
    if (!cluster) throw new TypeError('FLANORA_LANE_PARTICIPANT_REQUIRED');

    const routeGate = createNode(documentLike, 'span', 'grFlanoraRouteGateAnchor');
    setAttr(routeGate, 'data-flanora-goal', lane.key);
    setAttr(routeGate, 'data-flanora-route-gate', lane.routeGateId);
    setAttr(routeGate, 'data-shared-goal-id', SHARED_GOAL_ID);
    setAttr(routeGate, 'data-connected-to-goal', 'false');
    routeGate.style.gridColumn = String(lane.relativeColumn + 1);
    routeGateLayer.appendChild(routeGate);
    routeGatesByLaneKey.set(lane.key, routeGate);

    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
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
    sharedGoal,
    routeGateLayer,
    progressionGrid,
    clearing,
    resolveSharedGoal() {
      return sharedGoal;
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
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepMetaById.size,
        visibleBuiltRoadStepCount: roadStepsByKey.size,
        resolvedPhysicalCardIdentityCount: [...roadStepsByKey.values()].filter((node) => node.dataset?.cardIdentityResolved === 'true').length,
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
  sharedGoalCount: 1,
  routeGateCount: 12,
  sharedGoalPlacement: 'TOP_CENTER_WORLD_SPACE',
  progressionDirection: 'BOTTOM_TO_TOP',
  builtStageIdentity: 'CALLER_PHYSICAL_CARD_ID_WHEN_AVAILABLE',
  futureDiscreteStageNodes: false,
  unresolvedStageDefault: 'NO_DISCRETE_NODE_GUIDE_ONLY',
});

import { createFlanoraMapLayout } from './new-base-flanora-map-layout-core.mjs';
import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v1';
const LAYOUT_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V1';
const STYLE_ID = 'gameroad-new-base-flanora-board-surface-style';
const SHARED_GOAL_ID = 'goal:shared';
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
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new TypeError('FLANORA_LAYOUT_REQUIRED');
  if (layout.schema !== LAYOUT_SCHEMA) throw new TypeError('FLANORA_LAYOUT_SCHEMA_INVALID');
  if (layout.clearingOwnership !== 'SHARED') throw new TypeError('FLANORA_SHARED_CLEARING_REQUIRED');
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

  const laneRoots = [...layout.laneRootConnections].sort((a, b) => a.columnIndex - b.columnIndex);
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
      gateAnchorId: `gate:${key}`,
      shieldId: `shield:${key}`,
      clearingEntryCellId: root.clearingEntryCellId,
      roadSteps: ROAD_STEPS.map((roadIndex) => ({ id: `road:${key}:${roadIndex}`, roadIndex })),
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
    sharedGoalId: SHARED_GOAL_ID,
    sharedGoalCount: 1,
    columnSpan: { minColumnIndex: minColumn, maxColumnIndex: maxColumn, columnCount: 12 },
    lanes,
    clearingCells,
    clearingCycleCellIds: [...layout.clearingCycleCellIds],
    optionalRuleGeometryIncluded: false,
    upperProgressIsPrebuiltMovementField: false,
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

function removeNode(node) {
  if (!node) return;
  node.remove?.();
  if (node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function ensureStyle(documentLike) {
  if (!documentLike?.head || typeof documentLike.createElement !== 'function' || documentLike.getElementById?.(STYLE_ID)) return;
  const style = createNode(documentLike, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[data-new-base-flanora-board-surface="1"]{position:relative;display:grid;grid-template-rows:minmax(0,72%) minmax(86px,28%);width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;padding:clamp(4px,.8vw,9px);overflow:hidden;isolation:isolate;background:radial-gradient(ellipse at 50% 16%,rgba(245,231,177,.12),transparent 34%),linear-gradient(180deg,rgba(20,49,48,.34),rgba(17,42,30,.18))}
[data-new-base-flanora-board-surface="1"] .grFlanoraUpper{position:relative;min-width:0;min-height:0;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{position:absolute;z-index:8;left:50%;top:1.5%;transform:translateX(-50%);display:grid;place-items:center;width:clamp(70px,11vw,124px);height:clamp(30px,6vh,54px);box-sizing:border-box;border:clamp(3px,.45vw,6px) solid rgba(243,211,125,.92);border-bottom-width:clamp(5px,.7vw,8px);border-radius:50% 50% 32% 32%/70% 70% 30% 30%;background:radial-gradient(ellipse,rgba(244,226,165,.18),rgba(42,76,66,.42) 58%,rgba(19,40,35,.82));box-shadow:0 0 20px rgba(248,219,129,.22),inset 0 0 14px rgba(255,246,202,.12);font-weight:950;font-size:clamp(9px,1.3vw,15px);letter-spacing:.08em;color:#fff0b5}
[data-new-base-flanora-board-surface="1"] .grFlanoraLane{position:absolute;z-index:3;display:grid;grid-template-rows:clamp(19px,3.1vh,30px) minmax(0,1fr) clamp(18px,3vh,28px);align-items:stretch;justify-items:center;width:clamp(29px,5.5vw,64px);min-height:0;transform:translateX(-50%);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalGuide{position:absolute;z-index:1;height:2px;transform-origin:0 50%;border-radius:999px;background:linear-gradient(90deg,rgba(231,224,178,.13),rgba(248,226,145,.24));opacity:.42;pointer-events:none;transition:opacity .22s ease,box-shadow .22s ease}
[data-new-base-flanora-board-surface="1"] .grFlanoraGoalGuide[data-goal-path-open="1"]{opacity:.96;background:linear-gradient(90deg,rgba(243,226,160,.46),rgba(255,239,166,.92));box-shadow:0 0 8px rgba(255,230,141,.48)}
[data-new-base-flanora-board-surface="1"] .grFlanoraGateAnchor{position:relative;z-index:7;width:clamp(22px,3.8vw,42px);height:100%;overflow:visible}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad{position:relative;display:flex;flex-direction:column-reverse;justify-content:flex-start;align-items:center;gap:clamp(1px,.25vh,3px);width:100%;height:100%;min-height:0;padding:2px 0;box-sizing:border-box}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoad::before{content:"";position:absolute;left:50%;top:1%;bottom:1%;width:1px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(244,225,157,.24),rgba(228,238,217,.09));opacity:.55}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadCard{position:relative;z-index:2;display:block;height:min(11.5%,clamp(12px,2.25vh,22px));aspect-ratio:1.42;border:1px solid rgba(247,244,220,.9);border-radius:3px;background:linear-gradient(135deg,rgba(242,237,211,.98),rgba(78,122,99,.96));box-shadow:0 2px 5px rgba(0,0,0,.28);box-sizing:border-box;overflow:hidden}
[data-new-base-flanora-board-surface="1"] .grFlanoraRoadCard::after{content:"";position:absolute;inset:2px;border:1px solid rgba(31,67,54,.42);border-radius:2px}
[data-new-base-flanora-board-surface="1"] .grFlanoraShield{display:grid;place-items:center;width:clamp(26px,4.8vw,54px);height:100%;box-sizing:border-box;border:2px solid rgba(184,225,235,.84);border-radius:42% 42% 52% 52%/34% 34% 66% 66%;background:linear-gradient(180deg,rgba(43,100,111,.92),rgba(22,61,70,.95));box-shadow:0 3px 7px rgba(0,0,0,.23);font-size:0}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{position:relative;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:clamp(2px,.35vw,5px);min-width:0;min-height:0;padding:clamp(8px,1.4vh,14px) clamp(8px,1.2vw,16px);box-sizing:border-box}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearing::before{content:"";position:absolute;left:3%;right:3%;top:12%;bottom:12%;border:clamp(7px,1.25vw,15px) solid rgba(111,151,106,.2);border-radius:48% 52% 46% 54%/50% 45% 55% 50%;box-shadow:inset 0 0 0 1px rgba(213,233,194,.08),0 0 18px rgba(0,0,0,.08);pointer-events:none}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell{position:relative;z-index:2;place-self:center;width:clamp(10px,1.6vw,19px);height:clamp(10px,1.6vw,19px);border:1px solid rgba(221,239,211,.58);border-radius:44% 56% 48% 52%;background:radial-gradient(circle at 35% 30%,rgba(180,209,161,.88),rgba(52,92,61,.96));box-shadow:0 2px 5px rgba(0,0,0,.2)}
[data-new-base-flanora-board-surface="1"] .grFlanoraClearingCell[data-start-participant]{outline:2px solid rgba(248,218,129,.76);outline-offset:2px}
[data-new-base-flanora-board-surface="1"][data-performance-profile="reduced_motion"] *,[data-new-base-flanora-board-surface="1"][data-performance-profile="low_perf"] *{animation:none!important;transition:none!important;filter:none!important}
@media(max-height:420px){[data-new-base-flanora-board-surface="1"]{grid-template-rows:minmax(0,73%) minmax(68px,27%);padding:3px}[data-new-base-flanora-board-surface="1"] .grFlanoraSharedGoal{top:0;height:26px}[data-new-base-flanora-board-surface="1"] .grFlanoraLane{grid-template-rows:16px minmax(0,1fr) 16px}[data-new-base-flanora-board-surface="1"] .grFlanoraClearing{padding:5px 8px}}
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

function laneWorldPosition(relativeColumn) {
  const x = 5.5 + (relativeColumn * (89 / 11));
  const distanceFromCenter = Math.abs(x - 50);
  const top = 15 + (distanceFromCenter * 0.15);
  const height = 76 - top;
  return { x, top, height };
}

function guideGeometry(x, top) {
  const goalX = 50;
  const goalY = 7;
  const dx = goalX - x;
  const dy = goalY - top;
  const length = Math.sqrt((dx * dx) + (dy * dy));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return { length, angle };
}

function validateProgressionPresentation(presentation, roadsByLaneKey) {
  if (!isNewBaseProgressionLanePresentation(presentation) || presentation.ok !== true) return { ok: false, reason: 'PROGRESSION_PRESENTATION_REQUIRED' };
  if (presentation.lanePresentations.length !== roadsByLaneKey.size) return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  const seenLaneKeys = new Set();
  const assignments = [];
  for (const lane of presentation.lanePresentations) {
    const road = roadsByLaneKey.get(lane?.key);
    if (!road || seenLaneKeys.has(lane.key) || !Array.isArray(lane.placedCards) || lane.placedCards.length !== lane.straightCardCount) {
      return { ok: false, reason: 'PROGRESSION_CARD_SET_INVALID' };
    }
    seenLaneKeys.add(lane.key);
    const seenCardSteps = new Set();
    lane.placedCards.forEach((card, offset) => {
      if (!nonEmptyString(card?.cardId) || card?.stageIndex !== offset + 1 || card?.roadStepId !== `road:${lane.key}:${offset + 1}` || seenCardSteps.has(card.roadStepId)) {
        assignments.push(null);
        return;
      }
      seenCardSteps.add(card.roadStepId);
      assignments.push({ road, laneKey: lane.key, stageIndex: card.stageIndex, roadStepId: card.roadStepId, cardId: card.cardId });
    });
  }
  if (assignments.some((item) => item === null) || seenLaneKeys.size !== roadsByLaneKey.size) return { ok: false, reason: 'PROGRESSION_CARD_ASSIGNMENT_INVALID' };
  return { ok: true, assignments };
}

function syncProgressionLanePresentation({ presentation, documentLike, roadsByLaneKey, roadCardsByStepId }) {
  const validated = validateProgressionPresentation(presentation, roadsByLaneKey);
  if (!validated.ok) return failProgression(validated.reason);
  const wanted = new Set(validated.assignments.map((item) => item.roadStepId));
  for (const [stepId, node] of [...roadCardsByStepId]) {
    if (wanted.has(stepId)) continue;
    removeNode(node);
    roadCardsByStepId.delete(stepId);
  }
  for (const item of validated.assignments) {
    let node = roadCardsByStepId.get(item.roadStepId);
    if (!node) {
      node = createNode(documentLike, 'span', 'grFlanoraRoadCard');
      item.road.appendChild(node);
      roadCardsByStepId.set(item.roadStepId, node);
    }
    setAttr(node, 'data-flanora-road-step-id', item.roadStepId);
    setAttr(node, 'data-progression-stage-state', 'BUILT');
    setAttr(node, 'data-progression-established', 'true');
    setAttr(node, 'data-card-id', item.cardId);
    setAttr(node, 'data-physical-card-identity', 'preserved');
    setAttr(node, 'aria-label', `配置カード ${item.stageIndex}/7 ${item.cardId}`);
  }
  for (const lane of presentation.lanePresentations) {
    const road = roadsByLaneKey.get(lane.key);
    setAttr(road, 'data-progression-built-count', lane.straightCardCount);
    setAttr(road, 'data-progression-latent-count', 7 - lane.straightCardCount);
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'data-card-lineage', 'physical-card-id');
    setAttr(road, 'aria-label', `配置済み実カード ${lane.straightCardCount}/7`);
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
  setAttr(root, 'data-shared-goal-count', '1');
  setAttr(root, 'data-world-flow', 'shared-field-shields-card-path-gates-shared-goal');
  setAttr(root, 'data-future-discrete-progression-slots', 'false');
  setAttr(root, 'aria-label', '共有フィールドからShield、配置済み実カードの道、Gateを通って共通GOALへ進む盤面');

  const upper = createNode(documentLike, 'div', 'grFlanoraUpper');
  const clearing = createNode(documentLike, 'div', 'grFlanoraClearing');
  setAttr(clearing, 'data-flanora-clearing-loop', 'single-closed-loop');
  root.appendChild(upper);
  root.appendChild(clearing);

  const sharedGoal = createNode(documentLike, 'div', 'grFlanoraSharedGoal');
  sharedGoal.textContent = 'GOAL';
  setAttr(sharedGoal, 'data-flanora-shared-goal', model.sharedGoalId);
  setAttr(sharedGoal, 'data-goal-id', model.sharedGoalId);
  upper.appendChild(sharedGoal);

  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const gateAnchorsByLaneKey = new Map();
  const goalGuidesByLaneKey = new Map();
  const roadCardsByStepId = new Map();
  const clearingByCellId = new Map();

  for (const lane of model.lanes) {
    const pos = laneWorldPosition(lane.relativeColumn);
    const guideGeo = guideGeometry(pos.x, pos.top);
    const guide = createNode(documentLike, 'span', 'grFlanoraGoalGuide');
    setAttr(guide, 'data-goal-guide-lane', lane.key);
    setAttr(guide, 'data-goal-path-open', '0');
    guide.style.left = `${pos.x}%`;
    guide.style.top = `${pos.top}%`;
    guide.style.width = `${guideGeo.length}%`;
    guide.style.transform = `rotate(${guideGeo.angle}deg)`;
    upper.appendChild(guide);
    goalGuidesByLaneKey.set(lane.key, guide);

    const laneNode = createNode(documentLike, 'article', 'grFlanoraLane');
    setAttr(laneNode, 'data-flanora-lane-key', lane.key);
    setAttr(laneNode, 'data-participant-id', lane.participantId);
    setAttr(laneNode, 'data-lane-index', lane.laneIndex);
    setAttr(laneNode, 'data-lane-label', lane.laneLabel);
    laneNode.style.left = `${pos.x}%`;
    laneNode.style.top = `${pos.top}%`;
    laneNode.style.height = `${pos.height}%`;

    const gateAnchor = createNode(documentLike, 'span', 'grFlanoraGateAnchor');
    setAttr(gateAnchor, 'data-flanora-gate-anchor', lane.key);
    setAttr(gateAnchor, 'data-shared-goal-id', model.sharedGoalId);
    const road = createNode(documentLike, 'div', 'grFlanoraRoad');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', '7');
    setAttr(road, 'data-progression-built-count', '0');
    setAttr(road, 'data-progression-latent-count', '7');
    setAttr(road, 'data-future-discrete-slots', 'false');
    const shield = createNode(documentLike, 'span', 'grFlanoraShield');
    setAttr(shield, 'data-flanora-shield', lane.key);
    setAttr(shield, 'data-clearing-entry-cell-id', lane.clearingEntryCellId);

    laneNode.appendChild(gateAnchor);
    laneNode.appendChild(road);
    laneNode.appendChild(shield);
    upper.appendChild(laneNode);
    gateAnchorsByLaneKey.set(lane.key, gateAnchor);
    roadsByLaneKey.set(lane.key, road);
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
    sharedGoal,
    resolveGoal() { return sharedGoal; },
    resolveGateAnchor(participantId, laneIndex) { return gateAnchorsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveGoalGuide(participantId, laneIndex) { return goalGuidesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveShield(participantId, laneIndex) { return shieldsByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null; },
    resolveRoadStep(participantId, laneIndex, roadIndex) {
      if (!ROAD_STEPS.includes(roadIndex)) return null;
      return roadCardsByStepId.get(`road:${resolveLaneKey(participantId, laneIndex)}:${roadIndex}`) ?? null;
    },
    syncProgressionPresentation(presentation) {
      if (destroyed) return failProgression('RUNTIME_DESTROYED');
      return syncProgressionLanePresentation({ presentation, documentLike, roadsByLaneKey, roadCardsByStepId });
    },
    resolveClearingCell(cellId) { return nonEmptyString(cellId) ? clearingByCellId.get(cellId) ?? null : null; },
    snapshot() {
      return deepFreeze({
        laneCount: model.lanes.length,
        goalCount: 1,
        sharedGoalId: model.sharedGoalId,
        gateAnchorCount: gateAnchorsByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: model.lanes.length * ROAD_STEPS.length,
        visibleBuiltRoadStepCount: roadCardsByStepId.size,
        futureDiscreteStageNodeCount: 0,
        clearingCellCount: clearingByCellId.size,
        clearingCycleCellIds: [...model.clearingCycleCellIds],
        performanceProfile: root.dataset?.performanceProfile ?? performanceProfile({ reducedMotion, lowPerf }),
        movementAuthority: false,
      });
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      removeNode(root);
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
  clearingConnectivity: 'SINGLE_CLOSED_LOOP',
  clearingCellCount: 26,
  laneCount: 12,
  roadStepsPerLane: 7,
  sharedGoalCount: 1,
  routeGateAnchorCount: 12,
  progressionPresentationSource: 'EXISTING_NEW_BASE_PROGRESSION_LANE_PRESENTATION',
  unresolvedStageDefault: 'NO_DISCRETE_NODE',
  futureDiscreteStageNodes: false,
  physicalCardIdentityPreserved: true,
  progressionSyncWritesGameState: false,
  goalEndpointCount: 1,
});

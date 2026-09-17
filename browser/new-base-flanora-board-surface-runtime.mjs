import { isNewBaseProgressionLanePresentation } from './new-base-progression-lane-presentation-core.mjs';

const RUNTIME_SCHEMA = 'gameroad.new-base-flanora-board-surface-runtime.v2';
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);
const ROAD_STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const SHARED_GOAL_ID = 'goal:shared';
const PARTICIPANT_COUNT = 4;
const LANES_PER_PARTICIPANT = 3;
const UPPER_LANE_COUNT = PARTICIPANT_COUNT * LANES_PER_PARTICIPANT;
const ROUND_CELLS_PER_LANE = 7;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function laneKey(participantId, laneIndex) {
  return `${participantId}:${laneIndex}`;
}

function normalizeParticipantIds(layout) {
  const ids = Array.isArray(layout?.participantIds) ? layout.participantIds : null;
  if (!ids || ids.length !== PARTICIPANT_COUNT || ids.some((id) => !nonEmptyString(id)) || new Set(ids).size !== ids.length) {
    throw new TypeError('FLANORA_FOUR_PARTICIPANTS_REQUIRED');
  }
  return [...ids];
}

function normalizeSourceColumns(layout, participantIds) {
  const mapping = layout?.shieldLinkedLaneColumnsByParticipant;
  if (!mapping || typeof mapping !== 'object') {
    return new Map(participantIds.flatMap((participantId, participantSlot) =>
      LANE_LABELS.map((_, laneIndex) => [laneKey(participantId, laneIndex), participantSlot * LANES_PER_PARTICIPANT + laneIndex])));
  }
  const result = new Map();
  const seen = new Set();
  for (const participantId of participantIds) {
    const raw = mapping[participantId];
    if (!Array.isArray(raw) || raw.length !== LANES_PER_PARTICIPANT) {
      throw new TypeError('FLANORA_THREE_LANES_PER_PARTICIPANT_REQUIRED');
    }
    const sorted = raw.map(Number).sort((a, b) => a - b);
    if (sorted.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError('FLANORA_SOURCE_COLUMN_INVALID');
    }
    for (const value of sorted) {
      if (seen.has(value)) throw new TypeError('FLANORA_SOURCE_COLUMN_DUPLICATE');
      seen.add(value);
    }
    sorted.forEach((value, laneIndex) => result.set(laneKey(participantId, laneIndex), value));
  }
  if (result.size !== UPPER_LANE_COUNT) throw new TypeError('FLANORA_TWELVE_LANES_REQUIRED');
  return result;
}

function copyLegacyClearingCompatibility(layout) {
  if (!Array.isArray(layout?.clearingCells)) return [];
  return layout.clearingCells
    .filter((cell) => nonEmptyString(cell?.id))
    .map((cell) => ({
      id: cell.id,
      kind: nonEmptyString(cell?.kind) ? cell.kind : null,
      rowIndex: Number.isSafeInteger(cell?.rowIndex) ? cell.rowIndex : null,
      columnIndex: Number.isSafeInteger(cell?.columnIndex) ? cell.columnIndex : null,
      compatibilityOnly: true,
      canonicalNewBoardCell: false,
    }));
}

export function projectFlanoraBoardSurfaceModel(layoutValue) {
  if (!layoutValue || typeof layoutValue !== 'object' || Array.isArray(layoutValue)) {
    throw new TypeError('FLANORA_LAYOUT_REQUIRED');
  }
  const participantIds = normalizeParticipantIds(layoutValue);
  const sourceColumns = normalizeSourceColumns(layoutValue, participantIds);
  const lanes = [];

  participantIds.forEach((participantId, participantSlot) => {
    for (let laneIndex = 0; laneIndex < LANES_PER_PARTICIPANT; laneIndex += 1) {
      const key = laneKey(participantId, laneIndex);
      const sourceColumnIndex = sourceColumns.get(key);
      lanes.push({
        key,
        participantId,
        participantSlot,
        laneIndex,
        laneLabel: LANE_LABELS[laneIndex],
        sourceColumnIndex,
        goalId: SHARED_GOAL_ID,
        routeGateId: `goal-gate:${key}`,
        shieldId: `shield:${key}`,
        shieldStoppable: false,
        shieldCountsAsCell: false,
        shieldVisualRole: 'PART_OF_GATE',
        gateRole: 'UPPER_LANE_TO_SHARED_LOWER_FIELD_CONNECTION',
        roundCells: ROAD_STEPS.map((stageIndex) => ({
          id: `road:${key}:${stageIndex}`,
          stageIndex,
          shape: 'ROUND',
          semanticType: 'UNRESOLVED_NO_INFERENCE',
        })),
        roadSteps: ROAD_STEPS.map((roadIndex) => ({
          id: `road:${key}:${roadIndex}`,
          roadIndex,
          rowIndex: null,
        })),
      });
    }
  });

  const legacyClearingCompatibility = copyLegacyClearingCompatibility(layoutValue);
  return deepFreeze({
    schema: RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    participantIds,
    lanes,
    upperLaneCount: UPPER_LANE_COUNT,
    upperLanesPerParticipant: LANES_PER_PARTICIPANT,
    roundCellsPerUpperLane: ROUND_CELLS_PER_LANE,
    structuralRoundCellCount: UPPER_LANE_COUNT * ROUND_CELLS_PER_LANE,
    sharedGoalId: SHARED_GOAL_ID,
    sharedGoalCount: 1,
    routeGateCount: UPPER_LANE_COUNT,
    goalBranchCount: UPPER_LANE_COUNT,
    goalBranchInactiveState: 'FAINT_READABLE',
    goalBranchOpenState: 'STRONG_OPEN',
    goalBranchOpenRule: 'EXACTLY_SEVEN_ESTABLISHED_CARDS',
    screenSpaceBoardTopology: false,
    stale26CellHorizontalZeroCanon: false,
    lowerFieldOwnership: 'SHARED',
    lowerFieldTopologyAuthority: 'FIXED_USER_VISUAL_ACTUAL_OUTSIDE_THIS_RUNTIME',
    lowerFieldTopologyResolvedHere: false,
    cellTypeUniform: false,
    unknownCellTypeInference: false,
    legacyClearingCompatibility,
    clearingCells: legacyClearingCompatibility,
    clearingCycleCellIds: [],
    optionalRuleGeometryIncluded: false,
    upperProgressIsPrebuiltMovementField: false,
  });
}

export function createFlanoraBoardSurfaceModel(layoutInput = {}) {
  return projectFlanoraBoardSurfaceModel(layoutInput);
}

function createNode(documentLike, tagName, className = '') {
  const node = documentLike.createElement(tagName);
  if (className) node.className = className;
  return node;
}

function setAttr(node, name, value) {
  if (!node || value == null) return;
  node.setAttribute?.(name, String(value));
  if (name.startsWith('data-') && node.dataset) {
    const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    node.dataset[key] = String(value);
  }
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

function validateProgressionPresentation(presentation, roadsByLaneKey, roadStepMetaById) {
  if (!isNewBaseProgressionLanePresentation(presentation) || presentation.ok !== true) {
    return { ok: false, reason: 'PROGRESSION_PRESENTATION_REQUIRED' };
  }
  if (!Array.isArray(presentation.lanePresentations) || presentation.lanePresentations.length !== UPPER_LANE_COUNT) {
    return { ok: false, reason: 'FULL_FLANORA_PROGRESSION_REQUIRED' };
  }

  const seenLaneKeys = new Set();
  const seenRoadStepIds = new Set();
  const builtAssignments = [];
  const laneCounts = new Map();

  for (const lane of presentation.lanePresentations) {
    const road = roadsByLaneKey.get(lane?.key);
    if (!road || seenLaneKeys.has(lane.key) || !Array.isArray(lane?.stages) || lane.stages.length !== ROUND_CELLS_PER_LANE) {
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

    const connectedToGoal = lane.connectedToGoal === true;
    if (connectedToGoal !== (builtCount === ROUND_CELLS_PER_LANE)) {
      return { ok: false, reason: 'GOAL_BRANCH_STATE_MISMATCH' };
    }
    laneCounts.set(lane.key, { builtCount, latentCount, resolvedIdentityCount, connectedToGoal });
  }

  if (seenLaneKeys.size !== UPPER_LANE_COUNT || seenRoadStepIds.size !== roadStepMetaById.size) {
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
      node = createNode(documentLike, 'span', 'grFlanoraRoadStepCompatibility');
      road.appendChild(node);
      roadStepsByKey.set(meta.id, node);
    }
    node.textContent = '';
    setAttr(node, 'data-flanora-road-step', meta.roadIndex);
    setAttr(node, 'data-flanora-road-step-id', meta.id);
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
      node.textContent = cardId;
    }
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

    const gate = routeGatesByLaneKey.get(key);
    if (gate) setAttr(gate, 'data-connected-to-goal', counts.connectedToGoal);

    const branch = goalBranchesByLaneKey.get(key);
    if (branch) {
      setAttr(branch, 'data-connected-to-goal', counts.connectedToGoal);
      setAttr(branch, 'data-branch-visual-state', counts.connectedToGoal ? 'strong-open' : 'faint-readable');
    }
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

  const sourceLayout = layout ?? layoutInput ?? {};
  const model = projectFlanoraBoardSurfaceModel(sourceLayout);
  const root = createNode(documentLike, 'section', 'grFlanoraBoardSurfaceController');
  setAttr(root, 'data-new-base-flanora-board-surface', '1');
  setAttr(root, 'data-performance-profile', performanceProfile({ reducedMotion, lowPerf }));
  setAttr(root, 'data-presentation-only', 'true');
  setAttr(root, 'data-gameplay-authority', 'false');
  setAttr(root, 'data-screen-space-ui-attached', 'false');
  setAttr(root, 'data-world-space-placement', 'required-existing-field-renderer');
  setAttr(root, 'data-stale-horizontal-zero-canon', 'false');
  setAttr(root, 'data-stale-26-cell-canon', 'false');
  setAttr(root, 'data-lower-field-topology-resolved-here', 'false');
  setAttr(root, 'aria-hidden', 'true');
  host.appendChild(root);

  const sharedGoal = createNode(documentLike, 'span', 'grFlanoraSharedGoalCompatibility');
  setAttr(sharedGoal, 'data-flanora-shared-goal', SHARED_GOAL_ID);
  setAttr(sharedGoal, 'data-connected-route-count', 0);
  setAttr(sharedGoal, 'data-terminal-result-authority', 'false');

  const goalBranchesByLaneKey = new Map();
  const routeGatesByLaneKey = new Map();
  const shieldsByLaneKey = new Map();
  const roadsByLaneKey = new Map();
  const roadStepMetaById = new Map();
  const roadStepsByKey = new Map();
  const clearingByCellId = new Map();

  for (const lane of model.lanes) {
    const branch = createNode(documentLike, 'span', 'grFlanoraGoalBranchCompatibility');
    setAttr(branch, 'data-goal-branch-lane-key', lane.key);
    setAttr(branch, 'data-shared-goal-id', SHARED_GOAL_ID);
    setAttr(branch, 'data-connected-to-goal', 'false');
    setAttr(branch, 'data-branch-visual-state', 'faint-readable');
    setAttr(branch, 'data-screen-space-rendered', 'false');
    goalBranchesByLaneKey.set(lane.key, branch);

    const routeGate = createNode(documentLike, 'span', 'grFlanoraRouteGateCompatibility');
    setAttr(routeGate, 'data-flanora-goal', lane.key);
    setAttr(routeGate, 'data-flanora-route-gate', lane.routeGateId);
    setAttr(routeGate, 'data-shared-goal-id', SHARED_GOAL_ID);
    setAttr(routeGate, 'data-connected-to-goal', 'false');
    setAttr(routeGate, 'data-shield-visual-role', 'part-of-gate');
    setAttr(routeGate, 'data-screen-space-rendered', 'false');
    routeGatesByLaneKey.set(lane.key, routeGate);

    const shield = createNode(documentLike, 'span', 'grFlanoraShieldCompatibility');
    setAttr(shield, 'data-flanora-shield', lane.key);
    setAttr(shield, 'data-stoppable', 'false');
    setAttr(shield, 'data-counts-as-cell', 'false');
    setAttr(shield, 'data-visual-role', 'part-of-gate');
    shieldsByLaneKey.set(lane.key, shield);

    const road = createNode(documentLike, 'div', 'grFlanoraRoadCompatibility');
    setAttr(road, 'data-flanora-road-track', lane.key);
    setAttr(road, 'data-progression-capacity', ROUND_CELLS_PER_LANE);
    setAttr(road, 'data-structural-round-cell-count', ROUND_CELLS_PER_LANE);
    setAttr(road, 'data-progression-built-count', 0);
    setAttr(road, 'data-progression-latent-count', ROUND_CELLS_PER_LANE);
    setAttr(road, 'data-connected-to-goal', 'false');
    setAttr(road, 'data-future-discrete-slots', 'false');
    setAttr(road, 'data-screen-space-rendered', 'false');
    for (const step of lane.roadSteps) roadStepMetaById.set(step.id, { ...step, laneKey: lane.key });
    roadsByLaneKey.set(lane.key, road);
  }

  for (const cell of model.legacyClearingCompatibility) {
    const node = createNode(documentLike, 'span', 'grFlanoraLegacyClearingCompatibility');
    setAttr(node, 'data-source-clearing-cell-id', cell.id);
    setAttr(node, 'data-compatibility-only', 'true');
    setAttr(node, 'data-canonical-new-board-cell', 'false');
    setAttr(node, 'data-screen-space-rendered', 'false');
    clearingByCellId.set(cell.id, node);
  }

  let destroyed = false;

  function resolveLaneKey(participantId, laneIndex) {
    if (!nonEmptyString(participantId) || !Number.isSafeInteger(laneIndex) || laneIndex < 0 || laneIndex > 2) return null;
    return laneKey(participantId, laneIndex);
  }

  const runtime = {
    schema: RUNTIME_SCHEMA,
    mounted: true,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    resultAuthority: false,
    model,
    root,
    upper: null,
    sharedGoal,
    goalBranches: null,
    routeGateLayer: null,
    progressionGrid: null,
    clearing: null,
    resolveSharedGoal() {
      return sharedGoal;
    },
    resolveGoalBranch(participantId, laneIndex) {
      return goalBranchesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
    resolveRouteGate(participantId, laneIndex) {
      return routeGatesByLaneKey.get(resolveLaneKey(participantId, laneIndex)) ?? null;
    },
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
    resolveClearingCell(cellId) {
      return nonEmptyString(cellId) ? clearingByCellId.get(cellId) ?? null : null;
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
    snapshot() {
      return deepFreeze({
        laneCount: model.lanes.length,
        goalCount: 1,
        sharedGoalCount: 1,
        routeGateCount: routeGatesByLaneKey.size,
        goalBranchCount: goalBranchesByLaneKey.size,
        shieldCount: shieldsByLaneKey.size,
        roadStepCount: roadStepMetaById.size,
        structuralRoundCellCount: model.structuralRoundCellCount,
        visibleBuiltRoadStepCount: roadStepsByKey.size,
        resolvedPhysicalCardIdentityCount: [...roadStepsByKey.values()].filter((node) => node.dataset?.cardIdentityResolved === 'true').length,
        sourceClearingBindingCount: clearingByCellId.size,
        clearingCellCount: clearingByCellId.size,
        visibleSharedFieldNodeCount: 0,
        visibleSharedFieldEdgeCount: 0,
        clearingCycleCellIds: [],
        screenSpaceUiNodeCount: 0,
        screenSpaceBoardTopology: false,
        stale26CellHorizontalZeroCanon: false,
        worldSpacePlacementRequired: true,
        lowerFieldTopologyResolvedHere: false,
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
  sourceGeometry: 'NONE_SCREEN_SPACE',
  presentationOnly: true,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
  resultAuthority: false,
  secondBoardEngine: false,
  optionalRuleGeometryIncluded: false,
  sharedGoalCount: 1,
  routeGateCount: UPPER_LANE_COUNT,
  goalBranchCount: UPPER_LANE_COUNT,
  upperLaneCount: UPPER_LANE_COUNT,
  upperLanesPerParticipant: LANES_PER_PARTICIPANT,
  roundCellsPerUpperLane: ROUND_CELLS_PER_LANE,
  structuralRoundCellCount: UPPER_LANE_COUNT * ROUND_CELLS_PER_LANE,
  goalBranchInactiveState: 'FAINT_READABLE',
  goalBranchOpenState: 'STRONG_OPEN',
  goalBranchOpenRule: 'EXACTLY_SEVEN_ESTABLISHED_CARDS',
  shieldStoppable: false,
  shieldCountsAsCell: false,
  shieldVisualRole: 'PART_OF_GATE',
  lowerFieldOwnership: 'SHARED',
  lowerFieldTopologyAuthority: 'FIXED_USER_VISUAL_ACTUAL_OUTSIDE_THIS_RUNTIME',
  lowerFieldTopologyResolvedHere: false,
  screenSpaceBoardTopology: false,
  fixedViewportPercentLaneGeometry: false,
  stale26CellHorizontalZeroCanon: false,
  cellTypeUniform: false,
  unknownCellTypeInference: false,
  builtStageIdentity: 'CALLER_PHYSICAL_CARD_ID_WHEN_AVAILABLE',
  futureDiscreteStageNodes: false,
  unresolvedStageDefault: 'STRUCTURAL_ROUND_CELL_POSITION_WITH_SEMANTIC_TYPE_UNRESOLVED',
  duplicateLowerPresentationGraph: false,
  sharedLowerFieldVisualAuthority: 'EXISTING_BATTLE_WORLD_RENDERER_PLUS_FIXED_USER_VISUAL_ACTUAL',
  imageGenerationEditingOcrRedraw: false,
});

const GRAPH_SCHEMA = 'gameroad.new-base-battle-board-visual-graph.v1';
const SOURCE_WIDTH = 1536;
const SOURCE_HEIGHT = 864;
const PLAYER_COUNT = 4;
const LANES_PER_PLAYER = 3;
const UPPER_LANE_COUNT = PLAYER_COUNT * LANES_PER_PLAYER;
const ROUND_CELLS_PER_UPPER_LANE = 7;
const LANE_LABELS = Object.freeze(['L', 'C', 'R']);

// Direct visual reference coordinates from the user-provided 1536x864 board drawing.
// The drawing visibly contains six circles per upper strip. USER_LOCK_BATTLE_BOARD_TOPOLOGY_R4
// explicitly supersedes six as acceptable and requires seven structural round-cell positions per lane.
// Therefore the seven structural positions are distributed inside the same first/last visible-circle
// extents; this module does not pretend that a seventh source circle was visible in the drawing.
const UPPER_LANE_X = Object.freeze([110, 210, 310, 477, 579, 683, 850, 952, 1054, 1222, 1324, 1425]);
const REFERENCE_VISIBLE_UPPER_Y = Object.freeze([209, 253, 296, 340, 383, 427]);
const STRUCTURAL_UPPER_Y = Object.freeze([209, 245.333333, 281.666667, 318, 354.333333, 390.666667, 427]);
const GOAL_SOURCE_POINT = Object.freeze({ x: 767, y: 49 });
const SHIELD_SOURCE_Y = 468;

const LOWER_NODE_SOURCE_POINTS = Object.freeze({
  T0: [110, 540], T1: [210, 540], T2: [310, 540], T3: [477, 540],
  T4: [579, 540], T5: [683, 540], T6: [850, 540], T7: [952, 540],
  T8: [1054, 540], T9: [1222, 540], T10: [1324, 540], T11: [1425, 540],
  M0: [211, 647], M1: [366, 646], M2: [478, 646], M3: [634, 646],
  M4: [683, 646], M5: [766, 646], M6: [851, 646], M7: [898, 646],
  M8: [1054, 646], M9: [1167, 646], M10: [1326, 647],
  L0: [145, 680], L1: [298, 680], L2: [406, 707], L3: [185, 713], L4: [298, 746],
  R0: [1235, 680], R1: [1389, 680], R2: [1127, 703], R3: [1347, 714], R4: [1236, 746],
  B0: [200, 787], B1: [346, 787], B2: [464, 787], B3: [622, 787], B4: [766, 787],
  B5: [909, 787], B6: [1068, 786], B7: [1187, 787], B8: [1335, 787],
});

// Placement/debug identity only. This deliberately does not assign gameplay or semantic
// cell types. Read order follows the current 2D board: top-to-bottom, then left-to-right
// inside each visual row. Completed lane/GOAL/Gate/Shield structures are outside this list.
const LOWER_PLACEMENT_ROWS = Object.freeze([
  Object.freeze(['T0','T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11']),
  Object.freeze(['M0','M1','M2','M3','M4','M5','M6','M7','M8','M9','M10']),
  Object.freeze(['L0','L1','R0','R1']),
  Object.freeze(['L2','R2']),
  Object.freeze(['L3','R3']),
  Object.freeze(['L4','R4']),
  Object.freeze(['B0','B1','B2','B3','B4','B5','B6','B7','B8']),
]);
const LOWER_PLACEMENT_SOURCE_KEYS = Object.freeze(LOWER_PLACEMENT_ROWS.flat());
const LOWER_PLACEMENT_ORDINAL_BY_KEY = new Map(
  LOWER_PLACEMENT_SOURCE_KEYS.map((sourceKey, index) => [sourceKey, index + 1]),
);
if (
  LOWER_PLACEMENT_SOURCE_KEYS.length !== Object.keys(LOWER_NODE_SOURCE_POINTS).length
  || new Set(LOWER_PLACEMENT_SOURCE_KEYS).size !== LOWER_PLACEMENT_SOURCE_KEYS.length
  || LOWER_PLACEMENT_SOURCE_KEYS.some((sourceKey) => !(sourceKey in LOWER_NODE_SOURCE_POINTS))
) {
  throw new TypeError('BATTLE_BOARD_LOWER_PLACEMENT_ORDER_INVALID');
}

const LOWER_EDGE_PAIRS = Object.freeze([
  // Shared upper band: the small rectangles between circles are not cells.
  ['T0', 'T1'], ['T1', 'T2'], ['T2', 'T3'], ['T3', 'T4'], ['T4', 'T5'], ['T5', 'T6'],
  ['T6', 'T7'], ['T7', 'T8'], ['T8', 'T9'], ['T9', 'T10'], ['T10', 'T11'],
  // Shared middle band.
  ['M0', 'M1'], ['M1', 'M2'], ['M2', 'M3'], ['M3', 'M4'], ['M4', 'M5'],
  ['M5', 'M6'], ['M6', 'M7'], ['M7', 'M8'], ['M8', 'M9'], ['M9', 'M10'],
  // Shared bottom band.
  ['B0', 'B1'], ['B1', 'B2'], ['B2', 'B3'], ['B3', 'B4'], ['B4', 'B5'], ['B5', 'B6'], ['B6', 'B7'], ['B7', 'B8'],
  // Upper-band drops into the shared lower field.
  ['T0', 'L0'], ['T1', 'M0'], ['T2', 'M1'], ['T3', 'M2'], ['T4', 'M3'], ['T5', 'M4'],
  ['T6', 'M6'], ['T7', 'M7'], ['T8', 'M8'], ['T9', 'M9'], ['T10', 'M10'], ['T11', 'R1'],
  // Left mesh.
  ['M0', 'L0'], ['L0', 'L3'], ['M0', 'L3'], ['M0', 'L1'], ['L3', 'L1'],
  ['L3', 'L4'], ['L3', 'B0'], ['L1', 'M1'], ['L1', 'L4'], ['M1', 'L2'],
  ['L2', 'L4'], ['L2', 'B1'], ['L2', 'B2'], ['L4', 'B0'], ['L4', 'B1'],
  // Right mesh.
  ['M9', 'R0'], ['M9', 'R2'], ['M10', 'R0'], ['M10', 'R3'], ['M10', 'R1'],
  ['R0', 'R3'], ['R0', 'R4'], ['R2', 'R4'], ['R2', 'B6'], ['R2', 'B7'],
  ['R4', 'B7'], ['R4', 'B8'], ['R4', 'R3'], ['R3', 'R1'], ['R3', 'B8'],
]);

const BENT_LOWER_EDGE_WAYPOINTS = Object.freeze({
  'T0>L0': Object.freeze([[110, 664]]),
  'T11>R1': Object.freeze([[1425, 665]]),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sourcePoint(x, y) {
  return {
    x,
    y,
    u: x / SOURCE_WIDTH,
    v: y / SOURCE_HEIGHT,
  };
}

function lowerNode(id, [x, y]) {
  const placementOrdinal = LOWER_PLACEMENT_ORDINAL_BY_KEY.get(id);
  if (!Number.isSafeInteger(placementOrdinal)) {
    throw new TypeError(`BATTLE_BOARD_LOWER_PLACEMENT_ID_MISSING:${id}`);
  }
  return {
    id: `lower:${id}`,
    sourceKey: id,
    region: 'LOWER_SHARED_FIELD',
    shape: 'ROUND',
    isCell: true,
    countsAsCell: true,
    semanticType: 'UNRESOLVED_NO_INFERENCE',
    placementOrdinal,
    placementId: `lower-placement:${String(placementOrdinal).padStart(2, '0')}`,
    placementReadOrder: 'TOP_TO_BOTTOM_LEFT_TO_RIGHT',
    source: sourcePoint(x, y),
    movementAuthority: false,
    legalityAuthority: false,
  };
}

function edge(id, fromId, toId, { region, kind = 'VISUAL_ADJACENCY', waypoints = [] } = {}) {
  return {
    id,
    fromId,
    toId,
    region,
    kind,
    drawnLineMeansAdjacency: true,
    movementAuthority: false,
    legalityAuthority: false,
    waypoints: waypoints.map(([x, y]) => sourcePoint(x, y)),
  };
}

function makeUpperLanes() {
  return UPPER_LANE_X.map((x, laneSlot) => {
    const playerSlot = Math.floor(laneSlot / LANES_PER_PLAYER);
    const laneIndex = laneSlot % LANES_PER_PLAYER;
    const laneLabel = LANE_LABELS[laneIndex];
    const laneKey = `P${playerSlot + 1}:${laneLabel}`;
    const cells = STRUCTURAL_UPPER_Y.map((y, stageOffset) => ({
      id: `upper:${laneKey}:${stageOffset + 1}`,
      region: 'UPPER_PROGRESSION',
      playerSlot,
      laneIndex,
      laneLabel,
      laneKey,
      stageIndex: stageOffset + 1,
      shape: 'ROUND',
      isCell: true,
      countsAsCell: true,
      semanticType: 'UNRESOLVED_NO_INFERENCE',
      source: sourcePoint(x, y),
      sourceEvidence: 'USER_LOCK_SEVEN_WITHIN_REFERENCE_LANE_EXTENTS',
      movementAuthority: false,
      legalityAuthority: false,
    }));
    const shieldId = `shield:${laneKey}`;
    const gateId = `gate:${laneKey}`;
    const lowerAnchorId = `lower:T${laneSlot}`;
    return {
      laneSlot,
      playerSlot,
      laneIndex,
      laneLabel,
      laneKey,
      referenceVisibleCircleCount: REFERENCE_VISIBLE_UPPER_Y.length,
      structuralRoundCellCount: ROUND_CELLS_PER_UPPER_LANE,
      cells,
      shield: {
        id: shieldId,
        gateId,
        source: sourcePoint(x, SHIELD_SOURCE_Y),
        isCell: false,
        countsAsCell: false,
        stoppable: false,
        visualRole: 'PART_OF_GATE',
        semanticType: 'SHIELD_CURRENT_IDENTITY_PRESERVED',
      },
      gate: {
        id: gateId,
        shieldId,
        upperCellId: cells[cells.length - 1].id,
        lowerAnchorId,
        isCell: false,
        countsAsCell: false,
        stoppable: false,
        role: 'UPPER_LANE_TO_SHARED_LOWER_FIELD_CONNECTION',
      },
    };
  });
}

export function createBattleBoardVisualGraph() {
  const upperLanes = makeUpperLanes();
  const upperCells = upperLanes.flatMap((lane) => lane.cells);
  const lowerNodes = Object.entries(LOWER_NODE_SOURCE_POINTS).map(([id, point]) => lowerNode(id, point));

  const goal = {
    id: 'goal:shared',
    region: 'SHARED_GOAL',
    shape: 'ROUND',
    source: sourcePoint(GOAL_SOURCE_POINT.x, GOAL_SOURCE_POINT.y),
    sharedGoal: true,
    canBeSpecialCell: true,
    countsAsProgressionCell: false,
    semanticType: 'SPECIAL_GOAL',
    movementAuthority: false,
    legalityAuthority: false,
  };

  const goalBranches = upperLanes.map((lane) => edge(
    `goal-branch:${lane.laneKey}`,
    goal.id,
    lane.cells[0].id,
    { region: 'GOAL_BRANCH', kind: 'GOAL_BRANCH_VISUAL_CONNECTION' },
  ));

  const upperLaneEdges = upperLanes.flatMap((lane) => lane.cells.slice(0, -1).map((cell, index) => edge(
    `upper-edge:${lane.laneKey}:${index + 1}-${index + 2}`,
    cell.id,
    lane.cells[index + 1].id,
    { region: 'UPPER_PROGRESSION' },
  )));

  const gateConnections = upperLanes.flatMap((lane) => [
    edge(`gate-edge:${lane.laneKey}:upper`, lane.cells[lane.cells.length - 1].id, lane.gate.id, {
      region: 'GATE_CONNECTION',
      kind: 'STRUCTURAL_GATE_CONNECTION',
    }),
    edge(`gate-edge:${lane.laneKey}:lower`, lane.gate.id, lane.gate.lowerAnchorId, {
      region: 'GATE_CONNECTION',
      kind: 'STRUCTURAL_GATE_CONNECTION',
    }),
  ]);

  const lowerEdges = LOWER_EDGE_PAIRS.map(([fromKey, toKey]) => {
    const waypoints = BENT_LOWER_EDGE_WAYPOINTS[`${fromKey}>${toKey}`] ?? [];
    return edge(
      `lower-edge:${fromKey}-${toKey}`,
      `lower:${fromKey}`,
      `lower:${toKey}`,
      { region: 'LOWER_SHARED_FIELD', waypoints },
    );
  });

  return deepFreeze({
    schema: GRAPH_SCHEMA,
    sourceReference: {
      width: SOURCE_WIDTH,
      height: SOURCE_HEIGHT,
      modality: 'DIRECT_VISUAL_ACTUAL',
      proseRedrawAuthority: false,
      imageGenerationAuthority: false,
      ocrAuthority: false,
      visibleUpperCirclesPerLaneInReference: REFERENCE_VISIBLE_UPPER_Y.length,
      visibleUpperCircleYsInReference: [...REFERENCE_VISIBLE_UPPER_Y],
      userLockedStructuralUpperCirclesPerLane: ROUND_CELLS_PER_UPPER_LANE,
      structuralUpperCirclePlacementPolicy: 'SEVEN_EQUAL_POSITIONS_WITHIN_REFERENCE_FIRST_LAST_CIRCLE_EXTENTS',
    },
    presentationOnly: true,
    worldFieldRenderSpaceOnly: true,
    screenSpaceBoardTopology: false,
    gameplayAuthority: false,
    gameStateWrite: false,
    movementAuthority: false,
    legalityAuthority: false,
    stale26CellHorizontalZeroCanon: false,
    old109BasicCrossAsSource: false,
    playerCount: PLAYER_COUNT,
    upperLanesPerPlayer: LANES_PER_PLAYER,
    upperLaneCount: UPPER_LANE_COUNT,
    roundCellsPerUpperLane: ROUND_CELLS_PER_UPPER_LANE,
    upperStructuralRoundCellCount: upperCells.length,
    lowerFieldOwnership: 'SHARED',
    lowerRoundCellCount: lowerNodes.length,
    lowerPlacementPolicy: 'TOP_TO_BOTTOM_LEFT_TO_RIGHT',
    lowerPlacementSourceKeys: [...LOWER_PLACEMENT_SOURCE_KEYS],
    goal,
    goalCount: 1,
    goalBranches,
    upperLanes,
    upperCells,
    upperLaneEdges,
    gates: upperLanes.map((lane) => lane.gate),
    shields: upperLanes.map((lane) => lane.shield),
    gateConnections,
    lowerNodes,
    lowerEdges,
    lowerAdjacencyEdgeCount: lowerEdges.length,
    allRoundCells: [...upperCells, ...lowerNodes],
    allVisualEdges: [...goalBranches, ...upperLaneEdges, ...gateConnections, ...lowerEdges],
    invariants: {
      closeButVisuallyUnconnectedContradiction: 'FAIL',
      unknownCellTypeInference: false,
      cellTypeUniform: false,
      drawnLineMeansAdjacency: true,
      crossingWithoutCircleCreatesNode: false,
      shieldCountsAsCell: false,
      shieldStoppable: false,
      shieldVisualRole: 'PART_OF_GATE',
      inactiveGoalBranchVisualState: 'FAINT_READABLE',
      openGoalBranchVisualState: 'STRONG_OPEN',
      goalBranchOpenRule: 'EXACTLY_SEVEN_ESTABLISHED_CARDS_IN_LANE',
    },
  });
}

export function goalBranchVisualStateForBuiltCount(builtCount) {
  if (!Number.isSafeInteger(builtCount) || builtCount < 0 || builtCount > ROUND_CELLS_PER_UPPER_LANE) {
    throw new TypeError('BATTLE_BOARD_BUILT_COUNT_INVALID');
  }
  return builtCount === ROUND_CELLS_PER_UPPER_LANE ? 'STRONG_OPEN' : 'FAINT_READABLE';
}

export function projectBattleBoardVisualGraphToWorld(graphValue, {
  centerX = 0,
  centerZ = 0,
  width = 20,
  depth = width * (SOURCE_HEIGHT / SOURCE_WIDTH),
  y = 0,
} = {}) {
  const graph = graphValue ?? createBattleBoardVisualGraph();
  if (!graph || graph.schema !== GRAPH_SCHEMA) throw new TypeError('BATTLE_BOARD_VISUAL_GRAPH_REQUIRED');
  if (![centerX, centerZ, width, depth, y].every(Number.isFinite) || width <= 0 || depth <= 0) {
    throw new TypeError('BATTLE_BOARD_WORLD_BOUNDS_INVALID');
  }
  const toWorld = (source) => ({
    x: centerX + (source.u - 0.5) * width,
    y,
    z: centerZ + (source.v - 0.5) * depth,
  });
  const nodes = new Map();
  nodes.set(graph.goal.id, toWorld(graph.goal.source));
  for (const cell of graph.allRoundCells) nodes.set(cell.id, toWorld(cell.source));
  for (const gate of graph.gates) {
    const shield = graph.shields.find((candidate) => candidate.gateId === gate.id);
    if (shield) nodes.set(gate.id, toWorld(shield.source));
  }
  return deepFreeze({
    schema: 'gameroad.new-base-battle-board-world-projection.v1',
    presentationOnly: true,
    movementAuthority: false,
    legalityAuthority: false,
    centerX,
    centerZ,
    width,
    depth,
    y,
    nodes: Object.fromEntries(nodes),
  });
}

export const BATTLE_BOARD_VISUAL_GRAPH_SCHEMA = GRAPH_SCHEMA;
export const BATTLE_BOARD_VISUAL_REFERENCE_SIZE = Object.freeze({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT });

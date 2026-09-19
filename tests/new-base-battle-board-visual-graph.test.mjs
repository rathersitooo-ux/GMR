import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_BOARD_VISUAL_REFERENCE_SIZE,
  createBattleBoardVisualGraph,
  goalBranchVisualStateForBuiltCount,
  projectBattleBoardVisualGraphToWorld,
} from '../browser/new-base-battle-board-visual-graph.mjs';
import { validateNewBaseBoardStructure } from '../tools/validate-new-base-board-structure.mjs';

const EXPECTED_LOWER_NODE_KEYS = [
  'T0','T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11',
  'M0','M1','M2','M3','M4','M5','M6','M7','M8','M9','M10',
  'L0','L1','L2','L3','L4','R0','R1','R2','R3','R4',
  'B0','B1','B2','B3','B4','B5','B6','B7','B8',
];

const EXPECTED_LOWER_EDGES = [
  'T0-T1','T1-T2','T2-T3','T3-T4','T4-T5','T5-T6','T6-T7','T7-T8','T8-T9','T9-T10','T10-T11',
  'M0-M1','M1-M2','M2-M3','M3-M4','M4-M5','M5-M6','M6-M7','M7-M8','M8-M9','M9-M10',
  'B0-B1','B1-B2','B2-B3','B3-B4','B4-B5','B5-B6','B6-B7','B7-B8',
  'T0-L0','T1-M0','T2-M1','T3-M2','T4-M3','T5-M4','T6-M6','T7-M7','T8-M8','T9-M9','T10-M10','T11-R1',
  'M0-L0','L0-L3','M0-L3','M0-L1','L3-L1','L3-L4','L3-B0','L1-M1','L1-L4','M1-L2','L2-L4','L2-B1','L2-B2','L4-B0','L4-B1',
  'M9-R0','M9-R2','M10-R0','M10-R3','M10-R1','R0-R3','R0-R4','R2-R4','R2-B6','R2-B7','R4-B7','R4-B8','R4-R3','R3-R1','R3-B8',
];

function lowerEdgeKey(edge) {
  return `${edge.fromId.replace('lower:', '')}-${edge.toId.replace('lower:', '')}`;
}

test('direct visual graph keeps one shared GOAL, 12 lanes, seven structural round cells per lane, and one shared lower field', () => {
  const graph = createBattleBoardVisualGraph();
  assert.equal(graph.goalCount, 1);
  assert.equal(graph.goal.id, 'goal:shared');
  assert.equal(graph.playerCount, 4);
  assert.equal(graph.upperLanesPerPlayer, 3);
  assert.equal(graph.upperLaneCount, 12);
  assert.equal(graph.roundCellsPerUpperLane, 7);
  assert.equal(graph.upperStructuralRoundCellCount, 84);
  assert.equal(graph.lowerFieldOwnership, 'SHARED');
  assert.equal(graph.lowerRoundCellCount, 42);
  assert.equal(graph.allRoundCells.length, 126);
  assert.equal(graph.goalBranches.length, 12);
  assert.equal(graph.upperLaneEdges.length, 72);
  assert.equal(graph.gates.length, 12);
  assert.equal(graph.shields.length, 12);
  assert.equal(graph.gateConnections.length, 24);
  assert.equal(graph.lowerEdges.length, 71);
  assert.equal(graph.allVisualEdges.length, 179);
});

test('canonical visual-graph CI path runs the fail-closed NEW_BOARD_ONLY structure validator', () => {
  const result = validateNewBaseBoardStructure(createBattleBoardVisualGraph());
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.reason, 'STRUCTURE_VALID');
});

test('the six-circle source discrepancy stays explicit instead of silently losing the USER_LOCK seventh position', () => {
  const graph = createBattleBoardVisualGraph();
  assert.equal(graph.sourceReference.visibleUpperCirclesPerLaneInReference, 6);
  assert.deepEqual(graph.sourceReference.visibleUpperCircleYsInReference, [209,253,296,340,383,427]);
  assert.equal(graph.sourceReference.userLockedStructuralUpperCirclesPerLane, 7);
  assert.equal(graph.sourceReference.structuralUpperCirclePlacementPolicy, 'SEVEN_EQUAL_POSITIONS_WITHIN_REFERENCE_FIRST_LAST_CIRCLE_EXTENTS');
  for (const lane of graph.upperLanes) {
    assert.equal(lane.referenceVisibleCircleCount, 6);
    assert.equal(lane.structuralRoundCellCount, 7);
    assert.equal(lane.cells.length, 7);
    assert.equal(lane.cells[0].source.y, 209);
    assert.equal(lane.cells[6].source.y, 427);
  }
});

test('Shield stays a non-stoppable non-cell visual part of Gate', () => {
  const graph = createBattleBoardVisualGraph();
  for (const lane of graph.upperLanes) {
    assert.equal(lane.shield.isCell, false);
    assert.equal(lane.shield.countsAsCell, false);
    assert.equal(lane.shield.stoppable, false);
    assert.equal(lane.shield.visualRole, 'PART_OF_GATE');
    assert.equal(lane.gate.isCell, false);
    assert.equal(lane.gate.countsAsCell, false);
    assert.equal(lane.gate.stoppable, false);
    assert.equal(lane.gate.shieldId, lane.shield.id);
    assert.equal(lane.gate.lowerAnchorId, `lower:T${lane.laneSlot}`);
  }
});

test('all lower visual round nodes are retained and no rectangle/crossing is promoted into a cell', () => {
  const graph = createBattleBoardVisualGraph();
  assert.deepEqual(graph.lowerNodes.map((node) => node.sourceKey), EXPECTED_LOWER_NODE_KEYS);
  assert.ok(graph.lowerNodes.every((node) => node.shape === 'ROUND' && node.isCell === true));
  assert.ok(graph.lowerNodes.every((node) => node.semanticType === 'UNRESOLVED_NO_INFERENCE'));
  assert.equal(graph.invariants.crossingWithoutCircleCreatesNode, false);
  assert.equal(graph.invariants.cellTypeUniform, false);
  assert.equal(graph.invariants.unknownCellTypeInference, false);
});

test('lower shared-field visual adjacency is exact and omission-sensitive', () => {
  const graph = createBattleBoardVisualGraph();
  assert.deepEqual(graph.lowerEdges.map(lowerEdgeKey), EXPECTED_LOWER_EDGES);
  assert.equal(new Set(graph.lowerEdges.map((edge) => edge.id)).size, EXPECTED_LOWER_EDGES.length);
  assert.ok(graph.lowerEdges.every((edge) => edge.drawnLineMeansAdjacency === true));
  assert.ok(graph.lowerEdges.every((edge) => edge.movementAuthority === false));
  assert.ok(graph.lowerEdges.every((edge) => edge.legalityAuthority === false));

  const leftBent = graph.lowerEdges.find((edge) => lowerEdgeKey(edge) === 'T0-L0');
  const rightBent = graph.lowerEdges.find((edge) => lowerEdgeKey(edge) === 'T11-R1');
  assert.deepEqual(leftBent.waypoints.map(({ x, y }) => [x, y]), [[110,664]]);
  assert.deepEqual(rightBent.waypoints.map(({ x, y }) => [x, y]), [[1425,665]]);
});

test('GOAL branches remain faint/readable until that exact lane reaches seven established cards', () => {
  assert.equal(goalBranchVisualStateForBuiltCount(0), 'FAINT_READABLE');
  assert.equal(goalBranchVisualStateForBuiltCount(6), 'FAINT_READABLE');
  assert.equal(goalBranchVisualStateForBuiltCount(7), 'STRONG_OPEN');
  assert.throws(() => goalBranchVisualStateForBuiltCount(8), /BATTLE_BOARD_BUILT_COUNT_INVALID/);
  assert.throws(() => goalBranchVisualStateForBuiltCount(-1), /BATTLE_BOARD_BUILT_COUNT_INVALID/);
});

test('graph is field/world presentation data only and does not claim movement or legality authority', () => {
  const graph = createBattleBoardVisualGraph();
  assert.equal(graph.presentationOnly, true);
  assert.equal(graph.worldFieldRenderSpaceOnly, true);
  assert.equal(graph.screenSpaceBoardTopology, false);
  assert.equal(graph.gameplayAuthority, false);
  assert.equal(graph.gameStateWrite, false);
  assert.equal(graph.movementAuthority, false);
  assert.equal(graph.legalityAuthority, false);
  assert.equal(graph.old109BasicCrossAsSource, false);
  assert.equal(graph.stale26CellHorizontalZeroCanon, false);
  assert.equal(graph.sourceReference.proseRedrawAuthority, false);
  assert.equal(graph.sourceReference.imageGenerationAuthority, false);
  assert.equal(graph.sourceReference.ocrAuthority, false);
});

test('source coordinates project to world space without changing topology semantics', () => {
  const graph = createBattleBoardVisualGraph();
  const projected = projectBattleBoardVisualGraphToWorld(graph, { centerX: 2, centerZ: -3, width: 24, y: 0.2 });
  assert.equal(BATTLE_BOARD_VISUAL_REFERENCE_SIZE.width, 1536);
  assert.equal(BATTLE_BOARD_VISUAL_REFERENCE_SIZE.height, 864);
  assert.equal(projected.presentationOnly, true);
  assert.equal(projected.movementAuthority, false);
  assert.equal(projected.legalityAuthority, false);
  assert.ok(projected.nodes['goal:shared']);
  assert.ok(projected.nodes['upper:P1:L:1']);
  assert.ok(projected.nodes['lower:T0']);
  assert.ok(projected.nodes['gate:P4:R']);
  assert.equal(Object.keys(projected.nodes).length, 139); // 1 GOAL + 126 round cells + 12 non-cell Gates.
  assert.throws(() => projectBattleBoardVisualGraphToWorld(graph, { width: 0 }), /BATTLE_BOARD_WORLD_BOUNDS_INVALID/);
});

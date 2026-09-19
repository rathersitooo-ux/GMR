import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlanoraMapLayout, FLANORA_MAP_LAYOUT_CORE } from '../browser/new-base-flanora-map-layout-core.mjs';

const participantIds = ['P1','P2','P3','P4'];
function layout() {
  return createFlanoraMapLayout({
    participantIds,
    shieldLinkedLaneColumnsByParticipant: {
      P1:[0,1,2], P2:[3,4,5], P3:[6,7,8], P4:[9,10,11],
    },
  });
}
function adjacency(map) {
  const out = new Map(map.sharedFieldCells.map((cell)=>[cell.id,new Set()]));
  for (const e of map.geometryEdges) {
    out.get(e.fromCellId).add(e.toCellId);
    out.get(e.toCellId).add(e.fromCellId);
  }
  return out;
}

test('USER_LOCK: one shared GOAL and twelve gate-linked lanes are explicit', () => {
  const map = layout();
  assert.equal(map.sharedGoalCount, 1);
  assert.equal(map.sharedGoalId, 'goal:shared');
  assert.equal(map.upperLaneCount, 12);
  assert.equal(map.goalBranchCount, 12);
  assert.equal(map.laneRootConnections.length, 12);
  assert.equal(new Set(map.laneRootConnections.map((lane)=>lane.gateId)).size, 12);
  assert.equal(new Set(map.laneRootConnections.map((lane)=>lane.shieldId)).size, 12);
  assert.equal(new Set(map.laneRootConnections.map((lane)=>lane.gateExitCellId)).size, 12);
});

test('Shield is retained as a Gate component instead of silently disappearing or becoming a cell', () => {
  const map = layout();
  for (const lane of map.laneRootConnections) {
    assert.equal(lane.shieldVisualRole, 'PART_OF_GATE');
    assert.equal(lane.shieldCountsAsCell, false);
    assert.equal(lane.shieldStoppable, false);
    assert.equal(lane.gateClosedState, 'OPAQUE_HEAVY_BARRIER');
    assert.equal(lane.gateOpenState, 'PASSABLE_FRAME_WITH_TRANSPARENT_MEMBRANE');
    assert.equal(lane.gateOpenRule, 'EXACTLY_SEVEN_ESTABLISHED_CARDS');
  }
});

test('shared lower field keeps every modeled round space and is richer than the retired 26-cell zero loop', () => {
  const map = layout();
  assert.equal(map.sharedFieldCellCount, 42);
  assert.equal(map.sharedFieldCells.every((cell)=>cell.shape === 'ROUND'), true);
  assert.equal(map.sharedFieldCells.filter((cell)=>cell.kind === 'GATE_EXIT').length, 12);
  assert.equal(map.stale26CellHorizontalZeroCanon, false);
  assert.equal(map.staleHorizontalBandIncluded, false);
  assert.equal(map.sharedFieldTopologyPolicy, 'REFERENCE_INSPIRED_ADJUSTABLE_NO_DEAD_ENDS');
});

test('shared lower field is one connected graph with no isolated or dead-end round spaces', () => {
  const map = layout();
  const graph = adjacency(map);
  assert.equal(map.sharedFieldConnected, true);
  assert.deepEqual(map.isolatedSharedFieldCellIds, []);
  assert.deepEqual(map.deadEndSharedFieldCellIds, []);
  for (const cell of map.sharedFieldCells) assert.ok(graph.get(cell.id).size >= 2, cell.id);
});

test('the discarded long Shield-under horizontal band is not reconstructed as a chain of gate exits', () => {
  const map = layout();
  const forbidden = new Set(Array.from({length:11},(_,i)=>[
    `gate-exit:${i}|gate-exit:${i+1}`,
    `gate-exit:${i+1}|gate-exit:${i}`,
  ]).flat());
  for (const e of map.geometryEdges) assert.equal(forbidden.has(`${e.fromCellId}|${e.toCellId}`), false);
});

test('map geometry stays presentation geometry and does not seize movement authority', () => {
  const map = layout();
  assert.equal(map.geometryIsMovementAuthority, false);
  assert.equal(map.upperProgressIsPrebuiltMovementField, false);
  assert.equal(map.optionalRuleGeometryIncluded, false);
});

test('published core locks the corrected topology invariants', () => {
  assert.equal(FLANORA_MAP_LAYOUT_CORE.playerCount, 4);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.upperLaneCount, 12);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.upperRoundCellsPerLane, 7);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.sharedGoalCount, 1);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.goalBranchCount, 12);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.sharedFieldCellCount, 42);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.staleHorizontalBandIncluded, false);
  assert.equal(FLANORA_MAP_LAYOUT_CORE.stale26CellHorizontalZeroCanon, false);
});

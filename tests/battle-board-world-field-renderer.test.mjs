import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleBoardWorldFieldRenderModel, mountBattleBoardWorldField } from '../browser/battle-board-world-field-renderer.mjs';

test('world-field render model keeps the lower shared field, Gate boundary and only actual built upper cards', () => {
  let model = createBattleBoardWorldFieldRenderModel({ worldBounds: { centerX: 0, centerZ: 0, width: 24, y: 0.15 } });
  assert.equal(model.renderSpace, 'WORLD_FIELD');
  assert.equal(model.screenSpaceBoardTopology, false);
  assert.equal(model.counts.sharedGoal, 1);
  assert.equal(model.counts.upperLanes, 12);
  assert.equal(model.counts.lowerRoundCells, 42);
  assert.equal(model.counts.builtUpperCards, 0);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.deepEqual(model.actualBuiltCards, []);
  assert.equal(model.counts.roundCells, 42);
  assert.equal(model.counts.gates, 12);
  assert.equal(model.counts.shields, 12);
  assert.equal(model.goalBranches.length, 12);
  assert.equal(model.roundCells.some((cell) => cell.id.startsWith('upper:')), false);
  assert.ok(model.roundCells.some((cell) => cell.id === 'lower:T0'));
  assert.ok(model.gates.every((gate) => gate.state === 'CLOSED_HEAVY_BARRIER'));

  model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P2:C': 3 } });
  assert.equal(model.counts.builtUpperCards, 3);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.equal(model.actualBuiltCards.length, 3);
  assert.deepEqual(model.actualBuiltCards.map((card) => card.stageIndex), [1, 2, 3]);
  assert.ok(model.actualBuiltCards.every((card) => card.kind === 'ACTUAL_BUILT_CARD'));
  assert.deepEqual(model.actualBuiltCards.map((card) => card.id), model.roundCells.filter((cell) => cell.kind === 'ACTUAL_BUILT_CARD').map((cell) => cell.id));
  assert.deepEqual(model.roundCells.filter((cell) => cell.laneKey === 'P2:C').map((cell) => cell.stageIndex), [1, 2, 3]);
  assert.equal(model.roundCells.some((cell) => cell.id === 'upper:P2:C:4'), false);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P2:C').state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.gameplayAuthority, false);
  assert.equal(model.movementAuthority, false);
});

test('bent lower-field source waypoints survive source-to-world projection instead of collapsing to the edge origin', () => {
  const bounds = { centerX: 2, centerZ: -3, width: 24, depth: 13.5, y: 0.2 };
  const model = createBattleBoardWorldFieldRenderModel({ worldBounds: bounds });
  const left = model.edges.find((edge) => edge.id === 'lower-edge:T0-L0');
  const right = model.edges.find((edge) => edge.id === 'lower-edge:T11-R1');

  assert.equal(left.waypoints.length, 1);
  assert.equal(right.waypoints.length, 1);
  assert.equal(left.sourceWaypoints.length, 1);
  assert.equal(right.sourceWaypoints.length, 1);
  assert.equal(left.routePresentation, 'SOURCE_REFERENCE_WAYPOINTS');
  assert.equal(right.routePresentation, 'SOURCE_REFERENCE_WAYPOINTS');

  const leftExpected = {
    x: bounds.centerX + ((110 / 1536) - 0.5) * bounds.width,
    y: bounds.y,
    z: bounds.centerZ + ((664 / 864) - 0.5) * bounds.depth,
  };
  const rightExpected = {
    x: bounds.centerX + ((1425 / 1536) - 0.5) * bounds.width,
    y: bounds.y,
    z: bounds.centerZ + ((665 / 864) - 0.5) * bounds.depth,
  };

  assert.ok(Math.abs(left.waypoints[0].x - leftExpected.x) < 1e-9);
  assert.ok(Math.abs(left.waypoints[0].y - leftExpected.y) < 1e-9);
  assert.ok(Math.abs(left.waypoints[0].z - leftExpected.z) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].x - rightExpected.x) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].y - rightExpected.y) < 1e-9);
  assert.ok(Math.abs(right.waypoints[0].z - rightExpected.z) < 1e-9);
  assert.notEqual(left.waypoints[0].z, left.from.z);
  assert.notEqual(right.waypoints[0].z, right.from.z);
});

test('straight canonical lower edges gain deterministic terrain bows without changing edge identity or endpoints', () => {
  const model = createBattleBoardWorldFieldRenderModel({
    worldBounds: { centerX: 0, centerZ: 0, width: 24, depth: 13.5, y: 0.15 },
  });
  const lowerEdges = model.edges.filter((edge) => edge.region === 'LOWER_SHARED_FIELD');
  const terrainBent = lowerEdges.filter((edge) => edge.routePresentation === 'DERIVED_TERRAIN_BOW');
  const sourceBent = lowerEdges.filter((edge) => edge.routePresentation === 'SOURCE_REFERENCE_WAYPOINTS');

  assert.equal(lowerEdges.length, 71);
  assert.equal(terrainBent.length, 69);
  assert.equal(sourceBent.length, 2);
  assert.equal(model.counts.terrainBentLowerEdges, 69);
  assert.equal(model.counts.sourceWaypointLowerEdges, 2);
  assert.ok(terrainBent.every((edge) => edge.sourceWaypoints.length === 0));
  assert.ok(terrainBent.every((edge) => edge.waypoints.length === 3));
  assert.ok(terrainBent.every((edge) => edge.waypoints.every((point) => point.derivedTerrainRoute === true)));
  assert.ok(lowerEdges.every((edge) => edge.canonicalVisualEdge === true));
  assert.ok(lowerEdges.every((edge) => edge.gameplayAuthority === false));
  assert.ok(lowerEdges.every((edge) => edge.movementAuthority === false));
  assert.ok(lowerEdges.every((edge) => edge.legalityAuthority === false));

  const sample = lowerEdges.find((edge) => edge.id === 'lower-edge:T1-T2');
  const fromCell = model.roundCells.find((cell) => cell.id === 'lower:T1');
  const toCell = model.roundCells.find((cell) => cell.id === 'lower:T2');
  assert.equal(sample.fromId, 'lower:T1');
  assert.equal(sample.toId, 'lower:T2');
  assert.deepEqual(sample.from, fromCell.world);
  assert.deepEqual(sample.to, toCell.world);

  const dx = sample.to.x - sample.from.x;
  const dz = sample.to.z - sample.from.z;
  const midpoint = sample.waypoints[1];
  const cross = (midpoint.x - sample.from.x) * dz - (midpoint.z - sample.from.z) * dx;
  assert.ok(Math.abs(cross) > 1e-6, 'derived route should visibly bow away from its canonical straight chord');
});

test('Gate and GOAL branch visual state opens only for the exact lane at seven actual cards', () => {
  const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P1:L': 7, 'P1:C': 6 } });
  assert.equal(model.counts.builtUpperCards, 13);
  assert.equal(model.actualBuiltCards.length, 13);
  assert.equal(model.actualBuiltCards.filter((card) => card.laneKey === 'P1:L').length, 7);
  assert.equal(model.actualBuiltCards.filter((card) => card.laneKey === 'P1:C').length, 6);
  assert.equal(model.counts.visibleFutureUpperSlots, 0);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:L').length, 7);
  assert.equal(model.roundCells.filter((cell) => cell.laneKey === 'P1:C').length, 6);
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P1:L').state, 'OPEN_PASSABLE_FRAME');
  assert.equal(model.gates.find((gate) => gate.laneKey === 'P1:C').state, 'CLOSED_HEAVY_BARRIER');
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P1:L').visualState, 'STRONG_OPEN');
  assert.equal(model.goalBranches.find((branch) => branch.id === 'goal-branch:P1:C').visualState, 'FAINT_READABLE');
});

test('mount hands one complete world-field model to the caller-owned renderer', () => {
  const calls = [];
  const runtime = mountBattleBoardWorldField({ worldRenderer: { replaceBoard(model) { calls.push(model); } } });
  assert.equal(runtime.mounted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].renderSpace, 'WORLD_FIELD');
  assert.equal(calls[0].screenSpaceBoardTopology, false);
});

test('mount fails closed instead of falling back to screen-space UI', () => {
  const runtime = mountBattleBoardWorldField({});
  assert.equal(runtime.mounted, false);
  assert.equal(runtime.reason, 'WORLD_RENDERER_REQUIRED');
});

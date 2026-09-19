import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleBoardWorldFieldRenderModel, mountBattleBoardWorldField } from '../browser/battle-board-world-field-renderer.mjs';

test('world-field render model preserves the complete board inventory without HUD topology', () => {
  const model = createBattleBoardWorldFieldRenderModel({ worldBounds: { centerX: 0, centerZ: 0, width: 24, y: 0.15 } });
  assert.equal(model.renderSpace, 'WORLD_FIELD');
  assert.equal(model.screenSpaceBoardTopology, false);
  assert.equal(model.counts.sharedGoal, 1);
  assert.equal(model.counts.upperLanes, 12);
  assert.equal(model.counts.roundCells, 126);
  assert.equal(model.counts.gates, 12);
  assert.equal(model.counts.shields, 12);
  assert.equal(model.goalBranches.length, 12);
  assert.equal(model.edges.length, 167);
  assert.ok(model.roundCells.some((cell) => cell.id === 'upper:P1:L:7'));
  assert.ok(model.roundCells.some((cell) => cell.id === 'lower:T0'));
  assert.ok(model.gates.every((gate) => gate.kind === 'ROUTE_GATE'));
  assert.ok(model.shields.every((shield) => shield.countsAsCell === false && shield.stoppable === false));
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

test('Gate and GOAL branch visual state opens only for the exact lane at seven established cards', () => {
  const model = createBattleBoardWorldFieldRenderModel({ builtCountByLaneKey: { 'P1:L': 7, 'P1:C': 6 } });
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

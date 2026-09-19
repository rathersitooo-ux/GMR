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

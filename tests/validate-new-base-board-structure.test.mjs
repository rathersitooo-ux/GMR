import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleBoardVisualGraph } from '../browser/new-base-battle-board-visual-graph.mjs';
import {
  NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT,
  validateNewBaseBoardStructure,
} from '../tools/validate-new-base-board-structure.mjs';

const fresh = () => JSON.parse(JSON.stringify(createBattleBoardVisualGraph()));
const codes = (result) => new Set(result.errors.map((error) => error.code));

test('current NEW_BOARD_ONLY graph passes structural validation without inventing movement legality', () => {
  const graph = createBattleBoardVisualGraph();
  const result = validateNewBaseBoardStructure(graph);

  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(result.reason, 'STRUCTURE_VALID');
  assert.deepEqual(result.summary, {
    sharedGoalCount: 1,
    upperLaneCount: 12,
    upperRoundCellCount: 84,
    gateCount: 12,
    shieldCount: 12,
    lowerRoundCellCount: graph.lowerNodes.length,
    lowerAdjacencyEdgeCount: graph.lowerEdges.length,
    visualEdgeCount: graph.allVisualEdges.length,
  });

  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.boardScope, 'NEW_BOARD_ONLY');
  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.acceptsOld109AsNewBoardSource, false);
  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.acceptsStale26CellHorizontalZeroAsSource, false);
  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.permitsUnresolvedCellTypes, true);
  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.infersMovementLegality, false);
  assert.equal(NEW_BASE_BOARD_STRUCTURE_VALIDATION_CONTRACT.infersGameplayRules, false);
});

test('old 109/basic-cross or stale 26-cell source contamination is rejected', () => {
  const old109 = fresh();
  old109.old109BasicCrossAsSource = true;
  assert.equal(validateNewBaseBoardStructure(old109).ok, false);
  assert.ok(codes(validateNewBaseBoardStructure(old109)).has('CONTRACT_DRIFT'));

  const stale26 = fresh();
  stale26.stale26CellHorizontalZeroCanon = true;
  assert.equal(validateNewBaseBoardStructure(stale26).ok, false);
  assert.ok(codes(validateNewBaseBoardStructure(stale26)).has('CONTRACT_DRIFT'));
});

test('every upper progression lane must keep exactly seven structural round cells', () => {
  const graph = fresh();
  graph.upperLanes[0].cells.pop();

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('LANE_CELL_COUNT'));
  assert.ok(codes(result).has('UPPER_TOTAL'));
});

test('Shield remains Gate structure rather than a stoppable cell', () => {
  const graph = fresh();
  graph.upperLanes[3].shield.stoppable = true;

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('SHIELD_SEMANTICS'));
});

test('Gate must retain reciprocal Shield identity and valid upper/lower attachments', () => {
  const graph = fresh();
  graph.upperLanes[5].gate.shieldId = 'shield:wrong';
  graph.upperLanes[5].gate.lowerAnchorId = 'lower:missing';

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('GATE_SHIELD_RECIPROCITY'));
  assert.ok(codes(result).has('GATE_LOWER_LINK'));
});

test('the lower board must remain one connected shared visual field', () => {
  const graph = fresh();
  graph.lowerEdges = [];

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('LOWER_FIELD_SPLIT'));
});

test('GOAL, lane, Gate, and lower-field edge sets reject omitted connections', () => {
  const graph = fresh();
  graph.goalBranches.pop();
  graph.gateConnections.pop();

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('EDGE_SET_MISMATCH'));
});

test('dangling visual-edge endpoints fail closed even when edge identity is preserved', () => {
  const graph = fresh();
  graph.allVisualEdges[0].toId = 'missing:node';

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, false);
  assert.ok(codes(result).has('EDGE_TO_DANGLING'));
});

test('unresolved cell semantic types are allowed and are not flattened into one invented type', () => {
  const graph = fresh();
  for (const lane of graph.upperLanes) {
    for (const cell of lane.cells) cell.semanticType = 'UNRESOLVED_NO_INFERENCE';
  }
  for (const cell of graph.lowerNodes) cell.semanticType = 'UNRESOLVED_NO_INFERENCE';

  const result = validateNewBaseBoardStructure(graph);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

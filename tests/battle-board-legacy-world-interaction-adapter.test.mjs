import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT,
  mapLegacyRoadPositionToWorldNodeId,
  projectLegacyWorldInteractionSnapshot,
} from '../browser/battle-board-legacy-world-interaction-adapter.mjs';

test('legacy road depth reverses onto canonical GOAL-to-Gate upper stages', () => {
  assert.equal(mapLegacyRoadPositionToWorldNodeId('R:P1:L:1').nodeId, 'upper:P1:L:7');
  assert.equal(mapLegacyRoadPositionToWorldNodeId('R:P1:L:7').nodeId, 'upper:P1:L:1');
  const middle = mapLegacyRoadPositionToWorldNodeId('R:P4:R:4');
  assert.equal(middle.nodeId, 'upper:P4:R:4');
  assert.equal(middle.semanticInference, false);
  assert.equal(middle.gameplayAuthority, false);
});

test('road-only interaction snapshot is complete and can suppress legacy board visuals', () => {
  const result = projectLegacyWorldInteractionSnapshot({
    currentPositionId: 'R:P2:C:3',
    nextPositionId: 'R:P2:C:4',
    newBoardMounted: true,
    reachablePositionIds: ['R:P2:C:2', 'R:P2:C:4', 'R:P2:C:4'],
    pathPositionIds: ['R:P2:C:3', 'R:P2:C:4'],
  });
  assert.deepEqual(result.canonicalOverlayInput, {
    currentNodeId: 'upper:P2:C:5',
    reachableNodeIds: ['upper:P2:C:6', 'upper:P2:C:4'],
    pathNodeIds: ['upper:P2:C:5', 'upper:P2:C:4'],
    nextNodeId: 'upper:P2:C:4',
  });
  assert.equal(result.complete, true);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, true);
  assert.deepEqual(result.unresolved, []);
});

test('legacy shield remains unresolved because old gameplay stops there but the new shield is non-stoppable', () => {
  const result = projectLegacyWorldInteractionSnapshot({
    currentPositionId: 'S:P1:L',
    newBoardMounted: true,
    reachablePositionIds: ['R:P1:L:1'],
  });
  assert.equal(result.canonicalOverlayInput.currentNodeId, null);
  assert.deepEqual(result.canonicalOverlayInput.reachableNodeIds, ['upper:P1:L:7']);
  assert.equal(result.complete, false);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, true);
  assert.deepEqual(result.unresolved.map((entry) => [entry.role, entry.authorityPositionId, entry.reason]), [
    ['CURRENT', 'S:P1:L', 'LEGACY_SHIELD_IS_STOPPABLE_BUT_NEW_SHIELD_IS_NONSTOPPABLE'],
  ]);
});

test('center and corner identities stay unresolved instead of being guessed onto lower nodes', () => {
  const result = projectLegacyWorldInteractionSnapshot({
    currentPositionId: 'C:0:0',
    nextPositionId: 'K:NE',
    newBoardMounted: true,
    reachablePositionIds: ['C:-1:0', 'R:P3:R:7'],
  });
  assert.deepEqual(result.canonicalOverlayInput.reachableNodeIds, ['upper:P3:R:1']);
  assert.equal(result.complete, false);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, true);
  assert.ok(result.unresolved.every((entry) => entry.reason === 'LOWER_SHARED_FIELD_MAPPING_UNRESOLVED_NO_INFERENCE'));
});

test('malformed legacy ids remain visible as invalid blockers rather than disappearing', () => {
  const result = projectLegacyWorldInteractionSnapshot({ reachablePositionIds: ['R:P9:L:1', 'bad'] });
  assert.equal(result.complete, false);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, false);
  assert.equal(result.invalid.length, 2);
  assert.deepEqual(result.canonicalOverlayInput.reachableNodeIds, []);
});

test('invalid caller shapes fail closed', () => {
  assert.throws(() => projectLegacyWorldInteractionSnapshot({ reachablePositionIds: 'R:P1:L:1' }), /LEGACY_WORLD_REACHABLE_POSITIONS_INVALID/);
  assert.throws(() => projectLegacyWorldInteractionSnapshot({ pathPositionIds: [null] }), /LEGACY_WORLD_PATH_POSITIONS_INVALID/);
  assert.throws(() => projectLegacyWorldInteractionSnapshot({ nextPositionId: '' }), /LEGACY_WORLD_NEXT_POSITION_INVALID/);
});

test('contract forbids inferred lower mapping and separates mount success from legacy ID compatibility', () => {
  assert.deepEqual(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.mappedLegacyKinds, ['ROAD']);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.legacyShieldMapping, 'BLOCKED_STOPPABILITY_MISMATCH');
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.legacyCenterCornerMapping, 'UNRESOLVED_NO_INFERENCE');
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.safeLegacyVisualSuppressionRequiresCompleteMapping, false);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.safeLegacyVisualSuppressionRequiresSuccessfulNewBoardMount, true);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.legacyInteractionInputsMustRemainAvailable, true);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.movementAuthority, false);
  assert.equal(BATTLE_BOARD_LEGACY_WORLD_INTERACTION_ADAPTER_CONTRACT.legalityAuthority, false);
});

test('legacy position completeness never grants permission to hide before new board mounts', () => {
  const result = projectLegacyWorldInteractionSnapshot({ currentPositionId: 'R:P1:L:1' });
  assert.equal(result.complete, true);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, false);
  assert.equal(result.canonicalOverlayInput.currentNodeId, 'upper:P1:L:7');
});

test('confirmed new board mount permits visibility replacement with mixed unmapped positions, without inventing mappings', () => {
  const input = {
    newBoardMounted: true,
    currentPositionId: 'C:0:0',
    nextPositionId: 'S:P1:L',
    reachablePositionIds: ['K:NW', 'R:P2:C:1'],
  };
  const result = projectLegacyWorldInteractionSnapshot(input);
  assert.equal(result.complete, false);
  assert.equal(result.safeToSuppressLegacyBoardVisuals, true);
  assert.equal(result.canonicalOverlayInput.currentNodeId, null);
  assert.equal(result.canonicalOverlayInput.nextNodeId, null);
  assert.deepEqual(result.canonicalOverlayInput.reachableNodeIds, ['upper:P2:C:7']);
  assert.deepEqual(result.unresolved.map(entry => entry.authorityPositionId), ['C:0:0','S:P1:L','K:NW']);
  assert.equal(result.stateWrite, false);
});

test('invalid new board mount status fails closed rather than treating a truthy string as proof', () => {
  assert.throws(() => projectLegacyWorldInteractionSnapshot({ newBoardMounted: 'true' }), /NEW_BOARD_MOUNT_STATUS_INVALID/);
  assert.throws(() => projectLegacyWorldInteractionSnapshot({ newBoardMounted: 1 }), /NEW_BOARD_MOUNT_STATUS_INVALID/);
});

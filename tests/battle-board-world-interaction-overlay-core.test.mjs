import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT,
  createBattleBoardWorldInteractionOverlay,
} from '../browser/battle-board-world-interaction-overlay-core.mjs';

test('empty interaction snapshot stays presentation-only and authority-free', () => {
  const overlay = createBattleBoardWorldInteractionOverlay();
  assert.equal(overlay.presentationOnly, true);
  assert.equal(overlay.callerOwnsInteractionAuthority, true);
  assert.equal(overlay.gameplayAuthority, false);
  assert.equal(overlay.movementAuthority, false);
  assert.equal(overlay.legalityAuthority, false);
  assert.equal(overlay.stateWrite, false);
  assert.equal(overlay.computesMovementLegality, false);
  assert.equal(overlay.overlays.length, 0);
  assert.deepEqual(overlay.counts, {
    overlays: 0,
    current: 0,
    next: 0,
    reachable: 0,
    path: 0,
  });
});

test('normalizes CURRENT, NEXT, PATH and REACHABLE onto canonical new-board cells with deterministic precedence', () => {
  const overlay = createBattleBoardWorldInteractionOverlay({
    currentNodeId: 'lower:M5',
    nextNodeId: 'lower:M6',
    reachableNodeIds: ['lower:M4', 'lower:M5', 'lower:M6', 'lower:M6', 'upper:P1:L:1', 'goal:shared'],
    pathNodeIds: ['lower:M5', 'lower:M6', 'upper:P1:L:1'],
  });

  assert.deepEqual(overlay.reachableNodeIds, [
    'lower:M4',
    'lower:M5',
    'lower:M6',
    'upper:P1:L:1',
    'goal:shared',
  ]);
  assert.deepEqual(overlay.pathNodeIds, ['lower:M5', 'lower:M6', 'upper:P1:L:1']);

  assert.deepEqual(overlay.overlayByNodeId['lower:M5'].roles, ['CURRENT', 'PATH', 'REACHABLE']);
  assert.equal(overlay.overlayByNodeId['lower:M5'].primaryRole, 'CURRENT');
  assert.equal(overlay.overlayByNodeId['lower:M5'].pathIndex, 0);

  assert.deepEqual(overlay.overlayByNodeId['lower:M6'].roles, ['NEXT', 'PATH', 'REACHABLE']);
  assert.equal(overlay.overlayByNodeId['lower:M6'].primaryRole, 'NEXT');
  assert.equal(overlay.overlayByNodeId['lower:M6'].pathIndex, 1);

  assert.deepEqual(overlay.overlayByNodeId['upper:P1:L:1'].roles, ['PATH', 'REACHABLE']);
  assert.equal(overlay.overlayByNodeId['upper:P1:L:1'].primaryRole, 'PATH');
  assert.equal(overlay.overlayByNodeId['goal:shared'].primaryRole, 'REACHABLE');

  assert.equal(overlay.counts.overlays, 5);
  assert.equal(overlay.counts.current, 1);
  assert.equal(overlay.counts.next, 1);
  assert.equal(overlay.counts.reachable, 5);
  assert.equal(overlay.counts.path, 3);
  assert.ok(overlay.overlays.every((entry) => entry.gameplayAuthority === false));
  assert.ok(overlay.overlays.every((entry) => entry.movementAuthority === false));
  assert.ok(overlay.overlays.every((entry) => entry.legalityAuthority === false));
  assert.ok(overlay.overlays.every((entry) => entry.stateWrite === false));
});

test('render order is canonical rather than caller list order', () => {
  const overlay = createBattleBoardWorldInteractionOverlay({
    reachableNodeIds: ['goal:shared', 'upper:P4:R:7', 'lower:T0', 'lower:B8'],
  });
  assert.deepEqual(overlay.overlays.map((entry) => entry.nodeId), [
    'lower:T0',
    'lower:B8',
    'upper:P4:R:7',
    'goal:shared',
  ]);
});

test('legacy 3x3, shield, road, corner and Gate identities fail closed instead of being silently mapped', () => {
  for (const nodeId of [
    'C:0:0',
    'S:P1:L',
    'R:P1:L:1',
    'K:NW',
    'shield:P1:L',
    'gate:P1:L',
  ]) {
    assert.throws(
      () => createBattleBoardWorldInteractionOverlay({ currentNodeId: nodeId }),
      new RegExp(`BATTLE_BOARD_INTERACTION_NODE_NOT_CANONICAL:${nodeId.replace(/[.*+?^$()|[\\]{}]/g, '\\$&')}`),
    );
  }
});

test('invalid caller shapes fail closed and never infer an interaction state', () => {
  assert.throws(
    () => createBattleBoardWorldInteractionOverlay({ reachableNodeIds: 'lower:T0' }),
    /BATTLE_BOARD_INTERACTION_REACHABLE_NODES_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldInteractionOverlay({ pathNodeIds: [null] }),
    /BATTLE_BOARD_INTERACTION_PATH_NODES_INVALID/,
  );
  assert.throws(
    () => createBattleBoardWorldInteractionOverlay({ nextNodeId: '' }),
    /BATTLE_BOARD_INTERACTION_NEXT_NODE_INVALID/,
  );
});

test('result and contract are frozen and explicitly forbid lower-field semantic inference', () => {
  const overlay = createBattleBoardWorldInteractionOverlay({
    currentNodeId: 'lower:T0',
    reachableNodeIds: ['lower:T1'],
  });
  assert.equal(Object.isFrozen(overlay), true);
  assert.equal(Object.isFrozen(overlay.overlays), true);
  assert.equal(Object.isFrozen(overlay.overlayByNodeId['lower:T0']), true);
  assert.equal(BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT.legacyNodeIdMapping, false);
  assert.equal(BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT.infersLowerFieldSemantics, false);
  assert.equal(BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT.computesMovementLegality, false);
  assert.equal(BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT.writesGameState, false);
  assert.deepEqual(
    BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT.roles,
    ['CURRENT', 'NEXT', 'PATH', 'REACHABLE'],
  );
});

import {
  createBattleBoardVisualGraph,
} from './new-base-battle-board-visual-graph.mjs';

const SCHEMA = 'gameroad.battle-board-world-interaction-overlay-core.v1';
const ROLE_PRECEDENCE = Object.freeze(['CURRENT', 'NEXT', 'PATH', 'REACHABLE']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalStoppableNodeIds(graph) {
  return new Set([
    ...graph.lowerNodes.map((node) => node.id),
    ...graph.upperCells.map((node) => node.id),
    graph.goal.id,
  ]);
}

function normalizeNodeId(value, key, canonicalIds, { nullable = false } = {}) {
  if (value == null && nullable) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`BATTLE_BOARD_INTERACTION_${key}_INVALID`);
  }
  if (!canonicalIds.has(value)) {
    throw new TypeError(`BATTLE_BOARD_INTERACTION_NODE_NOT_CANONICAL:${value}`);
  }
  return value;
}

function normalizeNodeList(value, key, canonicalIds) {
  if (!Array.isArray(value)) {
    throw new TypeError(`BATTLE_BOARD_INTERACTION_${key}_INVALID`);
  }
  const out = [];
  const seen = new Set();
  for (const nodeId of value) {
    const normalized = normalizeNodeId(nodeId, key, canonicalIds);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function canonicalRenderOrder(graph) {
  return [
    ...graph.lowerNodes.map((node) => node.id),
    ...graph.upperCells.map((node) => node.id),
    graph.goal.id,
  ];
}

export function createBattleBoardWorldInteractionOverlay({
  graph = createBattleBoardVisualGraph(),
  currentNodeId = null,
  reachableNodeIds = [],
  pathNodeIds = [],
  nextNodeId = null,
} = {}) {
  const canonicalIds = canonicalStoppableNodeIds(graph);
  const current = normalizeNodeId(currentNodeId, 'CURRENT_NODE', canonicalIds, { nullable: true });
  const next = normalizeNodeId(nextNodeId, 'NEXT_NODE', canonicalIds, { nullable: true });
  const reachable = normalizeNodeList(reachableNodeIds, 'REACHABLE_NODES', canonicalIds);
  const path = normalizeNodeList(pathNodeIds, 'PATH_NODES', canonicalIds);

  const rolesByNodeId = new Map();
  const ensure = (nodeId) => {
    if (!nodeId) return null;
    if (!rolesByNodeId.has(nodeId)) rolesByNodeId.set(nodeId, new Set());
    return rolesByNodeId.get(nodeId);
  };

  for (const nodeId of reachable) ensure(nodeId).add('REACHABLE');
  for (const nodeId of path) ensure(nodeId).add('PATH');
  if (next) ensure(next).add('NEXT');
  if (current) ensure(current).add('CURRENT');

  const pathIndexByNodeId = new Map(path.map((nodeId, index) => [nodeId, index]));
  const overlays = canonicalRenderOrder(graph)
    .filter((nodeId) => rolesByNodeId.has(nodeId))
    .map((nodeId) => {
      const roleSet = rolesByNodeId.get(nodeId);
      const roles = ROLE_PRECEDENCE.filter((role) => roleSet.has(role));
      return {
        nodeId,
        roles,
        primaryRole: roles[0],
        pathIndex: pathIndexByNodeId.has(nodeId) ? pathIndexByNodeId.get(nodeId) : null,
        presentationOnly: true,
        gameplayAuthority: false,
        movementAuthority: false,
        legalityAuthority: false,
        stateWrite: false,
      };
    });

  const overlayByNodeId = Object.fromEntries(overlays.map((entry) => [entry.nodeId, entry]));

  return deepFreeze({
    schema: SCHEMA,
    presentationOnly: true,
    callerOwnsInteractionAuthority: true,
    canonicalNodeIdentityAuthority: 'NEW_BASE_BATTLE_BOARD_VISUAL_GRAPH',
    legacyNodeIdMapping: false,
    computesMovementLegality: false,
    computesTargetLegality: false,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    stateWrite: false,
    currentNodeId: current,
    nextNodeId: next,
    reachableNodeIds: reachable,
    pathNodeIds: path,
    overlays,
    overlayByNodeId,
    counts: {
      overlays: overlays.length,
      current: current ? 1 : 0,
      next: next ? 1 : 0,
      reachable: reachable.length,
      path: path.length,
    },
  });
}

export const BATTLE_BOARD_WORLD_INTERACTION_OVERLAY_CONTRACT = deepFreeze({
  schema: SCHEMA,
  acceptedNodeKinds: Object.freeze(['LOWER_ROUND_CELL', 'UPPER_ROUND_CELL', 'SHARED_GOAL']),
  rejectedCompatibilityKinds: Object.freeze(['SHIELD', 'GATE', 'LEGACY_C', 'LEGACY_S', 'LEGACY_R', 'LEGACY_K']),
  roles: ROLE_PRECEDENCE,
  rolePrecedence: 'CURRENT>NEXT>PATH>REACHABLE',
  callerOwnsInteractionAuthority: true,
  legacyNodeIdMapping: false,
  infersLowerFieldSemantics: false,
  computesMovementLegality: false,
  computesTargetLegality: false,
  writesGameState: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
});

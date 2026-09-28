import {
  createBattleBoardVisualGraph,
  goalBranchVisualStateForBuiltCount,
  projectBattleBoardVisualGraphToWorld,
} from './new-base-battle-board-visual-graph.mjs';

const SCHEMA = 'gameroad.battle-board-world-field-renderer.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function point(nodes, id) {
  const value = nodes[id];
  if (!value) throw new TypeError(`BATTLE_BOARD_WORLD_NODE_MISSING:${id}`);
  return value;
}
function projectSourcePoint(source, projection) {
  return {
    x: projection.centerX + (source.u - 0.5) * projection.width,
    y: projection.y,
    z: projection.centerZ + (source.v - 0.5) * projection.depth,
    sourceU: source.u,
    sourceV: source.v,
  };
}
function stableBendSign(id) {
  let hash = 2166136261;
  for (const char of String(id ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}
function deriveTerrainRouteWaypoints(edge, from, to, sourceWaypoints) {
  if (sourceWaypoints.length > 0) {
    return { waypoints: sourceWaypoints, routePresentation: 'SOURCE_REFERENCE_WAYPOINTS' };
  }
  if (edge.region !== 'LOWER_SHARED_FIELD') {
    return { waypoints: sourceWaypoints, routePresentation: 'STRAIGHT_CANONICAL' };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance) || distance <= Number.EPSILON) {
    return { waypoints: sourceWaypoints, routePresentation: 'STRAIGHT_CANONICAL' };
  }
  const normalX = -dz / distance;
  const normalZ = dx / distance;
  const direction = stableBendSign(edge.id);
  const amplitude = Math.min(0.34, Math.max(0.10, distance * 0.09));
  const waypoints = [0.25, 0.5, 0.75].map((t) => {
    const bend = Math.sin(Math.PI * t) * amplitude * direction;
    return {
      x: from.x + dx * t + normalX * bend,
      y: from.y + dy * t,
      z: from.z + dz * t + normalZ * bend,
      derivedTerrainRoute: true,
    };
  });
  return { waypoints, routePresentation: 'DERIVED_TERRAIN_BOW' };
}
function edgePrimitive(edge, nodes, projection) {
  const from = point(nodes, edge.fromId);
  const to = point(nodes, edge.toId);
  const sourceWaypoints = (edge.waypoints ?? []).map((source) => projectSourcePoint(source, projection));
  const route = deriveTerrainRouteWaypoints(edge, from, to, sourceWaypoints);
  return {
    id: edge.id,
    kind: edge.kind,
    region: edge.region,
    fromId: edge.fromId,
    toId: edge.toId,
    from,
    to,
    sourceWaypoints,
    waypoints: route.waypoints,
    routePresentation: route.routePresentation,
    canonicalVisualEdge: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
  };
}

export function createBattleBoardWorldFieldRenderModel({
  graph = createBattleBoardVisualGraph(),
  worldBounds = {},
  builtCountByLaneKey = {},
} = {}) {
  const projection = projectBattleBoardVisualGraphToWorld(graph, worldBounds);
  const nodes = projection.nodes;
  const lowerRoundCells = graph.lowerNodes.map((cell) => ({
    id: cell.id, kind: 'ROUND_CELL', region: cell.region, world: point(nodes, cell.id),
    semanticType: cell.semanticType, gameplayAuthority: false, movementAuthority: false,
  }));
  const builtUpperCells = graph.upperLanes.flatMap((lane) => {
    const builtCount = Number.isSafeInteger(builtCountByLaneKey[lane.laneKey]) ? builtCountByLaneKey[lane.laneKey] : 0;
    return lane.cells.slice(0, builtCount).map((cell) => ({
      id: cell.id, kind: 'ACTUAL_BUILT_CARD', region: cell.region, laneKey: lane.laneKey,
      stageIndex: cell.stageIndex, world: point(nodes, cell.id),
      semanticType: cell.semanticType, gameplayAuthority: false, movementAuthority: false,
    }));
  });
  const roundCells = [...lowerRoundCells, ...builtUpperCells];
  const gates = graph.upperLanes.map((lane) => {
    const builtCount = Number.isSafeInteger(builtCountByLaneKey[lane.laneKey]) ? builtCountByLaneKey[lane.laneKey] : 0;
    const state = goalBranchVisualStateForBuiltCount(builtCount);
    return {
      id: lane.gate.id, kind: 'ROUTE_GATE', laneKey: lane.laneKey, world: point(nodes, lane.gate.id),
      state: state === 'STRONG_OPEN' ? 'OPEN_PASSABLE_FRAME' : 'CLOSED_HEAVY_BARRIER',
      gameplayAuthority: false,
    };
  });
  const shields = graph.upperLanes.map((lane) => ({
    id: lane.shield.id, kind: 'SHIELD_GATE_FACE', laneKey: lane.laneKey,
    world: point(nodes, lane.gate.id), countsAsCell: false, stoppable: false, gameplayAuthority: false,
  }));
  const goalBranches = graph.goalBranches.map((edge) => {
    const lane = graph.upperLanes.find((candidate) => edge.id === `goal-branch:${candidate.laneKey}`);
    const builtCount = lane && Number.isSafeInteger(builtCountByLaneKey[lane.laneKey]) ? builtCountByLaneKey[lane.laneKey] : 0;
    return { ...edgePrimitive(edge, nodes, projection), visualState: goalBranchVisualStateForBuiltCount(builtCount) };
  });
  const visibleUpperIds = new Set(builtUpperCells.map((cell) => cell.id));
  const upperLaneEdges = graph.upperLaneEdges
    .filter((edge) => visibleUpperIds.has(edge.fromId) && visibleUpperIds.has(edge.toId))
    .map((edge) => edgePrimitive(edge, nodes, projection));
  const gateConnections = graph.gateConnections
    .filter((edge) => edge.id.endsWith(':lower') || visibleUpperIds.has(edge.fromId))
    .map((edge) => edgePrimitive(edge, nodes, projection));
  const lowerEdges = graph.lowerEdges.map((edge) => edgePrimitive(edge, nodes, projection));
  const edges = [...upperLaneEdges, ...gateConnections, ...lowerEdges];
  return deepFreeze({
    schema: SCHEMA,
    renderSpace: 'WORLD_FIELD',
    screenSpaceBoardTopology: false,
    presentationOnly: true,
    gameplayAuthority: false,
    movementAuthority: false,
    legalityAuthority: false,
    sharedGoal: { id: graph.goal.id, kind: 'SHARED_GOAL', world: point(nodes, graph.goal.id) },
    roundCells, gates, shields, goalBranches, edges,
    counts: {
      sharedGoal: 1,
      upperLanes: graph.upperLaneCount,
      lowerRoundCells: lowerRoundCells.length,
      builtUpperCards: builtUpperCells.length,
      visibleFutureUpperSlots: 0,
      roundCells: roundCells.length,
      gates: gates.length,
      shields: shields.length,
      terrainBentLowerEdges: lowerEdges.filter((edge) => edge.routePresentation === 'DERIVED_TERRAIN_BOW').length,
      sourceWaypointLowerEdges: lowerEdges.filter((edge) => edge.routePresentation === 'SOURCE_REFERENCE_WAYPOINTS').length,
    },
  });
}

export function mountBattleBoardWorldField({
  worldRenderer,
  graph,
  worldBounds,
  builtCountByLaneKey,
} = {}) {
  if (!worldRenderer || typeof worldRenderer.replaceBoard !== 'function') {
    return deepFreeze({ mounted: false, reason: 'WORLD_RENDERER_REQUIRED', schema: SCHEMA });
  }
  const model = createBattleBoardWorldFieldRenderModel({ graph, worldBounds, builtCountByLaneKey });
  worldRenderer.replaceBoard(model);
  return deepFreeze({
    schema: SCHEMA, mounted: true, renderSpace: 'WORLD_FIELD', screenSpaceBoardTopology: false,
    presentationOnly: true, gameplayAuthority: false, movementAuthority: false, legalityAuthority: false,
    model,
  });
}

export const BATTLE_BOARD_WORLD_FIELD_RENDERER_CONTRACT = deepFreeze({
  schema: SCHEMA,
  consumesCanonicalVisualGraph: true,
  renderSpace: 'WORLD_FIELD',
  screenSpaceBoardTopology: false,
  sharedGoalCount: 1,
  routeGateAndShieldPreserved: true,
  upperProgressionVisibility: 'ACTUAL_BUILT_CARDS_ONLY',
  visibleFutureUpperSlots: 0,
  lowerSharedFieldRoutePresentation: 'DERIVED_TERRAIN_BOW_WITH_SOURCE_WAYPOINT_PRESERVATION',
  canonicalAdjacencyUnchanged: true,
  renderWaypointsAreMovementNodes: false,
  secondBoardEngine: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
});

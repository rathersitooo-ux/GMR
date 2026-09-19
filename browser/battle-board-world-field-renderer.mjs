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
function edgePrimitive(edge, nodes, graph) {
  const from = point(nodes, edge.fromId);
  const to = point(nodes, edge.toId);
  const waypoints = (edge.waypoints ?? []).map((source) => ({
    x: from.x + (to.x - from.x) * 0,
    y: from.y,
    z: from.z + (to.z - from.z) * 0,
    sourceU: source.u,
    sourceV: source.v,
  }));
  return { id: edge.id, kind: edge.kind, region: edge.region, fromId: edge.fromId, toId: edge.toId, from, to, waypoints, gameplayAuthority: false };
}

export function createBattleBoardWorldFieldRenderModel({
  graph = createBattleBoardVisualGraph(),
  worldBounds = {},
  builtCountByLaneKey = {},
} = {}) {
  const projection = projectBattleBoardVisualGraphToWorld(graph, worldBounds);
  const nodes = projection.nodes;
  const roundCells = graph.allRoundCells.map((cell) => ({
    id: cell.id, kind: 'ROUND_CELL', region: cell.region, world: point(nodes, cell.id),
    semanticType: cell.semanticType, gameplayAuthority: false, movementAuthority: false,
  }));
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
    return { ...edgePrimitive(edge, nodes, graph), visualState: goalBranchVisualStateForBuiltCount(builtCount) };
  });
  const edges = [...graph.upperLaneEdges, ...graph.gateConnections, ...graph.lowerEdges].map((edge) => edgePrimitive(edge, nodes, graph));
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
    counts: { sharedGoal: 1, upperLanes: graph.upperLaneCount, roundCells: roundCells.length, gates: gates.length, shields: shields.length },
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
  secondBoardEngine: false,
  gameplayAuthority: false,
  movementAuthority: false,
  legalityAuthority: false,
});

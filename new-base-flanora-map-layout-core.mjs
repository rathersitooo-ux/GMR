const FLANORA_MAP_SCHEMA = 'GAMEROAD_FLANORA_MAP_LAYOUT_V2';

const PLAYER_COUNT = 4;
const LANES_PER_PLAYER = 3;
const LANE_COUNT = PLAYER_COUNT * LANES_PER_PLAYER;
const UPPER_ROUND_CELLS_PER_LANE = 7;

const LOWER_COORDS = Object.freeze([
  ...Array.from({ length: 12 }, (_, i) => ({ id: `gate-exit:${i}`, kind: 'GATE_EXIT', x: i / 11, y: 0 })),
  ...Array.from({ length: 11 }, (_, i) => ({ id: `mid:${i}`, kind: 'SHARED_FIELD', x: (i + 0.5) / 11, y: 0.42 })),
  ...Array.from({ length: 9 }, (_, i) => ({ id: `bottom:${i}`, kind: 'SHARED_FIELD', x: (i + 1) / 10, y: 1 })),
  { id: 'left:0', kind: 'SHARED_FIELD', x: 0.03, y: 0.56 },
  { id: 'left:1', kind: 'SHARED_FIELD', x: 0.17, y: 0.56 },
  { id: 'left:2', kind: 'SHARED_FIELD', x: 0.09, y: 0.72 },
  { id: 'left:3', kind: 'SHARED_FIELD', x: 0.18, y: 0.82 },
  { id: 'left:4', kind: 'SHARED_FIELD', x: 0.28, y: 0.68 },
  { id: 'right:0', kind: 'SHARED_FIELD', x: 0.97, y: 0.56 },
  { id: 'right:1', kind: 'SHARED_FIELD', x: 0.83, y: 0.56 },
  { id: 'right:2', kind: 'SHARED_FIELD', x: 0.91, y: 0.72 },
  { id: 'right:3', kind: 'SHARED_FIELD', x: 0.82, y: 0.82 },
  { id: 'right:4', kind: 'SHARED_FIELD', x: 0.72, y: 0.68 },
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function edge(fromCellId, toCellId) { return { fromCellId, toCellId }; }
function chain(prefix, count) {
  return Array.from({ length: count - 1 }, (_, i) => edge(`${prefix}:${i}`, `${prefix}:${i + 1}`));
}
function buildSharedFieldEdges() {
  const edges = [...chain('mid', 11), ...chain('bottom', 9)];
  const gateToMid = [
    [0,0,1],[1,0,1],[2,1,2],[3,2,3],[4,3,4],[5,4,5],
    [6,5,6],[7,6,7],[8,7,8],[9,8,9],[10,9,10],[11,9,10],
  ];
  for (const [gate, a, b] of gateToMid) {
    edges.push(edge(`gate-exit:${gate}`, `mid:${a}`), edge(`gate-exit:${gate}`, `mid:${b}`));
  }
  edges.push(
    edge('mid:0','left:0'), edge('mid:1','left:1'),
    edge('left:0','left:2'), edge('left:1','left:2'), edge('left:2','left:3'),
    edge('left:3','left:4'), edge('left:4','bottom:1'), edge('left:0','bottom:0'),
    edge('mid:9','right:1'), edge('mid:10','right:0'),
    edge('right:0','right:2'), edge('right:1','right:2'), edge('right:2','right:3'),
    edge('right:3','right:4'), edge('right:4','bottom:7'), edge('right:0','bottom:8'),
    edge('mid:2','bottom:2'), edge('mid:4','bottom:3'),
    edge('mid:6','bottom:5'), edge('mid:8','bottom:6'),
  );
  return edges;
}
function connectivity(cells, edges) {
  const adjacency = new Map(cells.map(({ id }) => [id, new Set()]));
  for (const { fromCellId, toCellId } of edges) {
    if (!adjacency.has(fromCellId) || !adjacency.has(toCellId)) throw new TypeError('LOWER_FIELD_EDGE_UNKNOWN_CELL');
    adjacency.get(fromCellId).add(toCellId);
    adjacency.get(toCellId).add(fromCellId);
  }
  const first = cells[0]?.id;
  const visited = new Set(first ? [first] : []);
  const queue = first ? [first] : [];
  while (queue.length) {
    const id = queue.shift();
    for (const next of adjacency.get(id) ?? []) if (!visited.has(next)) { visited.add(next); queue.push(next); }
  }
  return {
    connected: visited.size === cells.length,
    isolatedCellIds: [...adjacency].filter(([, n]) => n.size === 0).map(([id]) => id),
    deadEndCellIds: [...adjacency].filter(([, n]) => n.size < 2).map(([id]) => id),
    degreeByCellId: Object.fromEntries([...adjacency].map(([id, n]) => [id, n.size])),
  };
}
function normalizeParticipants(participantIds) {
  if (!Array.isArray(participantIds) || participantIds.length !== PLAYER_COUNT) throw new TypeError('FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  if (participantIds.some((id) => !nonEmptyString(id)) || new Set(participantIds).size !== PLAYER_COUNT) throw new TypeError('FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  return [...participantIds];
}
function normalizeLaneBlocks(participants, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('FOUR_THREE_LANE_BLOCKS_REQUIRED');
  const normalized = {};
  const all = [];
  for (const participantId of participants) {
    const values = source[participantId];
    if (!Array.isArray(values) || values.length !== LANES_PER_PLAYER) throw new TypeError('FOUR_THREE_LANE_BLOCKS_REQUIRED');
    const cols = values.map(Number).sort((a,b)=>a-b);
    if (cols.some((v)=>!Number.isSafeInteger(v) || v < 0) || new Set(cols).size !== LANES_PER_PLAYER) throw new TypeError('FOUR_THREE_LANE_BLOCKS_REQUIRED');
    normalized[participantId] = cols;
    all.push(...cols);
  }
  if (new Set(all).size !== LANE_COUNT) throw new TypeError('TWELVE_UNIQUE_LANES_REQUIRED');
  return normalized;
}

export function createFlanoraMapLayout({ participantIds, shieldLinkedLaneColumnsByParticipant } = {}) {
  const participants = normalizeParticipants(participantIds);
  const laneBlocks = normalizeLaneBlocks(participants, shieldLinkedLaneColumnsByParticipant);
  const sharedFieldCells = LOWER_COORDS.map((item) => ({ ...item, participantId: null, shape: 'ROUND' }));
  const geometryEdges = buildSharedFieldEdges();
  const fieldConnectivity = connectivity(sharedFieldCells, geometryEdges);
  if (!fieldConnectivity.connected || fieldConnectivity.isolatedCellIds.length || fieldConnectivity.deadEndCellIds.length) {
    throw new TypeError('SHARED_FIELD_MUST_BE_CONNECTED_WITHOUT_DEAD_ENDS');
  }

  const laneRootConnections = [];
  let ordinal = 0;
  for (const participantId of participants) {
    laneBlocks[participantId].forEach((columnIndex, laneIndex) => {
      laneRootConnections.push({
        participantId, laneIndex, columnIndex,
        upperRoundCellCount: UPPER_ROUND_CELLS_PER_LANE,
        gateId: `gate:${participantId}:${laneIndex}`,
        shieldId: `shield:${participantId}:${laneIndex}`,
        shieldVisualRole: 'PART_OF_GATE',
        shieldCountsAsCell: false,
        shieldStoppable: false,
        gateClosedState: 'OPAQUE_HEAVY_BARRIER',
        gateOpenState: 'PASSABLE_FRAME_WITH_TRANSPARENT_MEMBRANE',
        gateOpenRule: 'EXACTLY_SEVEN_ESTABLISHED_CARDS',
        gateExitCellId: `gate-exit:${ordinal}`,
      });
      ordinal += 1;
    });
  }

  return deepFreeze({
    schema: FLANORA_MAP_SCHEMA,
    participantIds: participants,
    playerCount: PLAYER_COUNT,
    shieldLinkedLanesPerPlayer: LANES_PER_PLAYER,
    shieldLinkedLaneColumnsByParticipant: laneBlocks,
    upperLaneCount: LANE_COUNT,
    upperRoundCellsPerLane: UPPER_ROUND_CELLS_PER_LANE,
    sharedGoalId: 'goal:shared',
    sharedGoalCount: 1,
    goalBranchCount: LANE_COUNT,
    laneRootConnections,
    sharedFieldOwnership: 'SHARED',
    sharedFieldCells,
    sharedFieldCellCount: sharedFieldCells.length,
    geometryEdges,
    sharedFieldConnected: true,
    isolatedSharedFieldCellIds: [],
    deadEndSharedFieldCellIds: [],
    geometryDegreeByCellId: fieldConnectivity.degreeByCellId,
    geometryIsMovementAuthority: false,
    sharedFieldTopologyPolicy: 'REFERENCE_INSPIRED_ADJUSTABLE_NO_DEAD_ENDS',
    staleHorizontalBandIncluded: false,
    stale26CellHorizontalZeroCanon: false,
    legacyClearingCompatibilityOnly: true,
    upperProgressIsPrebuiltMovementField: false,
    optionalRuleGeometryIncluded: false,
  });
}

export const FLANORA_MAP_LAYOUT_CORE = deepFreeze({
  schema: FLANORA_MAP_SCHEMA,
  playerCount: PLAYER_COUNT,
  shieldLinkedLanesPerPlayer: LANES_PER_PLAYER,
  upperLaneCount: LANE_COUNT,
  upperRoundCellsPerLane: UPPER_ROUND_CELLS_PER_LANE,
  sharedGoalCount: 1,
  goalBranchCount: LANE_COUNT,
  sharedFieldCellCount: LOWER_COORDS.length,
  sharedFieldTopologyPolicy: 'REFERENCE_INSPIRED_ADJUSTABLE_NO_DEAD_ENDS',
  staleHorizontalBandIncluded: false,
  stale26CellHorizontalZeroCanon: false,
  geometryIsMovementAuthority: false,
  upperProgressIsPrebuiltMovementField: false,
  optionalRuleGeometryIncluded: false,
});

/**
 * Appearance-only projection of the user's selected ring marker (A) and
 * vine-like connection (D) onto the existing new-board world-field model.
 *
 * Input is the already-projected rendering model. No second graph, movement
 * legality, height, terrain, material assignment or new stopping positions.
 */
const SCHEMA = 'gameroad.battle-board-ring-vine-world-presentation.v1';

const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const VALID_NUM = (n) => typeof n === 'number' && Number.isFinite(n);
function worldPoint(value, context) {
  if (!value || ![value.x, value.y, value.z].every(VALID_NUM)) {
    throw new TypeError(`RING_VINE_INVALID_WORLD_POINT:${context}`);
  }
  return { x: value.x, y: value.y, z: value.z };
}

function pointAlongPolyline(polyline, fraction) {
  const lengths = polyline.slice(1).map((p, i) => Math.hypot(p.x - polyline[i].x, p.z - polyline[i].z));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 1e-9) return null;
  let remaining = fraction * total;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] > 0 ? remaining / lengths[i] : 0;
      const a = polyline[i], b = polyline[i + 1];
      return { x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        tangentX: (b.x - a.x) / Math.max(lengths[i], 1e-9),
        tangentZ: (b.z - a.z) / Math.max(lengths[i], 1e-9) };
    }
    remaining -= lengths[i];
  }
  return null;
}

export function projectRingVineWorldPresentation({
  roundCells, edges, worldWidth, worldDepth, lowPerf = false, reducedMotion = false,
} = {}) {
  if (!Array.isArray(roundCells) || !Array.isArray(edges)
      || !VALID_NUM(worldWidth) || worldWidth <= 0
      || !VALID_NUM(worldDepth) || worldDepth <= 0) {
    throw new TypeError('RING_VINE_WORLD_FIELD_INPUT_REQUIRED');
  }
  const renderableNodes = new Set(roundCells.map((c) => c?.id));
  if (renderableNodes.size !== roundCells.length || renderableNodes.has(undefined)) {
    throw new TypeError('RING_VINE_DUPLICATE_OR_INVALID_CELL');
  }
  // Original selected ring.svg: viewBox 64×64, ellipse rx=22, ry=15;
  // dark under-stroke and light stroke. Source artwork is a reference, not
  // a mandate for exact runtime thickness or scale.
  const markers = roundCells.map((cell) => ({
    cellId: cell.id,
    kind: 'RING_ONLY',
    anchor: worldPoint(cell.world, cell.id),
    radiusX: worldWidth * 22 / 1536,
    radiusZ: worldDepth * 15 / 864,
    darkStroke: '#14281e', lightStroke: '#e8edc5',
    selectedStyleAuthority: 'HUMAN_SELECTED_A_RING_ONLY',
    gameplayAuthority: false,
  }));
  const lowerEdges = edges.filter((edge) => edge?.region === 'LOWER_SHARED_FIELD');
  const seenEdges = new Set();
  const vines = lowerEdges.map((edge) => {
    if (!edge?.id || seenEdges.has(edge.id)) throw new TypeError('RING_VINE_INVALID_OR_DUPLICATE_EDGE');
    seenEdges.add(edge.id);
    const points = [edge.from, ...(edge.waypoints ?? []), edge.to].map((p, i) => worldPoint(p, `${edge.id}:${i}`));
    if (points.length < 2) throw new TypeError('RING_VINE_EDGE_PATH_REQUIRED');
    // Optional leaves are *decoration*, not cells or branch junctions. Two
    // placements follow the separately saved selected vine SVG specimen.
    const leaves = lowPerf ? [] : [0.28, 0.74]
      .map((fraction) => pointAlongPolyline(points, fraction))
      .filter(Boolean)
      .map((center, index) => ({ kind: 'DECORATIVE_LEAF', index, center,
        material: 'VINE_LEAF', gameplayAuthority: false }));
    return {
      edgeId: edge.id, fromId: edge.fromId, toId: edge.toId,
      kind: 'VINE_LIKE', centerline: points, leaves,
      darkStroke: '#15251d', greenStroke: '#668a46',
      selectedStyleAuthority: 'HUMAN_SELECTED_D_VINE_LIKE',
      newGraphNode: false, walkableBridge: false, gameplayAuthority: false,
    };
  });
  return freeze({
    schema: SCHEMA,
    selection: { cellMarker: 'A_RING_ONLY', connectionLine: 'D_VINE_LIKE' },
    markers, vines,
    count: { markers: markers.length, vines: vines.length,
      decorativeLeaves: vines.reduce((n, v) => n + v.leaves.length, 0) },
    lowPerf, reducedMotion,
    appearanceOnly: true, noTerrainAssignment: true,
    noMovementAuthority: true, noAdditionalStoppingPositions: true,
    notAcceptedAssetPlacementOrScale: true,
  });
}
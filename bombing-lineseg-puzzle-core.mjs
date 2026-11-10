export const RULES_VERSION = 'BOMB_LINESEG_2026-07-24_R1';
export const ARTIFACT_VERSION = 'RECOVERY_R2_20260912';
export const SUIT_COUNT = 4;
export const BOARD_COLUMNS = 5;
export const BOARD_ROWS = 3;
export const SEGMENT_COUNT = 60;

function pointKey(p) {
  return `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
}

function edgeKey(a, b) {
  const A = pointKey(a);
  const B = pointKey(b);
  return A < B ? `${A}|${B}` : `${B}|${A}`;
}

export function buildBombingLineGeometry() {
  const edgeIndexByKey = new Map();
  const edges = [];

  for (let column = 0; column < BOARD_COLUMNS; column += 1) {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      const cx = 1.5 * column;
      const cy = Math.sqrt(3) * (row + 0.5 * (column % 2));
      const points = [];
      for (const degrees of [0, 60, 120, 180, 240, 300]) {
        const radians = degrees * Math.PI / 180;
        points.push({ x: cx + Math.cos(radians), y: cy + Math.sin(radians) });
      }
      for (let side = 0; side < 6; side += 1) {
        const a = points[side];
        const b = points[(side + 1) % 6];
        const key = edgeKey(a, b);
        if (!edgeIndexByKey.has(key)) {
          edgeIndexByKey.set(key, edges.length);
          edges.push({
            id: edges.length,
            a,
            b,
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          });
        }
      }
    }
  }

  if (edges.length !== SEGMENT_COUNT) {
    throw new Error(`geometry invariant: expected ${SEGMENT_COUNT} segments, got ${edges.length}`);
  }

  const adjacency = Array.from({ length: edges.length }, () => []);
  const endpointToEdges = new Map();
  for (const edge of edges) {
    for (const point of [edge.a, edge.b]) {
      const key = pointKey(point);
      if (!endpointToEdges.has(key)) endpointToEdges.set(key, []);
      endpointToEdges.get(key).push(edge.id);
    }
  }

  for (const incidentEdges of endpointToEdges.values()) {
    for (let i = 0; i < incidentEdges.length; i += 1) {
      for (let j = i + 1; j < incidentEdges.length; j += 1) {
        const a = incidentEdges[i];
        const b = incidentEdges[j];
        adjacency[a].push(b);
        adjacency[b].push(a);
      }
    }
  }

  for (const list of adjacency) list.sort((a, b) => a - b);
  return { edges, adjacency };
}

export const DEFAULT_GEOMETRY = buildBombingLineGeometry();

export function powerForGroupSize(size) {
  if (size < 3) return 0;
  if (size === 3) return 1;
  if (size === 4) return 2;
  return 3;
}

export function findScoringGroups(colors, geometry = DEFAULT_GEOMETRY) {
  if (!Array.isArray(colors) || colors.length !== geometry.edges.length) {
    throw new TypeError(`colors must contain exactly ${geometry.edges.length} segment values`);
  }

  const seen = new Set();
  const groups = [];
  for (let start = 0; start < colors.length; start += 1) {
    if (seen.has(start)) continue;
    const color = colors[start];
    const stack = [start];
    const component = [];
    seen.add(start);

    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of geometry.adjacency[current]) {
        if (!seen.has(neighbor) && colors[neighbor] === color) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      }
    }

    if (component.length >= 3) {
      component.sort((a, b) => a - b);
      groups.push({
        suit: color,
        segments: component,
        size: component.length,
        power: powerForGroupSize(component.length),
      });
    }
  }

  groups.sort((a, b) => a.segments[0] - b.segments[0]);
  return groups;
}

export function scoreGroups(groups, selfSuit) {
  let selfBuff = 0;
  const bombingBySuit = Array(SUIT_COUNT).fill(0);
  for (const group of groups) {
    if (group.suit === selfSuit) selfBuff += group.power;
    else bombingBySuit[group.suit] += group.power;
  }
  return {
    selfBuff,
    bombingBySuit,
    totalBombing: bombingBySuit.reduce((sum, value) => sum + value, 0),
  };
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function componentSizeOfAssigned(colors, start, suit, geometry) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const neighbor of geometry.adjacency[current]) {
      if (!seen.has(neighbor) && colors[neighbor] === suit) {
        seen.add(neighbor);
        stack.push(neighbor);
      }
    }
  }
  return seen.size;
}

export function countImmediateScoringSwaps(colors, geometry = DEFAULT_GEOMETRY, stopAt = Infinity) {
  let count = 0;
  for (let i = 0; i < colors.length; i += 1) {
    for (const j of geometry.adjacency[i]) {
      if (i >= j || colors[i] === colors[j]) continue;
      const next = colors.slice();
      [next[i], next[j]] = [next[j], next[i]];
      if (findScoringGroups(next, geometry).length) {
        count += 1;
        if (count >= stopAt) return count;
      }
    }
  }
  return count;
}

export function generateBoard(seed, options = {}) {
  const {
    geometry = DEFAULT_GEOMETRY,
    maxAttempts = 500,
    minimumImmediateScoringSwaps = 2,
  } = options;
  const random = mulberry32(seed >>> 0);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const colors = Array(geometry.edges.length).fill(null);
    const order = [...Array(geometry.edges.length).keys()];
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let failed = false;
    for (const segment of order) {
      const suits = [0, 1, 2, 3];
      for (let i = suits.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [suits[i], suits[j]] = [suits[j], suits[i]];
      }

      let placed = false;
      for (const suit of suits) {
        colors[segment] = suit;
        if (componentSizeOfAssigned(colors, segment, suit, geometry) < 3) {
          placed = true;
          break;
        }
      }
      if (!placed) {
        failed = true;
        break;
      }
    }

    if (failed || findScoringGroups(colors, geometry).length) continue;
    if (countImmediateScoringSwaps(colors, geometry, minimumImmediateScoringSwaps) < minimumImmediateScoringSwaps) continue;

    return colors;
  }

  throw new Error(`board generation failed after ${maxAttempts} attempts for seed ${seed >>> 0}`);
}

export function applyDragPath(initialColors, path, geometry = DEFAULT_GEOMETRY) {
  if (!Array.isArray(path) || path.length < 1) {
    throw new TypeError('path must contain at least one segment id');
  }
  const colors = initialColors.slice();
  let held = path[0];
  if (!Number.isInteger(held) || held < 0 || held >= colors.length) {
    throw new RangeError(`invalid starting segment ${held}`);
  }

  const swaps = [];
  for (let index = 1; index < path.length; index += 1) {
    const target = path[index];
    if (!Number.isInteger(target) || target < 0 || target >= colors.length) {
      throw new RangeError(`invalid target segment ${target}`);
    }
    if (!geometry.adjacency[held].includes(target)) {
      throw new Error(`illegal drag step ${held} -> ${target}: segments do not share an endpoint`);
    }
    [colors[held], colors[target]] = [colors[target], colors[held]];
    swaps.push([held, target]);
    held = target;
  }

  return { colors, held, swaps };
}

export function evaluateDrag(initialColors, path, selfSuit, geometry = DEFAULT_GEOMETRY) {
  const result = applyDragPath(initialColors, path, geometry);
  const groups = findScoringGroups(result.colors, geometry);
  return {
    ...result,
    groups,
    score: scoreGroups(groups, selfSuit),
  };
}

export function createReplayReceipt({ seed, path, selfSuit }) {
  return Object.freeze({
    rulesVersion: RULES_VERSION,
    artifactVersion: ARTIFACT_VERSION,
    seed: seed >>> 0,
    path: [...path],
    selfSuit,
  });
}

export function replayReceipt(receipt, geometry = DEFAULT_GEOMETRY) {
  if (!receipt || receipt.rulesVersion !== RULES_VERSION) {
    throw new Error(`rulesVersion mismatch: expected ${RULES_VERSION}`);
  }
  const board = generateBoard(receipt.seed, { geometry });
  return evaluateDrag(board, receipt.path, receipt.selfSuit, geometry);
}

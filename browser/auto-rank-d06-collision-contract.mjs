export const D06_COLLISION_KIND = Object.freeze({
  CROSSING: 'CROSSING',
  SWAP: 'SWAP',
  REVERSE_EDGE: 'REVERSE_EDGE'
});

export const D06_NORMALIZED_EVENT_KIND = Object.freeze({
  PATH_CROSSING_NODE: 'PATH_CROSSING_NODE',
  POSITION_SWAP: 'POSITION_SWAP',
  REVERSE_EDGE_PASSAGE: 'REVERSE_EDGE_PASSAGE'
});

const D06_KINDS = new Set(Object.values(D06_COLLISION_KIND));
const D06_NORMALIZED_EVENT_TO_COLLISION_KIND = new Map([
  [D06_NORMALIZED_EVENT_KIND.PATH_CROSSING_NODE, D06_COLLISION_KIND.CROSSING],
  [D06_NORMALIZED_EVENT_KIND.POSITION_SWAP, D06_COLLISION_KIND.SWAP],
  [D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE, D06_COLLISION_KIND.REVERSE_EDGE]
]);
const D06_FAILURE_BASE = Object.freeze({
  ruleId: 'D06', applyReservation: false, keepStartPosition: true,
  honeyDelta: 0, manaDelta: 0, repairOwnReservation: true,
  repairOwnReady: true, preserveOtherLegalReservations: true
});

function normalizePath(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const normalized = [];
  for (const node of path) {
    if (typeof node !== 'string') return null;
    const value = node.trim();
    if (!value) return null;
    normalized.push(value);
  }
  return normalized;
}

const edgeKey = (from, to) => `${from}\u0000${to}`;
const localPair = (path, index) => [path[index - 1], path[index + 1]].sort().join('\u0000');

/**
 * Classify the two-path H02 path-history collision vocabulary fixed by CURRENT.
 * Raw facets remain auditable while normalizedEvents removes overlap: a direct
 * endpoint swap emits only POSITION_SWAP; reverse-edge endpoints cannot also
 * become PATH_CROSSING_NODE; same-start/shared-endpoint cases stay outside H02.
 * Invalid inputs fail closed instead of guessing semantics.
 */
export function classifyH02PathHistory(firstPath, secondPath) {
  const first = normalizePath(firstPath);
  const second = normalizePath(secondPath);
  if (!first || !second) {
    return Object.freeze({
      valid: false,
      rawFacets: Object.freeze({
        positionSwap: false,
        reverseEdgePassages: Object.freeze([]),
        pathCrossingNodes: Object.freeze([])
      }),
      normalizedEvents: Object.freeze([])
    });
  }

  const positionSwap = first.length === 2 && second.length === 2
    && first[0] === second[1] && first[1] === second[0] && first[0] !== first[1];

  const secondEdges = new Map();
  for (let index = 0; index < second.length - 1; index += 1) {
    const from = second[index], to = second[index + 1], key = edgeKey(from, to);
    const entries = secondEdges.get(key) || [];
    entries.push(Object.freeze({ path: 'second', index, from, to }));
    secondEdges.set(key, entries);
  }

  const reverseEdgePassages = [];
  const reverseEdgeEndpointNodes = new Set();
  for (let index = 0; index < first.length - 1; index += 1) {
    const from = first[index], to = first[index + 1];
    for (const match of secondEdges.get(edgeKey(to, from)) || []) {
      reverseEdgePassages.push(Object.freeze({
        first: Object.freeze({ path: 'first', index, from, to }),
        second: match
      }));
      reverseEdgeEndpointNodes.add(from);
      reverseEdgeEndpointNodes.add(to);
    }
  }

  const firstInterior = new Map();
  for (let index = 1; index < first.length - 1; index += 1) {
    const node = first[index], entries = firstInterior.get(node) || [];
    entries.push(Object.freeze({ index, localPair: localPair(first, index) }));
    firstInterior.set(node, entries);
  }

  const pathCrossingNodes = [];
  for (let index = 1; index < second.length - 1; index += 1) {
    const node = second[index], secondLocalPair = localPair(second, index);
    const firstEntries = firstInterior.get(node) || [];
    if (firstEntries.some(entry => entry.localPair !== secondLocalPair)) {
      pathCrossingNodes.push(Object.freeze({ node, secondIndex: index }));
    }
  }

  const rawFacets = Object.freeze({
    positionSwap,
    reverseEdgePassages: Object.freeze(reverseEdgePassages),
    pathCrossingNodes: Object.freeze(pathCrossingNodes)
  });
  const normalizedEvents = [];
  if (positionSwap) normalizedEvents.push(D06_NORMALIZED_EVENT_KIND.POSITION_SWAP);
  else if (reverseEdgePassages.length) normalizedEvents.push(D06_NORMALIZED_EVENT_KIND.REVERSE_EDGE_PASSAGE);
  if (pathCrossingNodes.some(({ node }) => !reverseEdgeEndpointNodes.has(node))) {
    normalizedEvents.push(D06_NORMALIZED_EVENT_KIND.PATH_CROSSING_NODE);
  }
  return Object.freeze({ valid: true, rawFacets, normalizedEvents: Object.freeze(normalizedEvents) });
}

export function toD06ReservationFailure(collisionKind) {
  if (!D06_KINDS.has(collisionKind)) return null;
  return Object.freeze({ ...D06_FAILURE_BASE, collisionKind });
}

export function toD06ReservationFailureFromNormalizedEvent(normalizedEventKind) {
  const collisionKind = D06_NORMALIZED_EVENT_TO_COLLISION_KIND.get(normalizedEventKind);
  return collisionKind ? toD06ReservationFailure(collisionKind) : null;
}

/**
 * Vertical detector→D06 adapter for the current two-path AUTO-RANK consumer.
 * It carries only the adopted fail contract; winner/priority/wait/retry/receipt
 * and fairness-threshold policy remain outside this module.
 */
export function evaluateH02PathHistoryForD06(firstPath, secondPath) {
  const classification = classifyH02PathHistory(firstPath, secondPath);
  const failures = classification.normalizedEvents
    .map(toD06ReservationFailureFromNormalizedEvent)
    .filter(Boolean);
  return Object.freeze({ valid: classification.valid, classification, failures: Object.freeze(failures) });
}

import { createBattleBoardVisualGraph } from './new-base-battle-board-visual-graph.mjs';

const SCHEMA = 'gameroad.new-base-start-platform-state.v1';
const graph = createBattleBoardVisualGraph();
const lowerNodes = new Map(graph.lowerNodes.map(node => [node.id, node]));
export const START_PLATFORMS = Object.freeze(['A','B','C','D'].map((letter, index) => Object.freeze({
  id: `start:${letter}`, destinationId: `lower:B${index * 2 + 1}`, placementOrdinal: 35 + index * 2,
})));
const platforms = new Map(START_PLATFORMS.map(platform => [platform.id, platform]));
const adjacency = new Map(graph.lowerNodes.map(node => [node.id, []]));
for (const edge of graph.lowerEdges) {
  adjacency.get(edge.fromId).push(edge.toId);
  adjacency.get(edge.toId).push(edge.fromId);
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && !['__proto__','constructor','prototype'].includes(value);
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys) {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function requireValue(condition, reason) { if (!condition) throw new TypeError(reason); }
function initialState(matchId, assignmentByParticipant) {
  return freeze({ schema: SCHEMA, matchId, revision: 0, assignmentByParticipant: {...assignmentByParticipant},
    positionsByParticipant: {...assignmentByParticipant}, consumedPadIds: [], receipts: [] });
}
function drawBelow(randomUint32, count) {
  const range = 0x100000000, limit = range - range % count;
  for (let attempt = 0; attempt < 64; attempt++) {
    const value = randomUint32();
    requireValue(integer(value) && value < range, 'INVALID_START_PLATFORM_ENTROPY');
    if (value < limit) return value % count;
  }
  throw new RangeError('START_PLATFORM_ENTROPY_RETRY_LIMIT');
}

/** One caller-authoritative match-start shuffle; render/reconnect must restore instead. */
export function createStartPlatformState({ matchId, participantIds, randomUint32 } = {}) {
  requireValue(canonical(matchId), 'INVALID_MATCH_ID');
  requireValue(Array.isArray(participantIds) && participantIds.length === 4
    && participantIds.every(canonical) && new Set(participantIds).size === 4, 'FOUR_UNIQUE_PARTICIPANTS_REQUIRED');
  requireValue(typeof randomUint32 === 'function', 'START_PLATFORM_ENTROPY_REQUIRED');
  const shuffled = START_PLATFORMS.map(platform => platform.id);
  for (let index = 3; index > 0; index--) {
    const picked = drawBelow(randomUint32, index + 1);
    [shuffled[index], shuffled[picked]] = [shuffled[picked], shuffled[index]];
  }
  return initialState(matchId, Object.fromEntries(participantIds.map((id, index) => [id, shuffled[index]])));
}

/** Lower-field scope only: no incoming start edges, upper lanes, or legacy graph. */
export function startPlatformNeighbors(state, nodeId) {
  const platform = platforms.get(nodeId);
  if (platform) return state.consumedPadIds.includes(nodeId) ? [] : [platform.destinationId];
  return [...(adjacency.get(nodeId) ?? [])];
}
function validate(state, { participantId, path, movementBudget } = {}) {
  const fail = reason => ({ ok: false, stepCount: null, remainingBudget: null, reason });
  if (!Object.hasOwn(state.positionsByParticipant, participantId)) return fail('UNKNOWN_PARTICIPANT');
  if (!integer(movementBudget)) return fail('INVALID_MOVEMENT_BUDGET');
  if (!Array.isArray(path) || path.length === 0 || !path.every(id => typeof id === 'string')) return fail('INVALID_PATH');
  if (path[0] !== state.positionsByParticipant[participantId]) return fail('PATH_ORIGIN_MISMATCH');
  if (new Set(path).size !== path.length) return fail('REPEATED_PATH_NODE');
  const stepCount = path.length - 1;
  if (stepCount === 0 && movementBudget > 0
    && path[0] === state.assignmentByParticipant[participantId]) return fail('START_DROP_REQUIRED');
  if (stepCount > movementBudget) return fail('MOVEMENT_BUDGET_EXCEEDED');
  for (let index = 1; index < path.length; index++) {
    if (!startPlatformNeighbors(state, path[index - 1]).includes(path[index])) return fail('ILLEGAL_PATH_EDGE');
  }
  return { ok: true, stepCount, remainingBudget: movementBudget - stepCount, reason: 'VALID_PATH' };
}
export function validateStartPlatformPath(state, command) {
  restoreStartPlatformState(state);
  return freeze(validate(state, command));
}
function receiptFor(command, result) {
  return { commandId: command.commandId, participantId: command.participantId, path: [...command.path],
    movementBudget: command.movementBudget, expectedRevision: command.expectedRevision,
    stepCount: result.stepCount, remainingMovementBudget: result.remainingBudget };
}
function advance(state, receipt) {
  const fromId = receipt.path[0], platform = platforms.get(fromId);
  const departed = platform !== undefined && receipt.stepCount > 0;
  const consumedPadIds = departed ? [...state.consumedPadIds, fromId].sort() : [...state.consumedPadIds];
  return freeze({ ...state, revision: state.revision + 1,
    positionsByParticipant: { ...state.positionsByParticipant, [receipt.participantId]: receipt.path.at(-1) },
    consumedPadIds, receipts: [...state.receipts, receipt] });
}
const receiptKeys = ['commandId','participantId','path','movementBudget','expectedRevision','stepCount','remainingMovementBudget'];
function sameReceipt(left, right) {
  return receiptKeys.every(key => key === 'path'
    ? Array.isArray(left.path) && Array.isArray(right.path) && left.path.length === right.path.length && left.path.every((id, index) => id === right.path[index])
    : left[key] === right[key]);
}

/** Reconstruct accepted history to reject forged positions, consumption, or receipt totals. */
export function restoreStartPlatformState(snapshot) {
  requireValue(exactKeys(snapshot, ['schema','matchId','revision','assignmentByParticipant','positionsByParticipant','consumedPadIds','receipts'])
    && snapshot.schema === SCHEMA && canonical(snapshot.matchId) && integer(snapshot.revision), 'INVALID_START_PLATFORM_SNAPSHOT');
  requireValue(object(snapshot.assignmentByParticipant), 'INVALID_START_PLATFORM_ASSIGNMENTS');
  const ids = Object.keys(snapshot.assignmentByParticipant);
  requireValue(ids.length === 4 && ids.every(canonical)
    && Object.values(snapshot.assignmentByParticipant).every(id => platforms.has(id))
    && new Set(Object.values(snapshot.assignmentByParticipant)).size === 4, 'INVALID_START_PLATFORM_ASSIGNMENTS');
  requireValue(exactKeys(snapshot.positionsByParticipant, ids)
    && Array.isArray(snapshot.consumedPadIds) && Array.isArray(snapshot.receipts)
    && snapshot.receipts.length === snapshot.revision, 'INVALID_START_PLATFORM_HISTORY');
  let rebuilt = initialState(snapshot.matchId, snapshot.assignmentByParticipant);
  const seen = new Set();
  for (const receipt of snapshot.receipts) {
    requireValue(exactKeys(receipt, receiptKeys) && canonical(receipt.commandId) && !seen.has(receipt.commandId)
      && receipt.expectedRevision === rebuilt.revision, 'INVALID_START_PLATFORM_RECEIPT');
    const validation = validate(rebuilt, receipt);
    requireValue(validation.ok && sameReceipt(receipt, receiptFor(receipt, validation)), 'INVALID_START_PLATFORM_RECEIPT');
    seen.add(receipt.commandId);
    rebuilt = advance(rebuilt, receiptFor(receipt, validation));
  }
  requireValue(ids.every(id => rebuilt.positionsByParticipant[id] === snapshot.positionsByParticipant[id])
    && JSON.stringify(rebuilt.consumedPadIds) === JSON.stringify(snapshot.consumedPadIds), 'INCONSISTENT_START_PLATFORM_SNAPSHOT');
  return rebuilt;
}

/** Atomic accepted state transition. A preview/cancel must never call this function. */
export function acceptStartPlatformPath(state, command = {}) {
  const restored = restoreStartPlatformState(state);
  const reject = reason => Object.freeze({ ok: false, state, events: Object.freeze([]), stepCount: null, remainingMovementBudget: null, duplicate: false, reason });
  if (!canonical(command.commandId)) return reject('INVALID_COMMAND_ID');
  const existing = state.receipts.find(receipt => receipt.commandId === command.commandId);
  if (existing) {
    const supplied = { ...command, stepCount: existing.stepCount, remainingMovementBudget: existing.remainingMovementBudget };
    if (!sameReceipt(existing, supplied)) return reject('COMMAND_RECEIPT_CONFLICT');
    return freeze({ ok: true, state: restored, events: [], stepCount: existing.stepCount,
      remainingMovementBudget: existing.remainingMovementBudget, duplicate: true, reason: 'ALREADY_ACCEPTED' });
  }
  if (command.expectedRevision !== state.revision) return reject('REVISION_MISMATCH');
  if (state.revision === Number.MAX_SAFE_INTEGER) return reject('REVISION_EXHAUSTED');
  const result = validate(state, command);
  if (!result.ok) return reject(result.reason);
  const receipt = receiptFor(command, result), next = advance(restored, receipt);
  const platform = platforms.get(command.path[0]);
  const events = platform && result.stepCount > 0 ? [{ type: 'START_PLATFORM_DEPARTED', participantId: command.participantId,
    platformId: platform.id, fromId: platform.id, toId: platform.destinationId }] : [];
  return freeze({ ok: true, state: next, events, stepCount: result.stepCount,
    remainingMovementBudget: result.remainingBudget, duplicate: false, reason: 'ACCEPTED' });
}

export function startPlatformSourcePoint(nodeId) {
  const platform = platforms.get(nodeId), node = lowerNodes.get(platform?.destinationId ?? nodeId);
  if (!node) return null;
  return freeze({ x: node.source.x, y: node.source.y + (platform ? 240 : 0), height: platform ? 1.4 : 0.075 });
}

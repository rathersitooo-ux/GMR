export const ROGUE_RUN_SCHEMA_VERSION = 'GAMEROAD_ROGUE_RUN_V1';

const PHASES = new Set([
  'AWAITING_ROUTE',
  'AWAITING_BATTLE_RESULT',
  'AWAITING_REWARD_DECISION',
  'READY_FOR_NEXT_NODE',
  'COMPLETE',
]);

const BATTLE_DISPOSITIONS = new Set(['REWARD', 'NEXT_NODE', 'RUN_COMPLETE']);
const REWARD_DECISIONS = new Set(['SKIP', 'SELECT']);

function fail(message) {
  throw new Error(`rogue_run:${message}`);
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail(`${name}_required`);
  return value;
}

function cloneJson(value, name = 'value') {
  if (value === undefined) fail(`${name}_required`);
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    fail(`${name}_not_json_safe`);
  }
}

function cloneOptional(value, name) {
  return value === undefined ? undefined : cloneJson(value, name);
}

function assertState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('state_invalid');
  if (state.schemaVersion !== ROGUE_RUN_SCHEMA_VERSION) fail('schema_version_invalid');
  requireString(state.runId, 'run_id');
  if (!PHASES.has(state.phase)) fail('phase_invalid');
  if (!Array.isArray(state.receiptIds)) fail('receipt_ids_invalid');
  if (state.receiptIds.some((id) => typeof id !== 'string' || !id)) fail('receipt_id_invalid');
  if (new Set(state.receiptIds).size !== state.receiptIds.length) fail('receipt_id_duplicate');
  cloneJson(state.deckSnapshot, 'deck_snapshot');
  cloneOptional(state.handSnapshot, 'hand_snapshot');
  return state;
}

function consumeReceipt(state, receiptId) {
  const id = requireString(receiptId, 'receipt_id');
  if (state.receiptIds.includes(id)) fail('duplicate_receipt');
  return [...state.receiptIds, id];
}

function baseNext(state, receiptIds) {
  return {
    ...cloneJson(state, 'state'),
    receiptIds,
  };
}

export function createRogueRunState({
  runId,
  pathSeed,
  deckSnapshot,
  handSnapshot,
  chapterIdentity,
} = {}) {
  const state = {
    schemaVersion: ROGUE_RUN_SCHEMA_VERSION,
    runId: requireString(runId, 'run_id'),
    pathSeed: cloneJson(pathSeed, 'path_seed'),
    phase: 'AWAITING_ROUTE',
    chapterIdentity: chapterIdentity === undefined ? null : cloneJson(chapterIdentity, 'chapter_identity'),
    deckSnapshot: cloneJson(deckSnapshot, 'deck_snapshot'),
    handSnapshot: handSnapshot === undefined ? null : cloneJson(handSnapshot, 'hand_snapshot'),
    currentNode: null,
    battleHandoff: null,
    lastBattleResult: null,
    lastRewardDecision: null,
    completion: null,
    receiptIds: [],
  };
  return snapshotRogueRunState(state);
}

export function applyRogueRunEvent(currentState, event = {}) {
  const state = restoreRogueRunState(currentState);
  const type = requireString(event.type, 'event_type');
  const receiptIds = consumeReceipt(state, event.receiptId);

  if (type === 'ROUTE_CONFIRMED') {
    if (state.phase !== 'AWAITING_ROUTE') fail('route_wrong_phase');
    const next = baseNext(state, receiptIds);
    next.currentNode = {
      nodeId: requireString(event.nodeId, 'node_id'),
      nodeKind: requireString(event.nodeKind, 'node_kind'),
    };
    next.lastBattleResult = null;
    next.lastRewardDecision = null;
    if (event.battleHandoff !== undefined && event.battleHandoff !== null) {
      next.battleHandoff = cloneJson(event.battleHandoff, 'battle_handoff');
      next.phase = 'AWAITING_BATTLE_RESULT';
    } else {
      next.battleHandoff = null;
      next.phase = 'READY_FOR_NEXT_NODE';
    }
    return snapshotRogueRunState(next);
  }

  if (type === 'BATTLE_RESULT_CONFIRMED') {
    if (state.phase !== 'AWAITING_BATTLE_RESULT') fail('battle_result_wrong_phase');
    if (!BATTLE_DISPOSITIONS.has(event.authoritativeDisposition)) fail('battle_disposition_invalid');
    const next = baseNext(state, receiptIds);
    next.lastBattleResult = cloneJson(event.result, 'battle_result');
    next.battleHandoff = null;
    if (event.authoritativeDisposition === 'REWARD') {
      next.phase = 'AWAITING_REWARD_DECISION';
    } else if (event.authoritativeDisposition === 'NEXT_NODE') {
      next.phase = 'READY_FOR_NEXT_NODE';
    } else {
      next.phase = 'COMPLETE';
      next.completion = cloneJson(event.completion, 'completion');
    }
    return snapshotRogueRunState(next);
  }

  if (type === 'REWARD_DECISION_CONFIRMED') {
    if (state.phase !== 'AWAITING_REWARD_DECISION') fail('reward_wrong_phase');
    if (!REWARD_DECISIONS.has(event.decision)) fail('reward_decision_invalid');
    if (event.decision === 'SELECT') requireString(event.selectedCardId, 'selected_card_id');
    const next = baseNext(state, receiptIds);
    next.lastRewardDecision = {
      decision: event.decision,
      ...(event.decision === 'SELECT' ? { selectedCardId: event.selectedCardId } : {}),
    };
    next.deckSnapshot = cloneJson(event.nextDeckSnapshot, 'next_deck_snapshot');
    if (event.nextHandSnapshot !== undefined) {
      next.handSnapshot = cloneJson(event.nextHandSnapshot, 'next_hand_snapshot');
    }
    next.phase = 'READY_FOR_NEXT_NODE';
    return snapshotRogueRunState(next);
  }

  if (type === 'ADVANCE_CONFIRMED') {
    if (state.phase !== 'READY_FOR_NEXT_NODE') fail('advance_wrong_phase');
    const next = baseNext(state, receiptIds);
    next.phase = 'AWAITING_ROUTE';
    next.currentNode = null;
    next.battleHandoff = null;
    next.lastBattleResult = null;
    next.lastRewardDecision = null;
    if (event.nextChapterIdentity !== undefined) {
      next.chapterIdentity = cloneJson(event.nextChapterIdentity, 'next_chapter_identity');
    }
    return snapshotRogueRunState(next);
  }

  fail('event_type_unsupported');
}

export function snapshotRogueRunState(state) {
  assertState(state);
  return cloneJson(state, 'state');
}

export function restoreRogueRunState(snapshot) {
  const state = cloneJson(snapshot, 'snapshot');
  assertState(state);
  return state;
}

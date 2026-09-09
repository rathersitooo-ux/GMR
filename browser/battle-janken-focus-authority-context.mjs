import {
  createBattleJankenCompoundAttackPackage,
} from './battle-janken-compound-attack-package-core.mjs';
import {
  NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE,
  NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA,
} from './new-base-round-start-janken-slot-assignment-core.mjs';

export const BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA =
  'gameroad.battle-janken-focus-authority-context.v1';

const HAND_ORDER = Object.freeze(['ROCK', 'SCISSORS', 'PAPER']);

function requiredFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function requiredObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an authority-supplied object`);
  }
  return value;
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
  return value;
}

function normalizeCurrentHand3Snapshot(value) {
  const snapshot = requiredObject(value, 'liveConsumer round snapshot');
  if (snapshot.schema !== NEW_BASE_ROUND_START_JANKEN_SLOT_ASSIGNMENT_SCHEMA) {
    throw new TypeError('liveConsumer round snapshot schema is not the existing janken-slot assignment');
  }
  if (snapshot.assignmentMode !== NEW_BASE_ROUND_START_JANKEN_ASSIGNMENT_MODE.CURRENT_HAND3_POLICY) {
    throw new Error('CURRENT_HAND3_POLICY round snapshot is required');
  }
  const roundId = requiredString(snapshot.roundId, 'liveConsumer round snapshot roundId');
  if (!Object.isFrozen(snapshot)) {
    throw new TypeError('liveConsumer round snapshot must remain immutable');
  }
  if (!Array.isArray(snapshot.slots) || snapshot.slots.length !== HAND_ORDER.length) {
    throw new Error('exactly three existing janken slots are required');
  }

  const byHand = new Map();
  const cardIds = new Set();
  for (const rawSlot of snapshot.slots) {
    const slot = requiredObject(rawSlot, 'liveConsumer round snapshot slot');
    const jankenHand = requiredString(slot.jankenHand, 'slot.jankenHand');
    if (!HAND_ORDER.includes(jankenHand) || byHand.has(jankenHand)) {
      throw new Error('round snapshot must contain one ROCK, SCISSORS and PAPER slot');
    }
    const cardId = requiredString(slot.cardId, `slot.${jankenHand}.cardId`);
    if (slot.selectable !== true || cardIds.has(cardId)) {
      throw new Error('CURRENT_HAND3_POLICY must expose three distinct selectable physical cards');
    }
    cardIds.add(cardId);
    byHand.set(jankenHand, Object.freeze({ jankenHand, cardId }));
  }
  if (!HAND_ORDER.every((hand) => byHand.has(hand))) {
    throw new Error('round snapshot must contain one ROCK, SCISSORS and PAPER slot');
  }
  return Object.freeze({ snapshot, roundId, byHand });
}

function sameAssignedCards(leftValue, rightValue) {
  try {
    const left = normalizeCurrentHand3Snapshot(leftValue);
    const right = normalizeCurrentHand3Snapshot(rightValue);
    return left.roundId === right.roundId
      && HAND_ORDER.every((hand) => left.byHand.get(hand).cardId === right.byHand.get(hand).cardId);
  } catch {
    return false;
  }
}

function validateCandidate(candidate, expected) {
  const pkg = createBattleJankenCompoundAttackPackage(candidate);
  if (pkg.jankenHand !== expected.jankenHand || pkg.cardId !== expected.cardId) {
    throw new Error('authoritative compound candidate changed assigned janken hand or physical card');
  }
  return pkg;
}

/**
 * Builds the exact-three package context required by the already-merged Focus
 * surface without becoming a game-rule authority.
 *
 * The existing live consumer remains the sole owner of the immutable Hand3
 * assignment. The same caller-supplied compound-candidate reader used by the
 * live consumer remains the sole source of target / Shield / route facts.
 * This reader only joins those two existing authority surfaces so the Focus UI
 * can display ROCK / SCISSORS / PAPER before one hand is staged.
 */
export function createBattleJankenFocusAuthorityContextReader({
  liveConsumer,
  readCompoundAttackCandidate,
} = {}) {
  const syncRoundStart = requiredFunction(liveConsumer?.syncRoundStart, 'liveConsumer.syncRoundStart')
    .bind(liveConsumer);
  const readCandidate = requiredFunction(readCompoundAttackCandidate, 'readCompoundAttackCandidate');

  return async function readBattleJankenFocusAuthorityContext({
    roundId: requestedRoundId = null,
    assignment: callerAssignment = null,
  } = {}) {
    const current = normalizeCurrentHand3Snapshot(await syncRoundStart());
    if (requestedRoundId !== null && requiredString(requestedRoundId, 'requested roundId') !== current.roundId) {
      throw new Error('SlidePad round and current Hand3 authority round do not match');
    }
    if (callerAssignment !== null && !sameAssignedCards(callerAssignment, current.snapshot)) {
      throw new Error('SlidePad assignment and current Hand3 authority assignment do not match');
    }

    const packages = [];
    for (const jankenHand of HAND_ORDER) {
      const slot = current.byHand.get(jankenHand);
      const candidate = await readCandidate(Object.freeze({
        roundId: current.roundId,
        jankenHand,
        cardId: slot.cardId,
      }));
      packages.push(validateCandidate(candidate, slot));
    }

    // Re-read only the existing immutable assignment after the three authority
    // reads. If the round changed while the context was being gathered, fail
    // closed instead of presenting a mixed-generation set.
    const afterRead = normalizeCurrentHand3Snapshot(await syncRoundStart());
    if (!sameAssignedCards(current.snapshot, afterRead.snapshot)) {
      throw new Error('Hand3 authority changed while Focus context was being read');
    }

    return Object.freeze({
      schema: BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA,
      generationId: current.roundId,
      packages: Object.freeze(packages),
      assignment: current.snapshot,
      presentationOnly: true,
      gameplayAuthority: false,
      handAssignmentAuthority: false,
      targetInference: false,
      legalTargetRecompute: false,
      routeRecompute: false,
      shieldMappingAuthority: false,
      commitTransport: false,
      gameStateWrite: false,
    });
  };
}

export const BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_CONTRACT = Object.freeze({
  schema: BATTLE_JANKEN_FOCUS_AUTHORITY_CONTEXT_SCHEMA,
  authority: 'NONE',
  handAssignmentSource: 'EXISTING_BATTLE_NEW_BASE_LIVE_CONSUMER_SYNC_ROUND_START',
  compoundCandidateSource: 'CALLER_SUPPLIED_EXISTING_COMPOUND_CANDIDATE_READER',
  requiresCurrentHand3Policy: true,
  exactThreeHands: HAND_ORDER,
  computesHandAssignment: false,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShieldMapping: false,
  commitsBattleAction: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesSlidePadRuntime: false,
  mutatesPublicPackage: false,
});

import {
  createSlotRollState,
  resolveSlotRollCommit,
  stepSlotRoll,
  wrapSlotRollIndex,
} from './slidepad-slot-roll-core.mjs';

export const BATTLE_HAND_ROULETTE_SCHEMA = 'gameroad.battle-hand-roulette.v1';
export const BATTLE_HAND_ROULETTE_TAP_RUN_SCHEMA = 'gameroad.battle-hand-roulette-tap-run.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeCandidateCardIds(candidateCardIds) {
  const seen = new Set();
  return Object.freeze((Array.isArray(candidateCardIds) ? candidateCardIds : []).flatMap((raw) => {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [id];
  }));
}

function integerCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.trunc(number));
}

function directionSign(value) {
  const sign = Math.sign(Number(value));
  return sign < 0 ? -1 : 1;
}

export function createBattleHandRouletteState({
  candidateCardIds = [],
  anchorCardId = null,
} = {}) {
  const ids = normalizeCandidateCardIds(candidateCardIds);
  const requestedAnchor = typeof anchorCardId === 'string' ? anchorCardId.trim() : '';
  const matchedAnchorIndex = ids.indexOf(requestedAnchor);
  const anchorIndex = matchedAnchorIndex >= 0 ? matchedAnchorIndex : 0;
  const roll = createSlotRollState({
    items: ids.map((id) => ({ id })),
    anchorIndex,
  });
  return deepFreeze({
    schema: BATTLE_HAND_ROULETTE_SCHEMA,
    candidateCardIds: ids,
    roll,
    selectedCardId: roll.itemId,
  });
}

export function stepBattleHandRouletteState(state, {
  steps = 1,
  direction = 1,
} = {}) {
  if (!state || state.schema !== BATTLE_HAND_ROULETTE_SCHEMA) {
    throw new Error('state must be a Battle hand roulette state');
  }
  const count = integerCount(steps);
  const sign = directionSign(direction);
  let roll = state.roll;
  for (let index = 0; index < count; index += 1) roll = stepSlotRoll(roll, sign);
  return deepFreeze({
    schema: BATTLE_HAND_ROULETTE_SCHEMA,
    candidateCardIds: state.candidateCardIds,
    roll,
    selectedCardId: roll.itemId,
  });
}

export function resolveBattleHandRouletteCommit(state, {
  currentCandidateCardIds = [],
} = {}) {
  if (!state || state.schema !== BATTLE_HAND_ROULETTE_SCHEMA) return null;
  const selectedCardId = resolveSlotRollCommit(state.roll)?.itemId ?? null;
  if (!selectedCardId) return null;
  const current = new Set(normalizeCandidateCardIds(currentCandidateCardIds));
  return current.has(selectedCardId) ? selectedCardId : null;
}

export function projectBattleHandRouletteTapRun({
  candidateCardIds = [],
  startCardId = null,
  tapCount = 0,
  direction = 1,
} = {}) {
  const ids = normalizeCandidateCardIds(candidateCardIds);
  const totalTapCount = integerCount(tapCount);
  const sign = directionSign(direction);
  const requestedStart = typeof startCardId === 'string' ? startCardId.trim() : '';
  const matchedStartIndex = ids.indexOf(requestedStart);
  const startIndex = matchedStartIndex >= 0 ? matchedStartIndex : (ids.length ? 0 : -1);
  const acceptedTapCount = Math.min(totalTapCount, ids.length);
  const cardIds = [];
  for (let offset = 0; offset < acceptedTapCount; offset += 1) {
    const index = wrapSlotRollIndex(startIndex + (offset * sign), ids.length);
    if (index >= 0) cardIds.push(ids[index]);
  }
  return deepFreeze({
    schema: BATTLE_HAND_ROULETTE_TAP_RUN_SCHEMA,
    sourceCandidateCardIds: ids,
    startCardId: startIndex >= 0 ? ids[startIndex] : null,
    direction: sign,
    tapCount: totalTapCount,
    acceptedTapCount,
    pendingTapCount: totalTapCount - acceptedTapCount,
    cardIds: Object.freeze(cardIds),
  });
}

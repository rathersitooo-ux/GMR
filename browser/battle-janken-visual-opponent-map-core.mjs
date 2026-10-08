import {
  createBattleJankenCompoundAttackPackage,
} from './battle-janken-compound-attack-package-core.mjs';

/**
 * Only the four-player, attacker-facing horizontal seat correspondence.
 * This module NEVER chooses a Shield lane, legal route or janken hand.
 * Each complete action remains owned by the existing board/round authority.
 */
export const BATTLE_JANKEN_VISUAL_POSITIONS = Object.freeze(['LEFT', 'CENTER', 'RIGHT']);
export const BATTLE_JANKEN_VISUAL_OPPONENT_MAP_SCHEMA =
  'gameroad.battle-janken-visual-opponent-map.v1';
const FOUR_PLAYER_SEATS = Object.freeze(['P1', 'P2', 'P3', 'P4']);
const HANDS = new Set(['ROCK', 'SCISSORS', 'PAPER']);

function canonicalFourPlayerSeats(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length !== 4
      || playerIds.some((id) => !FOUR_PLAYER_SEATS.includes(id))
      || new Set(playerIds).size !== 4) {
    throw new RangeError('exactly the four unique canonical seats P1/P2/P3/P4 are required');
  }
  return FOUR_PLAYER_SEATS;
}

export function mapBattleJankenVisualOpponents({ attackerId, playerIds } = {}) {
  const seats = canonicalFourPlayerSeats(playerIds);
  if (!seats.includes(attackerId)) throw new RangeError('attackerId must be one of the four players');
  const opponents = seats.filter((id) => id !== attackerId);
  return Object.freeze(BATTLE_JANKEN_VISUAL_POSITIONS.map((position, index) => Object.freeze({
    position,
    opponentId: opponents[index],
  })));
}

/**
 * Validate, do not infer, the three complete authority-supplied attack packages.
 * visualCandidates MUST already be ordered by actual screen position. Using
 * ROCK/SCISSORS/PAPER as a surrogate for visual order is not permitted.
 */
export function bindBattleJankenVisualOpponents({
  attackerId,
  playerIds,
  visualCandidates,
} = {}) {
  const slots = mapBattleJankenVisualOpponents({ attackerId, playerIds });
  if (!Array.isArray(visualCandidates) || visualCandidates.length !== 3) {
    throw new RangeError('exactly three visible candidate slots are required');
  }
  const cards = new Set();
  const hands = new Set();
  const result = slots.map((slot, index) => {
    const entry = visualCandidates[index];
    if (!entry || entry.position !== slot.position) {
      throw new RangeError('visual candidate position does not match the actual left-to-right slot');
    }
    const attack = createBattleJankenCompoundAttackPackage(entry.candidate);
    if (attack.opponentId !== slot.opponentId) {
      throw new RangeError(`candidate at ${slot.position} does not target ${slot.opponentId}`);
    }
    if (cards.has(attack.cardId) || hands.has(attack.jankenHand) || !HANDS.has(attack.jankenHand)) {
      throw new RangeError('each slot must have a distinct assigned card and janken hand');
    }
    cards.add(attack.cardId);
    hands.add(attack.jankenHand);
    return Object.freeze({ position: slot.position, opponentId: slot.opponentId, package: attack });
  });
  if (hands.size !== 3) throw new RangeError('three distinct janken hands are required');
  return Object.freeze({
    schema: BATTLE_JANKEN_VISUAL_OPPONENT_MAP_SCHEMA,
    attackerId,
    slots: Object.freeze(result),
    computesShield: false,
    computesRoute: false,
    gameStateWrite: false,
  });
}

/** Never expose attack-specific packages through an observer/spectator view. */
export function projectBattleJankenAttackerOnly(map, viewerId) {
  if (!map || map.schema !== BATTLE_JANKEN_VISUAL_OPPONENT_MAP_SCHEMA) {
    throw new TypeError('a validated visual mapping is required');
  }
  return map.attackerId === viewerId ? map.slots : null;
}

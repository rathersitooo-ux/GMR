export const NEW_BASE_DICE_ROLL_SCHEMA = 'new-base-authoritative-dice-roll-v1';

function requireId(value, name) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
  return value;
}

function requireSideCount(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('sides must be a positive safe integer supplied by the authoritative ruleset');
  }
  return value;
}

/**
 * Produce one immutable, identity-bound dice roll for a new-base turn.
 *
 * This core deliberately owns no default die shape. The current product contract
 * says to roll a die every turn, but does not fix the side count; the ruleset
 * caller therefore supplies `sides`. The entropy source is injected by the
 * authoritative runtime and must return one integer inside the requested range.
 *
 * Movement composition, path legality, reservation/revalidation, Honey effects,
 * card movement values, caps and stop rules are consumers outside this module.
 */
export function rollAuthoritativeNewBaseDice({
  matchId,
  turnId,
  rollId,
  sides,
  nextInteger,
} = {}) {
  const canonicalMatchId = requireId(matchId, 'matchId');
  const canonicalTurnId = requireId(turnId, 'turnId');
  const canonicalRollId = requireId(rollId, 'rollId');
  const sideCount = requireSideCount(sides);
  if (typeof nextInteger !== 'function') {
    throw new TypeError('nextInteger must be an injected authoritative integer source');
  }

  const request = Object.freeze({
    min: 1,
    max: sideCount,
    matchId: canonicalMatchId,
    turnId: canonicalTurnId,
    rollId: canonicalRollId,
  });
  const value = nextInteger(request);
  if (!Number.isSafeInteger(value) || value < request.min || value > request.max) {
    throw new RangeError(`authoritative dice value must be an integer in [${request.min}, ${request.max}]`);
  }

  return Object.freeze({
    schema: NEW_BASE_DICE_ROLL_SCHEMA,
    matchId: canonicalMatchId,
    turnId: canonicalTurnId,
    rollId: canonicalRollId,
    sides: sideCount,
    value,
    diceDelta: value,
  });
}

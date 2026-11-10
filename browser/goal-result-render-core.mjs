const SCHEMA = 'GAMEROAD_GOAL_RESULT_RENDER_V1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validWinnerIds(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const winners = value.map((entry) => (typeof entry === 'string' ? entry.trim() : ''));
  if (winners.some((entry) => !entry)) return null;
  if (new Set(winners).size !== winners.length) return null;
  return winners;
}

/**
 * Projects the result-screen lead lines from a finalized GOAL_REACHED result.
 *
 * The input is the finalizedResult carried by either the live Result
 * presentation (m.goalResultPresentation.finalizedResult, set when the
 * arrival animation completes) or the terminal state
 * (m.goalTerminalState.finalizedResult, set synchronously before endMatch).
 * Both hold the same content: the presentation clones the terminal state's
 * finalizedResult. renderResult reads the presentation first and falls back
 * to the terminal state, so the goal text shows even though the presentation
 * arrives after endMatch -> renderResult already ran.
 *
 * Returns null for anything that is not a well-formed GOAL_REACHED result
 * (missing actor, unknown actor, malformed winners), so the caller keeps
 * its existing result lines unchanged.
 */
export function projectGoalResultLead(finalizedResult, players = []) {
  if (!finalizedResult || typeof finalizedResult !== 'object' || Array.isArray(finalizedResult)) {
    return null;
  }
  if (finalizedResult.terminalReason !== 'GOAL_REACHED') return null;
  const winners = validWinnerIds(finalizedResult.winnerIds);
  if (!winners) return null;
  const arrival = finalizedResult.goalArrival;
  if (!arrival || typeof arrival !== 'object' || Array.isArray(arrival)) return null;
  const actorId = nonEmptyString(arrival.actorId) ? arrival.actorId.trim() : '';
  if (!actorId) return null;
  const list = Array.isArray(players) ? players : [];
  const actor = list.find((player) => player && player.id === actorId);
  if (!actor || !nonEmptyString(actor.name)) return null;
  const actorName = actor.name || (actor.human === true ? 'プレイヤー' : '');
  return deepFreeze({
    schema: SCHEMA,
    actorId,
    actorName,
    winnerIds: [...winners],
    leadText: 'ゴール到達で決着',
    arrivalSentence: `${actorName}がゴールに到達。`
  });
}

export const GOAL_RESULT_RENDER_CORE = Object.freeze({
  schema: SCHEMA,
  leadText: 'ゴール到達で決着'
});

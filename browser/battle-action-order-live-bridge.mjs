import {
  auditBattleActionOrderPresentation,
  projectBattleActionOrderChain,
} from './battle-action-order-presentation-core.mjs';

export const BATTLE_ACTION_ORDER_LIVE_BRIDGE_SCHEMA = 'gameroad.battle-action-order-live-bridge.v1';

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * The one missing link between the live battle resolution and the played-card
 * order display: take the caller-supplied played cards plus the caller's
 * authoritative processing order and triad resolution, project them through
 * the presentation-only core, and hand the frozen model to the caller's
 * presentation surface exactly once.
 *
 * The bridge owns no ordering rule, no hand comparison, no winner choice, no
 * invalidated destination and no game-state write. It only gates: an input
 * whose final states do not partition the four players, or whose processing
 * order does not match the card order, is reported to the caller and never
 * handed to the presentation surface, because presenting an order the live
 * match did not produce would be inventing gameplay.
 *
 * The live caller (GAMEROAD.html, in resolveBattle) still supplies three
 * things this file cannot know: `readActionOrderInput` (the four played
 * cards in the caller's authoritative processing order, with printed numbers
 * and janken hands when known, plus the resolution triad — resolved winners,
 * invalidated, unresolved survivors and steps — taken from the live outcome),
 * `presentActionOrder` (the screen surface; in production this feeds the
 * model into createBattleScreenModel with a compare4 plan and the battle
 * screen mount), and the moment to call `sync()` (after the battle cards
 * are revealed and the winner is decided).
 */
export function createBattleActionOrderLiveBridge({
  readActionOrderInput,
  presentActionOrder,
  projectActionOrder = projectBattleActionOrderChain,
} = {}) {
  const read = requireFunction(readActionOrderInput, 'readActionOrderInput');
  const present = requireFunction(presentActionOrder, 'presentActionOrder');
  const project = requireFunction(projectActionOrder, 'projectActionOrder');
  let inFlight = false;

  return Object.freeze({
    async sync(options = {}) {
      if (inFlight) {
        return Object.freeze({
          ok: false,
          presented: false,
          reason: 'SYNC_IN_FLIGHT',
        });
      }
      inFlight = true;
      try {
        const input = await read();
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          return Object.freeze({
            ok: false,
            presented: false,
            reason: 'ACTION_ORDER_INPUT_MISSING',
          });
        }
        let model;
        try {
          model = project({
            orderedCards: input.orderedCards,
            resolution: input.resolution,
            reducedMotion: input.reducedMotion ?? false,
            lowPerf: input.lowPerf ?? false,
          });
        } catch (error) {
          return Object.freeze({
            ok: false,
            presented: false,
            reason: String(error?.message ?? error ?? 'ACTION_ORDER_PROJECTION_FAILED'),
          });
        }
        const audit = auditBattleActionOrderPresentation(model);
        if (!audit.ok) {
          return Object.freeze({
            ok: false,
            presented: false,
            reason: `ACTION_ORDER_MODEL_REJECTED:${audit.defects.join(',')}`,
          });
        }
        const presentResult = await present(model, options);
        return Object.freeze({
          ok: true,
          presented: true,
          model,
          presentResult,
        });
      } finally {
        inFlight = false;
      }
    },

    status() {
      return Object.freeze({ inFlight });
    },
  });
}

export const BATTLE_ACTION_ORDER_LIVE_BRIDGE_CONTRACT = deepFreeze({
  schema: BATTLE_ACTION_ORDER_LIVE_BRIDGE_SCHEMA,
  projectionAuthority: 'battle-action-order-presentation-core.mjs',
  presentationSurface: 'battle-screen-presentation-core.mjs createBattleScreenModel (compare4 plan) + battle-screen-runtime-mount.mjs',
  sortingOwnedHere: false,
  comparisonOwnedHere: false,
  winnerOwnedHere: false,
  targetOwnedHere: false,
  destinationOwnedHere: false,
  gameStateWrite: false,
  invalidPresentationPolicy: 'REPORT_WITHOUT_PRESENTING',
  liveCallerSupplies: ['readActionOrderInput', 'presentActionOrder', 'sync trigger'],
});

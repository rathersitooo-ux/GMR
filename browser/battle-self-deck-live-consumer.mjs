import { createOwnerSelfRemainingDeckPresentationInput } from './battle-self-deck-owner-knowledge-adapter.mjs';
import {
  projectLiveBattleRemainingDeckPresentation,
  renderLiveBattleRemainingDeckPresentation
} from './battle-replay-live-adapter.mjs';

export const BATTLE_SELF_DECK_LIVE_CONSUMER_SCHEMA =
  'gameroad.battle-self-deck-live-consumer.v1';

function unavailable(reason) {
  return Object.freeze({ ok: false, status: 'unavailable', reason });
}

/**
 * Explicit/on-demand Battle consumer for the local owner's remaining deck.
 *
 * This function deliberately creates no deck, replay, privacy, save, or gameplay
 * authority. It reads the existing live match only through the owner-safe adapter,
 * projects through the existing remaining-deck presenter, then renders into the
 * caller-selected existing Battle information host.
 */
export function renderOwnerSelfRemainingDeckFromLiveState({
  state,
  viewer,
  revision,
  document,
  hostId = 'battleLog',
  cardLabel
} = {}) {
  const prepared = createOwnerSelfRemainingDeckPresentationInput({
    state,
    viewer,
    revision
  });
  if (!prepared?.ok) return unavailable(prepared?.reason || 'OWNER_DECK_INPUT_UNAVAILABLE');

  const presentation = projectLiveBattleRemainingDeckPresentation(prepared.presentationInput);
  if (!presentation?.ok || presentation.status !== 'ready') {
    return unavailable(presentation?.reason || 'REMAINING_DECK_PRESENTATION_UNAVAILABLE');
  }

  const rendered = renderLiveBattleRemainingDeckPresentation(presentation, {
    document,
    hostId,
    cardLabel
  });
  if (!rendered) return unavailable('REMAINING_DECK_RENDER_TARGET_UNAVAILABLE');

  return Object.freeze({
    ok: true,
    status: 'rendered',
    schema: BATTLE_SELF_DECK_LIVE_CONSUMER_SCHEMA,
    authority: prepared.authority,
    orderHidden: prepared.orderHidden === true && presentation.orderHidden === true,
    opponentDeckRead: prepared.opponentDeckRead === false,
    gameStateWrite: prepared.gameStateWrite === false,
    total: presentation.total,
    knownCount: presentation.knownCount,
    unknownCount: presentation.unknownCount,
    revision: presentation.revision
  });
}

export const BATTLE_SELF_DECK_LIVE_CONSUMER = Object.freeze({
  schema: BATTLE_SELF_DECK_LIVE_CONSUMER_SCHEMA,
  invocation: 'explicit_on_demand_only',
  sourceAuthority: 'state.match.players[].deck via existing owner-safe adapter',
  projection: 'projectLiveBattleRemainingDeckPresentation',
  renderer: 'renderLiveBattleRemainingDeckPresentation',
  defaultHostId: 'battleLog',
  orderHidden: true,
  opponentDeckRead: false,
  gameStateWrite: false
});

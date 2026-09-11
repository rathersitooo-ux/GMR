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

function findExistingPresentationRoot(document, hostId) {
  const host = document?.getElementById?.(hostId);
  return host?.querySelector?.('[data-battle-remaining-deck]') || null;
}

function concealExistingPresentation(document, hostId) {
  const root = findExistingPresentationRoot(document, hostId);
  if (!root) return;
  root.hidden = true;
  root.setAttribute?.('aria-hidden', 'true');
  root.replaceChildren?.();
}

function revealExistingPresentation(document, hostId) {
  const root = findExistingPresentationRoot(document, hostId);
  if (!root) return false;
  root.hidden = false;
  root.setAttribute?.('aria-hidden', 'false');
  return true;
}

function failClosed(reason, document, hostId) {
  concealExistingPresentation(document, hostId);
  return unavailable(reason);
}

/**
 * Explicit/on-demand Battle consumer for the local owner's remaining deck.
 *
 * This creates no deck, replay, privacy, save, or gameplay authority. It reads
 * the existing live match only through the owner-safe adapter, projects through
 * the existing remaining-deck projection, then renders into an existing Battle
 * information host. Any authorization/projection/render failure conceals stale
 * self-deck presentation instead of leaving old private information visible.
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
  if (!prepared?.ok) {
    return failClosed(
      prepared?.reason || 'OWNER_DECK_INPUT_UNAVAILABLE',
      document,
      hostId
    );
  }
  if (prepared.orderHidden !== true ||
      prepared.opponentDeckRead !== false ||
      prepared.gameStateWrite !== false) {
    return failClosed('OWNER_DECK_AUTHORITY_CONTRACT_INVALID', document, hostId);
  }

  let presentation;
  try {
    presentation = projectLiveBattleRemainingDeckPresentation(prepared.presentationInput);
  } catch {
    return failClosed('REMAINING_DECK_PRESENTATION_ERROR', document, hostId);
  }
  if (!presentation?.ok || presentation.status !== 'ready') {
    return failClosed(
      presentation?.reason || 'REMAINING_DECK_PRESENTATION_UNAVAILABLE',
      document,
      hostId
    );
  }
  if (presentation.orderHidden !== true || presentation.presentationOnly !== true) {
    return failClosed('REMAINING_DECK_PRESENTATION_CONTRACT_INVALID', document, hostId);
  }

  let rendered = false;
  try {
    rendered = renderLiveBattleRemainingDeckPresentation(presentation, {
      document,
      hostId,
      cardLabel
    });
  } catch {
    return failClosed('REMAINING_DECK_RENDER_ERROR', document, hostId);
  }
  if (!rendered || !revealExistingPresentation(document, hostId)) {
    return failClosed('REMAINING_DECK_RENDER_TARGET_UNAVAILABLE', document, hostId);
  }

  return Object.freeze({
    ok: true,
    status: 'rendered',
    schema: BATTLE_SELF_DECK_LIVE_CONSUMER_SCHEMA,
    authority: prepared.authority,
    orderHidden: true,
    opponentDeckRead: false,
    gameStateWrite: false,
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
  stalePresentationPolicy: 'conceal_on_unavailable',
  orderHidden: true,
  opponentDeckRead: false,
  gameStateWrite: false
});

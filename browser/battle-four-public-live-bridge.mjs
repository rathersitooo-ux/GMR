import { projectAcceptedBattleEventsToScreen } from './battle-screen-presentation-core.mjs';

export const BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA =
  'gameroad.battle-four-public-live-bridge.v1';

const PARTICIPANT_KEYS = new Set(['id', 'label', 'team']);
const PUBLIC_CARD_KEYS = new Set([
  'playerId',
  'cardId',
  'displayNumber',
  'hand',
  'committed',
  'visibility',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requiredObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function requiredString(value, code) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new TypeError(code);
  }
  return value;
}

function assertOnlyKeys(value, allowed, code) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${code}:${key}`);
  }
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) throw new TypeError('BATTLE_FOUR_PUBLIC_PARTICIPANTS_REQUIRED');
  return participants.map((raw, index) => {
    const participant = requiredObject(raw, `BATTLE_FOUR_PUBLIC_PARTICIPANT_INVALID:${index}`);
    assertOnlyKeys(participant, PARTICIPANT_KEYS, 'BATTLE_FOUR_PUBLIC_PARTICIPANT_UNEXPECTED_KEY');
    const normalized = {
      id: requiredString(participant.id, 'BATTLE_FOUR_PUBLIC_PARTICIPANT_ID_INVALID'),
    };
    if (participant.label != null) {
      normalized.label = requiredString(participant.label, 'BATTLE_FOUR_PUBLIC_PARTICIPANT_LABEL_INVALID');
    }
    if (participant.team != null) {
      normalized.team = requiredString(participant.team, 'BATTLE_FOUR_PUBLIC_PARTICIPANT_TEAM_INVALID');
    }
    return normalized;
  });
}

function normalizeCommittedPublicCards(publicCards) {
  if (!Array.isArray(publicCards)) throw new TypeError('BATTLE_FOUR_PUBLIC_CARDS_REQUIRED');
  return publicCards.map((raw, index) => {
    const card = requiredObject(raw, `BATTLE_FOUR_PUBLIC_CARD_INVALID:${index}`);
    assertOnlyKeys(card, PUBLIC_CARD_KEYS, 'BATTLE_FOUR_PUBLIC_CARD_UNEXPECTED_KEY');
    if (card.committed !== true) throw new TypeError('BATTLE_FOUR_PUBLIC_CARD_NOT_COMMITTED');
    if (card.visibility !== 'public') throw new TypeError('BATTLE_FOUR_PUBLIC_CARD_NOT_PUBLIC');

    const normalized = {
      playerId: requiredString(card.playerId, 'BATTLE_FOUR_PUBLIC_CARD_PLAYER_INVALID'),
      cardId: requiredString(card.cardId, 'BATTLE_FOUR_PUBLIC_CARD_ID_INVALID'),
    };
    if (card.displayNumber != null) normalized.displayNumber = card.displayNumber;
    if (card.hand != null) normalized.hand = requiredString(card.hand, 'BATTLE_FOUR_PUBLIC_CARD_HAND_INVALID');
    return normalized;
  });
}

/**
 * Converts the caller-authoritative legal reveal snapshot into the already-merged
 * Battle conveyor + four-lane screen model. This bridge owns no publicity,
 * commitment, order, winner, target, Shield or gameplay decision.
 *
 * The caller must invoke it only after all four physical Battle cards are legally
 * public. Missing cards fail closed through the existing four-public projector;
 * this bridge never manufactures a placeholder, self-card, ghost card or
 * substitute card.
 */
export function projectBattleFourPublicRevealLive({
  eventId,
  participants,
  publicCards,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const acceptedEventId = requiredString(eventId, 'BATTLE_FOUR_PUBLIC_EVENT_ID_INVALID');
  const acceptedParticipants = normalizeParticipants(participants);
  const acceptedPublicCards = normalizeCommittedPublicCards(publicCards);

  const acceptedRevealEvent = deepFreeze({
    accepted: true,
    eventId: acceptedEventId,
    kind: 'reveal',
    publicData: {
      playerIds: acceptedParticipants.map(participant => participant.id),
      publicCards: acceptedPublicCards,
    },
  });

  const timeline = projectAcceptedBattleEventsToScreen({
    participants: acceptedParticipants,
    events: [acceptedRevealEvent],
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
  });
  if (!Array.isArray(timeline.models) || timeline.models.length !== 1) {
    throw new TypeError('BATTLE_FOUR_PUBLIC_REVEAL_MODEL_INVALID');
  }

  return deepFreeze({
    schema: BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA,
    presentationOnly: true,
    authorityBoundary: 'caller_authoritative_legal_public_committed_cards_only',
    gameplayAuthority: false,
    gameStateWrite: false,
    secretProjectionAuthority: false,
    processingOrderCalculation: false,
    winnerCalculation: false,
    targetCalculation: false,
    cardIdentityInference: false,
    placeholderCardAllowed: false,
    reconnectProjection: 'PURE_IDEMPOTENT_FROM_SAME_ACCEPTED_INPUT',
    acceptedRevealEvent,
    timeline,
    model: timeline.models[0],
  });
}

export const BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT = deepFreeze({
  schema: BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA,
  inputAuthority: 'CALLER_LEGAL_PUBLIC_COMMITTED_CARDS_ONLY',
  requiresExactlyFourPublicCards: true,
  preservesCallerCardId: true,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  secretProjectionAuthority: false,
  processingOrderCalculation: false,
  winnerCalculation: false,
  targetCalculation: false,
  shieldCalculation: false,
  cardIdentityInference: false,
  placeholderCardAllowed: false,
  usesExistingBattleScreenProjector: true,
  usesExistingBattleConveyor: true,
  createsSecondRenderer: false,
  productionHtmlMutationOwnedHere: false,
  battleScreenRuntimeMutationOwnedHere: false,
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT,
  BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA,
  projectBattleFourPublicRevealLive,
} from '../browser/battle-four-public-live-bridge.mjs';

function participants() {
  return [
    { id: 'P1', label: 'P1', team: 'A' },
    { id: 'P2', label: 'P2', team: 'B' },
    { id: 'P3', label: 'P3', team: 'A' },
    { id: 'P4', label: 'P4', team: 'B' },
  ];
}

function publicCards() {
  return [
    { playerId: 'P3', cardId: 'CARD-33', displayNumber: 33, hand: 'PAPER', committed: true, visibility: 'public' },
    { playerId: 'P1', cardId: 'CARD-11', displayNumber: 11, hand: 'ROCK', committed: true, visibility: 'public' },
    { playerId: 'P4', cardId: 'CARD-44', displayNumber: 44, hand: 'SCISSORS', committed: true, visibility: 'public' },
    { playerId: 'P2', cardId: 'CARD-22', displayNumber: 22, hand: 'PAPER', committed: true, visibility: 'public' },
  ];
}

function project(overrides = {}) {
  return projectBattleFourPublicRevealLive({
    eventId: 'round-7:four-public',
    participants: participants(),
    publicCards: publicCards(),
    ...overrides,
  });
}

test('composes one accepted reveal into the existing four-lane Battle screen model', () => {
  const result = project();

  assert.equal(result.schema, BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA);
  assert.equal(result.presentationOnly, true);
  assert.equal(result.gameplayAuthority, false);
  assert.equal(result.gameStateWrite, false);
  assert.equal(result.acceptedRevealEvent.accepted, true);
  assert.equal(result.acceptedRevealEvent.kind, 'reveal');
  assert.deepEqual(result.acceptedRevealEvent.publicData.playerIds, ['P1', 'P2', 'P3', 'P4']);
  assert.equal(result.timeline.authorityBoundary, 'existing_battle_conveyor_accepted_public_event_only');
  assert.equal(result.timeline.models.length, 1);
  assert.equal(result.model.screenMode, 'BATTLE_PHASE');
  assert.equal(result.model.phase, 'reveal');
  assert.equal(result.model.eventId, 'round-7:four-public');
  assert.equal(result.model.fourLaneCausalStructure, true);
  assert.deepEqual(result.model.lanes.map(lane => lane.id), ['P1', 'P2', 'P3', 'P4']);
  assert.deepEqual(result.model.lanes.map(lane => lane.role), ['revealed', 'revealed', 'revealed', 'revealed']);
});

test('preserves exact physical card identity while binding cards by participant rather than sorting cards', () => {
  const result = project();

  assert.deepEqual(
    result.model.publicCardState.cards.map(card => [card.playerId, card.cardId, card.displayNumber, card.hand]),
    [
      ['P1', 'CARD-11', 11, 'ROCK'],
      ['P2', 'CARD-22', 22, 'PAPER'],
      ['P3', 'CARD-33', 33, 'PAPER'],
      ['P4', 'CARD-44', 44, 'SCISSORS'],
    ],
  );
  assert.deepEqual(
    result.model.lanes.map(lane => [lane.id, lane.publicCard?.cardId]),
    [
      ['P1', 'CARD-11'],
      ['P2', 'CARD-22'],
      ['P3', 'CARD-33'],
      ['P4', 'CARD-44'],
    ],
  );
  assert.equal(result.model.publicCardState.orderCalculation, false);
  assert.equal(result.model.publicCardState.winnerCalculation, false);
  assert.equal(result.model.publicCardState.targetCalculation, false);
});

test('fails closed when all four legally public committed cards are not present', () => {
  assert.throws(
    () => project({ publicCards: publicCards().slice(0, 3) }),
    /BATTLE_SCREEN_PUBLIC_CARDS_REQUIRE_FOUR/,
  );
  assert.throws(
    () => project({ publicCards: [...publicCards(), { playerId: 'P1', cardId: 'CARD-99', committed: true, visibility: 'public' }] }),
    /BATTLE_SCREEN_PUBLIC_CARDS_REQUIRE_FOUR/,
  );
});

test('reuses existing projector rejection for duplicate and unknown participant card identities', () => {
  const duplicate = publicCards();
  duplicate[3] = { ...duplicate[3], playerId: 'P1' };
  assert.throws(
    () => project({ publicCards: duplicate }),
    /BATTLE_SCREEN_PUBLIC_CARD_PLAYER_DUPLICATE:P1/,
  );

  const unknown = publicCards();
  unknown[3] = { ...unknown[3], playerId: 'P9' };
  assert.throws(
    () => project({ publicCards: unknown }),
    /BATTLE_SCREEN_PUBLIC_CARD_PLAYER_UNKNOWN:P9/,
  );
});

test('requires caller proof that every forwarded card is both committed and legally public', () => {
  const notCommitted = publicCards();
  notCommitted[0] = { ...notCommitted[0], committed: false };
  assert.throws(
    () => project({ publicCards: notCommitted }),
    /BATTLE_FOUR_PUBLIC_CARD_NOT_COMMITTED/,
  );

  const privateCard = publicCards();
  privateCard[0] = { ...privateCard[0], visibility: 'private' };
  assert.throws(
    () => project({ publicCards: privateCard }),
    /BATTLE_FOUR_PUBLIC_CARD_NOT_PUBLIC/,
  );
});

test('rejects private-state-shaped extras instead of silently forwarding them into presentation', () => {
  const leakedCard = publicCards();
  leakedCard[0] = { ...leakedCard[0], battleId: 'SECRET-BATTLE-ID' };
  assert.throws(
    () => project({ publicCards: leakedCard }),
    /BATTLE_FOUR_PUBLIC_CARD_UNEXPECTED_KEY:battleId/,
  );

  const leakedParticipant = participants();
  leakedParticipant[0] = { ...leakedParticipant[0], hand: ['SECRET-HAND-CARD'] };
  assert.throws(
    () => project({ participants: leakedParticipant }),
    /BATTLE_FOUR_PUBLIC_PARTICIPANT_UNEXPECTED_KEY:hand/,
  );
});

test('reconnect projection is pure and idempotent for the same accepted public snapshot', () => {
  const inputParticipants = participants();
  const inputCards = publicCards();
  const beforeParticipants = JSON.stringify(inputParticipants);
  const beforeCards = JSON.stringify(inputCards);

  const first = projectBattleFourPublicRevealLive({
    eventId: 'round-7:four-public',
    participants: inputParticipants,
    publicCards: inputCards,
  });
  const second = projectBattleFourPublicRevealLive({
    eventId: 'round-7:four-public',
    participants: inputParticipants,
    publicCards: inputCards,
  });

  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(inputParticipants), beforeParticipants);
  assert.equal(JSON.stringify(inputCards), beforeCards);
  assert.equal(first.reconnectProjection, 'PURE_IDEMPOTENT_FROM_SAME_ACCEPTED_INPUT');
});

test('ReducedMotion and LowPerf preserve the same four public card identities and reveal semantics', () => {
  const normal = project();
  const reduced = project({ reducedMotion: true });
  const lowPerf = project({ lowPerf: true });
  const identities = model => model.lanes.map(lane => [lane.id, lane.publicCard?.cardId]);

  assert.deepEqual(identities(reduced.model), identities(normal.model));
  assert.deepEqual(identities(lowPerf.model), identities(normal.model));
  assert.equal(reduced.model.phase, 'reveal');
  assert.equal(lowPerf.model.phase, 'reveal');
  assert.equal(reduced.model.motion, 'static_only');
  assert.equal(lowPerf.model.motion, 'static_only');
  assert.equal(normal.model.motion, 'allowed');
});

test('bridge contract owns no order, winner, target, Shield, identity or gameplay authority', () => {
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_SCHEMA, 'gameroad.battle-four-public-live-bridge.v1');
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.requiresExactlyFourPublicCards, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.preservesCallerCardId, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.presentationOnly, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.secretProjectionAuthority, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.processingOrderCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.winnerCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.targetCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.shieldCalculation, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.cardIdentityInference, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.placeholderCardAllowed, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.usesExistingBattleScreenProjector, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.usesExistingBattleConveyor, true);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.createsSecondRenderer, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.productionHtmlMutationOwnedHere, false);
  assert.equal(BATTLE_FOUR_PUBLIC_LIVE_BRIDGE_CONTRACT.battleScreenRuntimeMutationOwnedHere, false);
});

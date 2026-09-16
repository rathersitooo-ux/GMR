import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_HIDDEN_HAND_CONTRACT,
  BATTLE_HIDDEN_HAND_ROAD_SOURCE,
  BATTLE_HIDDEN_HAND_STATUS,
  allocateBattleHiddenHandReservation,
  applyBattleHiddenHandAuthoritativeRoadCommit,
  hasBattleHiddenHandPrivilegeForPhysicalCard,
  projectBattleHiddenHandView,
  reconcileBattleHiddenHandRecovery,
  resolveBattleHiddenHandRoadChoice,
} from '../browser/battle-hidden-hand-core.mjs';

const roadA = Object.freeze({ physicalId: 'P-R-A', type: 'ROAD', cardId: 'ROAD-A' });
const roadB = Object.freeze({ physicalId: 'P-R-B', type: 'ROAD', cardId: 'ROAD-B' });
const battleA = Object.freeze({ physicalId: 'P-B-A', type: 'BATTLE', cardId: 'BATTLE-A' });

const identityOf = (card) => card.physicalId;
const isRoadCard = (card) => card.type === 'ROAD';

function freshAllocation(overrides = {}) {
  return allocateBattleHiddenHandReservation({
    ownerPlayerId: 'P1',
    normalDeckCards: [roadA, battleA, roadB],
    reservedCardIdentity: roadA.physicalId,
    identityOf,
    isRoadCard,
    ...overrides,
  });
}

test('allocates exactly one caller-selected ROAD physical card without choosing or cloning it', () => {
  const allocation = freshAllocation();

  assert.equal(allocation.state.status, BATTLE_HIDDEN_HAND_STATUS.RESERVED);
  assert.strictEqual(allocation.reservedCard, roadA);
  assert.strictEqual(allocation.state.reservedCard, roadA);
  assert.equal(allocation.state.reservedCardIdentity, 'P-R-A');
  assert.deepEqual(allocation.remainingNormalDeckCards, [battleA, roadB]);
  assert.strictEqual(allocation.remainingNormalDeckCards[0], battleA);
  assert.strictEqual(allocation.remainingNormalDeckCards[1], roadB);
  assert.equal(allocation.state.privilegeAvailable, true);
  assert.equal(allocation.state.privilegeConsumed, false);
  assert.equal(allocation.state.reservationActive, true);
  assert.equal(allocation.selectionAuthority, false);
  assert.equal(allocation.deckAuthority, false);
  assert.equal(allocation.gameStateWrite, false);
});

test('reservation fails closed unless the caller identifies exactly one ROAD physical card', () => {
  assert.throws(
    () => freshAllocation({ reservedCardIdentity: 'UNKNOWN' }),
    /EXACT_ONE_RESERVED_PHYSICAL_CARD_REQUIRED/,
  );
  assert.throws(
    () => freshAllocation({ reservedCardIdentity: battleA.physicalId }),
    /RESERVED_CARD_MUST_BE_ROAD/,
  );
  assert.throws(
    () => freshAllocation({ normalDeckCards: [roadA, roadA, roadB] }),
    /EXACT_ONE_RESERVED_PHYSICAL_CARD_REQUIRED/,
  );
  assert.throws(
    () => freshAllocation({ identityOf: null }),
    /IDENTITY_OF_FUNCTION_REQUIRED/,
  );
  assert.throws(
    () => freshAllocation({ isRoadCard: null }),
    /IS_ROAD_CARD_FUNCTION_REQUIRED/,
  );
});

test('reserved identity is owner-only while the card remains hidden', () => {
  const state = freshAllocation().state;
  const ownerView = projectBattleHiddenHandView(state, { viewerPlayerId: 'P1' });
  const opponentView = projectBattleHiddenHandView(state, { viewerPlayerId: 'P2' });

  assert.equal(ownerView.owner, true);
  assert.equal(ownerView.hasReservedCard, true);
  assert.equal(ownerView.privilegeAvailable, true);
  assert.equal(ownerView.reservedCardIdentity, 'P-R-A');
  assert.strictEqual(ownerView.reservedCard, roadA);

  assert.equal(opponentView.owner, false);
  assert.equal(opponentView.hasReservedCard, null);
  assert.equal(opponentView.privilegeAvailable, null);
  assert.equal(opponentView.reservedCardIdentity, null);
  assert.equal(opponentView.reservedCard, null);
  assert.equal(opponentView.identityPublic, false);
});

test('Hidden Hand Road choice returns the same reserved physical card and does not consume on staging', () => {
  const state = freshAllocation().state;
  const choice = resolveBattleHiddenHandRoadChoice({
    state,
    source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND,
  });

  assert.equal(choice.ok, true);
  assert.equal(choice.source, 'HIDDEN_HAND');
  assert.strictEqual(choice.card, roadA);
  assert.equal(choice.physicalCardIdentity, 'P-R-A');
  assert.equal(choice.consumesPrivilegeNow, false);
  assert.equal(state.privilegeAvailable, true);
  assert.equal(state.privilegeConsumed, false);
});

test('one Road choice cannot mix ordinary and Hidden Hand sources or duplicate the reserved physical identity', () => {
  const state = freshAllocation().state;

  assert.throws(
    () => resolveBattleHiddenHandRoadChoice({
      state,
      source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND,
      ordinaryCard: roadB,
      ordinaryCardIdentity: roadB.physicalId,
    }),
    /ROAD_SOURCE_MUST_NOT_MIX_ORDINARY_AND_HIDDEN/,
  );

  assert.throws(
    () => resolveBattleHiddenHandRoadChoice({
      state,
      source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.ORDINARY_HAND,
      ordinaryCard: roadA,
      ordinaryCardIdentity: roadA.physicalId,
    }),
    /RESERVED_PHYSICAL_CARD_CANNOT_BE_ORDINARY_SOURCE/,
  );

  const ordinary = resolveBattleHiddenHandRoadChoice({
    state,
    source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.ORDINARY_HAND,
    ordinaryCard: roadB,
    ordinaryCardIdentity: roadB.physicalId,
  });
  assert.equal(ordinary.ok, true);
  assert.strictEqual(ordinary.card, roadB);
  assert.equal(ordinary.physicalCardIdentity, 'P-R-B');
  assert.equal(ordinary.consumesPrivilegeNow, false);
});

test('invalid or uncommitted attempts never consume Hidden Hand privilege', () => {
  const state = freshAllocation().state;

  const invalid = applyBattleHiddenHandAuthoritativeRoadCommit(state, {
    committedPhysicalCardIdentity: roadA.physicalId,
    authoritativeLegalRoadCommit: false,
  });
  assert.strictEqual(invalid.state, state);
  assert.equal(invalid.privilegeConsumedNow, false);
  assert.equal(invalid.reason, 'LEGAL_COMMIT_NOT_CONFIRMED');
  assert.equal(invalid.state.privilegeAvailable, true);

  const otherCard = applyBattleHiddenHandAuthoritativeRoadCommit(state, {
    committedPhysicalCardIdentity: roadB.physicalId,
    authoritativeLegalRoadCommit: true,
  });
  assert.strictEqual(otherCard.state, state);
  assert.equal(otherCard.privilegeConsumedNow, false);
  assert.equal(otherCard.reason, 'OTHER_CARD_COMMITTED');
  assert.equal(otherCard.state.privilegeAvailable, true);
});

test('privilege is consumed exactly on caller-confirmed legal Road commit of the reserved physical card', () => {
  const state = freshAllocation().state;
  const committed = applyBattleHiddenHandAuthoritativeRoadCommit(state, {
    committedPhysicalCardIdentity: roadA.physicalId,
    authoritativeLegalRoadCommit: true,
  });

  assert.equal(committed.privilegeConsumedNow, true);
  assert.equal(committed.reason, 'AUTHORITATIVE_LEGAL_RESERVED_ROAD_COMMIT');
  assert.strictEqual(committed.reservedCard, roadA);
  assert.equal(committed.state.status, BATTLE_HIDDEN_HAND_STATUS.CONSUMED);
  assert.equal(committed.state.reservationActive, false);
  assert.equal(committed.state.privilegeAvailable, false);
  assert.equal(committed.state.privilegeConsumed, true);
  assert.equal(committed.gameplayAuthority, false);
  assert.equal(committed.gameStateWrite, false);

  const repeated = applyBattleHiddenHandAuthoritativeRoadCommit(committed.state, {
    committedPhysicalCardIdentity: roadA.physicalId,
    authoritativeLegalRoadCommit: true,
  });
  assert.strictEqual(repeated.state, committed.state);
  assert.equal(repeated.privilegeConsumedNow, false);
  assert.equal(repeated.reason, 'ALREADY_CONSUMED');
});

test('a copied card with a different physical identity does not inherit the privilege', () => {
  const state = freshAllocation().state;

  assert.equal(hasBattleHiddenHandPrivilegeForPhysicalCard(state, 'P-R-A'), true);
  assert.equal(hasBattleHiddenHandPrivilegeForPhysicalCard(state, 'COPY-P-R-A'), false);

  const consumed = applyBattleHiddenHandAuthoritativeRoadCommit(state, {
    committedPhysicalCardIdentity: 'P-R-A',
    authoritativeLegalRoadCommit: true,
  }).state;
  assert.equal(hasBattleHiddenHandPrivilegeForPhysicalCard(consumed, 'P-R-A'), false);
});

test('recovery uses authoritative state and never restores a consumed privilege from stale local state', () => {
  const available = freshAllocation().state;
  const consumed = applyBattleHiddenHandAuthoritativeRoadCommit(available, {
    committedPhysicalCardIdentity: 'P-R-A',
    authoritativeLegalRoadCommit: true,
  }).state;

  const recovered = reconcileBattleHiddenHandRecovery({
    authoritativeState: consumed,
    localState: available,
  });

  assert.strictEqual(recovered.state, consumed);
  assert.equal(recovered.state.privilegeAvailable, false);
  assert.equal(recovered.state.privilegeConsumed, true);
  assert.equal(recovered.discardedLocalState, true);
  assert.equal(recovered.restoredPrivilege, false);
  assert.equal(recovered.gameStateWrite, false);
});

test('consumed reservation does not expose a reusable Hidden Hand Road choice', () => {
  const available = freshAllocation().state;
  const consumed = applyBattleHiddenHandAuthoritativeRoadCommit(available, {
    committedPhysicalCardIdentity: 'P-R-A',
    authoritativeLegalRoadCommit: true,
  }).state;

  const choice = resolveBattleHiddenHandRoadChoice({
    state: consumed,
    source: BATTLE_HIDDEN_HAND_ROAD_SOURCE.HIDDEN_HAND,
  });
  assert.equal(choice.ok, false);
  assert.equal(choice.reason, 'HIDDEN_HAND_PRIVILEGE_UNAVAILABLE');
  assert.equal(choice.card, null);
});

test('contract keeps selection, legality, Mana, UI, save, deck mutation and gameplay writes outside this core', () => {
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.reservedCardCount, 1);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.reservedCardClass, 'ROAD');
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.roadChoice, 'ORDINARY_HAND_OR_HIDDEN_HAND_NOT_BOTH');
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.invalidOrUncommittedAttemptConsumes, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.recoveryRestoresPrivilege, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.copiedCardInheritsPrivilege, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.extraBuffs, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.extraRankRarityTeamRestrictions, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.choosesReservedCard, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.computesRoadLegality, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.computesManaCost, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.mutatesDeck, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.writesGameState, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.mutatesProductionHtml, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.ownsUi, false);
  assert.equal(BATTLE_HIDDEN_HAND_CONTRACT.ownsSave, false);
});

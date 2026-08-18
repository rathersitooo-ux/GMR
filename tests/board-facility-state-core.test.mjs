import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_FACILITY_STATE_CORE,
  beginFacilityRound,
  createBoardFacilityState,
  depositArenaCard,
  endFacilityMatch,
  prepareArenaBattle,
  purchaseShopProduct,
  resolveArenaBattle,
  settleArena,
} from '../browser/board-facility-state-core.mjs';

const PERMANENT = Object.freeze({
  unlockIds: ['unlock-a'],
  savedDeckSignature: 'deck-stable',
});

function baseState(overrides = {}) {
  return createBoardFacilityState({
    playerId: 'p1',
    round: 4,
    honey: 10,
    permanent: PERMANENT,
    cards: [
      { id: 'card-a', ownerId: 'p1' },
      { id: 'card-b', ownerId: 'p1' },
      { id: 'card-other', ownerId: 'p2' },
    ],
    reservations: {},
    shopCatalogRevision: 'shop-r7',
    shopProducts: {
      itemA: { cost: 3, grantCard: { id: 'shop-card-a', ownerId: 'p1' } },
    },
    arenaCatalogRevision: 'arena-r9',
    ...overrides,
  });
}

function deposit(state = baseState(), overrides = {}) {
  return depositArenaCard(state, {
    requestId: 'arena-req-1',
    catalogRevision: 'arena-r9',
    opponentRef: 'opaque-opponent-ref',
    cardId: 'card-a',
    cost: 2,
    ...overrides,
  });
}

function prepared(state = baseState(), overrides = {}) {
  const deposited = deposit(state, overrides.deposit).state;
  return prepareArenaBattle(deposited, {
    requestId: 'arena-req-1',
    battleId: 'battle-1',
    success: true,
    ...overrides.prepare,
  }).state;
}

function resolved(outcome, { state = baseState(), rewardRef = outcome === 'win' ? 'opaque-reward-ref' : null } = {}) {
  return resolveArenaBattle(prepared(state), {
    battleId: 'battle-1',
    outcome,
    rewardRef,
  });
}

// G: shop contract, six evidence cases.
test('G1 purchase success is atomic and the purchased card waits until the next round boundary', () => {
  const initial = baseState();
  const result = purchaseShopProduct(initial, {
    requestId: 'shop-req-1',
    catalogRevision: 'shop-r7',
    productId: 'itemA',
  });
  assert.equal(BOARD_FACILITY_STATE_CORE.schema, 'gameroad.board-facility-state.v1');
  assert.equal(result.status, 'accepted');
  assert.equal(result.state.honey, 7);
  assert.equal(result.state.availableCards.some(card => card.id === 'shop-card-a'), false);
  assert.deepEqual(result.state.pendingReturns.map(entry => entry.card.id), ['shop-card-a']);
  const nextRound = beginFacilityRound(result.state, { round: 5 });
  assert.equal(nextRound.state.availableCards.some(card => card.id === 'shop-card-a'), true);
});

test('G2 duplicate purchase request cannot charge or grant twice', () => {
  const first = purchaseShopProduct(baseState(), {
    requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'itemA',
  });
  const duplicate = purchaseShopProduct(first.state, {
    requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'itemA',
  });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.honey, 7);
  assert.equal(duplicate.state.pendingReturns.length, 1);
});

test('G3 insufficient honey leaves the complete state unchanged', () => {
  const initial = baseState({ honey: 2 });
  const result = purchaseShopProduct(initial, {
    requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'itemA',
  });
  assert.equal(result.reason, 'INSUFFICIENT_HONEY');
  assert.equal(result.state, initial);
});

test('G4 shop catalog revision mismatch is rejected without mutation', () => {
  const initial = baseState();
  const result = purchaseShopProduct(initial, {
    requestId: 'shop-req-1', catalogRevision: 'shop-old', productId: 'itemA',
  });
  assert.equal(result.reason, 'SHOP_CATALOG_REVISION_MISMATCH');
  assert.equal(result.state, initial);
});

test('G5 unregistered shop product is rejected without mutation', () => {
  const initial = baseState();
  const result = purchaseShopProduct(initial, {
    requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'unknown',
  });
  assert.equal(result.reason, 'PRODUCT_NOT_REGISTERED');
  assert.equal(result.state, initial);
});

test('G6 purchase after match end is rejected', () => {
  const ended = endFacilityMatch(baseState()).state;
  const result = purchaseShopProduct(ended, {
    requestId: 'shop-req-1', catalogRevision: 'shop-r7', productId: 'itemA',
  });
  assert.equal(result.reason, 'MATCH_ENDED');
  assert.equal(result.state, ended);
});

// H: arena contract, sixteen evidence cases.
test('H1 arena deposit atomically charges honey and moves one owned card into the deposit region', () => {
  const result = deposit();
  assert.equal(result.status, 'accepted');
  assert.equal(result.state.honey, 8);
  assert.equal(result.state.availableCards.some(card => card.id === 'card-a'), false);
  assert.equal(result.state.arenaPending.card.id, 'card-a');
  assert.deepEqual(result.state.permanent, PERMANENT);
});

test('H2 duplicate arena deposit request cannot charge or deposit twice', () => {
  const first = deposit();
  const duplicate = deposit(first.state);
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.state, first.state);
  assert.equal(duplicate.state.honey, 8);
});

test('H3 a card reserved for another purpose cannot be deposited', () => {
  const initial = baseState({ reservations: { 'card-a': 'deck-edit' } });
  const result = deposit(initial);
  assert.equal(result.reason, 'CARD_RESERVED_ELSEWHERE');
  assert.equal(result.state, initial);
});

test('H4 insufficient honey leaves the complete arena state unchanged', () => {
  const initial = baseState({ honey: 1 });
  const result = deposit(initial);
  assert.equal(result.reason, 'INSUFFICIENT_HONEY');
  assert.equal(result.state, initial);
});

test('H5 only one unresolved arena record is allowed per player', () => {
  const first = deposit();
  const second = depositArenaCard(first.state, {
    requestId: 'arena-req-2', catalogRevision: 'arena-r9', opponentRef: 'other', cardId: 'card-b', cost: 1,
  });
  assert.equal(second.reason, 'ARENA_ALREADY_UNRESOLVED');
  assert.equal(second.state, first.state);
});

test('H6 battle preparation failure fully restores honey and the deposited card', () => {
  const initial = baseState();
  const deposited = deposit(initial).state;
  const failed = prepareArenaBattle(deposited, {
    requestId: 'arena-req-1', battleId: 'battle-never-started', success: false,
  });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.state.honey, initial.honey);
  assert.equal(failed.state.availableCards.some(card => card.id === 'card-a'), true);
  assert.equal(failed.state.arenaPending, null);
  assert.deepEqual(failed.state.permanent, initial.permanent);
});

test('H7 win waits for the next round before returning the card and reward reference', () => {
  const win = resolved('win');
  assert.equal(win.reason, 'ARENA_WIN_WAITING_NEXT_ROUND');
  assert.equal(win.state.availableCards.some(card => card.id === 'card-a'), false);
  assert.equal(win.state.arenaSettlement.eligibleRound, 5);
  assert.equal(win.state.arenaSettlement.rewardRef, 'opaque-reward-ref');
});

test('H8 loss removes only the current-match card instance and preserves permanent assets', () => {
  const initial = baseState();
  const loss = resolved('loss', { state: initial });
  assert.equal(loss.reason, 'ARENA_LOSS_APPLIED');
  assert.deepEqual(loss.state.lostThisMatch.map(card => card.id), ['card-a']);
  assert.deepEqual(loss.state.permanent, initial.permanent);
  assert.equal(loss.state.availableCards.some(card => card.id === 'card-b'), true);
});

test('H9 draw queues only the card return and never a reward', () => {
  const draw = resolved('draw');
  assert.equal(draw.reason, 'ARENA_DRAW_WAITING_NEXT_ROUND');
  assert.equal(draw.state.arenaSettlement.rewardRef, null);
  assert.equal(draw.state.availableCards.some(card => card.id === 'card-a'), false);
});

test('H10 same-round early arena settlement is rejected without mutation', () => {
  const waiting = resolved('win').state;
  const early = settleArena(waiting, { settlementId: 'settle-1' });
  assert.equal(early.reason, 'SETTLEMENT_TOO_EARLY');
  assert.equal(early.state, waiting);
});

test('H11 win settles exactly once at the next-round boundary', () => {
  const waiting = resolved('win').state;
  const nextRound = beginFacilityRound(waiting, { round: 5 }).state;
  const first = settleArena(nextRound, { settlementId: 'settle-1' });
  assert.equal(first.status, 'accepted');
  assert.deepEqual(first.effects, { returnedCardId: 'card-a', rewardRef: 'opaque-reward-ref' });
  const duplicate = settleArena(first.state, { settlementId: 'settle-1' });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.state, first.state);
});

test('H12 draw settles exactly once at the next-round boundary with card return only', () => {
  const waiting = resolved('draw').state;
  const nextRound = beginFacilityRound(waiting, { round: 5 }).state;
  const first = settleArena(nextRound, { settlementId: 'settle-draw' });
  assert.deepEqual(first.effects, { returnedCardId: 'card-a', rewardRef: null });
  const duplicate = settleArena(first.state, { settlementId: 'settle-draw' });
  assert.equal(duplicate.status, 'duplicate');
});

test('H13 match end clears unresolved return/reward state without promoting it into available assets', () => {
  const waiting = resolved('win').state;
  const ended = endFacilityMatch(waiting);
  assert.equal(ended.state.arenaSettlement, null);
  assert.equal(ended.state.availableCards.some(card => card.id === 'card-a'), false);
  assert.deepEqual(ended.state.permanent, waiting.permanent);
});

test('H14 match end during deposit clears transient arena state and does not alter permanent assets', () => {
  const initial = baseState();
  const deposited = deposit(initial).state;
  const ended = endFacilityMatch(deposited);
  assert.equal(ended.state.arenaPending, null);
  assert.deepEqual(ended.state.permanent, initial.permanent);
  assert.equal(ended.state.matchActive, false);
});

test('H15 another player card cannot be deposited', () => {
  const initial = baseState();
  const result = deposit(initial, { cardId: 'card-other' });
  assert.equal(result.reason, 'CARD_NOT_OWNED');
  assert.equal(result.state, initial);
});

test('H16 arena catalog revision mismatch is rejected without mutation', () => {
  const initial = baseState();
  const result = deposit(initial, { catalogRevision: 'arena-old' });
  assert.equal(result.reason, 'ARENA_CATALOG_REVISION_MISMATCH');
  assert.equal(result.state, initial);
});

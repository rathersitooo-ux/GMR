import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_CARD_STATE,
  compatible,
  compatibleRoadCards,
  createDraftMove,
  reconcileDraftMovePath,
  focusRoadCard,
  clearRoadFocus,
  undoDraftMoveStep,
  cancelDraftMove,
  confirmDraftMove,
} from '../browser/road-move-draft-core.mjs';

const road = value => Object.freeze({ id: `ROAD_${value}`, value });
const R = Object.freeze([1,2,3,4,5,6].map(road));
const path = steps => Object.freeze(Array.from({ length: steps + 1 }, (_, index) => `P${index}`));

function board(version = 'B1') {
  return {
    currentBoardVersion: version,
    roadValueOf(card) { return card?.value; },
    cardKeyOf(card) { return card?.id; },
    pathStepCountOf(value) { return value.length - 1; },
    isPathLegal(value) { return value.length >= 1 && new Set(value).size === value.length; },
    isPathStoppable(value) { return !String(value.at(-1)).startsWith('BLOCK'); },
  };
}

function context(handRoadCards, extra = {}) {
  const boardState = extra.boardState ?? board();
  return {
    handRoadCards,
    boardState,
    reducedMotion: extra.reducedMotion ?? false,
    lowPerf: extra.lowPerf ?? false,
    reachableForCard: extra.reachableForCard ?? ((card, currentPath) => {
      const used = currentPath.length - 1;
      return Array.from({ length: Math.max(0, card.value - used) }, (_, index) => `P${used + index + 1}`);
    }),
    targetKeyOf: value => value,
  };
}

for (const card of R) {
  test(`Road${card.value} uses value as an upper bound`, () => {
    const b = board();
    for (let steps = 1; steps <= card.value; steps += 1) {
      assert.equal(compatible(card, path(steps), b), true, `Road${card.value} should allow ${steps}`);
    }
    assert.equal(compatible(card, path(card.value + 1), b), false);
  });
}

test('move-first derives every compatible held Road card without auto-selection', () => {
  const ctx = context([R[0], R[2], R[4]]);
  const draft = createDraftMove({ currentPath: path(0), boardVersion: 'B1' }, ctx);
  const moved = reconcileDraftMovePath(draft, path(2), ctx);
  assert.deepEqual(moved.compatibleRoadCards.map(card => card.value), [3,5]);
  assert.equal(moved.focusedRoadCard, null);
  assert.equal(moved.softFocusRoadCard, null);
  assert.equal(moved.validity.requiresExplicitChoice, true);
  assert.equal(moved.autoSelectedRoadCard, null);
  assert.deepEqual(moved.cardStates.map(entry => entry.state), [
    ROAD_CARD_STATE.NORMAL,
    ROAD_CARD_STATE.COMPATIBLE,
    ROAD_CARD_STATE.COMPATIBLE,
  ]);
});

test('card-first focus is order-neutral and confirms a legal <= value path', () => {
  const ctx = context([R[2], R[4]]);
  let draft = createDraftMove({ currentPath: path(0), boardVersion: 'B1' }, ctx);
  draft = focusRoadCard(draft, R[2], ctx);
  draft = reconcileDraftMovePath(draft, path(3), ctx);
  assert.equal(draft.validity.focusState, ROAD_CARD_STATE.FOCUSED);
  assert.equal(draft.focusedRoadCard.id, R[2].id);
  const confirmation = confirmDraftMove(draft, ctx);
  assert.equal(confirmation.ok, true);
  assert.equal(confirmation.roadCard.id, R[2].id);
  assert.equal(confirmation.selectionSource, 'EXPLICIT_FOCUS');
});

test('Elastic Focus preserves a longer path, marks old focus invalid, and exposes a compatible switch', () => {
  const ctx = context([R[2], R[4]]);
  let draft = createDraftMove({ currentPath: path(0), boardVersion: 'B1' }, ctx);
  draft = focusRoadCard(draft, R[2], ctx);
  draft = reconcileDraftMovePath(draft, path(4), ctx);
  assert.deepEqual(draft.currentPath, path(4));
  assert.equal(draft.validity.focusState, ROAD_CARD_STATE.INVALID_FOCUS);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [5]);
  assert.equal(draft.softFocusRoadCard.id, R[4].id);
  assert.equal(draft.autoSelectedRoadCard, null);
  const switched = focusRoadCard(draft, R[4], ctx);
  assert.deepEqual(switched.currentPath, path(4));
  assert.equal(switched.focusedRoadCard.id, R[4].id);
  assert.equal(switched.validity.focusState, ROAD_CARD_STATE.FOCUSED);
  assert.equal(confirmDraftMove(switched, ctx).ok, true);
});

test('focused strong range and alternate expandable range remain distinct', () => {
  const ctx = context([R[2], R[4]]);
  let draft = createDraftMove({ currentPath: path(2), boardVersion: 'B1' }, ctx);
  draft = focusRoadCard(draft, R[2], ctx);
  assert.deepEqual(draft.strongReachablePositionIds, ['P3']);
  assert.deepEqual(draft.expandableReachablePositionIds, ['P4','P5']);
});

test('backtracking recomputes candidates from the current path instead of restoring candidate history', () => {
  const ctx = context([R[1], R[3], R[4], R[5]]);
  let draft = createDraftMove({ currentPath: path(5), boardVersion: 'B1' }, ctx);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [5,6]);
  draft = undoDraftMoveStep(draft, ctx);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [4,5,6]);
  draft = undoDraftMoveStep(undoDraftMoveStep(draft, ctx), ctx);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [2,4,5,6]);
});

test('cancel resets only the draft path/focus and recomputes candidates', () => {
  const battleState = Object.freeze({ selectedBattleCardId: 'BATTLE_X', reservation: 'KEEP' });
  const ctx = context([R[0], R[2], R[4]]);
  let draft = createDraftMove({ currentPath: path(2), focusedRoadCard: R[2], boardVersion: 'B1' }, ctx);
  draft = cancelDraftMove(draft, ctx);
  assert.deepEqual(draft.currentPath, ['P0']);
  assert.equal(draft.focusedRoadCard, null);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [1,3,5]);
  assert.deepEqual(battleState, { selectedBattleCardId: 'BATTLE_X', reservation: 'KEEP' });
});

test('sole compatible candidate stays soft until confirm, where it may resolve without prior focus', () => {
  const ctx = context([R[0], R[2], R[4]]);
  const draft = createDraftMove({ currentPath: path(4), boardVersion: 'B1' }, ctx);
  assert.deepEqual(draft.compatibleRoadCards.map(card => card.value), [5]);
  assert.equal(draft.focusedRoadCard, null);
  assert.equal(draft.softFocusRoadCard.id, R[4].id);
  assert.equal(draft.cardStates.find(entry => entry.card.id === R[4].id).state, ROAD_CARD_STATE.COMPATIBLE);
  assert.equal(draft.autoSelectedRoadCard, null);
  const confirmation = confirmDraftMove(draft, ctx);
  assert.equal(confirmation.ok, true);
  assert.equal(confirmation.selectionSource, 'SOLE_COMPATIBLE_AT_CONFIRM');
  assert.equal(confirmation.autoSelectedRoadCard, null);
});

test('multiple candidates cannot be decided without explicit focus', () => {
  const ctx = context([R[2], R[4], R[5]]);
  const draft = createDraftMove({ currentPath: path(2), boardVersion: 'B1' }, ctx);
  const confirmation = confirmDraftMove(draft, ctx);
  assert.equal(confirmation.ok, false);
  assert.equal(confirmation.reason, 'ROAD_CARD_CHOICE_REQUIRED');
});

test('focus changes never erase the path and incompatible card taps do not steal focus', () => {
  const ctx = context([R[0], R[2], R[4]]);
  let draft = createDraftMove({ currentPath: path(2), boardVersion: 'B1' }, ctx);
  draft = focusRoadCard(draft, R[2], ctx);
  const before = draft.currentPath;
  const rejected = focusRoadCard(draft, R[0], ctx);
  assert.deepEqual(rejected.currentPath, before);
  assert.equal(rejected.focusedRoadCard.id, R[2].id);
  const cleared = clearRoadFocus(rejected, ctx);
  assert.deepEqual(cleared.currentPath, before);
  assert.equal(cleared.focusedRoadCard, null);
});

test('presentation states remain distinguishable without color and Reduced Motion removes animation only', () => {
  const ctx = context([R[0], R[2], R[4]], { reducedMotion: true });
  const draft = createDraftMove({ currentPath: path(2), focusedRoadCard: R[0], boardVersion: 'B1' }, ctx);
  const invalid = draft.cardStates.find(entry => entry.card.id === R[0].id);
  const compatibleEntry = draft.cardStates.find(entry => entry.card.id === R[2].id);
  assert.equal(invalid.state, ROAD_CARD_STATE.INVALID_FOCUS);
  assert.equal(compatibleEntry.state, ROAD_CARD_STATE.COMPATIBLE);
  assert.equal(invalid.presentation.animate, false);
  assert.equal(compatibleEntry.presentation.animate, false);
  assert.equal(invalid.presentation.colorIndependent, true);
  assert.equal(compatibleEntry.presentation.colorIndependent, true);
  assert.notEqual(invalid.presentation.lift, compatibleEntry.presentation.lift);
  assert.notEqual(invalid.presentation.outline, compatibleEntry.presentation.outline);
});

test('confirmation re-derives against current hand and board version and fails closed when stale', () => {
  const ctx = context([R[2]]);
  const draft = createDraftMove({ currentPath: path(2), boardVersion: 'B1' }, ctx);
  const stale = context([R[2]], { boardState: board('B2') });
  assert.equal(confirmDraftMove(draft, stale).reason, 'BOARD_VERSION_STALE');
  const lostCard = context([]);
  const noLongerOwned = confirmDraftMove(draft, lostCard);
  assert.equal(noLongerOwned.ok, false);
  assert.equal(noLongerOwned.reason, 'NO_COMPATIBLE_ROAD_CARD');
});

test('DraftMove rejects Battle-card or mode fields instead of becoming a second mixed state machine', () => {
  const ctx = context([R[2]]);
  assert.throws(
    () => createDraftMove({ currentPath: path(0), boardVersion: 'B1', battleId: 'BATTLE_X' }, ctx),
    /DRAFT_MOVE_FIELD_FORBIDDEN:battleId/,
  );
  assert.throws(
    () => createDraftMove({ currentPath: path(0), boardVersion: 'B1', mode: 'CARD_FIRST' }, ctx),
    /DRAFT_MOVE_FIELD_FORBIDDEN:mode/,
  );
});

test('zero-step draft can expose held Road cards but cannot be confirmed as movement', () => {
  const ctx = context([R[0], R[5]]);
  const draft = createDraftMove({ currentPath: path(0), boardVersion: 'B1' }, ctx);
  assert.deepEqual(compatibleRoadCards(ctx.handRoadCards, draft.currentPath, ctx.boardState).map(card => card.value), [1,6]);
  assert.equal(draft.validity.canConfirm, false);
  assert.equal(confirmDraftMove(draft, ctx).reason, 'PATH_EMPTY');
});

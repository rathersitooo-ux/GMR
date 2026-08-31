import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftMove, updateDraftMove } from '../browser/draft-move-state-core.mjs';

function context({ hand = ['road1', 'road3', 'road5'], values = { road1: 1, road3: 3, road5: 5 }, boardVersion = 'b1' } = {}) {
  return {
    handRoadCards: hand,
    boardState: { version: boardVersion },
    deriveCompatibleRoadCards: ({ handRoadCards, currentPath }) => {
      const steps = Math.max(0, currentPath.length - 1);
      return handRoadCards.filter((card) => values[card] >= steps);
    },
    deriveValidity: ({ currentPath, boardState }) => ({
      legalPath: currentPath.length > 0,
      boardVersion: boardState.version,
    }),
  };
}

test('DraftMove stores only canonical inputs and derives candidates plus validity', () => {
  const draft = createDraftMove({ currentPath: ['A', 'B', 'C'], boardVersion: 'b1' }, context());
  assert.deepEqual(draft.currentPath, ['A', 'B', 'C']);
  assert.equal(draft.focusedRoadCard, null);
  assert.deepEqual(draft.compatibleRoadCards, ['road3', 'road5']);
  assert.equal(draft.boardVersion, 'b1');
  assert.deepEqual(draft.validity, { legalPath: true, boardVersion: 'b1' });
  assert.equal(Object.hasOwn(draft, 'mode'), false);
});

test('card-first and move-first converge to the same DraftMove snapshot', () => {
  const ctx = context();
  const cardFirst = updateDraftMove(
    updateDraftMove(createDraftMove({ boardVersion: 'b1' }, ctx), { focusedRoadCard: 'road3' }, ctx),
    { currentPath: ['A', 'B', 'C'] },
    ctx,
  );
  const moveFirst = updateDraftMove(
    updateDraftMove(createDraftMove({ boardVersion: 'b1' }, ctx), { currentPath: ['A', 'B', 'C'] }, ctx),
    { focusedRoadCard: 'road3' },
    ctx,
  );
  assert.deepEqual(cardFirst, moveFirst);
});

test('changing or clearing card focus preserves the current path', () => {
  const ctx = context();
  const start = createDraftMove({ currentPath: ['A', 'B', 'C'], focusedRoadCard: 'road3' }, ctx);
  const changed = updateDraftMove(start, { focusedRoadCard: 'road5' }, ctx);
  const cleared = updateDraftMove(changed, { focusedRoadCard: null }, ctx);
  assert.deepEqual(changed.currentPath, ['A', 'B', 'C']);
  assert.deepEqual(cleared.currentPath, ['A', 'B', 'C']);
  assert.equal(cleared.focusedRoadCard, null);
});

test('an incompatible focused card does not erase the path or auto-select another candidate', () => {
  const ctx = context();
  const start = createDraftMove({ currentPath: ['A', 'B'], focusedRoadCard: 'road3' }, ctx);
  const extended = updateDraftMove(start, { currentPath: ['A', 'B', 'C', 'D', 'E'] }, ctx);
  assert.equal(extended.focusedRoadCard, 'road3');
  assert.deepEqual(extended.currentPath, ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(extended.compatibleRoadCards, ['road5']);
});

test('candidate cards are recalculated from the current path on every update', () => {
  let derives = 0;
  const ctx = context();
  const counted = {
    ...ctx,
    deriveCompatibleRoadCards: (input) => {
      derives += 1;
      return ctx.deriveCompatibleRoadCards(input);
    },
  };
  const initial = createDraftMove({ currentPath: ['A', 'B', 'C', 'D', 'E', 'F'] }, counted);
  const backedUp = updateDraftMove(initial, { currentPath: ['A', 'B', 'C'] }, counted);
  assert.deepEqual(initial.compatibleRoadCards, ['road5']);
  assert.deepEqual(backedUp.compatibleRoadCards, ['road3', 'road5']);
  assert.equal(derives, 2);
});

test('derived fields and mode-like or battle fields cannot be patched into DraftMove', () => {
  const ctx = context();
  const draft = createDraftMove({}, ctx);
  assert.throws(() => updateDraftMove(draft, { compatibleRoadCards: ['road5'] }, ctx), /DERIVED_FIELD_WRITE_FORBIDDEN/);
  assert.throws(() => updateDraftMove(draft, { validity: 'forced' }, ctx), /DERIVED_FIELD_WRITE_FORBIDDEN/);
  assert.throws(() => updateDraftMove(draft, { mode: 'CARD_FIRST' }, ctx), /DRAFT_MOVE_FIELD_INVALID/);
  assert.throws(() => updateDraftMove(draft, { battleCard: 'x' }, ctx), /DRAFT_MOVE_FIELD_INVALID/);
});

test('path and candidate arrays are copied and frozen at the model boundary', () => {
  const path = ['A', 'B'];
  const hand = ['road1', 'road3'];
  const draft = createDraftMove({ currentPath: path }, context({ hand, values: { road1: 1, road3: 3 } }));
  path.push('C');
  hand.push('road5');
  assert.deepEqual(draft.currentPath, ['A', 'B']);
  assert.deepEqual(draft.compatibleRoadCards, ['road1', 'road3']);
  assert.equal(Object.isFrozen(draft), true);
  assert.equal(Object.isFrozen(draft.currentPath), true);
  assert.equal(Object.isFrozen(draft.compatibleRoadCards), true);
});

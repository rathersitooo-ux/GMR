import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftMove, updateDraftMove } from '../browser/draft-move-state-core.mjs';

function regressionContext({ battleState, derivations }) {
  const hand = ['road1', 'road3', 'road5'];
  const candidatesByPath = new Map([
    ['A>B>C>D>E>F', ['road5']],
    ['A>B>C', ['road3', 'road5']],
    ['A', hand],
  ]);

  return {
    handRoadCards: hand,
    boardState: { version: 'board-v1', battleState },
    deriveCompatibleRoadCards: ({ currentPath }) => {
      derivations.push([...currentPath]);
      return candidatesByPath.get(currentPath.join('>')) ?? [];
    },
    deriveValidity: ({ currentPath, focusedRoadCard, compatibleRoadCards }) => ({
      pathReady: currentPath.length > 1,
      focusState: focusedRoadCard == null
        ? 'NONE'
        : compatibleRoadCards.includes(focusedRoadCard) ? 'VALID' : 'INVALID_FOCUS',
    }),
  };
}

test('backtracking rederives candidates and can restore an invalid explicit focus without selecting another card', () => {
  const battleState = {
    selectedBattleCard: 'battle-7',
    reservedBattleCards: ['battle-9'],
  };
  const battleBefore = structuredClone(battleState);
  const derivations = [];
  const ctx = regressionContext({ battleState, derivations });

  const extended = createDraftMove({
    currentPath: ['A', 'B', 'C', 'D', 'E', 'F'],
    focusedRoadCard: 'road3',
    boardVersion: 'board-v1',
  }, ctx);
  assert.deepEqual(extended.compatibleRoadCards, ['road5']);
  assert.equal(extended.focusedRoadCard, 'road3');
  assert.equal(extended.validity.focusState, 'INVALID_FOCUS');

  const backed = updateDraftMove(extended, { currentPath: ['A', 'B', 'C'] }, ctx);
  assert.deepEqual(backed.compatibleRoadCards, ['road3', 'road5']);
  assert.equal(backed.focusedRoadCard, 'road3');
  assert.equal(backed.validity.focusState, 'VALID');
  assert.deepEqual(derivations, [
    ['A', 'B', 'C', 'D', 'E', 'F'],
    ['A', 'B', 'C'],
  ]);
  assert.deepEqual(battleState, battleBefore);
});

test('cancel resets only the draft path/focus, rederives candidates, and leaves authoritative position plus Battle state unchanged', () => {
  const authoritativePlayer = { positionId: 'A' };
  const authoritativeBefore = structuredClone(authoritativePlayer);
  const battleState = {
    selectedBattleCard: 'battle-7',
    reservedBattleCards: ['battle-9'],
  };
  const battleBefore = structuredClone(battleState);
  const derivations = [];
  const ctx = regressionContext({ battleState, derivations });

  const planned = createDraftMove({
    currentPath: ['A', 'B', 'C'],
    focusedRoadCard: 'road3',
    boardVersion: 'board-v1',
  }, ctx);
  const cancelled = updateDraftMove(planned, {
    currentPath: ['A'],
    focusedRoadCard: null,
  }, ctx);

  assert.deepEqual(cancelled.currentPath, ['A']);
  assert.equal(cancelled.focusedRoadCard, null);
  assert.deepEqual(cancelled.compatibleRoadCards, ['road1', 'road3', 'road5']);
  assert.deepEqual(cancelled.validity, { pathReady: false, focusState: 'NONE' });
  assert.deepEqual(derivations, [['A', 'B', 'C'], ['A']]);
  assert.deepEqual(authoritativePlayer, authoritativeBefore);
  assert.deepEqual(battleState, battleBefore);
  assert.equal(Object.hasOwn(cancelled, 'mode'), false);
  assert.equal(Object.hasOwn(cancelled, 'battleCard'), false);
  assert.equal(Object.hasOwn(cancelled, 'selectedRoadCard'), false);
});

test('after cancel the same draft can resume card-first or move-first and converge without a mode switch', () => {
  const battleState = { selectedBattleCard: 'battle-7', reservedBattleCards: [] };
  const battleBefore = structuredClone(battleState);
  const ctx = regressionContext({ battleState, derivations: [] });
  const cancelled = createDraftMove({
    currentPath: ['A'],
    focusedRoadCard: null,
    boardVersion: 'board-v1',
  }, ctx);

  const cardFirst = updateDraftMove(
    updateDraftMove(cancelled, { focusedRoadCard: 'road3' }, ctx),
    { currentPath: ['A', 'B', 'C'] },
    ctx,
  );
  const moveFirst = updateDraftMove(
    updateDraftMove(cancelled, { currentPath: ['A', 'B', 'C'] }, ctx),
    { focusedRoadCard: 'road3' },
    ctx,
  );

  assert.deepEqual(cardFirst, moveFirst);
  assert.deepEqual(cardFirst.currentPath, ['A', 'B', 'C']);
  assert.equal(cardFirst.focusedRoadCard, 'road3');
  assert.equal(cardFirst.validity.focusState, 'VALID');
  assert.equal(Object.hasOwn(cardFirst, 'mode'), false);
  assert.deepEqual(battleState, battleBefore);
});

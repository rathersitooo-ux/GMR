import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_HAND_ROULETTE_SCHEMA,
  BATTLE_HAND_ROULETTE_TAP_RUN_SCHEMA,
  createBattleHandRouletteState,
  projectBattleHandRouletteTapRun,
  resolveBattleHandRouletteCommit,
  stepBattleHandRouletteState,
} from '../browser/battle-hand-roulette-core.mjs';

test('roulette mirrors the current playable ordinary-hand candidate ids with variable count', () => {
  const state = createBattleHandRouletteState({
    candidateCardIds: ['a', 'b', 'b', '', 'c'],
    anchorCardId: 'b',
  });
  assert.equal(state.schema, BATTLE_HAND_ROULETTE_SCHEMA);
  assert.deepEqual(state.candidateCardIds, ['a', 'b', 'c']);
  assert.equal(state.selectedCardId, 'b');
});

test('roulette reuses cyclic Slot Roll stepping instead of creating a second selection engine', () => {
  let state = createBattleHandRouletteState({ candidateCardIds: ['a', 'b', 'c'], anchorCardId: 'c' });
  state = stepBattleHandRouletteState(state, { steps: 1, direction: 1 });
  assert.equal(state.selectedCardId, 'a');
  state = stepBattleHandRouletteState(state, { steps: 2, direction: -1 });
  assert.equal(state.selectedCardId, 'b');
});

test('roulette commit revalidates against the fresh existing playable candidate set', () => {
  const state = createBattleHandRouletteState({ candidateCardIds: ['a', 'b', 'c'], anchorCardId: 'b' });
  assert.equal(resolveBattleHandRouletteCommit(state, { currentCandidateCardIds: ['a', 'b', 'c'] }), 'b');
  assert.equal(
    resolveBattleHandRouletteCommit(state, { currentCandidateCardIds: ['a', 'c'] }),
    null,
    'a card that stopped being legal/playable must fail closed instead of being forced through',
  );
});

test('beginner rapid-tap rescue keeps a contiguous run from the accepted start card with no gaps', () => {
  const run = projectBattleHandRouletteTapRun({
    candidateCardIds: ['a', 'b', 'c', 'd'],
    startCardId: 'c',
    tapCount: 3,
  });
  assert.equal(run.schema, BATTLE_HAND_ROULETTE_TAP_RUN_SCHEMA);
  assert.equal(run.startCardId, 'c');
  assert.deepEqual(run.cardIds, ['c', 'd', 'a']);
  assert.equal(run.acceptedTapCount, 3);
  assert.equal(run.pendingTapCount, 0);
});

test('rapid taps are never duplicated inside one hand snapshot and excess intent stays pending', () => {
  const run = projectBattleHandRouletteTapRun({
    candidateCardIds: ['a', 'b', 'c'],
    startCardId: 'b',
    tapCount: 5,
  });
  assert.deepEqual(run.cardIds, ['b', 'c', 'a']);
  assert.equal(new Set(run.cardIds).size, run.cardIds.length);
  assert.equal(run.acceptedTapCount, 3);
  assert.equal(run.pendingTapCount, 2,
    'later authoritative hand changes can re-project candidates before consuming the remaining taps');
});

test('reverse rapid-tap rescue remains contiguous around the same ring', () => {
  const run = projectBattleHandRouletteTapRun({
    candidateCardIds: ['a', 'b', 'c', 'd'],
    startCardId: 'b',
    tapCount: 4,
    direction: -1,
  });
  assert.deepEqual(run.cardIds, ['b', 'a', 'd', 'c']);
  assert.equal(run.pendingTapCount, 0);
});

test('empty and one-card snapshots fail safely without inventing cards or repeated current-snapshot uses', () => {
  const empty = createBattleHandRouletteState({ candidateCardIds: [] });
  assert.equal(empty.selectedCardId, null);
  assert.equal(resolveBattleHandRouletteCommit(empty, { currentCandidateCardIds: [] }), null);
  const emptyRun = projectBattleHandRouletteTapRun({ candidateCardIds: [], tapCount: 3 });
  assert.deepEqual(emptyRun.cardIds, []);
  assert.equal(emptyRun.pendingTapCount, 3);

  const single = createBattleHandRouletteState({ candidateCardIds: ['only'] });
  assert.equal(stepBattleHandRouletteState(single, { steps: 5 }).selectedCardId, 'only');
  const singleRun = projectBattleHandRouletteTapRun({ candidateCardIds: ['only'], tapCount: 3 });
  assert.deepEqual(singleRun.cardIds, ['only']);
  assert.equal(singleRun.pendingTapCount, 2);
});

test('roulette projection is pure and leaves caller-owned candidate arrays untouched', () => {
  const candidateCardIds = ['a', 'b', 'c'];
  const before = [...candidateCardIds];
  const state = createBattleHandRouletteState({ candidateCardIds, anchorCardId: 'a' });
  projectBattleHandRouletteTapRun({ candidateCardIds, startCardId: 'a', tapCount: 2 });
  resolveBattleHandRouletteCommit(state, { currentCandidateCardIds: candidateCardIds });
  assert.deepEqual(candidateCardIds, before);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.candidateCardIds), true);
});

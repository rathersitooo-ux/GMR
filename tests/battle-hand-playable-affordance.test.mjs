import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_HAND_PLAYABLE_AFFORDANCE_SCHEMA,
  projectBattlePlayableHandAffordance,
} from '../browser/battle-janken-slidepad-runtime-mount.mjs';

test('projects only existing legal hand cards and preserves hand order', () => {
  const state = projectBattlePlayableHandAffordance({
    handCardIds: ['A', 'B', 'C', 'B'],
    activeRole: 'road',
    activeOptionValues: ['', 'C', 'A', 'OUTSIDE'],
  });

  assert.equal(state.schema, BATTLE_HAND_PLAYABLE_AFFORDANCE_SCHEMA);
  assert.deepEqual(state.candidateCardIds, ['A', 'C']);
  assert.equal(state.showActionBase, true);
});

test('excludes the opposite-role reservation and janken-reserved cards without redefining legality', () => {
  const state = projectBattlePlayableHandAffordance({
    handCardIds: ['A', 'B', 'C'],
    activeRole: 'battle',
    activeOptionValues: ['A', 'B', 'C'],
    oppositeSelectedCardId: 'B',
    reservedCardIds: ['C'],
  });

  assert.deepEqual(state.candidateCardIds, ['A']);
  assert.equal(state.showActionBase, true);
});

test('shows no affordance when no projected role is active or the plan input is disabled', () => {
  assert.deepEqual(projectBattlePlayableHandAffordance({
    handCardIds: ['A'],
    activeRole: null,
    activeOptionValues: ['A'],
  }).candidateCardIds, []);

  const disabled = projectBattlePlayableHandAffordance({
    handCardIds: ['A'],
    activeRole: 'road',
    activeOptionValues: ['A'],
    phasePlayable: false,
  });
  assert.deepEqual(disabled.candidateCardIds, []);
  assert.equal(disabled.showActionBase, false);
});

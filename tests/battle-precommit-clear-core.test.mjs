import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_PRECOMMIT_CLEAR_CONTRACT,
  BATTLE_PRECOMMIT_CLEAR_SCHEMA,
  clearBattlePrecommitSelection,
} from '../browser/battle-precommit-clear-core.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('plan phase clears both card reservations and the staged movement path in one operation', () => {
  const input = {
    phase: 'plan',
    busy: false,
    planSubmitted: false,
    position: 'C:0:0',
    plan: {
      roadId: 'road-7',
      battleId: 'battle-3',
      path: ['C:0:0', 'C:0:1', 'C:0:2'],
    },
    targetDraft: null,
  };
  const before = clone(input);
  const result = clearBattlePrecommitSelection(input);

  assert.equal(result.cleared, true);
  assert.equal(result.reason, 'CLEARED_PLAN_DRAFT');
  assert.deepEqual(result.clearedFields, ['roadId', 'battleId', 'path']);
  assert.deepEqual(result.next.plan, {
    roadId: null,
    battleId: null,
    path: ['C:0:0'],
  });
  assert.equal(result.next.targetDraft, null);
  assert.equal(result.authoritativeRollback, false);
  assert.equal(result.gameStateWrite, false);
  assert.deepEqual(input, before);
});

test('plan phase reports nothing to clear when already at the unselected baseline', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'plan',
    position: 'C:0:0',
    plan: { roadId: null, battleId: null, path: ['C:0:0'] },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'NOTHING_TO_CLEAR');
  assert.deepEqual(result.next.plan.path, ['C:0:0']);
});

test('plan clear fails closed once the plan was already submitted', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'plan',
    position: 'C:0:0',
    planSubmitted: true,
    plan: { roadId: 'road-1', battleId: 'battle-2', path: ['C:0:0', 'C:0:1'] },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'PLAN_ALREADY_SUBMITTED');
  assert.equal(result.next.plan.roadId, 'road-1');
  assert.equal(result.next.plan.battleId, 'battle-2');
  assert.deepEqual(result.next.plan.path, ['C:0:0', 'C:0:1']);
});

test('busy or commit-in-flight state rejects clear before considering either phase', () => {
  for (const phase of ['plan', 'target']) {
    const result = clearBattlePrecommitSelection({
      phase,
      busy: true,
      position: 'C:0:0',
      plan: { roadId: 'road-1', battleId: 'battle-2', path: ['C:0:0'] },
      targetDraft: { defenderId: 'P2', lane: 'L', shield: 'C' },
    });
    assert.equal(result.cleared, false);
    assert.equal(result.reason, 'BUSY_OR_COMMIT_IN_FLIGHT');
  }
});

test('target phase clears only the uncommitted target draft and preserves the committed plan', () => {
  const input = {
    phase: 'target',
    busy: false,
    targetCommitted: false,
    position: 'C:0:2',
    plan: {
      roadId: 'road-7',
      battleId: 'battle-3',
      path: ['C:0:0', 'C:0:1', 'C:0:2'],
    },
    targetDraft: { defenderId: 'P2', lane: 'R', shield: 'L' },
  };
  const before = clone(input);
  const result = clearBattlePrecommitSelection(input);

  assert.equal(result.cleared, true);
  assert.equal(result.reason, 'CLEARED_TARGET_DRAFT');
  assert.deepEqual(result.clearedFields, ['targetDraft']);
  assert.equal(result.next.targetDraft, null);
  assert.deepEqual(result.next.plan, input.plan);
  assert.deepEqual(input, before);
});

test('target clear fails closed once authoritative target commit occurred', () => {
  const result = clearBattlePrecommitSelection({
    phase: 'target',
    targetCommitted: true,
    position: 'C:0:2',
    plan: { roadId: 'road-7', battleId: 'battle-3', path: ['C:0:0', 'C:0:2'] },
    targetDraft: { defenderId: 'P2', lane: 'C', shield: 'R' },
  });

  assert.equal(result.cleared, false);
  assert.equal(result.reason, 'TARGET_ALREADY_COMMITTED');
  assert.deepEqual(result.next.targetDraft, { defenderId: 'P2', lane: 'C', shield: 'R' });
});

test('resolve and later phases can never use precommit clear as a rollback', () => {
  for (const phase of ['resolve', 'reveal', 'move', 'result']) {
    const result = clearBattlePrecommitSelection({
      phase,
      position: 'C:0:2',
      plan: { roadId: 'road-7', battleId: 'battle-3', path: ['C:0:0', 'C:0:2'] },
      targetDraft: { defenderId: 'P2', lane: 'C', shield: 'R' },
    });
    assert.equal(result.cleared, false);
    assert.equal(result.reason, 'PHASE_NOT_CLEARABLE');
    assert.equal(result.authoritativeRollback, false);
    assert.equal(result.gameStateWrite, false);
  }
});

test('contract explicitly denies gameplay authority and authoritative rollback', () => {
  assert.equal(BATTLE_PRECOMMIT_CLEAR_SCHEMA, 'gameroad.battle-precommit-clear.v1');
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.schema, BATTLE_PRECOMMIT_CLEAR_SCHEMA);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.authority, 'NONE_CALLER_OWNS_STATE');
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.precommitOnly, true);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.authoritativeRollback, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.planSubmittedRollback, false);
  assert.equal(BATTLE_PRECOMMIT_CLEAR_CONTRACT.committedTargetRollback, false);
  assert.deepEqual(BATTLE_PRECOMMIT_CLEAR_CONTRACT.clearablePhases, ['plan', 'target']);
});

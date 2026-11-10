const BATTLE_PRECOMMIT_CLEAR_SCHEMA = 'gameroad.battle-precommit-clear.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizePlan(plan, position) {
  const source = plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : {};
  const path = Array.isArray(source.path) ? [...source.path] : (position ? [position] : []);
  return {
    roadId: typeof source.roadId === 'string' && source.roadId ? source.roadId : null,
    battleId: typeof source.battleId === 'string' && source.battleId ? source.battleId : null,
    path,
  };
}

function normalizeTargetDraft(targetDraft) {
  if (!targetDraft || typeof targetDraft !== 'object' || Array.isArray(targetDraft)) return null;
  const defenderId = typeof targetDraft.defenderId === 'string' && targetDraft.defenderId ? targetDraft.defenderId : null;
  const lane = typeof targetDraft.lane === 'string' && targetDraft.lane ? targetDraft.lane : null;
  const shield = typeof targetDraft.shield === 'string' && targetDraft.shield ? targetDraft.shield : null;
  return defenderId || lane || shield ? { defenderId, lane, shield } : null;
}

function planHasDraft(plan, position) {
  if (plan.roadId || plan.battleId) return true;
  if (!position) return plan.path.length > 0;
  return plan.path.length !== 1 || plan.path[0] !== position;
}

function unchangedResult({ phase, plan, targetDraft, reason }) {
  return deepFreeze({
    schema: BATTLE_PRECOMMIT_CLEAR_SCHEMA,
    cleared: false,
    reason,
    phase,
    clearedFields: [],
    next: { plan, targetDraft },
    authoritativeRollback: false,
    gameStateWrite: false,
  });
}

/**
 * Pure policy helper for the user-approved one-operation clear gesture.
 *
 * The caller owns all real Battle state. This helper only decides whether the
 * currently staged local selection may be cleared and returns a projected next
 * draft. It never mutates the supplied object and never rolls back submitted or
 * committed Battle state.
 */
export function clearBattlePrecommitSelection(input = {}) {
  const phase = typeof input.phase === 'string' ? input.phase : '';
  const position = typeof input.position === 'string' && input.position ? input.position : null;
  const plan = normalizePlan(input.plan, position);
  const targetDraft = normalizeTargetDraft(input.targetDraft);

  if (input.busy) {
    return unchangedResult({ phase, plan, targetDraft, reason: 'BUSY_OR_COMMIT_IN_FLIGHT' });
  }

  if (phase === 'plan') {
    if (input.planSubmitted) {
      return unchangedResult({ phase, plan, targetDraft, reason: 'PLAN_ALREADY_SUBMITTED' });
    }
    if (!position) {
      return unchangedResult({ phase, plan, targetDraft, reason: 'POSITION_REQUIRED' });
    }
    if (!planHasDraft(plan, position)) {
      return unchangedResult({ phase, plan, targetDraft, reason: 'NOTHING_TO_CLEAR' });
    }
    return deepFreeze({
      schema: BATTLE_PRECOMMIT_CLEAR_SCHEMA,
      cleared: true,
      reason: 'CLEARED_PLAN_DRAFT',
      phase,
      clearedFields: ['roadId', 'battleId', 'path'],
      next: {
        plan: { roadId: null, battleId: null, path: [position] },
        targetDraft,
      },
      authoritativeRollback: false,
      gameStateWrite: false,
    });
  }

  if (phase === 'target') {
    if (input.targetCommitted) {
      return unchangedResult({ phase, plan, targetDraft, reason: 'TARGET_ALREADY_COMMITTED' });
    }
    if (!targetDraft) {
      return unchangedResult({ phase, plan, targetDraft, reason: 'NOTHING_TO_CLEAR' });
    }
    return deepFreeze({
      schema: BATTLE_PRECOMMIT_CLEAR_SCHEMA,
      cleared: true,
      reason: 'CLEARED_TARGET_DRAFT',
      phase,
      clearedFields: ['targetDraft'],
      next: { plan, targetDraft: null },
      authoritativeRollback: false,
      gameStateWrite: false,
    });
  }

  return unchangedResult({ phase, plan, targetDraft, reason: 'PHASE_NOT_CLEARABLE' });
}

export const BATTLE_PRECOMMIT_CLEAR_CONTRACT = deepFreeze({
  schema: BATTLE_PRECOMMIT_CLEAR_SCHEMA,
  authority: 'NONE_CALLER_OWNS_STATE',
  precommitOnly: true,
  authoritativeRollback: false,
  gameStateWrite: false,
  planSubmittedRollback: false,
  committedTargetRollback: false,
  clearablePhases: ['plan', 'target'],
});

export { BATTLE_PRECOMMIT_CLEAR_SCHEMA };

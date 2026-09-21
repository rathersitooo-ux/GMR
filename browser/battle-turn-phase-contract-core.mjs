const SCHEMA = 'gameroad.battle-turn-phase-contract.v1';

export const BATTLE_TURN_PHASE = Object.freeze({
  PLAN: 'plan',
  REVEAL: 'reveal',
  MOVE: 'move',
  TARGET: 'target',
  RESOLVE: 'resolve',
});

const ORDER = Object.freeze([
  BATTLE_TURN_PHASE.PLAN,
  BATTLE_TURN_PHASE.REVEAL,
  BATTLE_TURN_PHASE.MOVE,
  BATTLE_TURN_PHASE.TARGET,
  BATTLE_TURN_PHASE.RESOLVE,
]);

const SPECS = Object.freeze({
  [BATTLE_TURN_PHASE.PLAN]: Object.freeze({
    id: BATTLE_TURN_PHASE.PLAN,
    label: '計画',
    title: '行動を計画',
    startCondition: 'ROUND_RUNTIME_READY',
    completionCondition: 'ALL_LEGAL_PLANS_ACCEPTED_AND_LOCKED',
    primaryInputOwner: 'PLAN_RESERVATION',
    next: BATTLE_TURN_PHASE.REVEAL,
    automatic: false,
  }),
  [BATTLE_TURN_PHASE.REVEAL]: Object.freeze({
    id: BATTLE_TURN_PHASE.REVEAL,
    label: '公開',
    title: 'ロードを公開',
    startCondition: 'PLANS_LOCKED',
    completionCondition: 'ROAD_REVEAL_AND_REVEAL_ABILITIES_RESOLVED',
    primaryInputOwner: 'SYSTEM',
    next: BATTLE_TURN_PHASE.MOVE,
    automatic: true,
  }),
  [BATTLE_TURN_PHASE.MOVE]: Object.freeze({
    id: BATTLE_TURN_PHASE.MOVE,
    label: '移動',
    title: '移動を解決',
    startCondition: 'ROAD_REVEAL_RESOLVED',
    completionCondition: 'ALL_AUTHORITATIVE_PATHS_RESOLVED',
    primaryInputOwner: 'SYSTEM',
    next: BATTLE_TURN_PHASE.TARGET,
    automatic: true,
  }),
  [BATTLE_TURN_PHASE.TARGET]: Object.freeze({
    id: BATTLE_TURN_PHASE.TARGET,
    label: '攻撃先',
    title: '攻撃先を選択',
    startCondition: 'MOVEMENT_RESOLVED_AND_ACTIVE_ATTACKER_SELECTED',
    completionCondition: 'LEGAL_ATTACK_TARGET_COMMITTED',
    primaryInputOwner: 'ATTACK_TARGET',
    next: BATTLE_TURN_PHASE.RESOLVE,
    automatic: false,
  }),
  [BATTLE_TURN_PHASE.RESOLVE]: Object.freeze({
    id: BATTLE_TURN_PHASE.RESOLVE,
    label: '戦闘処理',
    title: '戦闘を解決',
    startCondition: 'LEGAL_ATTACK_TARGET_COMMITTED',
    completionCondition: 'BATTLE_RESOLUTION_BOARD_SETTLE_AND_TERMINAL_CHECK_COMPLETE',
    primaryInputOwner: 'SYSTEM',
    next: BATTLE_TURN_PHASE.PLAN,
    automatic: true,
    terminalExitAllowed: true,
  }),
});

function canonicalPhase(value) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(SPECS, value)) {
    throw new TypeError('BATTLE_TURN_PHASE_UNKNOWN');
  }
  return value;
}

export function getBattleTurnPhaseSpec(phase) {
  return SPECS[canonicalPhase(phase)];
}

export function canTransitionBattleTurnPhase(current, next) {
  try {
    const from = getBattleTurnPhaseSpec(current);
    const to = canonicalPhase(next);
    return from.next === to;
  } catch {
    return false;
  }
}

export function assertBattleTurnPhaseTransition({ current, next, reason } = {}) {
  const from = getBattleTurnPhaseSpec(current);
  const to = getBattleTurnPhaseSpec(next);
  if (from.next !== to.id) {
    throw new Error(`BATTLE_TURN_PHASE_ILLEGAL_TRANSITION:${from.id}->${to.id}`);
  }
  const normalizedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'UNSPECIFIED';
  return Object.freeze({
    schema: SCHEMA,
    current: from.id,
    next: to.id,
    reason: normalizedReason,
    currentCompletionCondition: from.completionCondition,
    nextStartCondition: to.startCondition,
    gameStateWrite: false,
  });
}

export function phaseOwnsPrimaryInput(phase, owner) {
  const spec = getBattleTurnPhaseSpec(phase);
  return spec.primaryInputOwner === owner;
}

export const BATTLE_TURN_PHASE_CONTRACT = Object.freeze({
  schema: SCHEMA,
  initialPhase: BATTLE_TURN_PHASE.PLAN,
  order: ORDER,
  specs: SPECS,
  gameplayPhaseAuthority: 'match.phase',
  battlePresentationStageAuthority: 'match.battlePresentation.stage',
  nestedChoiceAuthority: 'EXISTING_ABILITY_AND_REPLACEMENT_RUNTIME',
  presentationStageChangesGameplayPhase: false,
  secondTurnController: false,
  gameStateWrite: false,
});

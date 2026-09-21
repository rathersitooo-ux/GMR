import {
  BATTLE_TURN_PHASE_CONTRACT,
  assertBattleTurnPhaseTransition,
  getBattleTurnPhaseSpec,
} from './battle-turn-phase-contract-core.mjs';

const LIVE_SCHEMA = 'gameroad.battle-turn-phase-live-guard.v1';
const MATCH_GUARD = Symbol.for('gameroad.battle-turn-phase-live-guard.match.v1');
const STATE_GUARD = Symbol.for('gameroad.battle-turn-phase-live-guard.state.v1');
const RECEIPT_LIMIT = 32;

function objectRequired(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label}_OBJECT_REQUIRED`);
  }
  return value;
}

function phaseRequired(value) {
  return getBattleTurnPhaseSpec(value).id;
}

function guardMatch(match, onTransition) {
  objectRequired(match, 'MATCH');
  if (match[MATCH_GUARD] === true) return match;

  const descriptor = Object.getOwnPropertyDescriptor(match, 'phase');
  if (!descriptor) throw new TypeError('MATCH_PHASE_REQUIRED');
  if (descriptor.configurable === false) throw new TypeError('MATCH_PHASE_NOT_GUARDABLE');
  if (descriptor.get || descriptor.set) throw new TypeError('MATCH_PHASE_ACCESSOR_CONFLICT');

  let current = phaseRequired(match.phase);
  Object.defineProperty(match, 'phase', {
    enumerable: descriptor.enumerable !== false,
    configurable: false,
    get() {
      return current;
    },
    set(next) {
      const normalizedNext = phaseRequired(next);
      if (normalizedNext === current) return;
      const receipt = assertBattleTurnPhaseTransition({
        current,
        next: normalizedNext,
        reason: 'EXISTING_ENGINE_PHASE_WRITE',
      });
      current = receipt.next;
      onTransition?.(Object.freeze({
        ...receipt,
        round: Number.isSafeInteger(match.round) ? match.round : null,
      }));
    },
  });
  Object.defineProperty(match, MATCH_GUARD, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return match;
}

export function installBattleTurnPhaseLiveGuard(state) {
  objectRequired(state, 'STATE');
  if (state[STATE_GUARD]) return state[STATE_GUARD];

  const descriptor = Object.getOwnPropertyDescriptor(state, 'match');
  if (!descriptor) throw new TypeError('STATE_MATCH_REQUIRED');
  if (descriptor.configurable === false) throw new TypeError('STATE_MATCH_NOT_GUARDABLE');
  if (descriptor.get || descriptor.set) throw new TypeError('STATE_MATCH_ACCESSOR_CONFLICT');

  const receipts = [];
  const record = (receipt) => {
    receipts.push(receipt);
    if (receipts.length > RECEIPT_LIMIT) receipts.splice(0, receipts.length - RECEIPT_LIMIT);
  };
  let currentMatch = state.match == null ? null : guardMatch(state.match, record);

  Object.defineProperty(state, 'match', {
    enumerable: descriptor.enumerable !== false,
    configurable: false,
    get() {
      return currentMatch;
    },
    set(next) {
      currentMatch = next == null ? null : guardMatch(next, record);
    },
  });

  const runtime = Object.freeze({
    schema: LIVE_SCHEMA,
    contract: BATTLE_TURN_PHASE_CONTRACT,
    installed: true,
    secondTurnController: false,
    callerOwnsPhaseProgression: true,
    writesPhaseOnItsOwn: false,
    snapshot() {
      return Object.freeze({
        schema: LIVE_SCHEMA,
        installed: true,
        phase: currentMatch?.phase ?? null,
        round: Number.isSafeInteger(currentMatch?.round) ? currentMatch.round : null,
        recentTransitions: Object.freeze(receipts.map((receipt) => Object.freeze({ ...receipt }))),
        secondTurnController: false,
        callerOwnsPhaseProgression: true,
        writesPhaseOnItsOwn: false,
      });
    },
  });

  Object.defineProperty(state, STATE_GUARD, {
    value: runtime,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return runtime;
}

export function tryInstallBattleTurnPhaseLiveGuard(environment = globalThis) {
  const state = environment?.__GAMEROAD_TEST__?.state;
  if (!state) return null;
  const runtime = installBattleTurnPhaseLiveGuard(state);
  const existing = environment.GAMEROAD_BATTLE_TURN_PHASE_RUNTIME;
  if (existing && existing !== runtime && existing?.schema !== runtime.schema) {
    throw new Error('GAMEROAD_BATTLE_TURN_PHASE_RUNTIME_CONFLICT');
  }
  if (!existing) {
    Object.defineProperty(environment, 'GAMEROAD_BATTLE_TURN_PHASE_RUNTIME', {
      value: runtime,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return runtime;
}

function scheduleProductionInstall(environment = globalThis) {
  const attempt = () => {
    try {
      return tryInstallBattleTurnPhaseLiveGuard(environment) !== null;
    } catch (error) {
      environment?.console?.error?.('battle-turn-phase-live-guard-install', error);
      throw error;
    }
  };

  if (attempt()) return;
  const deferred = () => {
    if (attempt()) return;
    const documentLike = environment?.document;
    if (documentLike?.readyState === 'loading' && typeof documentLike.addEventListener === 'function') {
      documentLike.addEventListener('DOMContentLoaded', attempt, { once: true });
    } else if (typeof environment?.setTimeout === 'function') {
      environment.setTimeout(attempt, 0);
    }
  };
  if (typeof environment?.queueMicrotask === 'function') environment.queueMicrotask(deferred);
  else deferred();
}

scheduleProductionInstall();

export const BATTLE_TURN_PHASE_LIVE_GUARD_CONTRACT = Object.freeze({
  schema: LIVE_SCHEMA,
  gameplayPhaseAuthority: BATTLE_TURN_PHASE_CONTRACT.gameplayPhaseAuthority,
  validatesExistingCallerWrites: true,
  allowsIdempotentSamePhaseWrite: true,
  guardsMatchReplacement: true,
  battlePresentationStageAuthority: BATTLE_TURN_PHASE_CONTRACT.battlePresentationStageAuthority,
  presentationStageChangesGameplayPhase: false,
  secondTurnController: false,
  callerOwnsPhaseProgression: true,
  writesPhaseOnItsOwn: false,
  gameplayResultAuthority: false,
  boardAuthority: false,
  saveAuthority: false,
  economyAuthority: false,
  networkAuthority: false,
});

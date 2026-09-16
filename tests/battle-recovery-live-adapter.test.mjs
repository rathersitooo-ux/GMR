import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT,
  resolveBattleRecoveryFrom2v2Authority,
  syncBattleRecoveryRuntimeFrom2v2Authority,
} from '../browser/battle-recovery-live-adapter.mjs';
import {
  create2v2ReconnectState,
  disconnect2v2Player,
  expire2v2ReconnectGrace,
  project2v2SeatControl,
  reconnect2v2Player,
} from '../browser/battle-2v2-reconnect-core.mjs';
import {
  BATTLE_RECOVERY_LOCAL_STAGE,
  BATTLE_RECOVERY_STATUS,
  projectBattleRecoveryPresentation,
} from '../browser/battle-recovery-presentation-core.mjs';

const seats = Object.freeze([
  Object.freeze({ seatId: 'P1', playerId: 'H1', teamId: 'A' }),
  Object.freeze({ seatId: 'P2', playerId: 'H2', teamId: 'A' }),
  Object.freeze({ seatId: 'P3', playerId: 'H3', teamId: 'B' }),
  Object.freeze({ seatId: 'P4', playerId: 'H4', teamId: 'B' }),
]);

function freshState() {
  return create2v2ReconnectState({ seats });
}

function localInput(reconnectState, overrides = {}) {
  return {
    reconnectState,
    localSeatId: 'P1',
    localPlayerId: 'H1',
    ...overrides,
  };
}

function envelope(state, seatId = 'P1') {
  const seat = project2v2SeatControl(state).seats.find((candidate) => candidate.seatId === seatId);
  return Object.freeze({
    seatId,
    controlMode: seat.controlMode,
    controlGeneration: seat.controlGeneration,
  });
}

test('SELF maps only to READY without creating recovery authority', () => {
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(freshState()));

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, BATTLE_RECOVERY_STATUS.READY);
  assert.equal(resolved.presentation.visible, false);
  assert.equal(resolved.presentation.inputLockRequired, false);
  assert.equal(resolved.seat.controlMode, 'self');
  assert.equal(resolved.gameplayAuthority, false);
  assert.equal(resolved.networkAuthority, false);
  assert.equal(resolved.controlAuthority, false);
  assert.equal(resolved.gameStateWrite, false);
});

test('authoritative temporary_partner maps to WAITING when no reconnect attempt is declared', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(disconnected));

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, BATTLE_RECOVERY_STATUS.WAITING);
  assert.equal(resolved.seat.controlMode, 'temporary_partner');
  assert.equal(resolved.presentation.label, '待機中');
  assert.equal(resolved.presentation.inputLockRequired, true);
});

test('RECONNECTING requires both temporary_partner authority and caller-explicit in-flight fact', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(disconnected, {
    reconnectInFlight: true,
  }));

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, BATTLE_RECOVERY_STATUS.RECONNECTING);
  assert.equal(resolved.presentation.requiresAuthoritativeRefresh, true);
  assert.equal(resolved.presentation.label, '再接続中');

  const inconsistent = resolveBattleRecoveryFrom2v2Authority(localInput(freshState(), {
    reconnectInFlight: true,
  }));
  assert.equal(inconsistent.ok, false);
  assert.equal(inconsistent.reason, 'RECONNECT_IN_FLIGHT_CONTROL_MISMATCH');
});

test('authoritative reconnect restoring SELF returns the adapter to READY', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const restored = reconnect2v2Player(disconnected, 'H1').state;
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(restored));

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, BATTLE_RECOVERY_STATUS.READY);
  assert.equal(resolved.seat.controlMode, 'self');
  assert.equal(resolved.seat.controlGeneration, 2);
});

test('explicitly rejected old local control envelope maps to STALE only after existing guard proves it non-current', () => {
  const before = freshState();
  const staleHumanEnvelope = envelope(before);
  const disconnected = disconnect2v2Player(before, 'H1').state;

  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(disconnected, {
    controlEnvelopeRejected: true,
    rejectedControlEnvelope: staleHumanEnvelope,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
  }));

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED);
  assert.equal(resolved.presentation.clearUncommittedLocalStage, true);
  assert.equal(resolved.presentation.rollbackAuthoritativeCommit, false);
  assert.equal(resolved.presentation.requiresAuthoritativeRefresh, true);
});

test('a current envelope cannot be mislabeled stale even if caller says it was rejected', () => {
  const state = freshState();
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(state, {
    controlEnvelopeRejected: true,
    rejectedControlEnvelope: envelope(state),
  }));

  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, 'REJECTED_CONTROL_ENVELOPE_IS_CURRENT');
  assert.equal(resolved.status, null);
});

test('malformed or another-seat rejected envelopes fail closed instead of becoming stale', () => {
  const state = disconnect2v2Player(freshState(), 'H1').state;

  for (const rejectedControlEnvelope of [
    null,
    { seatId: 'P1', controlMode: 'bogus', controlGeneration: 0 },
    envelope(state, 'P2'),
    { seatId: 'P1', controlMode: 'self', controlGeneration: -1 },
  ]) {
    const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(state, {
      controlEnvelopeRejected: true,
      rejectedControlEnvelope,
    }));
    assert.equal(resolved.ok, false);
    assert.equal(resolved.reason, 'REJECTED_CONTROL_ENVELOPE_INVALID');
  }
});

test('permanent partner ownership remains unresolved rather than being guessed as wait or ready', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const permanent = expire2v2ReconnectGrace(disconnected, 'H1').state;
  const resolved = resolveBattleRecoveryFrom2v2Authority(localInput(permanent));

  assert.equal(resolved.ok, false);
  assert.equal(resolved.reason, 'PERMANENT_PARTNER_RECOVERY_STATUS_UNRESOLVED');
  assert.equal(resolved.status, null);
});

test('local identity mismatch and unsupported local-stage facts fail closed', () => {
  const state = freshState();

  const mismatch = resolveBattleRecoveryFrom2v2Authority(localInput(state, {
    localPlayerId: 'H2',
  }));
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'LOCAL_PLAYER_SEAT_MISMATCH');

  const stage = resolveBattleRecoveryFrom2v2Authority(localInput(state, {
    localStage: 'MAYBE',
  }));
  assert.equal(stage.ok, false);
  assert.equal(stage.reason, 'LOCAL_STAGE_INVALID');
});

test('runtime composition forwards only resolved existing recovery input', () => {
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const received = [];
  const runtime = {
    sync(input) {
      received.push(input);
      return projectBattleRecoveryPresentation(input);
    },
  };

  const result = syncBattleRecoveryRuntimeFrom2v2Authority(runtime, localInput(disconnected, {
    reconnectInFlight: true,
    reducedMotion: true,
  }));

  assert.equal(result.ok, true);
  assert.equal(result.status, BATTLE_RECOVERY_STATUS.RECONNECTING);
  assert.deepEqual(received, [{
    status: BATTLE_RECOVERY_STATUS.RECONNECTING,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.NONE,
    reducedMotion: true,
    lowPerformance: false,
  }]);
  assert.equal(result.presentation.motionMode, 'REDUCED_STATIC');
  assert.equal(result.presentation.inputLockRequired, true);
});

test('runtime is never called when authority facts are unresolved', () => {
  let calls = 0;
  const runtime = { sync() { calls += 1; return null; } };
  const disconnected = disconnect2v2Player(freshState(), 'H1').state;
  const permanent = expire2v2ReconnectGrace(disconnected, 'H1').state;

  const result = syncBattleRecoveryRuntimeFrom2v2Authority(runtime, localInput(permanent));
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
  assert.throws(
    () => syncBattleRecoveryRuntimeFrom2v2Authority(null, localInput(freshState())),
    /BATTLE_RECOVERY_RUNTIME_SYNC_REQUIRED/,
  );
});

test('contract keeps all timing, retry, control, legality and game-state authority outside the adapter', () => {
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.reconnectStateAuthority, 'EXISTING_BATTLE_2V2_RECONNECT_CORE');
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.reconnectInFlightAuthority, 'CALLER_EXPLICIT_ONLY');
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.permanentPartnerMapping, 'FAIL_CLOSED_UNRESOLVED');
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.createsReconnectState, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.startsReconnect, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.computesTimeoutOrGrace, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.computesRetryPolicy, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.computesControlOwner, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.computesResult, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.writesGameState, false);
});

function authoritativeJankenContext(roundId = 'ROUND-7') {
  const slots = Object.freeze([
    Object.freeze({ jankenHand: 'ROCK', cardId: 'CARD-R' }),
    Object.freeze({ jankenHand: 'SCISSORS', cardId: 'CARD-S' }),
    Object.freeze({ jankenHand: 'PAPER', cardId: 'CARD-P' }),
  ]);
  const assignment = Object.freeze({ roundId, slots });
  const packages = Object.freeze([
    Object.freeze({ jankenHand: 'ROCK', cardId: 'CARD-R' }),
    Object.freeze({ jankenHand: 'SCISSORS', cardId: 'CARD-S' }),
    Object.freeze({ jankenHand: 'PAPER', cardId: 'CARD-P' }),
  ]);
  return Object.freeze({
    schema: 'gameroad.battle-janken-focus-authority-context.v1',
    generationId: roundId,
    assignment,
    packages,
  });
}

test('reconnect recovery preserves the exact authoritative Hand3 snapshot and packages while clearing local focus', async () => {
  const {
    BATTLE_JANKEN_RECOVERY_TRIGGER,
    projectBattleJankenRecoveryContinuity,
  } = await import('../browser/battle-recovery-live-adapter.mjs');
  const authoritativeContext = authoritativeJankenContext();
  const localFocusState = Object.freeze({
    generationId: 'ROUND-7',
    focusedHand: 'ROCK',
    focusedPackage: authoritativeContext.packages[0],
  });
  const localStagedPackage = authoritativeContext.packages[0];

  const recovered = projectBattleJankenRecoveryContinuity({
    recoveryTrigger: BATTLE_JANKEN_RECOVERY_TRIGGER.RECONNECT_RESTORED,
    authoritativeContext,
    localFocusState,
    localStagedPackage,
  });

  assert.equal(recovered.ok, true);
  assert.strictEqual(recovered.authoritativeContext, authoritativeContext);
  assert.strictEqual(recovered.assignment, authoritativeContext.assignment);
  assert.strictEqual(recovered.packages, authoritativeContext.packages);
  assert.deepEqual(recovered.packages.map((pkg) => pkg.cardId), ['CARD-R', 'CARD-S', 'CARD-P']);
  assert.equal(recovered.localFocusState, null);
  assert.equal(recovered.localStagedPackage, null);
  assert.equal(recovered.clearedLocalFocus, true);
  assert.equal(recovered.clearedStagedPackage, true);
  assert.equal(recovered.generationMismatch, false);
  assert.equal(recovered.handAssignmentReroll, false);
  assert.equal(recovered.compoundPackageRecompute, false);
  assert.equal(recovered.legalityRecompute, false);
  assert.equal(recovered.routeRecompute, false);
  assert.equal(recovered.committedRollback, false);
  assert.equal(recovered.gameStateWrite, false);
});

test('stale input recovery drops an old-generation local focus without changing current authority', async () => {
  const {
    BATTLE_JANKEN_RECOVERY_TRIGGER,
    projectBattleJankenRecoveryContinuity,
  } = await import('../browser/battle-recovery-live-adapter.mjs');
  const authoritativeContext = authoritativeJankenContext('ROUND-8');
  const oldLocalPackage = Object.freeze({ jankenHand: 'PAPER', cardId: 'OLD-CARD' });

  const recovered = projectBattleJankenRecoveryContinuity({
    recoveryTrigger: BATTLE_JANKEN_RECOVERY_TRIGGER.STALE_INPUT_REJECTED,
    authoritativeContext,
    localFocusState: Object.freeze({
      generationId: 'ROUND-7',
      focusedHand: 'PAPER',
      focusedPackage: oldLocalPackage,
    }),
    localStagedPackage: oldLocalPackage,
  });

  assert.equal(recovered.ok, true);
  assert.equal(recovered.previousGenerationId, 'ROUND-7');
  assert.equal(recovered.generationId, 'ROUND-8');
  assert.equal(recovered.generationMismatch, true);
  assert.strictEqual(recovered.assignment, authoritativeContext.assignment);
  assert.strictEqual(recovered.packages, authoritativeContext.packages);
  assert.equal(recovered.localFocusState, null);
  assert.equal(recovered.localStagedPackage, null);
});

test('explicit version mismatch clears same-generation local staging and never infers a reroll', async () => {
  const {
    BATTLE_JANKEN_RECOVERY_TRIGGER,
    projectBattleJankenRecoveryContinuity,
  } = await import('../browser/battle-recovery-live-adapter.mjs');
  const authoritativeContext = authoritativeJankenContext('ROUND-9');

  const recovered = projectBattleJankenRecoveryContinuity({
    recoveryTrigger: BATTLE_JANKEN_RECOVERY_TRIGGER.VERSION_MISMATCH,
    authoritativeContext,
    localFocusState: Object.freeze({ generationId: 'ROUND-9', focusedHand: 'SCISSORS' }),
    localStagedPackage: authoritativeContext.packages[1],
  });

  assert.equal(recovered.ok, true);
  assert.equal(recovered.generationMismatch, false);
  assert.equal(recovered.clearedLocalFocus, true);
  assert.equal(recovered.clearedStagedPackage, true);
  assert.strictEqual(recovered.assignment, authoritativeContext.assignment);
  assert.equal(recovered.handAssignmentReroll, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.jankenRecoveryRerollsHand3, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.jankenRecoveryRecomputesCompoundPackage, false);
  assert.equal(BATTLE_RECOVERY_LIVE_ADAPTER_CONTRACT.jankenRecoveryRollsBackCommittedAction, false);
});

test('recovery continuity fails closed when package identity disagrees with the authoritative Hand3 assignment', async () => {
  const {
    BATTLE_JANKEN_RECOVERY_TRIGGER,
    projectBattleJankenRecoveryContinuity,
  } = await import('../browser/battle-recovery-live-adapter.mjs');
  const good = authoritativeJankenContext('ROUND-10');
  const badPackages = Object.freeze([
    good.packages[0],
    good.packages[1],
    Object.freeze({ jankenHand: 'PAPER', cardId: 'NOT-THE-ASSIGNED-CARD' }),
  ]);
  const badContext = Object.freeze({ ...good, packages: badPackages });

  const recovered = projectBattleJankenRecoveryContinuity({
    recoveryTrigger: BATTLE_JANKEN_RECOVERY_TRIGGER.RECONNECT_RESTORED,
    authoritativeContext: badContext,
    localFocusState: Object.freeze({ generationId: 'ROUND-OLD', focusedHand: 'PAPER' }),
  });

  assert.equal(recovered.ok, false);
  assert.equal(recovered.reason, 'AUTHORITATIVE_JANKEN_CONTEXT_INVALID');
  assert.equal(recovered.assignment, null);
  assert.equal(recovered.packages, null);
  assert.equal(recovered.localFocusState, null);
  assert.equal(recovered.handAssignmentReroll, false);
  assert.equal(recovered.committedRollback, false);
});

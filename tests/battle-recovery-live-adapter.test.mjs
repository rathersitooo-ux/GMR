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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_RECOVERY_LOCAL_STAGE,
  BATTLE_RECOVERY_PRESENTATION_CONTRACT,
  BATTLE_RECOVERY_STATUS,
  isBattleRecoveryPresentation,
  projectBattleRecoveryPresentation,
} from '../browser/battle-recovery-presentation-core.mjs';
import {
  create2v2ReconnectState,
  disconnect2v2Player,
  isCurrent2v2ControlEnvelope,
  project2v2SeatControl,
  reconnect2v2Player,
} from '../browser/battle-2v2-reconnect-core.mjs';

const seats = Object.freeze([
  Object.freeze({ seatId: 'P1', playerId: 'H1', teamId: 'A' }),
  Object.freeze({ seatId: 'P2', playerId: 'H2', teamId: 'A' }),
  Object.freeze({ seatId: 'P3', playerId: 'H3', teamId: 'B' }),
  Object.freeze({ seatId: 'P4', playerId: 'H4', teamId: 'B' }),
]);

function envelope(state, seatId) {
  const seat = project2v2SeatControl(state).seats.find((candidate) => candidate.seatId === seatId);
  return Object.freeze({
    seatId,
    controlMode: seat.controlMode,
    controlGeneration: seat.controlGeneration,
  });
}

test('READY is hidden and leaves local commit enabled without claiming authority', () => {
  const view = projectBattleRecoveryPresentation({ status: BATTLE_RECOVERY_STATUS.READY });

  assert.equal(view.visible, false);
  assert.equal(view.canCommitLocalInput, true);
  assert.equal(view.inputLockRequired, false);
  assert.equal(view.requiresAuthoritativeRefresh, false);
  assert.equal(view.clearUncommittedLocalStage, false);
  assert.equal(view.rollbackAuthoritativeCommit, false);
  assert.equal(view.gameplayAuthority, false);
  assert.equal(view.networkAuthority, false);
  assert.equal(view.controlAuthority, false);
  assert.equal(view.legalityAuthority, false);
  assert.equal(view.resultAuthority, false);
  assert.equal(view.gameStateWrite, false);
  assert.equal(view.secretExpansion, false);
  assert.equal(isBattleRecoveryPresentation(view), true);
});

test('WAITING locks commit but does not invent reconnect, retry, or timeout policy', () => {
  const view = projectBattleRecoveryPresentation({ status: BATTLE_RECOVERY_STATUS.WAITING });

  assert.equal(view.visible, true);
  assert.equal(view.label, '待機中');
  assert.equal(view.canCommitLocalInput, false);
  assert.equal(view.inputLockRequired, true);
  assert.equal(view.requiresAuthoritativeRefresh, false);
  assert.equal(view.timeoutAuthority, false);
  assert.equal(view.retryPolicyAuthority, false);
  assert.equal(view.blocksBoard, false);
});

test('RECONNECTING stays fail-closed until caller supplies a fresh authoritative state', () => {
  const view = projectBattleRecoveryPresentation({ status: BATTLE_RECOVERY_STATUS.RECONNECTING });

  assert.equal(view.label, '再接続中');
  assert.equal(view.canCommitLocalInput, false);
  assert.equal(view.inputLockRequired, true);
  assert.equal(view.requiresAuthoritativeRefresh, true);
  assert.equal(view.clearUncommittedLocalStage, false);
  assert.equal(view.rollbackAuthoritativeCommit, false);
});

test('STALE_INPUT_REJECTED requests clearing only an explicitly uncommitted local stage', () => {
  const draft = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
  });
  const committed = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.COMMITTED,
  });

  assert.equal(draft.label, '状態が更新されました');
  assert.equal(draft.requiresAuthoritativeRefresh, true);
  assert.equal(draft.clearUncommittedLocalStage, true);
  assert.equal(draft.rollbackAuthoritativeCommit, false);

  assert.equal(committed.clearUncommittedLocalStage, false);
  assert.equal(committed.rollbackAuthoritativeCommit, false);
  assert.equal(committed.canCommitLocalInput, false);
});

test('reduced-motion and low-performance projections preserve semantics with static cues', () => {
  const normal = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.RECONNECTING,
  });
  const reduced = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.RECONNECTING,
    reducedMotion: true,
  });
  const lowPerf = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.RECONNECTING,
    lowPerformance: true,
  });

  assert.equal(normal.visualCue, 'RECONNECT_SYNC_SWEEP');
  assert.equal(reduced.visualCue, 'STATIC_STATUS');
  assert.equal(lowPerf.visualCue, 'STATIC_STATUS');
  assert.equal(reduced.canCommitLocalInput, normal.canCommitLocalInput);
  assert.equal(lowPerf.canCommitLocalInput, normal.canCommitLocalInput);
  assert.equal(reduced.requiresAuthoritativeRefresh, true);
  assert.equal(lowPerf.requiresAuthoritativeRefresh, true);
});

test('2v2 control-generation authority can reject stale human and stale temporary-partner envelopes upstream', () => {
  const initial = create2v2ReconnectState({ seats });
  const staleHumanEnvelope = envelope(initial, 'P1');

  const disconnected = disconnect2v2Player(initial, 'H1').state;
  assert.equal(isCurrent2v2ControlEnvelope(disconnected, staleHumanEnvelope), false);

  const staleHumanView = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
  });
  assert.equal(staleHumanView.clearUncommittedLocalStage, true);
  assert.equal(staleHumanView.controlAuthority, false);

  const stalePartnerEnvelope = envelope(disconnected, 'P1');
  const reconnected = reconnect2v2Player(disconnected, 'H1').state;
  assert.equal(isCurrent2v2ControlEnvelope(reconnected, stalePartnerEnvelope), false);
  assert.equal(isCurrent2v2ControlEnvelope(reconnected, envelope(reconnected, 'P1')), true);

  const readyView = projectBattleRecoveryPresentation({ status: BATTLE_RECOVERY_STATUS.READY });
  assert.equal(readyView.canCommitLocalInput, true);
});

test('projection never exposes transport timers, outcomes, takeover rules, or hidden payload fields', () => {
  const view = projectBattleRecoveryPresentation({
    status: BATTLE_RECOVERY_STATUS.STALE_INPUT_REJECTED,
    localStage: BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED,
  });

  for (const forbiddenKey of [
    'graceMs', 'graceSeconds', 'deadline', 'winner', 'forfeit', 'reward',
    'partnerId', 'targetId', 'cardId', 'hand', 'secretPayload',
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(view, forbiddenKey), false, forbiddenKey);
  }
  assert.equal(view.secretExpansion, false);

  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.computesTimeoutOrGrace, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.computesRetryPolicy, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.computesControlOwner, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.computesResult, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.writesGameState, false);
  assert.equal(BATTLE_RECOVERY_PRESENTATION_CONTRACT.expandsSecrets, false);
});

test('invalid status, local stage, and motion flags fail closed', () => {
  assert.throws(() => projectBattleRecoveryPresentation(), /status is not supported/);
  assert.throws(
    () => projectBattleRecoveryPresentation({ status: 'UNKNOWN' }),
    /status is not supported/,
  );
  assert.throws(
    () => projectBattleRecoveryPresentation({
      status: BATTLE_RECOVERY_STATUS.WAITING,
      localStage: 'UNKNOWN',
    }),
    /localStage is not supported/,
  );
  assert.throws(
    () => projectBattleRecoveryPresentation({
      status: BATTLE_RECOVERY_STATUS.WAITING,
      reducedMotion: 'yes',
    }),
    /reducedMotion must be boolean/,
  );
});

test('projection and public contracts are deeply frozen', () => {
  const view = projectBattleRecoveryPresentation({ status: BATTLE_RECOVERY_STATUS.WAITING });

  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(BATTLE_RECOVERY_STATUS), true);
  assert.equal(Object.isFrozen(BATTLE_RECOVERY_LOCAL_STAGE), true);
  assert.equal(Object.isFrozen(BATTLE_RECOVERY_PRESENTATION_CONTRACT), true);
  assert.equal(Object.isFrozen(BATTLE_RECOVERY_PRESENTATION_CONTRACT.statuses), true);
});

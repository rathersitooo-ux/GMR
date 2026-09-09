import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT,
  handoffTitleBootRecovery,
} from '../browser/battle-title-recovery-handoff.mjs';
import {
  TITLE_BOOT_MATCH_AUTHORITY,
  TITLE_BOOT_ROUTE_KINDS,
} from '../browser/title-boot-router-core.mjs';
import {
  create2v2ReconnectState,
} from '../browser/battle-2v2-reconnect-core.mjs';
import {
  BATTLE_RECOVERY_STATUS,
  projectBattleRecoveryPresentation,
} from '../browser/battle-recovery-presentation-core.mjs';

const seats = Object.freeze([
  Object.freeze({ seatId: 'P1', playerId: 'H1', teamId: 'A' }),
  Object.freeze({ seatId: 'P2', playerId: 'H2', teamId: 'A' }),
  Object.freeze({ seatId: 'P3', playerId: 'H3', teamId: 'B' }),
  Object.freeze({ seatId: 'P4', playerId: 'H4', teamId: 'B' }),
]);

function activeMatch(matchId = 'match-001') {
  return Object.freeze({
    resumable: true,
    authority: TITLE_BOOT_MATCH_AUTHORITY,
    matchId,
    resumeContext: Object.freeze({ transportRef: 'opaque-caller-owned' }),
  });
}

function recoveryInput(overrides = {}) {
  return {
    reconnectState: create2v2ReconnectState({ seats }),
    localSeatId: 'P1',
    localPlayerId: 'H1',
    ...overrides,
  };
}

function recordingRuntime({ throwOnSync = false } = {}) {
  const calls = [];
  return {
    calls,
    runtime: {
      sync(input) {
        calls.push(input);
        if (throwOnSync) throw new Error('runtime failure');
        return projectBattleRecoveryPresentation(input);
      },
    },
  };
}

test('authoritative RECOVER_MATCH route forwards exactly once to existing recovery runtime', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: { activeMatch: activeMatch() },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, 'RECOVERY_SYNCED');
  assert.equal(resolved.reason, 'OK');
  assert.equal(resolved.route.kind, TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH);
  assert.equal(resolved.matchId, 'match-001');
  assert.equal(resolved.recovery.status, BATTLE_RECOVERY_STATUS.READY);
  assert.equal(resolved.runtimeSyncInvoked, true);
  assert.equal(rec.calls.length, 1);
  assert.equal(resolved.gameplayAuthority, false);
  assert.equal(resolved.networkAuthority, false);
  assert.equal(resolved.reconnectAuthority, false);
  assert.equal(resolved.saveAuthority, false);
  assert.equal(resolved.gameStateWrite, false);
});

test('required gate keeps priority over match recovery and never invokes runtime sync', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: {
      activeMatch: activeMatch(),
      requiredGate: {
        required: true,
        kind: 'required-download',
        blocksMatchRecovery: true,
        context: Object.freeze({ owner: 'caller' }),
      },
    },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, 'NO_RECOVERY');
  assert.equal(resolved.route.kind, TITLE_BOOT_ROUTE_KINDS.REQUIRED_GATE);
  assert.equal(resolved.runtimeSyncInvoked, false);
  assert.equal(rec.calls.length, 0);
});

test('safe current resume keeps priority and never invokes recovery runtime', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: {
      safeCurrentResume: true,
      activeMatch: activeMatch(),
    },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, 'NO_RECOVERY');
  assert.equal(resolved.route.kind, TITLE_BOOT_ROUTE_KINDS.RESUME_CURRENT);
  assert.equal(resolved.runtimeSyncInvoked, false);
  assert.equal(rec.calls.length, 0);
});

test('non-authoritative resumable match cannot become a recovery handoff', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: {
      activeMatch: {
        resumable: true,
        authority: 'client-local-match',
        matchId: 'match-001',
      },
    },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, 'NO_RECOVERY');
  assert.notEqual(resolved.route.kind, TITLE_BOOT_ROUTE_KINDS.RECOVER_MATCH);
  assert.equal(resolved.runtimeSyncInvoked, false);
  assert.equal(rec.calls.length, 0);
});

test('resolved match identity must equal explicit caller expectation before recovery sync', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: { activeMatch: activeMatch('match-authoritative') },
    expectedMatchId: 'match-stale',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, false);
  assert.equal(resolved.status, 'REJECTED');
  assert.equal(resolved.reason, 'RECOVERY_MATCH_ID_MISMATCH');
  assert.equal(resolved.matchId, 'match-authoritative');
  assert.equal(resolved.runtimeSyncInvoked, false);
  assert.equal(rec.calls.length, 0);
});

test('existing recovery authority rejects a mismatched local player before runtime sync', () => {
  const rec = recordingRuntime();
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: { activeMatch: activeMatch() },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput({ localPlayerId: 'H4' }),
  });

  assert.equal(resolved.ok, false);
  assert.equal(resolved.status, 'RECOVERY_REJECTED');
  assert.equal(resolved.reason, 'LOCAL_PLAYER_SEAT_MISMATCH');
  assert.equal(resolved.runtimeSyncInvoked, false);
  assert.equal(rec.calls.length, 0);
});

test('runtime failure is isolated and reported without creating authority', () => {
  const rec = recordingRuntime({ throwOnSync: true });
  const resolved = handoffTitleBootRecovery({
    runtime: rec.runtime,
    bootInput: { activeMatch: activeMatch() },
    expectedMatchId: 'match-001',
    recoveryInput: recoveryInput(),
  });

  assert.equal(resolved.ok, false);
  assert.equal(resolved.status, 'REJECTED');
  assert.equal(resolved.reason, 'BATTLE_RECOVERY_RUNTIME_SYNC_FAILED');
  assert.equal(resolved.runtimeSyncInvoked, true);
  assert.equal(rec.calls.length, 1);
  assert.equal(resolved.gameplayAuthority, false);
  assert.equal(resolved.networkAuthority, false);
  assert.equal(resolved.saveAuthority, false);
  assert.equal(resolved.gameStateWrite, false);
});

test('handoff contract explicitly owns no Battle, reconnect, transport, save, or rule authority', () => {
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.startsBattle, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.startsReconnect, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.attachesTransport, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.computesControlOwner, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.computesLegality, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.computesResult, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.writesSave, false);
  assert.equal(BATTLE_TITLE_RECOVERY_HANDOFF_CONTRACT.writesGameState, false);
});

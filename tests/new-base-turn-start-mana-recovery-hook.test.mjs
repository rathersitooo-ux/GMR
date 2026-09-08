import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEW_BASE_TURN_START_MANA_RECOVERY_SCHEMA,
  runNewBaseTurnStartManaRecovery,
} from '../browser/new-base-turn-start-mana-recovery-hook.mjs';

test('undecided recovery amount fails closed without touching mana authority', () => {
  let calls = 0;
  const applyManaRecovery = () => { calls += 1; };

  const missing = runNewBaseTurnStartManaRecovery({ applyManaRecovery });
  const explicitNull = runNewBaseTurnStartManaRecovery({ recoveryAmount: null, applyManaRecovery });

  assert.equal(calls, 0);
  assert.deepEqual(missing, {
    schema: NEW_BASE_TURN_START_MANA_RECOVERY_SCHEMA,
    status: 'CONFIG_REQUIRED',
    applied: false,
    recoveryAmount: null,
    authorityResult: null,
  });
  assert.equal(explicitNull.status, 'CONFIG_REQUIRED');
  assert.equal(explicitNull.applied, false);
});

test('configured recovery amount is passed through unchanged to caller-owned mana authority', () => {
  const context = Object.freeze({ matchId: 'match-1', turnId: 'turn-8' });
  const configuredAmount = Object.freeze({ currentConfigValue: 3 });
  let observed = null;

  const outcome = runNewBaseTurnStartManaRecovery({
    recoveryAmount: configuredAmount,
    context,
    applyManaRecovery(input) {
      observed = input;
      return Object.freeze({ manaAuthorityReceipt: 'receipt-1' });
    },
  });

  assert.equal(observed.recoveryAmount, configuredAmount);
  assert.equal(observed.context, context);
  assert.equal(outcome.status, 'APPLIED_BY_AUTHORITY');
  assert.equal(outcome.applied, true);
  assert.equal(outcome.recoveryAmount, configuredAmount);
  assert.deepEqual(outcome.authorityResult, { manaAuthorityReceipt: 'receipt-1' });
});

test('configured zero is not confused with an undecided amount', () => {
  let observed = null;
  const outcome = runNewBaseTurnStartManaRecovery({
    recoveryAmount: 0,
    applyManaRecovery({ recoveryAmount }) {
      observed = recoveryAmount;
      return 'ok';
    },
  });

  assert.equal(observed, 0);
  assert.equal(outcome.status, 'APPLIED_BY_AUTHORITY');
  assert.equal(outcome.recoveryAmount, 0);
});

test('missing caller-owned mana authority fails closed and invents no local state', () => {
  const configuredAmount = Object.freeze({ currentConfigValue: 5 });
  const outcome = runNewBaseTurnStartManaRecovery({ recoveryAmount: configuredAmount });

  assert.deepEqual(outcome, {
    schema: NEW_BASE_TURN_START_MANA_RECOVERY_SCHEMA,
    status: 'AUTHORITY_REQUIRED',
    applied: false,
    recoveryAmount: configuredAmount,
    authorityResult: null,
  });
});

test('authority errors propagate instead of being converted into a false applied receipt', () => {
  assert.throws(
    () => runNewBaseTurnStartManaRecovery({
      recoveryAmount: 4,
      applyManaRecovery() {
        throw new Error('mana authority rejected recovery');
      },
    }),
    /mana authority rejected recovery/,
  );
});

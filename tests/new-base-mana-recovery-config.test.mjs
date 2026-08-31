import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NEW_BASE_MANA_RECOVERY_AMOUNT_KEY,
  NEW_BASE_MANA_RECOVERY_STATUS,
  readNewBaseManaRecoveryConfig,
  requireConfiguredNewBaseManaRecoveryAmount,
} from '../browser/new-base-mana-recovery-config.mjs';

test('missing recovery amount remains explicitly UNDECIDED with no numeric default', () => {
  const config = readNewBaseManaRecoveryConfig({});

  assert.deepEqual(config, {
    status: NEW_BASE_MANA_RECOVERY_STATUS.UNDECIDED,
    amount: null,
  });
  assert.equal(Object.isFrozen(config), true);
});

test('legacy max/current mana fields do not imply full refill for the new base', () => {
  const config = readNewBaseManaRecoveryConfig({
    currentMana: 2,
    maxMana: 8,
  });

  assert.equal(config.status, NEW_BASE_MANA_RECOVERY_STATUS.UNDECIDED);
  assert.equal(config.amount, null);
});

test('only an explicitly supplied authoritative amount becomes CONFIGURED', () => {
  // Arbitrary structural fixture only; this is not a formal gameplay value.
  const source = { [NEW_BASE_MANA_RECOVERY_AMOUNT_KEY]: 2.75 };
  const config = readNewBaseManaRecoveryConfig(source);

  assert.deepEqual(config, {
    status: NEW_BASE_MANA_RECOVERY_STATUS.CONFIGURED,
    amount: 2.75,
  });
  assert.equal(requireConfiguredNewBaseManaRecoveryAmount(config), 2.75);
});

test('the external amount is replaceable instead of being compiled into the core', () => {
  // Arbitrary structural fixtures only; neither value is a formal game rule.
  const first = readNewBaseManaRecoveryConfig({
    [NEW_BASE_MANA_RECOVERY_AMOUNT_KEY]: 1.25,
  });
  const second = readNewBaseManaRecoveryConfig({
    [NEW_BASE_MANA_RECOVERY_AMOUNT_KEY]: 4.5,
  });

  assert.equal(requireConfiguredNewBaseManaRecoveryAmount(first), 1.25);
  assert.equal(requireConfiguredNewBaseManaRecoveryAmount(second), 4.5);
});

test('UNDECIDED fails closed instead of silently becoming zero or max refill', () => {
  const config = readNewBaseManaRecoveryConfig({});

  assert.throws(
    () => requireConfiguredNewBaseManaRecoveryAmount(config),
    /still UNDECIDED/,
  );
});

test('Pursuit-specific mana fields do not leak into the new-base recovery config', () => {
  const config = readNewBaseManaRecoveryConfig({
    physicalManaLoss: 3,
    maxManaReduction: 2,
    finisherMultiplier: 9,
  });

  assert.deepEqual(config, {
    status: NEW_BASE_MANA_RECOVERY_STATUS.UNDECIDED,
    amount: null,
  });
});

test('explicit non-numeric or non-finite values are rejected rather than defaulted', () => {
  for (const invalid of [undefined, null, '3', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => readNewBaseManaRecoveryConfig({
        [NEW_BASE_MANA_RECOVERY_AMOUNT_KEY]: invalid,
      }),
      /finite number supplied by the authoritative rules config/,
    );
  }
});

test('configured status validation does not invent integer, cap, or max-mana semantics', () => {
  // A fractional fixture confirms this layer performs structural validation only.
  const config = readNewBaseManaRecoveryConfig({
    [NEW_BASE_MANA_RECOVERY_AMOUNT_KEY]: 0.5,
  });

  assert.equal(requireConfiguredNewBaseManaRecoveryAmount(config), 0.5);
});

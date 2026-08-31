import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readNewBaseManaRecoveryConfig,
} from '../browser/new-base-mana-recovery-config.mjs';
import {
  applyNewBaseTurnStartManaRecovery,
} from '../browser/new-base-turn-start-mana-recovery-core.mjs';

test('UNDECIDED mana recovery fails closed before any mana mutation', () => {
  const manaRecoveryConfig = readNewBaseManaRecoveryConfig({});
  let calls = 0;

  assert.throws(
    () => applyNewBaseTurnStartManaRecovery({
      manaRecoveryConfig,
      recoverMana() {
        calls += 1;
      },
    }),
    /still UNDECIDED/,
  );
  assert.equal(calls, 0);
});

test('configured recovery delegates the authoritative amount exactly once', () => {
  const manaRecoveryConfig = readNewBaseManaRecoveryConfig({
    turnStartManaRecoveryAmount: 2,
  });
  const received = [];
  const sentinel = { appliedBy: 'shared-mana-consumer' };

  const result = applyNewBaseTurnStartManaRecovery({
    manaRecoveryConfig,
    recoverMana(amount) {
      received.push(amount);
      return sentinel;
    },
  });

  assert.deepEqual(received, [2]);
  assert.equal(result, sentinel);
});

test('the hook remains parameterized instead of embedding a formal recovery value', () => {
  const fixtureAmounts = [2, 7];

  for (const fixtureAmount of fixtureAmounts) {
    const received = [];
    const manaRecoveryConfig = readNewBaseManaRecoveryConfig({
      turnStartManaRecoveryAmount: fixtureAmount,
    });

    applyNewBaseTurnStartManaRecovery({
      manaRecoveryConfig,
      recoverMana(amount) {
        received.push(amount);
      },
    });

    assert.deepEqual(received, [fixtureAmount]);
  }
});

test('the hook requires an injected shared mana consumer instead of mutating its own state', () => {
  const manaRecoveryConfig = readNewBaseManaRecoveryConfig({
    turnStartManaRecoveryAmount: 2,
  });

  assert.throws(
    () => applyNewBaseTurnStartManaRecovery({ manaRecoveryConfig }),
    /recoverMana must be a function/,
  );
});

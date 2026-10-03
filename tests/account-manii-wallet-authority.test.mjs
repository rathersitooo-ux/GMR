import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCOUNT_CURRENCY_AUTHORITY_ID,
  INITIAL_MANII_GRANT_AMOUNT,
  INITIAL_MANII_GRANT_ID,
  claimInitialManiiGrant,
  readAccountManiiWallet,
  accountCurrencyStorageKeysForTest,
} from '../tools/account-manii-wallet-authority.mjs';

function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(structuredClone(seed)));
  return {
    async get(key) {
      return values.has(key) ? structuredClone(values.get(key)) : undefined;
    },
    async transaction(callback) {
      const writes = new Map();
      const txn = {
        async get(key) {
          if (writes.has(key)) return structuredClone(writes.get(key));
          return values.has(key) ? structuredClone(values.get(key)) : undefined;
        },
        put(key, value) {
          writes.set(key, structuredClone(value));
        },
      };
      const result = await callback(txn);
      for (const [key, value] of writes) values.set(key, value);
      return result;
    },
  };
}

test('first authoritative account claim grants exactly 100 MANII and persists it', async () => {
  const storage = createMemoryStorage();
  const result = await claimInitialManiiGrant(storage, { accountId: 'account:alice' }, { nowMs: 123456 });

  assert.equal(result.ok, true);
  assert.equal(result.granted, true);
  assert.equal(result.idempotent, false);
  assert.equal(result.wallet.currency, 'MANII');
  assert.equal(result.wallet.currencyDisplayName, '\u30de\u30cb\u30a3');
  assert.equal(result.wallet.balance, 100);
  assert.equal(result.wallet.initialGrantReceived, true);
  assert.equal(result.wallet.initialGrantAmount, INITIAL_MANII_GRANT_AMOUNT);
  assert.equal(result.wallet.authority.authorityId, ACCOUNT_CURRENCY_AUTHORITY_ID);

  const readback = await readAccountManiiWallet(storage, { accountId: 'account:alice' });
  assert.equal(readback.ok, true);
  assert.equal(readback.wallet.balance, 100);
  assert.equal(readback.wallet.initialGrantReceived, true);
});

test('repeated claim for the same account is idempotent and never grants twice', async () => {
  const storage = createMemoryStorage();
  const first = await claimInitialManiiGrant(storage, { accountId: 'account:alice' }, { nowMs: 1000 });
  const second = await claimInitialManiiGrant(storage, { accountId: 'account:alice' }, { nowMs: 2000 });

  assert.equal(first.wallet.balance, 100);
  assert.equal(second.ok, true);
  assert.equal(second.granted, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.wallet.balance, 100);
  assert.equal(second.wallet.revision, 1);
});

test('different accounts receive independent first grants', async () => {
  const storage = createMemoryStorage();
  const alice = await claimInitialManiiGrant(storage, { accountId: 'account:alice' }, { nowMs: 1000 });
  const bob = await claimInitialManiiGrant(storage, { accountId: 'account:bob' }, { nowMs: 1001 });

  assert.equal(alice.wallet.balance, 100);
  assert.equal(bob.wallet.balance, 100);
  assert.equal(alice.wallet.accountId, 'account:alice');
  assert.equal(bob.wallet.accountId, 'account:bob');
});

test('invalid caller-supplied account identity fails closed', async () => {
  const storage = createMemoryStorage();
  for (const accountId of [undefined, '', ' account:alice', 'account:alice ', 'line\nbreak']) {
    const result = await claimInitialManiiGrant(storage, { accountId });
    assert.deepEqual(result, { ok: false, reason: 'account_identity_invalid' });
  }
});

test('corrupt persisted currency state fails closed instead of resetting or granting again', async () => {
  const accountId = 'account:alice';
  const key = accountCurrencyStorageKeysForTest.walletKey(accountId);
  const storage = createMemoryStorage({
    [key]: {
      schema: 'gameroad.account-currency.wallet.v1',
      accountId,
      currency: 'MANII',
      balance: 100,
      initialGrant: {
        grantId: INITIAL_MANII_GRANT_ID,
        amount: 999,
        grantedAtMs: 1000,
      },
      revision: 1,
    },
  });

  const claim = await claimInitialManiiGrant(storage, { accountId });
  assert.deepEqual(claim, { ok: false, reason: 'account_currency_state_invalid' });

  const read = await readAccountManiiWallet(storage, { accountId });
  assert.deepEqual(read, { ok: false, reason: 'account_currency_state_invalid' });
});

test('existing positive balance still receives the fixed first gift only once', async () => {
  const accountId = 'account:legacy';
  const key = accountCurrencyStorageKeysForTest.walletKey(accountId);
  const storage = createMemoryStorage({
    [key]: {
      schema: 'gameroad.account-currency.wallet.v1',
      accountId,
      currency: 'MANII',
      balance: 40,
      initialGrant: null,
      revision: 2,
    },
  });

  const result = await claimInitialManiiGrant(storage, { accountId }, { nowMs: 5000 });
  assert.equal(result.ok, true);
  assert.equal(result.wallet.balance, 140);
  assert.equal(result.wallet.revision, 3);

  const repeated = await claimInitialManiiGrant(storage, { accountId }, { nowMs: 6000 });
  assert.equal(repeated.wallet.balance, 140);
  assert.equal(repeated.granted, false);
});

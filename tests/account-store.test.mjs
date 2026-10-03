import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import {
  ACCOUNT_SESSION_TTL_MS,
  INITIAL_MANII_GRANT_AMOUNT,
  claimInitialManiiGrant,
  createPlayerAccount,
  derivePlayerAccountId,
  issuePlayerSession,
  readPlayerAccount,
  revokePlayerSession,
} from '../deploy/cloudflare/relay/src/account-store.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : undefined; },
    async transaction(callback) {
      const writes = new Map();
      const deletes = new Set();
      const txn = {
        async get(key) {
          if (deletes.has(key)) return undefined;
          if (writes.has(key)) return structuredClone(writes.get(key));
          return data.has(key) ? structuredClone(data.get(key)) : undefined;
        },
        put(key, value) { deletes.delete(key); writes.set(key, structuredClone(value)); },
        delete(key) { writes.delete(key); deletes.add(key); },
      };
      const result = await callback(txn);
      for (const key of deletes) data.delete(key);
      for (const [key, value] of writes) data.set(key, value);
      return result;
    },
  };
}

const accountKey = 'grk_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234567890_-';
const sessionToken = 'grs_abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-';
const accountId = await derivePlayerAccountId(accountKey, webcrypto);
const runtime = (nowMs) => ({ nowMs, crypto: webcrypto });

async function readyAccount() {
  const storage = memoryStorage();
  const created = await createPlayerAccount(storage, { accountId, accountKey }, runtime(1000));
  assert.equal(created.ok, true);
  const session = await issuePlayerSession(storage, { accountId, accountKey, sessionToken }, runtime(2000));
  assert.equal(session.ok, true);
  return storage;
}

test('creates a stable account without exposing credential material in public state', async () => {
  const storage = memoryStorage();
  const result = await createPlayerAccount(storage, { accountId, accountKey }, runtime(1000));
  assert.equal(result.ok, true);
  assert.equal(result.account.accountId, accountId);
  assert.equal(result.account.wallet.currency, 'MANII');
  assert.equal(result.account.wallet.balance, 0);
  assert.equal('credential' in result.account, false);
  assert.equal(JSON.stringify(result).includes(accountKey), false);
});

test('account creation is single-owner and cannot silently reset an existing account', async () => {
  const storage = memoryStorage();
  assert.equal((await createPlayerAccount(storage, { accountId, accountKey }, runtime(1000))).ok, true);
  const second = await createPlayerAccount(storage, { accountId, accountKey }, runtime(2000));
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
});

test('wrong account key cannot issue a session', async () => {
  const storage = memoryStorage();
  await createPlayerAccount(storage, { accountId, accountKey }, runtime(1000));
  const badKey = 'grk_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
  const result = await issuePlayerSession(storage, { accountId, accountKey: badKey, sessionToken }, runtime(2000));
  assert.deepEqual(result, { ok: false, reason: 'account_auth_invalid' });
});

test('issued session reads the same persisted account and has bounded lifetime', async () => {
  const storage = await readyAccount();
  const read = await readPlayerAccount(storage, { accountId, sessionToken }, runtime(2500));
  assert.equal(read.ok, true);
  assert.equal(read.account.accountId, accountId);
  assert.equal(read.account.wallet.balance, 0);
  assert.equal(read.session.expiresAtMs, 2000 + ACCOUNT_SESSION_TTL_MS);
  const expired = await readPlayerAccount(storage, { accountId, sessionToken }, runtime(2000 + ACCOUNT_SESSION_TTL_MS));
  assert.deepEqual(expired, { ok: false, reason: 'account_session_unauthorized' });
});

test('first onboarding grant adds 100 MANII exactly once per account', async () => {
  const storage = await readyAccount();
  const first = await claimInitialManiiGrant(storage, { accountId, sessionToken }, runtime(3000));
  assert.equal(first.ok, true);
  assert.equal(first.granted, true);
  assert.equal(first.amount, INITIAL_MANII_GRANT_AMOUNT);
  assert.equal(first.account.wallet.balance, 100);
  assert.equal(first.account.onboarding.initialManiiGranted, true);
  const second = await claimInitialManiiGrant(storage, { accountId, sessionToken }, runtime(4000));
  assert.equal(second.ok, true);
  assert.equal(second.granted, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.account.wallet.balance, 100);
  assert.equal(second.account.wallet.revision, 1);
});

test('different accounts are isolated even when they use the same logical flow', async () => {
  const storageA = await readyAccount();
  const keyB = 'grk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  const tokenB = 'grs_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  const accountIdB = await derivePlayerAccountId(keyB, webcrypto);
  const storageB = memoryStorage();
  await createPlayerAccount(storageB, { accountId: accountIdB, accountKey: keyB }, runtime(1000));
  await issuePlayerSession(storageB, { accountId: accountIdB, accountKey: keyB, sessionToken: tokenB }, runtime(2000));
  await claimInitialManiiGrant(storageA, { accountId, sessionToken }, runtime(3000));
  const stateB = await readPlayerAccount(storageB, { accountId: accountIdB, sessionToken: tokenB }, runtime(3000));
  assert.equal(stateB.account.wallet.balance, 0);
});

test('revoked sessions stop authorizing account reads and repeated revoke is safe', async () => {
  const storage = await readyAccount();
  const first = await revokePlayerSession(storage, { accountId, sessionToken }, runtime(3000));
  assert.deepEqual(first, { ok: true, revoked: true, idempotent: false });
  const read = await readPlayerAccount(storage, { accountId, sessionToken }, runtime(3001));
  assert.deepEqual(read, { ok: false, reason: 'account_session_unauthorized' });
  const second = await revokePlayerSession(storage, { accountId, sessionToken }, runtime(3002));
  assert.deepEqual(second, { ok: true, revoked: false, idempotent: true });
});

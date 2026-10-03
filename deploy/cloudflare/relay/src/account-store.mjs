export const ACCOUNT_SCHEMA = 'gameroad.player-account.v1';
export const ACCOUNT_CREDENTIAL_SCHEME = 'random-secret-sha256-v1';
export const ACCOUNT_SESSION_SCHEMA = 'gameroad.player-account.session.v1';
export const MANII_CURRENCY_CODE = 'MANII';
export const MANII_DISPLAY_NAME = 'マニィ';
export const INITIAL_MANII_GRANT_ID = 'account-onboarding-manii:v1';
export const INITIAL_MANII_GRANT_AMOUNT = 100;
export const ACCOUNT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ACCOUNT_STATE_KEY = 'account/state/v1';
const SESSION_PREFIX = 'account/session/v1/';
const MAX_ACCOUNT_ID_LENGTH = 96;
const MAX_SECRET_LENGTH = 256;

function reject(reason) {
  return Object.freeze({ ok: false, reason });
}

function exactToken(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function validAccountId(value) {
  const text = exactToken(value, MAX_ACCOUNT_ID_LENGTH);
  return text && /^acc_[0-9a-f]{32}$/i.test(text) ? text : null;
}

function validSecret(value) {
  const text = exactToken(value, MAX_SECRET_LENGTH);
  return text && /^(?:grk|grs)_[A-Za-z0-9_-]{32,192}$/.test(text) ? text : null;
}

function safeNowMs(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function derivePlayerAccountId(accountKey, cryptoImpl = globalThis.crypto) {
  const key = validSecret(accountKey);
  if (!key || !key.startsWith('grk_')) throw new TypeError('account_key_invalid');
  const digest = await secretDigest(key, cryptoImpl);
  return `acc_${digest.slice(0, 32)}`;
}

async function secretDigest(secret, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle?.digest) throw new TypeError('crypto.subtle.digest required');
  const encoded = new TextEncoder().encode(secret);
  const digest = await cryptoImpl.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0) ^ (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return diff === 0;
}

function sessionKey(digest) {
  return `${SESSION_PREFIX}${digest}`;
}

function normalizeAccount(raw, expectedAccountId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema !== ACCOUNT_SCHEMA || raw.accountId !== expectedAccountId) return null;
  if (!Number.isSafeInteger(raw.createdAtMs) || raw.createdAtMs < 0) return null;
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0) return null;
  if (!raw.credential || raw.credential.scheme !== ACCOUNT_CREDENTIAL_SCHEME) return null;
  if (!/^[0-9a-f]{64}$/.test(raw.credential.digest || '')) return null;
  if (!raw.wallet || raw.wallet.currency !== MANII_CURRENCY_CODE) return null;
  if (!Number.isSafeInteger(raw.wallet.balance) || raw.wallet.balance < 0) return null;
  if (!Number.isSafeInteger(raw.wallet.revision) || raw.wallet.revision < 0) return null;
  const grants = raw.grants && typeof raw.grants === 'object' && !Array.isArray(raw.grants) ? raw.grants : null;
  if (!grants) return null;
  const initial = grants[INITIAL_MANII_GRANT_ID];
  if (initial !== undefined) {
    if (!initial || typeof initial !== 'object' || Array.isArray(initial)) return null;
    if (initial.amount !== INITIAL_MANII_GRANT_AMOUNT) return null;
    if (!Number.isSafeInteger(initial.grantedAtMs) || initial.grantedAtMs < 0) return null;
  }
  return structuredClone(raw);
}

function normalizeSession(raw, expectedAccountId, nowMs) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema !== ACCOUNT_SESSION_SCHEMA || raw.accountId !== expectedAccountId) return null;
  if (!Number.isSafeInteger(raw.issuedAtMs) || raw.issuedAtMs < 0) return null;
  if (!Number.isSafeInteger(raw.expiresAtMs) || raw.expiresAtMs <= raw.issuedAtMs) return null;
  if (raw.expiresAtMs <= nowMs) return null;
  return structuredClone(raw);
}

function publicAccount(account) {
  return Object.freeze({
    accountId: account.accountId,
    accountSchema: account.schema,
    createdAtMs: account.createdAtMs,
    revision: account.revision,
    wallet: Object.freeze({
      currency: account.wallet.currency,
      currencyDisplayName: MANII_DISPLAY_NAME,
      balance: account.wallet.balance,
      revision: account.wallet.revision,
    }),
    onboarding: Object.freeze({
      initialManiiGranted: Boolean(account.grants[INITIAL_MANII_GRANT_ID]),
      initialManiiAmount: account.grants[INITIAL_MANII_GRANT_ID]?.amount ?? 0,
    }),
  });
}

function requireStorage(storage) {
  if (!storage || typeof storage !== 'object' || typeof storage.get !== 'function' || typeof storage.transaction !== 'function') {
    throw new TypeError('storage must provide get and transaction');
  }
  return storage;
}

export async function createPlayerAccount(storage, input = {}, runtime = {}) {
  const store = requireStorage(storage);
  const accountId = validAccountId(input.accountId);
  const accountKey = validSecret(input.accountKey);
  if (!accountId || !accountKey || !accountKey.startsWith('grk_')) return reject('account_create_invalid');
  const nowMs = safeNowMs(runtime.nowMs);
  const digest = await secretDigest(accountKey, runtime.crypto);

  return store.transaction(async (txn) => {
    const existingRaw = await txn.get(ACCOUNT_STATE_KEY);
    if (existingRaw !== undefined) {
      const existing = normalizeAccount(existingRaw, accountId);
      if (!existing) return reject('account_not_found_or_corrupt');
      if (!constantTimeEqual(existing.credential.digest, digest)) return reject('account_identity_conflict');
      return Object.freeze({ ok: true, created: false, idempotent: true, account: publicAccount(existing) });
    }
    const account = {
      schema: ACCOUNT_SCHEMA,
      accountId,
      createdAtMs: nowMs,
      credential: { scheme: ACCOUNT_CREDENTIAL_SCHEME, digest },
      wallet: { currency: MANII_CURRENCY_CODE, balance: 0, revision: 0 },
      grants: {},
      revision: 0,
    };
    txn.put(ACCOUNT_STATE_KEY, account);
    return Object.freeze({ ok: true, created: true, idempotent: false, account: publicAccount(account) });
  });
}

export async function issuePlayerSession(storage, input = {}, runtime = {}) {
  const store = requireStorage(storage);
  const accountId = validAccountId(input.accountId);
  const accountKey = validSecret(input.accountKey);
  const sessionToken = validSecret(input.sessionToken);
  if (!accountId || !accountKey?.startsWith('grk_') || !sessionToken?.startsWith('grs_')) return reject('account_session_invalid');
  const nowMs = safeNowMs(runtime.nowMs);
  const [accountKeyDigest, sessionDigest] = await Promise.all([
    secretDigest(accountKey, runtime.crypto),
    secretDigest(sessionToken, runtime.crypto),
  ]);

  return store.transaction(async (txn) => {
    const account = normalizeAccount(await txn.get(ACCOUNT_STATE_KEY), accountId);
    if (!account) return reject('account_not_found_or_corrupt');
    if (!constantTimeEqual(account.credential.digest, accountKeyDigest)) return reject('account_auth_invalid');
    const expiresAtMs = nowMs + ACCOUNT_SESSION_TTL_MS;
    txn.put(sessionKey(sessionDigest), {
      schema: ACCOUNT_SESSION_SCHEMA,
      accountId,
      issuedAtMs: nowMs,
      expiresAtMs,
    });
    return Object.freeze({ ok: true, accountId, expiresAtMs });
  });
}

async function authenticatedTransaction(storage, input, runtime, callback) {
  const store = requireStorage(storage);
  const accountId = validAccountId(input.accountId);
  const sessionToken = validSecret(input.sessionToken);
  if (!accountId || !sessionToken?.startsWith('grs_')) return reject('account_session_invalid');
  const nowMs = safeNowMs(runtime.nowMs);
  const digest = await secretDigest(sessionToken, runtime.crypto);
  return store.transaction(async (txn) => {
    const session = normalizeSession(await txn.get(sessionKey(digest)), accountId, nowMs);
    if (!session) return reject('account_session_unauthorized');
    const account = normalizeAccount(await txn.get(ACCOUNT_STATE_KEY), accountId);
    if (!account) return reject('account_not_found_or_corrupt');
    return callback({ txn, account, nowMs, session });
  });
}

export async function readPlayerAccount(storage, input = {}, runtime = {}) {
  return authenticatedTransaction(storage, input, runtime, async ({ account, session }) => Object.freeze({
    ok: true,
    account: publicAccount(account),
    session: Object.freeze({ expiresAtMs: session.expiresAtMs }),
  }));
}

export async function claimInitialManiiGrant(storage, input = {}, runtime = {}) {
  return authenticatedTransaction(storage, input, runtime, async ({ txn, account, nowMs }) => {
    const existing = account.grants[INITIAL_MANII_GRANT_ID];
    if (existing) {
      return Object.freeze({
        ok: true,
        granted: false,
        idempotent: true,
        amount: existing.amount,
        account: publicAccount(account),
      });
    }
    if (account.wallet.balance > Number.MAX_SAFE_INTEGER - INITIAL_MANII_GRANT_AMOUNT) {
      return reject('account_wallet_overflow');
    }
    const next = {
      ...account,
      wallet: {
        ...account.wallet,
        balance: account.wallet.balance + INITIAL_MANII_GRANT_AMOUNT,
        revision: account.wallet.revision + 1,
      },
      grants: {
        ...account.grants,
        [INITIAL_MANII_GRANT_ID]: {
          amount: INITIAL_MANII_GRANT_AMOUNT,
          grantedAtMs: nowMs,
        },
      },
      revision: account.revision + 1,
    };
    txn.put(ACCOUNT_STATE_KEY, next);
    return Object.freeze({
      ok: true,
      granted: true,
      idempotent: false,
      amount: INITIAL_MANII_GRANT_AMOUNT,
      account: publicAccount(next),
    });
  });
}

export async function revokePlayerSession(storage, input = {}, runtime = {}) {
  const store = requireStorage(storage);
  const accountId = validAccountId(input.accountId);
  const sessionToken = validSecret(input.sessionToken);
  if (!accountId || !sessionToken?.startsWith('grs_')) return reject('account_session_invalid');
  const digest = await secretDigest(sessionToken, runtime.crypto);
  const nowMs = safeNowMs(runtime.nowMs);
  return store.transaction(async (txn) => {
    const session = normalizeSession(await txn.get(sessionKey(digest)), accountId, nowMs);
    if (!session) return Object.freeze({ ok: true, revoked: false, idempotent: true });
    txn.delete(sessionKey(digest));
    return Object.freeze({ ok: true, revoked: true, idempotent: false });
  });
}

export const accountStoreKeysForTest = Object.freeze({ ACCOUNT_STATE_KEY, sessionKey });

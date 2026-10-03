export const ACCOUNT_CURRENCY_AUTHORITY_ID = 'gameroad.account-currency.authority.v1';
export const ACCOUNT_CURRENCY_SCHEMA = 'gameroad.account-currency.wallet.v1';
export const MANII_CURRENCY_CODE = 'MANII';
export const MANII_DISPLAY_NAME = '\u30de\u30cb\u30a3';
export const INITIAL_MANII_GRANT_ID = 'initial-account-grant:v1';
export const INITIAL_MANII_GRANT_AMOUNT = 100;

const RECORD_PREFIX = 'account-currency/wallet/';
const MAX_ACCOUNT_ID_LENGTH = 192;

function reject(reason) {
  return Object.freeze({ ok: false, reason });
}

function exactToken(value, max = MAX_ACCOUNT_ID_LENGTH) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function safeNowMs(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
}

function walletKey(accountId) {
  return `${RECORD_PREFIX}${encodeURIComponent(accountId)}`;
}

function emptyWallet(accountId) {
  return {
    schema: ACCOUNT_CURRENCY_SCHEMA,
    accountId,
    currency: MANII_CURRENCY_CODE,
    balance: 0,
    initialGrant: null,
    revision: 0,
  };
}

function normalizeWallet(raw, accountId) {
  if (raw === undefined || raw === null) return emptyWallet(accountId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.schema !== ACCOUNT_CURRENCY_SCHEMA) return null;
  if (raw.accountId !== accountId) return null;
  if (raw.currency !== MANII_CURRENCY_CODE) return null;
  if (!Number.isSafeInteger(raw.balance) || raw.balance < 0) return null;
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 0) return null;

  if (raw.initialGrant !== null) {
    if (!raw.initialGrant || typeof raw.initialGrant !== 'object' || Array.isArray(raw.initialGrant)) return null;
    if (raw.initialGrant.grantId !== INITIAL_MANII_GRANT_ID) return null;
    if (raw.initialGrant.amount !== INITIAL_MANII_GRANT_AMOUNT) return null;
    if (!Number.isSafeInteger(raw.initialGrant.grantedAtMs) || raw.initialGrant.grantedAtMs < 0) return null;
  }

  return {
    schema: ACCOUNT_CURRENCY_SCHEMA,
    accountId,
    currency: MANII_CURRENCY_CODE,
    balance: raw.balance,
    initialGrant: raw.initialGrant === null ? null : {
      grantId: raw.initialGrant.grantId,
      amount: raw.initialGrant.amount,
      grantedAtMs: raw.initialGrant.grantedAtMs,
    },
    revision: raw.revision,
  };
}

function publicWallet(wallet) {
  return Object.freeze({
    schema: wallet.schema,
    accountId: wallet.accountId,
    currency: wallet.currency,
    currencyDisplayName: MANII_DISPLAY_NAME,
    balance: wallet.balance,
    initialGrantReceived: wallet.initialGrant !== null,
    initialGrantAmount: wallet.initialGrant?.amount ?? 0,
    revision: wallet.revision,
    authority: Object.freeze({
      verified: true,
      authorityId: ACCOUNT_CURRENCY_AUTHORITY_ID,
    }),
  });
}

function requireStorage(storage) {
  if (!storage || typeof storage !== 'object' || typeof storage.transaction !== 'function' || typeof storage.get !== 'function') {
    throw new TypeError('storage must provide get and transaction');
  }
  return storage;
}

function normalizedAccount(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return exactToken(input.accountId);
}

export async function readAccountManiiWallet(storage, input = {}) {
  const store = requireStorage(storage);
  const accountId = normalizedAccount(input);
  if (!accountId) return reject('account_identity_invalid');
  const wallet = normalizeWallet(await store.get(walletKey(accountId)), accountId);
  if (!wallet) return reject('account_currency_state_invalid');
  return Object.freeze({ ok: true, wallet: publicWallet(wallet) });
}

/**
 * Atomically grants the fixed first-account MANII gift exactly once per authoritative account identity.
 *
 * The caller must supply an already-authenticated accountId. This module intentionally does not accept
 * browser/session/client identity as account authority and exposes no public HTTP route by itself.
 */
export async function claimInitialManiiGrant(storage, input = {}, runtime = {}) {
  const store = requireStorage(storage);
  const accountId = normalizedAccount(input);
  if (!accountId) return reject('account_identity_invalid');
  const nowMs = safeNowMs(runtime.nowMs);

  return store.transaction(async (txn) => {
    const key = walletKey(accountId);
    const current = normalizeWallet(await txn.get(key), accountId);
    if (!current) return reject('account_currency_state_invalid');

    if (current.initialGrant !== null) {
      return Object.freeze({
        ok: true,
        granted: false,
        idempotent: true,
        wallet: publicWallet(current),
      });
    }

    if (current.balance > Number.MAX_SAFE_INTEGER - INITIAL_MANII_GRANT_AMOUNT) {
      return reject('account_currency_balance_overflow');
    }

    const next = {
      ...current,
      balance: current.balance + INITIAL_MANII_GRANT_AMOUNT,
      initialGrant: {
        grantId: INITIAL_MANII_GRANT_ID,
        amount: INITIAL_MANII_GRANT_AMOUNT,
        grantedAtMs: nowMs,
      },
      revision: current.revision + 1,
    };
    txn.put(key, next);

    return Object.freeze({
      ok: true,
      granted: true,
      idempotent: false,
      wallet: publicWallet(next),
    });
  });
}

export const accountCurrencyStorageKeysForTest = Object.freeze({ walletKey });

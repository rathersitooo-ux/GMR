import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { onRequest } from '../deploy/cloudflare/functions/account.js';

const runtimeSource = await readFile(new URL('../deploy/nakama/modules/index.js', import.meta.url), 'utf8');

function loadRuntime() {
  const sandbox = {
    console,
    JSON,
    Error,
    String,
    Object,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    runtimeSource + '\n;globalThis.__gameroadTest = { InitModule, gameroadEnsureInitialManiiGrant, gameroadBootstrapRpc };',
    sandbox,
    { filename: 'deploy/nakama/modules/index.js' },
  );
  return sandbox.__gameroadTest;
}

function marker({ amount = 100 } = {}) {
  return {
    collection: 'gameroad_economy',
    key: 'onboarding_manii_v1',
    userId: 'user-1',
    value: {
      grantId: 'account-onboarding-manii:v1',
      amount,
    },
    version: 'v1',
  };
}

test('Nakama runtime registers one bootstrap RPC and supported authentication hooks', () => {
  const runtime = loadRuntime();
  const calls = [];
  const initializer = new Proxy({}, {
    get(_target, prop) {
      return (...args) => calls.push([String(prop), ...args]);
    },
  });
  runtime.InitModule({}, { info() {} }, {}, initializer);

  assert.equal(calls.filter(([name]) => name === 'registerRpc').length, 1);
  assert.equal(calls.find(([name]) => name === 'registerRpc')?.[1], 'gameroad_bootstrap');

  for (const hook of [
    'registerAfterAuthenticateDevice',
    'registerAfterAuthenticateCustom',
    'registerAfterAuthenticateEmail',
    'registerAfterAuthenticateApple',
    'registerAfterAuthenticateGoogle',
    'registerAfterAuthenticateGameCenter',
    'registerAfterAuthenticateSteam',
    'registerAfterAuthenticateFacebook',
    'registerAfterAuthenticateFacebookInstantGame',
  ]) {
    assert.equal(calls.filter(([name]) => name === hook).length, 1, hook);
  }
});

test('first bootstrap atomically creates the onboarding marker, adds 100 MANII, and writes the wallet ledger', () => {
  const runtime = loadRuntime();
  const multiUpdates = [];
  const nk = {
    storageRead() { return []; },
    multiUpdate(accountUpdates, storageWrites, storageDeletes, walletUpdates, updateLedger) {
      multiUpdates.push({ accountUpdates, storageWrites, storageDeletes, walletUpdates, updateLedger });
      return { storageWriteAcks: [], walletUpdateAcks: [] };
    },
  };

  const result = runtime.gameroadEnsureInitialManiiGrant(
    { userId: 'user-1' },
    { error() {} },
    nk,
  );

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: true,
    granted: true,
    idempotent: false,
    grantId: 'account-onboarding-manii:v1',
    amount: 100,
  });
  assert.equal(multiUpdates.length, 1);

  const update = multiUpdates[0];
  assert.equal(update.accountUpdates, null);
  assert.equal(update.storageDeletes, null);
  assert.equal(update.updateLedger, true);
  assert.equal(update.storageWrites.length, 1);
  assert.deepEqual(update.storageWrites[0], {
    collection: 'gameroad_economy',
    key: 'onboarding_manii_v1',
    userId: 'user-1',
    value: {
      grantId: 'account-onboarding-manii:v1',
      amount: 100,
    },
    version: '*',
    permissionRead: 1,
    permissionWrite: 0,
  });
  assert.deepEqual(update.walletUpdates, [{
    userId: 'user-1',
    changeset: { MANII: 100 },
    metadata: {
      reason: 'ACCOUNT_ONBOARDING',
      grantId: 'account-onboarding-manii:v1',
    },
  }]);
});

test('existing onboarding marker makes repeated bootstrap idempotent without another wallet mutation', () => {
  const runtime = loadRuntime();
  let updateCount = 0;
  const nk = {
    storageRead() { return [marker()]; },
    multiUpdate() { updateCount += 1; },
  };

  const result = runtime.gameroadEnsureInitialManiiGrant(
    { userId: 'user-1' },
    { error() {} },
    nk,
  );

  assert.equal(result.ok, true);
  assert.equal(result.granted, false);
  assert.equal(result.idempotent, true);
  assert.equal(result.amount, 100);
  assert.equal(updateCount, 0);
});

test('concurrent create-only marker race converges without a duplicate grant', () => {
  const runtime = loadRuntime();
  let reads = 0;
  let updates = 0;
  const nk = {
    storageRead() {
      reads += 1;
      return reads === 1 ? [] : [marker()];
    },
    multiUpdate() {
      updates += 1;
      throw new Error('storage version conflict');
    },
  };

  const result = runtime.gameroadEnsureInitialManiiGrant(
    { userId: 'user-1' },
    { error() {} },
    nk,
  );

  assert.equal(result.ok, true);
  assert.equal(result.granted, false);
  assert.equal(result.idempotent, true);
  assert.equal(updates, 1);
  assert.equal(reads, 2);
});

test('unexpected grant transaction failure remains an error when no marker exists after the failure', () => {
  const runtime = loadRuntime();
  const nk = {
    storageRead() { return []; },
    multiUpdate() { throw new Error('database unavailable'); },
  };

  assert.throws(
    () => runtime.gameroadEnsureInitialManiiGrant(
      { userId: 'user-1' },
      { error() {} },
      nk,
    ),
    /database unavailable/,
  );
});

function fetchRouter(routes, calls) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const route of routes) {
      if (String(url).includes(route.includes)) {
        return new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    throw new Error('unexpected upstream: ' + url);
  };
}

function contextFor({ url, method = 'GET', body, headers = {}, env = {}, fetchImpl }) {
  return {
    request: new Request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env: {
      NAKAMA_BASE_URL: 'https://nakama.example',
      NAKAMA_SERVER_KEY: 'test-server-key',
      ...env,
    },
    fetch: fetchImpl,
  };
}

test('Cloudflare device authentication returns player state but keeps refresh token and server key out of JSON', async () => {
  const calls = [];
  const fetchImpl = fetchRouter([
    {
      includes: '/v2/account/authenticate/device?create=true',
      body: { created: true, token: 'access-token-abcdefghijklmnop', refresh_token: 'refresh-token-abcdefghijklmnop' },
    },
    {
      includes: '/v2/rpc/gameroad_bootstrap',
      body: { payload: JSON.stringify({ ok: true, granted: true, idempotent: false, amount: 100 }) },
    },
    {
      includes: '/v2/account',
      body: { user: { id: 'player-uuid-1', username: 'PlayerOne' }, wallet: JSON.stringify({ MANII: 100 }) },
    },
  ], calls);

  const response = await onRequest(contextFor({
    url: 'https://game.example/account?op=authenticate-device',
    method: 'POST',
    body: { deviceId: 'device-identity-00000001' },
    fetchImpl,
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.created, true);
  assert.equal(payload.playerId, 'player-uuid-1');
  assert.equal(payload.wallet.MANII, 100);
  assert.equal(payload.token, 'access-token-abcdefghijklmnop');
  assert.equal(JSON.stringify(payload).includes('refresh-token-abcdefghijklmnop'), false);
  assert.equal(JSON.stringify(payload).includes('test-server-key'), false);

  const cookie = response.headers.get('set-cookie') || '';
  assert.match(cookie, /gameroad_nakama_refresh=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Strict/i);

  assert.equal(calls.length, 3);
  assert.match(calls[0].init.headers.authorization, /^Basic /);
  assert.equal(calls[1].init.headers.authorization, 'Bearer access-token-abcdefghijklmnop');
});

test('Cloudflare refresh consumes HttpOnly cookie server-side and rotates it without a client refresh body', async () => {
  const calls = [];
  const fetchImpl = fetchRouter([
    {
      includes: '/v2/account/session/refresh',
      body: { token: 'access-token-rotated-abcdefghijkl', refresh_token: 'refresh-token-rotated-abcdefghijkl' },
    },
    {
      includes: '/v2/rpc/gameroad_bootstrap',
      body: { payload: JSON.stringify({ ok: true, granted: false, idempotent: true, amount: 100 }) },
    },
    {
      includes: '/v2/account',
      body: { user: { id: 'player-uuid-1', username: 'PlayerOne' }, wallet: JSON.stringify({ MANII: 100 }) },
    },
  ], calls);

  const response = await onRequest(contextFor({
    url: 'https://game.example/account?op=refresh',
    method: 'POST',
    headers: { cookie: 'gameroad_nakama_refresh=refresh-token-old-abcdefghijklmnop' },
    fetchImpl,
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.token, 'access-token-rotated-abcdefghijkl');
  assert.equal(JSON.stringify(payload).includes('refresh-token-rotated-abcdefghijkl'), false);
  assert.match(response.headers.get('set-cookie') || '', /refresh-token-rotated-abcdefghijkl/);

  const refreshCall = calls.find((call) => call.url.includes('/v2/account/session/refresh'));
  assert.ok(refreshCall);
  assert.deepEqual(JSON.parse(refreshCall.init.body), { token: 'refresh-token-old-abcdefghijklmnop' });
});

test('account facade fails closed before upstream calls when service configuration or device identity is invalid', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('must not call'); };

  const unconfigured = await onRequest(contextFor({
    url: 'https://game.example/account?op=authenticate-device',
    method: 'POST',
    body: { deviceId: 'device-identity-00000001' },
    env: { NAKAMA_BASE_URL: '', NAKAMA_SERVER_KEY: '' },
    fetchImpl,
  }));
  assert.equal(unconfigured.status, 503);

  const invalid = await onRequest(contextFor({
    url: 'https://game.example/account?op=authenticate-device',
    method: 'POST',
    body: { deviceId: 'short' },
    fetchImpl,
  }));
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
});

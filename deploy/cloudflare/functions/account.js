const MAX_BODY_BYTES = 8192;
const REFRESH_COOKIE = 'gameroad_nakama_refresh';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function json(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  return new Response(JSON.stringify(body), { status, headers });
}

function exactToken(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length < min || text.length > max || /[\u0000-\u0020\u007f]/.test(text)) return null;
  return text;
}

function nakamaBaseUrl(env) {
  const raw = typeof env?.NAKAMA_BASE_URL === 'string' ? env.NAKAMA_BASE_URL.trim() : '';
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); } catch { return null; }
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return null;
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function serverKey(env) {
  return exactToken(env?.NAKAMA_SERVER_KEY, 8, 512);
}

function basicAuth(key) {
  return `Basic ${btoa(`${key}:`)}`;
}

function bearerFromRequest(request) {
  const value = request.headers.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(value);
  return match ? match[1] : null;
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

function refreshCookie(token, env) {
  const secure = env?.GAMEROAD_ACCOUNT_COOKIE_SECURE !== '0';
  return [
    `${REFRESH_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    secure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/account',
    `Max-Age=${REFRESH_COOKIE_MAX_AGE}`,
  ].filter(Boolean).join('; ');
}

function clearRefreshCookie(env) {
  const secure = env?.GAMEROAD_ACCOUNT_COOKIE_SECURE !== '0';
  return [
    `${REFRESH_COOKIE}=`,
    'HttpOnly',
    secure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/account',
    'Max-Age=0',
  ].filter(Boolean).join('; ');
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new Error('request_too_large');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('request_too_large');
  return JSON.parse(text || '{}');
}

async function upstreamJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  let payload = null;
  try { payload = await response.json(); } catch {}
  return { response, payload };
}

async function bootstrap(fetchImpl, baseUrl, token) {
  const result = await upstreamJson(fetchImpl, `${baseUrl}/v2/rpc/gameroad_bootstrap`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: '""',
  });
  if (!result.response.ok || typeof result.payload?.payload !== 'string') {
    return { ok: false, reason: 'nakama_bootstrap_failed' };
  }
  try {
    const parsed = JSON.parse(result.payload.payload);
    return parsed?.ok === true ? parsed : { ok: false, reason: 'nakama_bootstrap_invalid' };
  } catch {
    return { ok: false, reason: 'nakama_bootstrap_invalid' };
  }
}

async function fetchAccount(fetchImpl, baseUrl, token) {
  const result = await upstreamJson(fetchImpl, `${baseUrl}/v2/account`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!result.response.ok || !result.payload?.user?.id) return null;
  let wallet = {};
  try {
    wallet = typeof result.payload.wallet === 'string' ? JSON.parse(result.payload.wallet || '{}') : (result.payload.wallet || {});
  } catch {
    wallet = {};
  }
  const manii = Number(wallet.MANII);
  return {
    playerId: String(result.payload.user.id),
    username: String(result.payload.user.username || ''),
    wallet: {
      MANII: Number.isSafeInteger(manii) && manii >= 0 ? manii : 0,
    },
  };
}

async function completeSession(fetchImpl, baseUrl, session) {
  const token = exactToken(session?.token, 16, 8192);
  const refreshToken = exactToken(session?.refresh_token, 16, 8192);
  if (!token || !refreshToken) return { ok: false, reason: 'nakama_session_invalid' };

  const onboarding = await bootstrap(fetchImpl, baseUrl, token);
  if (!onboarding.ok) return onboarding;

  const account = await fetchAccount(fetchImpl, baseUrl, token);
  if (!account) return { ok: false, reason: 'nakama_account_read_failed' };

  return {
    ok: true,
    created: session?.created === true,
    token,
    refreshToken,
    account,
    onboarding,
  };
}

async function authenticateDevice(context, baseUrl, key) {
  let body;
  try { body = await readJson(context.request); } catch {
    return json({ ok: false, reason: 'invalid_request' }, 400);
  }
  const deviceId = exactToken(body?.deviceId, 10, 128);
  if (!deviceId) return json({ ok: false, reason: 'device_id_invalid' }, 400);

  const fetchImpl = typeof context.fetch === 'function' ? context.fetch : fetch;
  const result = await upstreamJson(fetchImpl, `${baseUrl}/v2/account/authenticate/device?create=true`, {
    method: 'POST',
    headers: {
      authorization: basicAuth(key),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ id: deviceId }),
  });
  if (!result.response.ok) return json({ ok: false, reason: 'authentication_rejected' }, result.response.status === 429 ? 429 : 401);

  const completed = await completeSession(fetchImpl, baseUrl, result.payload);
  if (!completed.ok) return json(completed, 503);

  return json({
    ok: true,
    created: completed.created,
    playerId: completed.account.playerId,
    username: completed.account.username,
    token: completed.token,
    wallet: completed.account.wallet,
    onboarding: completed.onboarding,
  }, 200, { 'set-cookie': refreshCookie(completed.refreshToken, context.env) });
}

async function refreshSession(context, baseUrl, key) {
  const refreshToken = exactToken(cookieValue(context.request, REFRESH_COOKIE), 16, 8192);
  if (!refreshToken) return json({ ok: false, reason: 'refresh_session_missing' }, 401);

  const fetchImpl = typeof context.fetch === 'function' ? context.fetch : fetch;
  const result = await upstreamJson(fetchImpl, `${baseUrl}/v2/account/session/refresh`, {
    method: 'POST',
    headers: {
      authorization: basicAuth(key),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ token: refreshToken }),
  });
  if (!result.response.ok) {
    return json({ ok: false, reason: 'refresh_session_rejected' }, 401, { 'set-cookie': clearRefreshCookie(context.env) });
  }

  const completed = await completeSession(fetchImpl, baseUrl, result.payload);
  if (!completed.ok) return json(completed, 503);

  return json({
    ok: true,
    playerId: completed.account.playerId,
    username: completed.account.username,
    token: completed.token,
    wallet: completed.account.wallet,
    onboarding: completed.onboarding,
  }, 200, { 'set-cookie': refreshCookie(completed.refreshToken, context.env) });
}

async function currentAccount(context, baseUrl) {
  const token = exactToken(bearerFromRequest(context.request), 16, 8192);
  if (!token) return json({ ok: false, reason: 'session_missing' }, 401);
  const fetchImpl = typeof context.fetch === 'function' ? context.fetch : fetch;
  const account = await fetchAccount(fetchImpl, baseUrl, token);
  if (!account) return json({ ok: false, reason: 'session_invalid' }, 401);
  return json({ ok: true, ...account });
}

async function logout(context, baseUrl) {
  const token = exactToken(bearerFromRequest(context.request), 16, 8192);
  const refreshToken = exactToken(cookieValue(context.request, REFRESH_COOKIE), 16, 8192);
  if (!token || !refreshToken) {
    return json({ ok: true, loggedOut: true }, 200, { 'set-cookie': clearRefreshCookie(context.env) });
  }

  const fetchImpl = typeof context.fetch === 'function' ? context.fetch : fetch;
  await fetchImpl(`${baseUrl}/v2/session/logout`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token, refresh_token: refreshToken }),
  });
  return json({ ok: true, loggedOut: true }, 200, { 'set-cookie': clearRefreshCookie(context.env) });
}

export async function onRequest(context) {
  const baseUrl = nakamaBaseUrl(context.env);
  const key = serverKey(context.env);
  if (!baseUrl || !key) return json({ ok: false, reason: 'account_service_not_configured' }, 503);

  const url = new URL(context.request.url);
  const op = url.searchParams.get('op') || '';

  if (op === 'authenticate-device' && context.request.method === 'POST') {
    return authenticateDevice(context, baseUrl, key);
  }
  if (op === 'refresh' && context.request.method === 'POST') {
    return refreshSession(context, baseUrl, key);
  }
  if (op === 'account' && context.request.method === 'GET') {
    return currentAccount(context, baseUrl);
  }
  if (op === 'logout' && context.request.method === 'POST') {
    return logout(context, baseUrl);
  }
  return json({ ok: false, reason: 'account_operation_not_found' }, 404);
}

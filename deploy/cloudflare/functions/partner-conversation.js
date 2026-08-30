const CONVAI_ENDPOINT = 'https://api.convai.com/character/getResponse';
const PARTNER_ID = 'partner.saasuna';
const MAX_BODY_BYTES = 32768;
const MAX_SESSION_ID = 160;
const MAX_TURN_ID = 160;
const MAX_MESSAGE = 800;
const MAX_PROVIDER_SESSION_ID = 256;
const UPSTREAM_TIMEOUT_MS = 12000;

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function boundedString(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function validateRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.kind !== 'partner_convai_turn_request' || body.partnerId !== PARTNER_ID) return null;
  const dialogueVersion = boundedString(body.dialogueVersion, 160);
  const sourceId = boundedString(body.sourceId, 200);
  const sourceUseSite = boundedString(body.sourceUseSite, 200);
  const sessionId = boundedString(body.sessionId, MAX_SESSION_ID);
  const turnId = boundedString(body.turnId, MAX_TURN_ID);
  const userMessage = boundedString(body.userMessage, MAX_MESSAGE);
  const providerSessionId = body.providerSessionId == null ? null : boundedString(body.providerSessionId, MAX_PROVIDER_SESSION_ID);
  if (!dialogueVersion || !sourceId || !sourceUseSite || !sessionId || !turnId || !userMessage) return null;
  if (body.providerSessionId != null && !providerSessionId) return null;
  return Object.freeze({ partnerId: PARTNER_ID, dialogueVersion, sourceId, sourceUseSite, sessionId, turnId, userMessage, providerSessionId });
}

async function readJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) return { error: 'UNSUPPORTED_MEDIA_TYPE' };
  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return { error: 'REQUEST_TOO_LARGE' };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { error: 'REQUEST_TOO_LARGE' };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { error: 'INVALID_JSON' };
  }
}

function sameOriginAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function publicUpstreamError(code = 'PROVIDER_UPSTREAM_FAILED') {
  return json(502, { ok: false, code });
}

export function createPartnerConversationHandler({ fetchImpl = globalThis.fetch, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  return async function onRequest(context) {
    const request = context?.request;
    if (!(request instanceof Request)) return json(500, { ok: false, code: 'INVALID_REQUEST_CONTEXT' });
    if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' }, { allow: 'POST' });
    if (!sameOriginAllowed(request)) return json(403, { ok: false, code: 'ORIGIN_FORBIDDEN' });

    const parsed = await readJsonBody(request);
    if (parsed.error === 'UNSUPPORTED_MEDIA_TYPE') return json(415, { ok: false, code: parsed.error });
    if (parsed.error === 'REQUEST_TOO_LARGE') return json(413, { ok: false, code: parsed.error });
    if (parsed.error) return json(400, { ok: false, code: parsed.error });
    const turn = validateRequestBody(parsed.value);
    if (!turn) return json(400, { ok: false, code: 'INVALID_REQUEST' });

    const apiKey = boundedString(context?.env?.CONVAI_API_KEY, 4096);
    const characterId = boundedString(context?.env?.CONVAI_SAASUNA_CHARACTER_ID, 512);
    if (!apiKey || !characterId) return json(503, { ok: false, code: 'PROVIDER_NOT_CONFIGURED' });

    const form = new FormData();
    form.set('userText', turn.userMessage);
    form.set('charID', characterId);
    form.set('sessionID', turn.providerSessionId || '-1');
    form.set('voiceResponse', 'false');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstream;
    try {
      upstream = await fetchImpl(CONVAI_ENDPOINT, {
        method: 'POST',
        headers: { 'CONVAI-API-KEY': apiKey, accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return publicUpstreamError('PROVIDER_NETWORK_ERROR');
    }
    clearTimeout(timer);
    if (!upstream.ok) return publicUpstreamError();

    let payload;
    try {
      payload = await upstream.json();
    } catch {
      return publicUpstreamError('PROVIDER_MALFORMED_RESPONSE');
    }
    const text = boundedString(payload?.text, MAX_MESSAGE);
    const providerSessionId = boundedString(payload?.sessionID, MAX_PROVIDER_SESSION_ID);
    if (!text || !providerSessionId) return publicUpstreamError('PROVIDER_MALFORMED_RESPONSE');
    if (payload?.charID != null && payload.charID !== characterId) return publicUpstreamError('PROVIDER_IDENTITY_MISMATCH');

    return json(200, {
      ok: true,
      kind: 'utterance_candidate',
      partnerId: turn.partnerId,
      dialogueVersion: turn.dialogueVersion,
      sourceId: turn.sourceId,
      text,
      providerSessionId,
      provider: 'convai',
    });
  };
}

export const onRequest = createPartnerConversationHandler();

const PARTNER_ID = 'partner.saasuna';
const CONVAI_ENDPOINT = 'https://api.convai.com/character/getResponse';
const PARTNER_MAX_MESSAGE_LENGTH = 4000;
const PARTNER_MAX_GROUNDING_ITEMS = 6;
const PARTNER_MAX_GROUNDING_LENGTH = 300;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function exactToken(value, max = 200) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max || text !== value) return null;
  return text;
}

function safeGrounding(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > PARTNER_MAX_GROUNDING_ITEMS) return null;
  const output = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return null;
    const text = entry.trim();
    if (!text || text.length > PARTNER_MAX_GROUNDING_LENGTH) return null;
    output.push(text);
  }
  return output;
}

function convaiUserText(message, grounding) {
  if (!grounding.length) return message;
  return [
    'GAMEROADから渡された検証済み参考情報です。人物設定・関係性・ゲーム結果の事実をこの情報だけで新規作成しないでください。',
    ...grounding.map((item) => `- ${item}`),
    '',
    `利用者の発話: ${message}`,
  ].join('\n');
}

export async function handlePartnerChatRequest(request, env = {}, fetchImpl = globalThis.fetch) {
  if (!request || request.method !== 'POST') {
    return jsonResponse({ ok: false, reason: 'PARTNER_CHAT_METHOD_NOT_ALLOWED' }, 405);
  }
  if (typeof fetchImpl !== 'function') {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_FETCH_UNAVAILABLE' }, 503);
  }

  const apiKey = exactToken(env.CONVAI_API_KEY, 512);
  const characterId = exactToken(env.CONVAI_SAASUNA_CHARACTER_ID, 256);
  if (!apiKey || !characterId) {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_NOT_CONFIGURED' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, reason: 'PARTNER_CHAT_BODY_INVALID' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ ok: false, reason: 'PARTNER_CHAT_BODY_INVALID' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sessionId = body.sessionId === undefined || body.sessionId === null
    ? '-1'
    : exactToken(body.sessionId, 200);
  const grounding = safeGrounding(body.grounding);
  if (!message || message.length > PARTNER_MAX_MESSAGE_LENGTH || !sessionId || grounding === null) {
    return jsonResponse({ ok: false, reason: 'PARTNER_CHAT_INPUT_INVALID' }, 400);
  }

  const form = new FormData();
  form.set('userText', convaiUserText(message, grounding));
  form.set('charID', characterId);
  form.set('sessionID', sessionId);
  form.set('voiceResponse', 'False');

  let upstream;
  try {
    upstream = await fetchImpl(CONVAI_ENDPOINT, {
      method: 'POST',
      headers: { 'CONVAI-API-KEY': apiKey },
      body: form,
    });
  } catch {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_UPSTREAM_FAILED' }, 502);
  }
  if (!upstream?.ok) {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_UPSTREAM_FAILED' }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_RESPONSE_INVALID' }, 502);
  }
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  const returnedSessionId = exactToken(data?.sessionID, 200);
  const returnedCharacterId = data?.charID === undefined ? characterId : exactToken(data.charID, 256);
  if (!text || text.length > 800 || !returnedSessionId || returnedCharacterId !== characterId) {
    return jsonResponse({ ok: false, reason: 'PARTNER_PROVIDER_RESPONSE_INVALID' }, 502);
  }

  return jsonResponse({
    ok: true,
    provider: 'convai',
    partnerId: PARTNER_ID,
    text,
    sessionId: returnedSessionId,
  });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket && url.searchParams.get('partnerOp') === 'chat') {
    return handlePartnerChatRequest(request, context.env);
  }

  if (!isWebSocket && request.method === 'POST') {
    const matchOp = url.searchParams.get('matchOp') || '';
    if (matchOp === 'create' || matchOp === 'status' || matchOp === 'cancel') {
      const queue = url.searchParams.get('queue') || '';
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(queue)) {
        return new Response('Invalid normal-match queue', { status: 400 });
      }
      const id = context.env.GAMEROAD_ROOMS.idFromName(`gameroad.normal.${queue}`);
      return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
    }
  }

  if (!isWebSocket) {
    return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
  }
  const channel = url.searchParams.get('channel') || '';
  if (!channel || channel.length > 192) return new Response('Invalid channel', { status: 400 });
  const id = context.env.GAMEROAD_ROOMS.idFromName(channel);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}

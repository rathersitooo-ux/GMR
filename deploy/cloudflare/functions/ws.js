const PARTNER_ENDPOINT = 'https://api.convai.com/character/getResponse';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function exactToken(value, max = 256) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\r\n]/.test(text)) return null;
  return text;
}

function userText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 4000) return null;
  return text;
}

async function handlePartnerConversation(context, request) {
  const apiKey = exactToken(context?.env?.CONVAI_API_KEY, 512);
  const characterId = exactToken(context?.env?.CONVAI_SAASUNA_CHARACTER_ID);
  if (!apiKey || !characterId) return json({ ok: false, state: 'not_configured' }, 503);

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }

  const message = userText(input.userMessage);
  const providerSessionId = input.providerSessionId == null ? null : exactToken(input.providerSessionId);
  if (!message || (input.providerSessionId != null && !providerSessionId)) {
    return json({ ok: false, state: 'invalid_request' }, 400);
  }

  const form = new FormData();
  form.set('userText', message);
  form.set('charID', characterId);
  form.set('sessionID', providerSessionId ?? '-1');
  form.set('voiceResponse', 'false');

  const upstreamFetch = typeof context?.fetch === 'function' ? context.fetch : fetch;
  let upstream;
  try {
    upstream = await upstreamFetch(PARTNER_ENDPOINT, {
      method: 'POST',
      headers: { 'CONVAI-API-KEY': apiKey },
      body: form,
    });
  } catch {
    return json({ ok: false, state: 'provider_unavailable' }, 502);
  }
  if (!upstream?.ok) return json({ ok: false, state: 'provider_unavailable' }, 502);

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    return json({ ok: false, state: 'provider_invalid' }, 502);
  }

  const responseCharacterId = exactToken(payload?.charID);
  const responseText = typeof payload?.text === 'string' ? payload.text.trim() : '';
  const responseSessionId = exactToken(payload?.sessionID);
  if (responseCharacterId !== characterId || !responseText || responseText.length > 800 || !responseSessionId) {
    return json({ ok: false, state: 'provider_invalid' }, 502);
  }

  return json({ ok: true, text: responseText, providerSessionId: responseSessionId });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket && request.method === 'POST') {
    if ((url.searchParams.get('partnerOp') || '') === 'conversation') {
      return handlePartnerConversation(context, request);
    }

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

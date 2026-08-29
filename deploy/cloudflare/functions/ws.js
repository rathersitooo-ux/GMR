const PARTNER_ENDPOINT = 'https://api.convai.com/character/getResponse';
const SAASUNA_PROVISIONAL_JPEG_BASE64 = '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[... ELLIPSIZATION ...]2+3rf0XLQgkgTYqxvqh7hb3lzFg68wPGwbVm2ekVX06qp3QAvku+tsIo26YimFPeCJWYDKPLArswllc9I7SiG0tA+IoFspXcPZY5EBvcEXaBf8AYhUcR+i5f03BC3RVrtcRYn/sLBsbOqfjSYi9Ne0JR80++hEk8xl7seCxFqFGsNlNw6uuuJYaCwSJ3GE0RoJczTAcJSvNcRva12DiVN0Y7TyxZf8AyoBUBY01dOYwssbSoGDGa68TUQt0j/YY0R+CbuIvqmFVWp2uBgVesG2PvGzitzYRaK6Z5enkRGN1AKS6veV1ZE1diw4vdiqbxLly/S5f07JE003X9/tHlCC/7zMTw25YjXHEIEqBFhGXnSEuYibGpMg75rrbdn5mgosGchigsegZf0X9ADB+CtFfhrpLkAaXofuXRo+Y6y+gQ9CU0lZVLG7Mdk9EVWNZrhV+Rvww76UjqNPxBqMWmIkGXL9T1JR1D17x2+L1CB6nprVEd4ruUN4j4cIuzJ8MtXFIdU6PZ+ZRkmRxMhHDBly/Q9VVa2v0BD6LlxeoaWqvuuBLQ36/EtEZhCYh0fRcGEJcPqP+Q0fM0fuwc/EXKEYeeHh9BWjNqdvQhD6D1IfUxfQIwrPD/p+JlbpS4dn3hYoZGmEeePS4Q+oh9F+jLixRiRKiwbTk3joXqvXFkAYS0p7sIQU16EPqIely5cuLLiza5v6MG4BzpWwQYL0mzR9viAwLtmDVua+hCH/C/W4sWaukX0YHPEXUC3lh4wBbwuKoA0iRTQRNkqBGzWIi1MehD/jcuLFhlmmCKasvea5VYikbDPbMtQ2ldWFVoX2meKTZjun3/hY6WGdQ4s9SH/FYzAl0red4tvSK4iLe3zFK1AhjrQ+ZbVzx0jwhKTTsovh2feHZTg6noQ/5BMENSGNWLfoLCmNprnlRAtJy27Sga0EgttAZd2vS+gEJx7zZ/ESn/nqwAMywtdWYt6wziBdq+kWgF8BMWIdB2OfMKpv7b3TME4Cvklo3MPeHqp7WNM173Xk2ZVf8heZjTfCJWKgQZuH0dZ4eLYTBgqsh5iRQgJYjnQlvrLW7Z8Q5Et7Gn7xQkb0fzEmuqlCAoVXECKGzsRdg7hLZh4KqnEsPrH0C2CiZPpiapjd2TRhC+muELCA0cETRgaNmYW64yhYcwuoYJaunyRcXPx+0tbKvQVGBgNcWkTUcSIwpb99SUug6S0lRnQaDs89uZvkSvV+jelOgW6BCBuo2puZ+Js6PEawG1uhME07A/lmCVGrVXDcHmUbsQNItaR6QCmEdYuZgms03EFPYGjLhKWRClRumkx4r5CANFatzNUYo5OGW5J//2Q==';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
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
  if (!apiKey || !characterId) {
    return json({ ok: false, state: 'not_configured' }, 503);
  }

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

  return json({
    ok: true,
    text: responseText,
    providerSessionId: responseSessionId,
  });
}


function provisionalVisualResponse() {
  const binary = atob(SAASUNA_PROVISIONAL_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'no-store',
      'x-gameroad-asset-role': 'provisional-static',
    },
  });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket && request.method === 'GET' && url.searchParams.get('partnerOp') === 'visual') {
    return provisionalVisualResponse();
  }

  if (!isWebSocket && request.method === 'POST') {
    const partnerOp = url.searchParams.get('partnerOp') || '';
    if (partnerOp === 'conversation') return handlePartnerConversation(context, request);

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

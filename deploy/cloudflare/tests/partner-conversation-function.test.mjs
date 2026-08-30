import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerConversationHandler } from '../functions/partner-conversation.js';

function requestBody(overrides = {}) {
  return {
    kind: 'partner_convai_turn_request',
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna-dialogue-v1',
    sourceId: 'source.saasuna.static.v1',
    sourceUseSite: 'partner.conversation',
    sessionId: 'browser-session-a',
    turnId: 'turn-1',
    userMessage: 'こんにちは',
    providerSessionId: null,
    ...overrides,
  };
}

function context(body = requestBody(), { env = {}, method = 'POST', origin = 'https://game.example', headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (method !== 'GET' && method !== 'HEAD') {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  if (origin !== null) init.headers.origin = origin;
  return { request: new Request('https://game.example/partner-conversation', init), env };
}

async function bodyOf(response) {
  return JSON.parse(await response.text());
}

test('server fails closed before upstream when Convai credentials are not configured', async () => {
  let called = false;
  const handler = createPartnerConversationHandler({ fetchImpl: async () => { called = true; throw new Error('must not call'); } });
  const response = await handler(context());
  assert.equal(response.status, 503);
  assert.deepEqual(await bodyOf(response), { ok: false, code: 'PROVIDER_NOT_CONFIGURED' });
  assert.equal(called, false);
});

test('server translates a first text turn to official Convai form-data without exposing credentials', async () => {
  const calls = [];
  const handler = createPartnerConversationHandler({ fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ charID: 'char-saasuna', text: 'こんにちは。', sessionID: 'convai-session-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, timeoutMs: 1000 });
  const response = await handler(context(requestBody(), { env: { CONVAI_API_KEY: 'server-secret', CONVAI_SAASUNA_CHARACTER_ID: 'char-saasuna' } }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.convai.com/character/getResponse');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['CONVAI-API-KEY'], 'server-secret');
  assert.equal(calls[0].init.body.get('userText'), 'こんにちは');
  assert.equal(calls[0].init.body.get('charID'), 'char-saasuna');
  assert.equal(calls[0].init.body.get('sessionID'), '-1');
  assert.equal(calls[0].init.body.get('voiceResponse'), 'false');
  const body = await bodyOf(response);
  assert.deepEqual(body, {
    ok: true, kind: 'utterance_candidate', partnerId: 'partner.saasuna', dialogueVersion: 'saasuna-dialogue-v1', sourceId: 'source.saasuna.static.v1', text: 'こんにちは。', providerSessionId: 'convai-session-1', provider: 'convai',
  });
  const publicBytes = JSON.stringify(body);
  assert.equal(publicBytes.includes('server-secret'), false);
  assert.equal(publicBytes.includes('char-saasuna'), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('server forwards only the bounded provider session id for a continuing turn', async () => {
  let sessionField;
  const handler = createPartnerConversationHandler({ fetchImpl: async (_url, init) => {
    sessionField = init.body.get('sessionID');
    return new Response(JSON.stringify({ text: '続きです。', sessionID: 'convai-session-2' }), { status: 200 });
  } });
  const response = await handler(context(requestBody({ providerSessionId: 'convai-session-1' }), { env: { CONVAI_API_KEY: 'server-secret', CONVAI_SAASUNA_CHARACTER_ID: 'char-saasuna' } }));
  assert.equal(response.status, 200);
  assert.equal(sessionField, 'convai-session-1');
  assert.equal((await bodyOf(response)).providerSessionId, 'convai-session-2');
});

test('server rejects cross-origin, wrong method, oversized, invalid, and malformed-upstream requests with stable public codes', async () => {
  const env = { CONVAI_API_KEY: 'server-secret', CONVAI_SAASUNA_CHARACTER_ID: 'char-saasuna' };
  const handler = createPartnerConversationHandler({ fetchImpl: async () => new Response(JSON.stringify({ raw: 'do-not-forward' }), { status: 200 }) });
  const cross = await handler(context(requestBody(), { env, origin: 'https://evil.example' }));
  assert.equal(cross.status, 403);
  const get = await handler(context(null, { env, method: 'GET' }));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  const invalid = await handler(context(requestBody({ partnerId: 'partner.other' }), { env }));
  assert.equal(invalid.status, 400);
  const malformed = await handler(context(requestBody(), { env }));
  assert.equal(malformed.status, 502);
  const malformedBody = await bodyOf(malformed);
  assert.deepEqual(malformedBody, { ok: false, code: 'PROVIDER_MALFORMED_RESPONSE' });
  assert.equal(JSON.stringify(malformedBody).includes('do-not-forward'), false);

  const oversizedReq = new Request('https://game.example/partner-conversation', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://game.example', 'content-length': '40000' },
    body: '{}',
  });
  const oversized = await handler({ request: oversizedReq, env });
  assert.equal(oversized.status, 413);
});

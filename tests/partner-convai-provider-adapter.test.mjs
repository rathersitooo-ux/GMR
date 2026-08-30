import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaasunaConvaiProvider, PartnerConvaiProviderError } from '../browser/partner-convai-provider-adapter.mjs';

function storageFixture() {
  const map = new Map();
  return {
    map,
    storage: {
      getItem(key) { return map.has(key) ? map.get(key) : null; },
      setItem(key, value) { map.set(key, String(value)); },
      removeItem(key) { map.delete(key); },
    },
  };
}

function coreRequest(overrides = {}) {
  return {
    kind: 'partner_conversation_request',
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna-dialogue-v1',
    sourceId: 'source.saasuna.static.v1',
    sourceUseSite: 'partner.conversation',
    sessionId: 'browser-session-a',
    turnId: 'turn-1',
    userMessage: 'こんにちは',
    highIntimacyEnabled: false,
    sessionContext: { shouldNotLeaveBrowser: 'private-context' },
    knowledgeContext: [{ shouldNotLeaveBrowser: 'knowledge' }],
    collectiveContext: [{ shouldNotLeaveBrowser: 'collective' }],
    ...overrides,
  };
}

function okResponse(session = 'convai-session-1', text = 'やあ。') {
  return new Response(JSON.stringify({
    ok: true,
    kind: 'utterance_candidate',
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna-dialogue-v1',
    sourceId: 'source.saasuna.static.v1',
    text,
    providerSessionId: session,
    provider: 'convai',
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('adapter sends only bounded turn fields to same-origin server and stores only provider session id', async () => {
  const { map, storage } = storageFixture();
  const calls = [];
  const provider = createSaasunaConvaiProvider({ sessionStorage: storage, fetchImpl: async (...args) => { calls.push(args); return okResponse(); } });
  const result = await provider.sendMessage(coreRequest());
  assert.deepEqual(result, {
    kind: 'utterance_candidate', partnerId: 'partner.saasuna', dialogueVersion: 'saasuna-dialogue-v1', sourceId: 'source.saasuna.static.v1', text: 'やあ。',
  });
  assert.equal(calls[0][0], '/partner-conversation');
  assert.equal(calls[0][1].credentials, 'same-origin');
  const sent = JSON.parse(calls[0][1].body);
  assert.equal(sent.providerSessionId, null);
  assert.equal(sent.userMessage, 'こんにちは');
  assert.equal('sessionContext' in sent, false);
  assert.equal('knowledgeContext' in sent, false);
  assert.equal('collectiveContext' in sent, false);
  assert.equal('apiKey' in sent, false);
  const stored = [...map.entries()];
  assert.equal(stored.length, 1);
  assert.equal(stored[0][1], 'convai-session-1');
  assert.equal(JSON.stringify(stored).includes('こんにちは'), false);
  assert.deepEqual(provider.getState(), { provider: 'convai', state: 'ready', sessionBound: true, lastCode: null });
});

test('adapter reuses provider session only inside the same GAMEROAD browser conversation', async () => {
  const { storage } = storageFixture();
  const bodies = [];
  let n = 0;
  const provider = createSaasunaConvaiProvider({ sessionStorage: storage, fetchImpl: async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    n += 1;
    return okResponse(`convai-${n}`);
  } });
  await provider.sendMessage(coreRequest());
  await provider.sendMessage(coreRequest({ turnId: 'turn-2', userMessage: '続き' }));
  await provider.sendMessage(coreRequest({ sessionId: 'browser-session-b', turnId: 'turn-1' }));
  assert.equal(bodies[0].providerSessionId, null);
  assert.equal(bodies[1].providerSessionId, 'convai-1');
  assert.equal(bodies[2].providerSessionId, null);
});

test('adapter exposes not-configured state and throws a stable error for server fallback', async () => {
  const provider = createSaasunaConvaiProvider({ fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: 'PROVIDER_NOT_CONFIGURED' }), { status: 503 }) });
  await assert.rejects(() => provider.sendMessage(coreRequest()), (error) => error instanceof PartnerConvaiProviderError && error.code === 'PROVIDER_NOT_CONFIGURED');
  assert.deepEqual(provider.getState(), { provider: 'convai', state: 'not_configured', sessionBound: false, lastCode: 'PROVIDER_NOT_CONFIGURED' });
});

test('adapter rejects malformed upstream normalization and never accepts an external endpoint', async () => {
  const provider = createSaasunaConvaiProvider({ fetchImpl: async () => new Response(JSON.stringify({ ok: true, text: 'missing identity' }), { status: 200 }) });
  await assert.rejects(() => provider.sendMessage(coreRequest()), (error) => error instanceof PartnerConvaiProviderError && error.code === 'MALFORMED_PROVIDER_RESPONSE');
  assert.deepEqual(provider.getState(), { provider: 'convai', state: 'fallback', sessionBound: false, lastCode: 'MALFORMED_PROVIDER_RESPONSE' });
  assert.throws(() => createSaasunaConvaiProvider({ endpoint: 'https://api.convai.com/character/getResponse', fetchImpl: async () => okResponse() }), /same-origin relative path/);
});

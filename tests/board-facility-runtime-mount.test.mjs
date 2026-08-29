import test from 'node:test';
import assert from 'node:assert/strict';

import {
  composeSaasunaProviderUserMessage,
  createSaasunaEdgeProvider,
  mountBoardFacilityRuntime,
  mountSaasunaConversationProductSurface,
  partnerConversationProjectionDecision,
  resolveSaasunaCollectiveContext,
  SAASUNA_PROVISIONAL_VISUAL_CONTRACT,
} from '../browser/board-facility-runtime-mount.mjs';
import { onRequest as cloudflareEntry } from '../deploy/cloudflare/functions/ws.js';

test('fails closed when the classic bridge is missing', async () => {
  await assert.rejects(() => mountBoardFacilityRuntime({}), /BOARD_FACILITY_CLASSIC_BRIDGE_MISSING/);
});

test('waits for bridge.ready before crossing the synchronous proxy', async () => {
  let releaseReady;
  let readyResolved = false;
  let syncReads = 0;
  const ready = new Promise(resolve => {
    releaseReady = () => { readyResolved = true; resolve(); };
  });
  const contract = Object.freeze({ version: 'fixture.contract.v1' });
  const bridge = { ready };
  Object.defineProperty(bridge, 'BOARD_FACILITY_STATE_CORE', {
    enumerable: true,
    get() {
      syncReads += 1;
      if (!readyResolved) throw new Error('SYNC_PROXY_READ_BEFORE_READY');
      return contract;
    },
  });
  const global = { GAMEROAD_BOARD_FACILITY_STATE_CORE: bridge };
  const mounting = mountBoardFacilityRuntime(global);
  await Promise.resolve();
  assert.equal(syncReads, 0);
  releaseReady();
  const runtime = await mounting;
  assert.equal(syncReads, 1);
  assert.equal(runtime.bridge, bridge);
  assert.equal(runtime.contract, contract);
  assert.equal(global.GAMEROAD_BOARD_FACILITY_RUNTIME, runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(await mountBoardFacilityRuntime(global), runtime);
});

test('rejects an incompatible occupied runtime global', async () => {
  const contract = Object.freeze({ version: 'fixture.contract.v1' });
  const bridge = { ready: Promise.resolve(), get BOARD_FACILITY_STATE_CORE() { return contract; } };
  const global = {
    GAMEROAD_BOARD_FACILITY_STATE_CORE: bridge,
    GAMEROAD_BOARD_FACILITY_RUNTIME: Object.freeze({ version: 'foreign.runtime' }),
  };
  await assert.rejects(() => mountBoardFacilityRuntime(global), /BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION/);
});

test('conversation product mount is a no-op outside a browser DOM', () => {
  assert.equal(mountSaasunaConversationProductSurface({}), null);
  assert.equal(mountSaasunaConversationProductSurface({ document: {} }), null);
});

test('active Partner screen projects straight to conversation with no picker state', () => {
  assert.equal(partnerConversationProjectionDecision({ screenActive: false }), 'idle');
  assert.equal(partnerConversationProjectionDecision({ screenActive: true }), 'conversation');
  assert.equal(partnerConversationProjectionDecision({ screenActive: true, partnerRoleActive: false }), 'conversation');
  assert.equal(partnerConversationProjectionDecision({ screenActive: true, saasunaSelected: false }), 'conversation');
});

test('provisional Saasuna visual is explicitly static and outside character production', () => {
  assert.deepEqual(SAASUNA_PROVISIONAL_VISUAL_CONTRACT, {
    assetRole: 'provisional_visual',
    partnerId: 'partner.saasuna',
    static: true,
    animatable: false,
    characterProductionOwnedHere: false,
    rigged: false,
    lipSyncEnabled: false,
    sourceKind: 'user_supplied_provisional',
  });
  assert.equal(Object.isFrozen(SAASUNA_PROVISIONAL_VISUAL_CONTRACT), true);
});

test('collective product resolver stays off when no real runtime evidence source is mounted', async () => {
  assert.equal(await resolveSaasunaCollectiveContext({}), null);
});

test('collective product resolver revalidates a mounted approved evidence source', async () => {
  const calls = [];
  const global = {
    async GAMEROAD_PARTNER_CONVERSATION_COLLECTIVE_EVIDENCE_SOURCE(request) {
      calls.push(request);
      return [{
        evidenceId: 'E-PROD-1',
        sourceId: 'SOURCE-PROD-1',
        sourceVersion: 'v3',
        provenance: 'public_production',
        authorityRef: 'AUTH-PROD-1',
        observedAt: '2026-08-30T01:00:00Z',
        freshness: 'current_bounded',
        counterevidenceState: 'NONE_FOUND',
        useSite: 'partner-conversation',
        summary: '承認済みの公開情報です。',
        confidence: 'bounded',
      }];
    },
  };
  const context = await resolveSaasunaCollectiveContext(global);
  assert.deepEqual(calls, [{ partnerId: 'partner.saasuna', useSite: 'partner-conversation' }]);
  assert.equal(context?.ok, true);
  assert.equal(context?.acceptedCount, 1);
  assert.equal(context?.safeForPrompt, true);
  assert.equal(context?.containsPrivate, false);
  assert.equal(context?.containsRawUserText, false);
  assert.equal(context?.items[0]?.summary, '承認済みの公開情報です。');
  assert.equal(context?.lineage[0]?.sourceId, 'SOURCE-PROD-1');
  assert.equal(Object.isFrozen(context), true);
});

test('collective product resolver rejects private, fixture-like or malformed runtime evidence', async () => {
  const privateContext = await resolveSaasunaCollectiveContext({
    GAMEROAD_PARTNER_CONVERSATION_COLLECTIVE_EVIDENCE_SOURCE() {
      return [{
        evidenceId: 'E-PRIVATE-1',
        sourceId: 'SOURCE-PRIVATE-1',
        sourceVersion: 'v1',
        provenance: 'private',
        authorityRef: 'AUTH-PRIVATE-1',
        observedAt: '2026-08-30T01:00:00Z',
        freshness: 'current',
        counterevidenceState: 'NONE_FOUND',
        useSite: 'partner-conversation',
        summary: '送ってはいけない情報',
        confidence: 'bounded',
      }];
    },
  });
  const unexpectedContext = await resolveSaasunaCollectiveContext({
    GAMEROAD_PARTNER_CONVERSATION_COLLECTIVE_EVIDENCE_SOURCE() {
      return [{
        evidenceId: 'E-FIXTURE-1',
        sourceId: 'SOURCE-FIXTURE-1',
        sourceVersion: 'v1',
        provenance: 'server_verified',
        authorityRef: 'AUTH-FIXTURE-1',
        observedAt: '2026-08-30T01:00:00Z',
        freshness: 'current',
        counterevidenceState: 'NONE_FOUND',
        useSite: 'partner-conversation',
        summary: 'fixtureをproductionへ昇格させない',
        confidence: 'bounded',
        fixtureOnly: true,
      }];
    },
  });
  assert.equal(privateContext, null);
  assert.equal(unexpectedContext, null);
});

test('collective product resolver fails soft when the runtime evidence source errors', async () => {
  const context = await resolveSaasunaCollectiveContext({
    GAMEROAD_PARTNER_CONVERSATION_COLLECTIVE_EVIDENCE_SOURCE() {
      throw new Error('SOURCE_UNAVAILABLE');
    },
  });
  assert.equal(context, null);
});

test('approved runtime evidence resolves through the existing Convai userText transport without lineage leakage', async () => {
  const calls = [];
  const global = {
    GAMEROAD_PARTNER_CONVERSATION_COLLECTIVE_EVIDENCE_SOURCE() {
      return [{
        evidenceId: 'E-PROD-2',
        sourceId: 'SOURCE-SECRET-LINEAGE',
        sourceVersion: 'v4',
        provenance: 'server_verified',
        authorityRef: 'AUTHORITY-SECRET-LINEAGE',
        observedAt: '2026-08-30T01:10:00Z',
        freshness: 'current',
        counterevidenceState: 'PRESENT',
        useSite: 'partner-conversation',
        summary: '反証があるため断定を避けるべき情報です。',
        confidence: 'bounded',
      }];
    },
    async fetch(url, options) {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, text: '確認しながらお答えします。', providerSessionId: 'convai-session-live' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
  const context = await resolveSaasunaCollectiveContext(global);
  const provider = createSaasunaEdgeProvider(global);
  await provider.sendMessage({
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna.dialogue.current.r1.20260810',
    sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
    userMessage: '教えて',
    collectiveContext: context,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.userMessage, /反証があるため断定を避けるべき情報です。/);
  assert.doesNotMatch(calls[0].body.userMessage, /SOURCE-SECRET-LINEAGE|AUTHORITY-SECRET-LINEAGE/);
});

test('browser edge provider keeps provider session locally and sends no API key', async () => {
  const calls = [];
  const provider = createSaasunaEdgeProvider({
    async fetch(url, options) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      const index = calls.length;
      return new Response(JSON.stringify({ ok: true, text: `返答${index}`, providerSessionId: 'convai-session-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const request = {
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna.dialogue.current.r1.20260810',
    sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
    userMessage: 'こんにちは',
  };
  const first = await provider.sendMessage(request);
  await provider.sendMessage({ ...request, userMessage: '続き' });
  assert.equal(first.kind, 'utterance_candidate');
  assert.equal(calls[0].url, '/ws?partnerOp=conversation');
  assert.deepEqual(calls[0].body, { userMessage: 'こんにちは', providerSessionId: null });
  assert.deepEqual(calls[1].body, { userMessage: '続き', providerSessionId: 'convai-session-1' });
  assert.equal(JSON.stringify(calls).includes('CONVAI-API-KEY'), false);
  assert.equal(provider.status().providerSessionStoredInCanon, false);
});

test('browser edge provider composes only approved collective summaries into Convai userText', async () => {
  const calls = [];
  const provider = createSaasunaEdgeProvider({
    async fetch(url, options) {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ ok: true, text: '承知しました。', providerSessionId: 'convai-session-ctx' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const collectiveContext = {
    schemaVersion: 'gameroad.partner-conversation-collective-context.v1',
    items: [{
      evidenceId: 'EVIDENCE-CURRENT-1',
      summary: '承認済みの現在情報です。',
      confidence: 'bounded',
      counterevidenceState: 'NONE_FOUND',
    }],
    lineage: [{
      evidenceId: 'EVIDENCE-CURRENT-1',
      sourceId: 'SOURCE-PRIVATE-TO-TRANSPORT',
      sourceVersion: 'v1',
      provenance: 'server_verified',
      authorityRef: 'AUTHORITY-PRIVATE-TO-TRANSPORT',
      observedAt: '2026-08-29T12:00:00Z',
      freshness: 'current',
      counterevidenceState: 'NONE_FOUND',
    }],
  };
  const composed = composeSaasunaProviderUserMessage({ userMessage: '今日の話を教えて', collectiveContext });
  assert.match(composed, /GAMEROAD承認済み参考情報/);
  assert.match(composed, /承認済みの現在情報です。/);
  assert.match(composed, /今日の話を教えて/);
  assert.doesNotMatch(composed, /SOURCE-PRIVATE-TO-TRANSPORT|AUTHORITY-PRIVATE-TO-TRANSPORT/);
  assert.ok(composed.length <= 4000);

  await provider.sendMessage({
    partnerId: 'partner.saasuna',
    dialogueVersion: 'saasuna.dialogue.current.r1.20260810',
    sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
    userMessage: '今日の話を教えて',
    collectiveContext,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/ws?partnerOp=conversation');
  assert.equal(calls[0].body.userMessage, composed);
  assert.equal(calls[0].body.providerSessionId, null);
  assert.equal(provider.status().collectiveContextTransport, 'approved_summary_in_user_text');
});

test('browser edge provider fails closed before fetch for unsafe collective context', async () => {
  let fetchCount = 0;
  const provider = createSaasunaEdgeProvider({
    async fetch() {
      fetchCount += 1;
      throw new Error('SHOULD_NOT_FETCH');
    },
  });
  const unsafeContext = {
    schemaVersion: 'gameroad.partner-conversation-collective-context.v1',
    items: [{ evidenceId: 'E1', summary: 'unsafe', confidence: 'bounded', counterevidenceState: 'PRESENT' }],
    lineage: [{
      evidenceId: 'E1',
      sourceId: 'S1',
      sourceVersion: 'v1',
      provenance: 'private',
      authorityRef: 'A1',
      observedAt: '2026-08-29T12:00:00Z',
      freshness: 'current',
      counterevidenceState: 'PRESENT',
    }],
  };
  await assert.rejects(() => provider.sendMessage({ userMessage: '送らない', collectiveContext: unsafeContext }), /PARTNER_PROVIDER_COLLECTIVE_CONTEXT_INVALID/);
  assert.equal(fetchCount, 0);
});

test('browser without fetch has no provider and therefore uses existing fallback lane', () => {
  assert.equal(createSaasunaEdgeProvider({}), null);
});

test('Cloudflare Partner conversation is unavailable when provider configuration is absent', async () => {
  const response = await cloudflareEntry({
    request: new Request('https://game.example/ws?partnerOp=conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'こんにちは', providerSessionId: null }),
    }),
    env: {},
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, state: 'not_configured' });
});

test('Cloudflare Partner conversation keeps secret server-side and forwards Convai session', async () => {
  const upstream = [];
  const context = {
    env: { CONVAI_API_KEY: 'server-secret', CONVAI_SAASUNA_CHARACTER_ID: 'saasuna-char' },
    request: new Request('https://game.example/ws?partnerOp=conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: '続きから', providerSessionId: 'convai-session-1' }),
    }),
    async fetch(url, options) {
      upstream.push({ url, options });
      return new Response(JSON.stringify({ charID: 'saasuna-char', text: '承知しました。', sessionID: 'convai-session-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
  const response = await cloudflareEntry(context);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, text: '承知しました。', providerSessionId: 'convai-session-2' });
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].url, 'https://api.convai.com/character/getResponse');
  assert.equal(upstream[0].options.headers['CONVAI-API-KEY'], 'server-secret');
  assert.equal(upstream[0].options.body.get('userText'), '続きから');
  assert.equal(upstream[0].options.body.get('charID'), 'saasuna-char');
  assert.equal(upstream[0].options.body.get('sessionID'), 'convai-session-1');
  assert.equal(upstream[0].options.body.get('voiceResponse'), 'false');
});

test('Cloudflare Partner conversation rejects wrong-character provider output', async () => {
  const response = await cloudflareEntry({
    env: { CONVAI_API_KEY: 'server-secret', CONVAI_SAASUNA_CHARACTER_ID: 'saasuna-char' },
    request: new Request('https://game.example/ws?partnerOp=conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'こんにちは' }),
    }),
    async fetch() {
      return new Response(JSON.stringify({ charID: 'other-char', text: 'wrong', sessionID: 'session-x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, state: 'provider_invalid' });
});

test('Cloudflare provisional visual route returns static JPEG bytes', async () => {
  const response = await cloudflareEntry({
    request: new Request('https://game.example/ws?partnerOp=visual'),
    env: {},
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('x-gameroad-asset-role'), 'provisional-static');
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(bytes.length > 5000);
});

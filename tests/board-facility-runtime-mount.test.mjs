import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSaasunaEdgeProvider,
  mountBoardFacilityRuntime,
  mountSaasunaConversationProductSurface,
  partnerConversationProjectionDecision,
} from '../browser/board-facility-runtime-mount.mjs';
import { onRequest as cloudflareEntry } from '../deploy/cloudflare/functions/ws.js';

test('fails closed when the classic bridge is missing', async () => {
  await assert.rejects(
    () => mountBoardFacilityRuntime({}),
    /BOARD_FACILITY_CLASSIC_BRIDGE_MISSING/,
  );
});

test('waits for bridge.ready before crossing the synchronous proxy', async () => {
  let releaseReady;
  let readyResolved = false;
  let syncReads = 0;
  const ready = new Promise(resolve => {
    releaseReady = () => {
      readyResolved = true;
      resolve();
    };
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

  const second = await mountBoardFacilityRuntime(global);
  assert.equal(second, runtime);
});

test('rejects an incompatible occupied runtime global', async () => {
  const contract = Object.freeze({ version: 'fixture.contract.v1' });
  const bridge = {
    ready: Promise.resolve(),
    get BOARD_FACILITY_STATE_CORE() {
      return contract;
    },
  };
  const global = {
    GAMEROAD_BOARD_FACILITY_STATE_CORE: bridge,
    GAMEROAD_BOARD_FACILITY_RUNTIME: Object.freeze({ version: 'foreign.runtime' }),
  };

  await assert.rejects(
    () => mountBoardFacilityRuntime(global),
    /BOARD_FACILITY_RUNTIME_GLOBAL_COLLISION/,
  );
});

test('conversation product mount is a no-op outside a browser DOM', () => {
  assert.equal(mountSaasunaConversationProductSurface({}), null);
  assert.equal(mountSaasunaConversationProductSurface({ document: {} }), null);
});

test('conversation entry has one direct path: Partner, Saasuna, conversation', () => {
  assert.equal(partnerConversationProjectionDecision({ screenActive: false }), 'idle');
  assert.equal(partnerConversationProjectionDecision({
    screenActive: true,
    partnerRoleActive: false,
  }), 'activate_partner');
  assert.equal(partnerConversationProjectionDecision({
    screenActive: true,
    partnerRoleActive: true,
    saasunaSelected: false,
  }), 'select_saasuna');
  assert.equal(partnerConversationProjectionDecision({
    screenActive: true,
    partnerRoleActive: true,
    saasunaSelected: true,
  }), 'conversation');
});

test('conversation entry does not add a player-character bypass', () => {
  assert.equal(partnerConversationProjectionDecision({
    screenActive: true,
    partnerRoleActive: false,
    playerModeRequested: true,
  }), 'activate_partner');
});

test('browser edge provider keeps provider session locally and sends no API key', async () => {
  const calls = [];
  const provider = createSaasunaEdgeProvider({
    async fetch(url, options) {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        ok: true,
        text: `返答${calls.length}`,
        providerSessionId: 'convai-session-1',
      }), {
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

test('browser without fetch has no provider and keeps the existing fallback lane', () => {
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

test('Cloudflare Partner conversation keeps secret server-side and forwards provider session', async () => {
  const upstream = [];
  const response = await cloudflareEntry({
    env: {
      CONVAI_API_KEY: 'server-secret',
      CONVAI_SAASUNA_CHARACTER_ID: 'saasuna-char',
    },
    request: new Request('https://game.example/ws?partnerOp=conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: '続きから', providerSessionId: 'convai-session-1' }),
    }),
    async fetch(url, options) {
      upstream.push({ url, options });
      return new Response(JSON.stringify({
        charID: 'saasuna-char',
        text: '承知しました。',
        sessionID: 'convai-session-2',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    text: '承知しました。',
    providerSessionId: 'convai-session-2',
  });
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
    env: {
      CONVAI_API_KEY: 'server-secret',
      CONVAI_SAASUNA_CHARACTER_ID: 'saasuna-char',
    },
    request: new Request('https://game.example/ws?partnerOp=conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userMessage: 'こんにちは' }),
    }),
    async fetch() {
      return new Response(JSON.stringify({
        charID: 'other-char',
        text: 'wrong',
        sessionID: 'session-x',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, state: 'provider_invalid' });
});

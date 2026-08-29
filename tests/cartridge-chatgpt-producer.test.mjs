import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatGptCartridgeProducerRequest,
  parseChatGptCartridgeProducerResult,
} from '../browser/cartridge-chatgpt-producer.mjs';

const identity = {
  taskId: 'AUTONOMOUS-GAME-MAKER-GENERIC-PRODUCT-001',
  workUnitKey: 'TEST_WAVE_D',
  acquireKey: 'TEST-ACQUIRE',
  packetId: 'packet-1',
  correlationId: 'corr-1',
};

const manifest = {
  schemaVersion: 'gameroad.cartridge-manifest.v1',
  id: 'chatgpt.math.game',
  version: '1.0.0',
  hostApi: 'gameroad.cartridge-host.v1',
  entry: { kind: 'recipe', ref: 'recipes/math.json' },
  capabilities: ['ui.surface'],
  payloadDigest: 'a'.repeat(64),
  display: { name: 'Math Game', description: 'Generated candidate.' },
};

const provenance = {
  declaredOrigin: 'AI_GENERATED',
  useScope: 'LOCAL_PRIVATE',
  rightsStatus: 'UNKNOWN',
  sourceRef: null,
  sourceDigest: null,
  containsPrivate: false,
  containsCredentials: false,
};

test('ChatGPT producer reuses transport identity and requests candidate-only JSON', () => {
  const request = buildChatGptCartridgeProducerRequest({ ...identity, userRequest: 'Make a short addition game.' });
  assert.equal(request.packetId, 'packet-1');
  assert.equal(request.correlationId, 'corr-1');
  assert.match(request.prompt, /CANDIDATE only/);
  assert.match(request.prompt, /Do not install/);
});

test('completed correlated transport result becomes a bounded CHATGPT candidate', () => {
  const marker = '[GAMEROAD_SOL_RESPONSE packetId="packet-1" correlationId="corr-1"]';
  const body = JSON.stringify({ sourceId: 'chatgpt:packet-1', manifest, provenance });
  const candidate = parseChatGptCartridgeProducerResult({
    ok: true,
    status: 'COMPLETED',
    packetId: 'packet-1',
    correlationId: 'corr-1',
    responseText: `${marker}\n${body}`,
  });
  assert.equal(candidate.producerKind, 'CHATGPT');
  assert.equal(candidate.authority, 'CANDIDATE_ONLY');
  assert.equal(candidate.controls.automaticInstall, false);
});

test('uncompleted, uncorrelated, or prose-wrapped response fails closed', () => {
  assert.throws(() => parseChatGptCartridgeProducerResult({ ok: false, status: 'TIMED_OUT' }), /NOT_COMPLETED/);
  assert.throws(() => parseChatGptCartridgeProducerResult({
    ok: true,
    status: 'COMPLETED',
    packetId: 'packet-1',
    correlationId: 'corr-1',
    responseText: JSON.stringify({ sourceId: 'x', manifest, provenance }),
  }), /MARKER_MISSING/);
  const marker = '[GAMEROAD_SOL_RESPONSE packetId="packet-1" correlationId="corr-1"]';
  assert.throws(() => parseChatGptCartridgeProducerResult({
    ok: true,
    status: 'COMPLETED',
    packetId: 'packet-1',
    correlationId: 'corr-1',
    responseText: `${marker}\nHere you go: ${JSON.stringify({ sourceId: 'x', manifest, provenance })}`,
  }), /NOT_EXACT_JSON/);
});

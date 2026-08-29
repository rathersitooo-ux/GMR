import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaasunaCartridgeProducerRequest,
  normalizeSaasunaProducerContext,
  parseSaasunaCartridgeProducerResult,
} from '../browser/cartridge-saasuna-producer.mjs';

const identity = {
  taskId: 'AUTONOMOUS-GAME-MAKER-GENERIC-PRODUCT-001',
  workUnitKey: 'TEST_SAASUNA_PRODUCER',
  acquireKey: 'TEST-ACQUIRE',
  packetId: 'saasuna-packet-1',
  correlationId: 'saasuna-corr-1',
};

const manifest = {
  schemaVersion: 'gameroad.cartridge-manifest.v1',
  id: 'saasuna.memory.game',
  version: '1.0.0',
  hostApi: 'gameroad.cartridge-host.v1',
  entry: { kind: 'recipe', ref: 'recipes/memory.json' },
  capabilities: ['ui.surface', 'gameroad.cards.read'],
  payloadDigest: 'c'.repeat(64),
  display: { name: 'Memory Game', description: null },
};

const provenance = {
  declaredOrigin: 'AI_ASSISTED',
  useScope: 'LOCAL_PRIVATE',
  rightsStatus: 'SELF_CREATED',
  sourceRef: 'saasuna-request:1',
  sourceDigest: 'd'.repeat(64),
  containsPrivate: false,
  containsCredentials: false,
};

test('Saasuna context accepts bounded references and rejects raw extra memory/history fields', () => {
  assert.deepEqual(normalizeSaasunaProducerContext({
    partnerId: 'saasuna',
    personaVersion: 'saasuna.current',
    currentActivityRef: 'activity:home',
  }), {
    partnerId: 'saasuna',
    personaVersion: 'saasuna.current',
    currentActivityRef: 'activity:home',
  });
  assert.throws(() => normalizeSaasunaProducerContext({ partnerId: 'saasuna', rawHistory: 'private transcript' }), /UNEXPECTED/);
});

test('Saasuna producer reuses the shared transport path and declares no authority mutation', () => {
  const request = buildSaasunaCartridgeProducerRequest({
    ...identity,
    userRequest: 'Turn these cards into a small memory game.',
    partnerContext: { partnerId: 'saasuna', responsePlanRef: 'plan:42', relationshipReadRef: 'relationship:read-only' },
  });
  assert.match(request.prompt, /creation director/);
  assert.match(request.prompt, /do not infer or mutate persona, canon, relationship, or private memory/i);
});

test('correlated Saasuna generation becomes SAASUNA candidate only', () => {
  const marker = '[GAMEROAD_SOL_RESPONSE packetId="saasuna-packet-1" correlationId="saasuna-corr-1"]';
  const candidate = parseSaasunaCartridgeProducerResult({
    ok: true,
    status: 'COMPLETED',
    packetId: 'saasuna-packet-1',
    correlationId: 'saasuna-corr-1',
    responseText: `${marker}\n${JSON.stringify({ sourceId: 'saasuna:1', manifest, provenance })}`,
  });
  assert.equal(candidate.producerKind, 'SAASUNA');
  assert.equal(candidate.controls.automaticCanonMutation, false);
  assert.equal(candidate.controls.automaticRelationshipMutation, false);
  assert.equal(candidate.controls.automaticInstall, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartridgeCapabilityBroker } from '../browser/cartridge-capability-broker.mjs';

function manifest(overrides = {}) {
  return {
    schemaVersion: 'gameroad.cartridge-manifest.v1',
    id: 'study.flashcards',
    version: '1.0.0',
    hostApi: 'gameroad.cartridge-host.v1',
    entry: { kind: 'recipe', ref: 'cartridges/study/recipe.json' },
    capabilities: ['ui.surface', 'storage.local'],
    payloadDigest: 'b'.repeat(64),
    ...overrides,
  };
}

function exactStorageGrant(overrides = {}) {
  return {
    cartridgeId: 'study.flashcards',
    version: '1.0.0',
    payloadDigest: 'b'.repeat(64),
    capability: 'storage.local',
    ...overrides,
  };
}

test('declared + host-supported + exact explicit grant is allowed', () => {
  const broker = createCartridgeCapabilityBroker({ hostCapabilities: ['storage.local'], grants: [exactStorageGrant()] });
  assert.deepEqual(broker.decide(manifest(), 'storage.local'), {
    allowed: true,
    reason: 'explicit_exact_identity_grant',
    cartridgeId: 'study.flashcards',
    capability: 'storage.local',
  });
});

test('declaration alone never grants a capability', () => {
  const broker = createCartridgeCapabilityBroker({ hostCapabilities: ['storage.local'], grants: [] });
  assert.equal(broker.decide(manifest(), 'storage.local').reason, 'not_explicitly_granted');
});

test('undeclared and host-unsupported capabilities are denied', () => {
  const broker = createCartridgeCapabilityBroker({ hostCapabilities: ['ui.surface'], grants: [] });
  assert.equal(broker.decide(manifest(), 'input.pointer').reason, 'not_declared');
  assert.equal(broker.decide(manifest(), 'storage.local').reason, 'host_unsupported');
});

test('grant cannot survive version or payload replacement', () => {
  const broker = createCartridgeCapabilityBroker({ hostCapabilities: ['storage.local'], grants: [exactStorageGrant()] });
  assert.equal(broker.decide(manifest({ version: '1.0.1' }), 'storage.local').reason, 'not_explicitly_granted');
  assert.equal(broker.decide(manifest({ payloadDigest: 'c'.repeat(64) }), 'storage.local').reason, 'not_explicitly_granted');
});

test('unknown wildcard-like capability cannot be configured or requested', () => {
  assert.throws(() => createCartridgeCapabilityBroker({ hostCapabilities: ['*'] }), /unknown_capability/);
  const broker = createCartridgeCapabilityBroker();
  assert.equal(broker.decide(manifest(), '*').reason, 'unknown_capability');
  assert.equal(Object.isFrozen(broker.snapshot()), true);
  assert.equal(Object.isFrozen(broker.snapshot().grants), true);
});

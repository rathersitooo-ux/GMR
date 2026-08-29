import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCartridgeManifest } from '../browser/cartridge-manifest-core.mjs';

function valid(overrides = {}) {
  return {
    schemaVersion: 'gameroad.cartridge-manifest.v1',
    id: 'study.flashcards',
    version: '1.2.3',
    hostApi: 'gameroad.cartridge-host.v1',
    entry: { kind: 'module', ref: 'cartridges/study/main.mjs' },
    capabilities: ['ui.surface', 'storage.local'],
    payloadDigest: 'a'.repeat(64),
    display: { name: 'Study', description: 'A bounded learning cartridge.' },
    ...overrides,
  };
}

test('valid manifest normalizes to an immutable request-only object', () => {
  const result = normalizeCartridgeManifest(valid());
  assert.equal(result.ok, true);
  assert.equal(result.manifest.capabilityAuthority, 'REQUEST_ONLY');
  assert.equal(Object.isFrozen(result.manifest), true);
  assert.equal(Object.isFrozen(result.manifest.capabilities), true);
});

test('unknown fields fail closed', () => {
  const result = normalizeCartridgeManifest(valid({ rootAccess: true }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('unexpected-field:rootAccess'));
});

test('module and recipe refs cannot traverse or become absolute', () => {
  for (const ref of ['../escape.mjs', '/root/main.mjs', 'x/../escape.mjs', 'https://example.com/x.mjs']) {
    const result = normalizeCartridgeManifest(valid({ entry: { kind: 'module', ref } }));
    assert.equal(result.ok, false, ref);
    assert.ok(result.reasons.includes('entry-ref-invalid'), ref);
  }
});

test('external refs require credential-free HTTPS', () => {
  assert.equal(normalizeCartridgeManifest(valid({ entry: { kind: 'external', ref: 'http://example.com/game' } })).ok, false);
  assert.equal(normalizeCartridgeManifest(valid({ entry: { kind: 'external', ref: 'https://u:p@example.com/game' } })).ok, false);
  const ok = normalizeCartridgeManifest(valid({ entry: { kind: 'external', ref: 'https://example.com/game#fragment' } }));
  assert.equal(ok.ok, true);
  assert.equal(ok.manifest.entry.ref, 'https://example.com/game');
});

test('duplicate or unknown capabilities and invalid digest are rejected', () => {
  assert.equal(normalizeCartridgeManifest(valid({ capabilities: ['ui.surface', 'ui.surface'] })).ok, false);
  assert.equal(normalizeCartridgeManifest(valid({ capabilities: ['gameroad.economy.write'] })).ok, false);
  assert.equal(normalizeCartridgeManifest(valid({ payloadDigest: 'not-a-digest' })).ok, false);
});

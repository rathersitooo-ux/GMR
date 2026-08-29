import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartridgeProducerCandidate } from '../browser/cartridge-producer-core.mjs';
import {
  assertCartridgeProducerCandidateAllowed,
  evaluateCartridgeProducerCandidate,
} from '../browser/cartridge-provenance-gate.mjs';

function manifest(overrides = {}) {
  return {
    schemaVersion: 'gameroad.cartridge-manifest.v1',
    id: 'gate.sample.game',
    version: '1.0.0',
    hostApi: 'gameroad.cartridge-host.v1',
    entry: { kind: 'recipe', ref: 'recipes/sample.json' },
    capabilities: ['ui.surface', 'gameroad.activity.report'],
    payloadDigest: 'e'.repeat(64),
    display: { name: 'Gate Sample', description: 'Candidate only.' },
    ...overrides,
  };
}

function provenance(overrides = {}) {
  return {
    declaredOrigin: 'AI_GENERATED',
    useScope: 'LOCAL_PRIVATE',
    rightsStatus: 'UNKNOWN',
    sourceRef: null,
    sourceDigest: null,
    containsPrivate: false,
    containsCredentials: false,
    ...overrides,
  };
}

function candidate({ manifestOverrides = {}, provenanceOverrides = {} } = {}) {
  return createCartridgeProducerCandidate({
    producerKind: 'CHATGPT',
    requestId: 'packet-1',
    sourceId: 'chatgpt:packet-1',
    manifest: manifest(manifestOverrides),
    provenance: provenance(provenanceOverrides),
  });
}

test('local/private candidate may keep unresolved rights but receives no install/publish/ranked/reward authority', () => {
  const result = evaluateCartridgeProducerCandidate(candidate());
  assert.equal(result.ok, true);
  assert.equal(result.hostCandidate.authority, 'HOST_CANDIDATE_ONLY');
  assert.equal(result.hostCandidate.capabilityAuthority, 'REQUEST_ONLY');
  assert.equal(result.hostCandidate.installAuthorized, false);
  assert.equal(result.hostCandidate.publishAuthorized, false);
  assert.equal(result.hostCandidate.rankedAuthorized, false);
  assert.equal(result.hostCandidate.rewardAuthorized, false);
  assert.equal(result.hostCandidate.canonMutationAuthorized, false);
  assert.equal(result.hostCandidate.relationshipMutationAuthorized, false);
});

test('formal review candidate requires resolved rights and declared origin', () => {
  const unresolved = evaluateCartridgeProducerCandidate(candidate({
    provenanceOverrides: { useScope: 'FORMAL_REVIEW_CANDIDATE', declaredOrigin: 'UNKNOWN', rightsStatus: 'UNKNOWN' },
  }));
  assert.equal(unresolved.ok, false);
  assert.ok(unresolved.reasons.includes('formal-review-rights-unresolved'));
  assert.ok(unresolved.reasons.includes('formal-review-origin-unresolved'));

  const resolved = evaluateCartridgeProducerCandidate(candidate({
    provenanceOverrides: { useScope: 'FORMAL_REVIEW_CANDIDATE', declaredOrigin: 'HUMAN', rightsStatus: 'SELF_CREATED' },
  }));
  assert.equal(resolved.ok, true);
});

test('private data, credentials, malformed manifest capabilities, and missing candidate authority fail closed', () => {
  const privateResult = evaluateCartridgeProducerCandidate(candidate({ provenanceOverrides: { containsPrivate: true } }));
  assert.equal(privateResult.ok, false);
  assert.ok(privateResult.reasons.includes('private-content-forbidden'));

  const credentialResult = evaluateCartridgeProducerCandidate(candidate({ provenanceOverrides: { containsCredentials: true } }));
  assert.equal(credentialResult.ok, false);
  assert.ok(credentialResult.reasons.includes('credentials-forbidden'));

  const badCapability = evaluateCartridgeProducerCandidate(candidate({ manifestOverrides: { capabilities: ['root.shell'] } }));
  assert.equal(badCapability.ok, false);
  assert.ok(badCapability.reasons.some((reason) => reason.includes('capability-unknown')));

  const noAuthority = { ...candidate() };
  delete noAuthority.authority;
  assert.equal(evaluateCartridgeProducerCandidate(noAuthority).ok, false);
});

test('assert helper returns only host candidate on a passing bounded candidate', () => {
  const allowed = assertCartridgeProducerCandidateAllowed(candidate());
  assert.equal(allowed.manifest.capabilityAuthority, 'REQUEST_ONLY');
  assert.equal(allowed.installAuthorized, false);
});

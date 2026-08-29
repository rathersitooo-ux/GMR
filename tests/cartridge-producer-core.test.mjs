import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARTRIDGE_PRODUCER_SCHEMA_VERSION,
  createExistingMakerCartridgeCandidate,
  createInGameMakerCartridgeCandidate,
  normalizeCartridgeProducerCandidate,
} from '../browser/cartridge-producer-core.mjs';

const manifest = {
  schemaVersion: 'gameroad.cartridge-manifest.v1',
  id: 'sample.math.cards',
  version: '1.0.0',
  hostApi: 'gameroad.cartridge-host.v1',
  entry: { kind: 'recipe', ref: 'recipes/sample.json' },
  capabilities: ['ui.surface', 'gameroad.cards.read'],
  payloadDigest: 'a'.repeat(64),
  display: { name: 'Sample', description: 'Bounded sample.' },
};

const provenance = {
  declaredOrigin: 'HUMAN',
  useScope: 'LOCAL_PRIVATE',
  rightsStatus: 'SELF_CREATED',
  sourceRef: 'maker-session:1',
  sourceDigest: 'b'.repeat(64),
  containsPrivate: false,
  containsCredentials: false,
};

test('existing Maker and in-game Maker converge on the same bounded candidate contract', () => {
  const existing = createExistingMakerCartridgeCandidate({ requestId: 'r1', sourceId: 'existing-maker:1', manifest, provenance });
  const inGame = createInGameMakerCartridgeCandidate({ requestId: 'r2', sourceId: 'in-game-maker:1', manifest, provenance });
  assert.equal(existing.schemaVersion, CARTRIDGE_PRODUCER_SCHEMA_VERSION);
  assert.equal(existing.producerKind, 'EXISTING_MAKER');
  assert.equal(inGame.producerKind, 'IN_GAME_MAKER');
  for (const candidate of [existing, inGame]) {
    assert.equal(candidate.authority, 'CANDIDATE_ONLY');
    assert.equal(candidate.controls.candidateOnly, true);
    assert.equal(candidate.controls.automaticInstall, false);
    assert.equal(candidate.controls.automaticPublish, false);
    assert.equal(candidate.controls.automaticRanked, false);
    assert.equal(candidate.controls.automaticReward, false);
    assert.equal(candidate.controls.automaticCanonMutation, false);
    assert.equal(candidate.controls.automaticRelationshipMutation, false);
  }
});

test('candidate normalization rejects unknown fields and implicit side effects', () => {
  const candidate = createExistingMakerCartridgeCandidate({ requestId: 'r3', sourceId: 'existing-maker:2', manifest, provenance });
  const bad = {
    ...candidate,
    authority: undefined,
    controls: { ...candidate.controls, automaticInstall: true },
  };
  const result = normalizeCartridgeProducerCandidate(bad);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('automaticInstall-must-be-false'));
});

test('candidate normalization fails closed on private/credential metadata types and malformed digests', () => {
  const result = normalizeCartridgeProducerCandidate({
    schemaVersion: CARTRIDGE_PRODUCER_SCHEMA_VERSION,
    producerKind: 'EXISTING_MAKER',
    requestId: 'r4',
    sourceId: 'existing-maker:3',
    manifest,
    provenance: { ...provenance, containsPrivate: 'no', sourceDigest: 'bad' },
    controls: {
      candidateOnly: true,
      automaticInstall: false,
      automaticPublish: false,
      automaticRanked: false,
      automaticReward: false,
      automaticCanonMutation: false,
      automaticRelationshipMutation: false,
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('containsPrivate-invalid'));
  assert.ok(result.reasons.includes('sourceDigest-invalid'));
});

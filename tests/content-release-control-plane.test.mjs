import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ReleaseControlError,
  activateStagingManifest,
  assertCandidateCanActivate,
  createEmptyReleaseState,
  createStagingManifest,
  normalizeAuthoringRow,
  rollbackToPreviousGood,
  validateReleasePackage,
} from '../tools/content-release-control-plane.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(here, '../data/content-releases/staging/example-release-v1.json');

async function fixtureRow() {
  return JSON.parse(await readFile(fixturePath, 'utf8'));
}

function expectCode(code) {
  return (error) => error instanceof ReleaseControlError && error.code === code;
}

test('authoring row normalizes and validates into deterministic staging manifest', async () => {
  const release = normalizeAuthoringRow(await fixtureRow());
  assert.equal(release.releaseId, 'OPS-SMOKE-20260929-001');
  assert.equal(release.version, 1);
  assert.deepEqual(release.contentRefs, ['nonprod:ops-smoke']);
  assert.deepEqual(release.requiredData, { message: 'release-control-plane-smoke' });
  const validation = validateReleasePackage(release);
  assert.equal(validation.ok, true);
  assert.match(validation.stagedDigest, /^[0-9a-f]{64}$/);
  const manifest = createStagingManifest(release);
  assert.equal(manifest.lifecycleState, 'STAGED');
  assert.equal(manifest.candidateDigest, validation.stagedDigest);
});

test('invalid or missing required content fails closed', async () => {
  const row = await fixtureRow();
  row.contentRefsJson = '[]';
  const release = normalizeAuthoringRow(row);
  const validation = validateReleasePackage(release);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('CONTENT_REFS_INVALID'));
  assert.equal(validation.stagedDigest, null);
});

test('malformed authoring JSON is rejected before staging', async () => {
  const row = await fixtureRow();
  row.requiredDataJson = '{broken';
  assert.throws(() => normalizeAuthoringRow(row), expectCode('INVALID_JSON_REQUIREDDATAJSON'));
});

test('first non-production activation records active identity', async () => {
  const manifest = createStagingManifest(normalizeAuthoringRow(await fixtureRow()));
  const next = activateStagingManifest(manifest, createEmptyReleaseState());
  assert.deepEqual(next.active, {
    releaseId: manifest.releaseId,
    version: 1,
    digest: manifest.candidateDigest,
    contentType: 'ops_smoke',
  });
  assert.equal(next.previousGood, null);
  assert.equal(next.history.at(-1).event, 'ACTIVATE_NONPROD');
});

test('double activation of the same release and version is rejected', async () => {
  const manifest = createStagingManifest(normalizeAuthoringRow(await fixtureRow()));
  const state = activateStagingManifest(manifest, createEmptyReleaseState());
  assert.throws(() => activateStagingManifest(manifest, state), expectCode('DOUBLE_ACTIVATION'));
});

test('same release version with different deploy-affecting content is rejected', async () => {
  const row = await fixtureRow();
  const first = createStagingManifest(normalizeAuthoringRow(row));
  const state = activateStagingManifest(first, createEmptyReleaseState());

  const changedRow = { ...row, requiredDataJson: '{"message":"different"}' };
  const changed = createStagingManifest(normalizeAuthoringRow(changedRow));
  assert.notEqual(changed.candidateDigest, first.candidateDigest);
  assert.throws(() => activateStagingManifest(changed, state), expectCode('SAME_VERSION_DIFFERENT_CONTENT'));
});

test('stale version is rejected against a newer active version', async () => {
  const row = await fixtureRow();
  const version1 = createStagingManifest(normalizeAuthoringRow(row));
  const version2 = createStagingManifest(normalizeAuthoringRow({
    ...row,
    version: '2',
    previousGoodVersion: '1',
    rollbackTarget: '1',
    requiredDataJson: '{"message":"release-control-plane-smoke-v2"}',
  }));
  const state1 = activateStagingManifest(version1, createEmptyReleaseState());
  const state2 = activateStagingManifest(version2, state1);

  const staleManifest = createStagingManifest(normalizeAuthoringRow({
    ...row,
    releaseId: 'OPS-SMOKE-20260929-001',
    version: '1',
  }));
  const stateWithoutSeenV1 = { ...state2, seenVersions: Object.freeze({}) };
  assert.throws(() => assertCandidateCanActivate(staleManifest, stateWithoutSeenV1), expectCode('STALE_VERSION'));
});

test('previous-good version must match the active version', async () => {
  const row = await fixtureRow();
  const version1 = createStagingManifest(normalizeAuthoringRow(row));
  const state1 = activateStagingManifest(version1, createEmptyReleaseState());
  const badVersion2 = createStagingManifest(normalizeAuthoringRow({
    ...row,
    version: '2',
    previousGoodVersion: '3',
    rollbackTarget: '3',
    requiredDataJson: '{"message":"release-control-plane-smoke-v2"}',
  }));
  assert.throws(() => activateStagingManifest(badVersion2, state1), expectCode('PREVIOUS_GOOD_VERSION_MISMATCH'));
});

test('R1 refuses production staging even when approval is marked approved', async () => {
  const row = await fixtureRow();
  const production = normalizeAuthoringRow({
    ...row,
    environment: 'production',
    audience: 'all',
    approvalState: 'APPROVED',
  });
  assert.equal(validateReleasePackage(production).ok, true);
  assert.throws(() => createStagingManifest(production), expectCode('PRODUCTION_ACTIVATION_FORBIDDEN_V1'));
});

test('rollback restores previous-good after a newer non-production activation', async () => {
  const row = await fixtureRow();
  const version1 = createStagingManifest(normalizeAuthoringRow(row));
  const state1 = activateStagingManifest(version1, createEmptyReleaseState());

  const version2 = createStagingManifest(normalizeAuthoringRow({
    ...row,
    version: '2',
    previousGoodVersion: '1',
    rollbackTarget: '1',
    requiredDataJson: '{"message":"release-control-plane-smoke-v2"}',
  }));
  const state2 = activateStagingManifest(version2, state1);
  assert.equal(state2.active.version, 2);
  assert.equal(state2.previousGood.version, 1);

  const rolled = rollbackToPreviousGood(state2);
  assert.equal(rolled.active.version, 1);
  assert.equal(rolled.active.digest, version1.candidateDigest);
  assert.equal(rolled.previousGood, null);
  assert.equal(rolled.history.at(-1).event, 'ROLLBACK_NONPROD');
});

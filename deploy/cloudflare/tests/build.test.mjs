import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBrowserRuntimeDependencyCompleteness, buildPackage } from '../scripts/build.mjs';
import {
  VERSION_MANIFEST_CHANNEL,
  VERSION_MANIFEST_FILENAME,
  VERSION_MANIFEST_RELOAD_POLICY,
  VERSION_MANIFEST_SCHEMA,
} from '../scripts/generate-version-manifest.mjs';

const testHere = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testHere, '../../..');
const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PUBLISHED_AT = '2026-08-19T00:12:00+09:00';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

async function verifyManifestArtifacts(dist, manifest) {
  assert.equal(manifest.schema, 'gameroad.public-pack.v1');
  assert.equal(manifest.source_commit, SOURCE_COMMIT);
  const outputs = new Set();
  for (const artifact of Object.values(manifest.artifacts)) {
    assert.equal(typeof artifact.output, 'string');
    assert.ok(artifact.output.length > 0);
    assert.equal(path.isAbsolute(artifact.output), false);
    assert.equal(artifact.output.includes('\\'), false);
    assert.equal(path.posix.normalize(artifact.output), artifact.output);
    assert.equal(outputs.has(artifact.output), false, `duplicate public output: ${artifact.output}`);
    outputs.add(artifact.output);
    const bytes = await readFile(path.join(dist, artifact.output));
    assert.equal(bytes.length, artifact.bytes, `byte count mismatch: ${artifact.output}`);
    assert.equal(sha256(bytes), artifact.sha256, `sha256 mismatch: ${artifact.output}`);
    if (artifact.git_blob_sha1) assert.equal(gitBlobSha1(bytes), artifact.git_blob_sha1, `git blob mismatch: ${artifact.output}`);
  }
  return outputs;
}

async function buildProductionInto(prefix = 'gameroad-public-pack-') {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const dist = path.join(dir, 'dist');
  const manifest = await buildPackage({ dist, sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
  return { dir, dist, manifest };
}

test('production build is deterministic, byte-verified, and includes the direct Saasuna conversation closure', async () => {
  const { dir, dist, manifest } = await buildProductionInto();
  try {
    const outputs = await verifyManifestArtifacts(dist, manifest);
    for (const output of [
      'index.html',
      'board-facility-runtime-mount.mjs',
      'partner-conversation-core.mjs',
      'partner-saasuna-conversation-source.mjs',
      VERSION_MANIFEST_FILENAME,
    ]) assert.equal(outputs.has(output), true, `missing required public output: ${output}`);

    for (const [source, output] of [
      ['browser/board-facility-runtime-mount.mjs', 'board-facility-runtime-mount.mjs'],
      ['browser/partner-conversation-core.mjs', 'partner-conversation-core.mjs'],
      ['browser/partner-saasuna-conversation-source.mjs', 'partner-saasuna-conversation-source.mjs'],
    ]) {
      assert.equal(
        (await readFile(path.join(dist, output))).equals(await readFile(path.join(repoRoot, source))),
        true,
        `${output} must be byte-identical to ${source}`,
      );
    }

    assert.deepEqual(JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')), {
      schema: VERSION_MANIFEST_SCHEMA,
      channel: VERSION_MANIFEST_CHANNEL,
      build_id: SOURCE_COMMIT,
      published_at: PUBLISHED_AT,
      reload_policy: VERSION_MANIFEST_RELOAD_POLICY,
    });

    const firstManifest = await readFile(path.join(dist, 'manifest.json'), 'utf8');
    const firstVersion = await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8');
    await buildPackage({ dist, sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
    assert.equal(await readFile(path.join(dist, 'manifest.json'), 'utf8'), firstManifest);
    assert.equal(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8'), firstVersion);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recursive dependency verifier fails closed on a missing nested module', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-dependency-'));
  try {
    await writeFile(path.join(dir, 'entry.mjs'), "import './nested.mjs';\n");
    await assert.rejects(
      () => assertBrowserRuntimeDependencyCompleteness(Buffer.from('<script type="module" src="./entry.mjs"></script>'), dir),
      /missing Browser runtime dependency: \.\/nested\.mjs/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dependency verifier also detects inline static imports', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-inline-'));
  try {
    await assert.rejects(
      () => assertBrowserRuntimeDependencyCompleteness(Buffer.from("<script type=\"module\">import './missing.mjs';</script>"), dir),
      /missing Browser runtime dependency: \.\/missing\.mjs/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('build rejects stale Browser, mount, and conversation dependency blob expectations', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-stale-'));
  try {
    const common = { dist: path.join(dir, 'dist'), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
    await assert.rejects(() => buildPackage({ ...common, expectedBlob: '0'.repeat(40) }), /Browser blob mismatch/);
    await assert.rejects(() => buildPackage({ ...common, expectedBoardFacilityRuntimeMountBlob: '0'.repeat(40) }), /Board facility runtime mount blob mismatch/);
    await assert.rejects(() => buildPackage({ ...common, expectedPartnerConversationCoreBlob: '0'.repeat(40) }), /Partner conversation core blob mismatch/);
    await assert.rejects(() => buildPackage({ ...common, expectedSaasunaConversationSourceBlob: '0'.repeat(40) }), /Saasuna conversation source blob mismatch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('built package can be copied and re-verified as an isolated rollback snapshot', async () => {
  const { dir, dist, manifest } = await buildProductionInto('gameroad-public-rollback-');
  const snapshot = path.join(dir, 'snapshot');
  try {
    await cp(dist, snapshot, { recursive: true });
    const snapshotManifest = JSON.parse(await readFile(path.join(snapshot, 'manifest.json'), 'utf8'));
    assert.deepEqual(snapshotManifest, manifest);
    await verifyManifestArtifacts(snapshot, snapshotManifest);
    assert.equal(
      (await readFile(path.join(snapshot, '_headers'))).equals(await readFile(path.join(dist, '_headers'))),
      true,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('build fails closed for invalid release identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-version-'));
  try {
    await assert.rejects(
      () => buildPackage({ dist: path.join(dir, 'dist'), sourceCommit: 'not-a-commit', publishedAt: PUBLISHED_AT }),
      /sourceCommit|build_id|commit/i,
    );
    await assert.rejects(
      () => buildPackage({ dist: path.join(dir, 'dist'), sourceCommit: SOURCE_COMMIT, publishedAt: 'not-a-date' }),
      /publishedAt|published_at|date/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

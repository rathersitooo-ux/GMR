import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build.mjs';

const testHere = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testHere, '../../..');

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

test('build copies Browser and local runtime dependency bytes exactly and emits deterministic provenance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const dist = path.join(dir, 'dist');
  const bytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n<script src="./deck-save-recovery-core.mjs"></script>\n', 'utf8');
  const coreBytes = Buffer.from('globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n', 'utf8');
  const presenceCoreBytes = Buffer.from('export const HATE_PEER_PRESENCE_CORE = Object.freeze({});\n', 'utf8');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  await writeFile(presenceCoreSource, presenceCoreBytes);
  const blob = gitBlobSha1(bytes);
  const coreBlob = gitBlobSha1(coreBytes);
  const presenceCoreBlob = gitBlobSha1(presenceCoreBytes);

  const first = await buildPackage({
    source,
    coreSource,
    presenceCoreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    expectedPresenceCoreBlob: presenceCoreBlob,
    sourceCommit: 'abc123',
  });
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(bytes), true);
  assert.equal((await readFile(path.join(dist, 'deck-save-recovery-core.mjs'))).equals(coreBytes), true);
  assert.equal((await readFile(path.join(dist, 'hate-peer-presence-core.mjs'))).equals(presenceCoreBytes), true);
  assert.equal(first.git_blob_sha1, blob);
  assert.equal(first.source_commit, 'abc123');
  assert.equal(first.artifacts.index_html.git_blob_sha1, blob);
  assert.equal(first.artifacts.index_html.output, 'index.html');
  assert.equal(first.artifacts.deck_save_recovery_core.git_blob_sha1, coreBlob);
  assert.equal(first.artifacts.deck_save_recovery_core.output, 'deck-save-recovery-core.mjs');
  assert.equal(first.artifacts.hate_peer_presence_core.git_blob_sha1, presenceCoreBlob);
  assert.equal(first.artifacts.hate_peer_presence_core.output, 'hate-peer-presence-core.mjs');

  const manifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  await buildPackage({
    source,
    coreSource,
    presenceCoreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    expectedPresenceCoreBlob: presenceCoreBlob,
    sourceCommit: 'abc123',
  });
  const manifest2 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  assert.equal(manifest1, manifest2);
});

test('build packages the current production Browser dependency set exactly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-current-public-pack-'));
  const dist = path.join(dir, 'dist');
  const browserBytes = await readFile(path.join(repoRoot, 'browser/GAMEROAD.html'));
  const coreBytes = await readFile(path.join(repoRoot, 'browser/deck-save-recovery-core.mjs'));
  const presenceCoreBytes = await readFile(path.join(repoRoot, 'browser/hate-peer-presence-core.mjs'));
  const expectedBlob = gitBlobSha1(browserBytes);
  const expectedCoreBlob = 'a21514cd3562005066298b2902f46da7c14f3caa';
  const expectedPresenceCoreBlob = '698516da1f89099c4cb15152bb98174473f77534';
  const sourceCommit = 'candidate-current-tree';

  assert.equal(gitBlobSha1(coreBytes), expectedCoreBlob);
  assert.equal(gitBlobSha1(presenceCoreBytes), expectedPresenceCoreBlob);
  const manifest = await buildPackage({ dist, expectedBlob, expectedCoreBlob, expectedPresenceCoreBlob, sourceCommit });

  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true);
  assert.equal((await readFile(path.join(dist, 'deck-save-recovery-core.mjs'))).equals(coreBytes), true);
  assert.equal((await readFile(path.join(dist, 'hate-peer-presence-core.mjs'))).equals(presenceCoreBytes), true);
  assert.equal(manifest.source_commit, sourceCommit);
  assert.equal(manifest.artifacts.index_html.git_blob_sha1, expectedBlob);
  assert.equal(manifest.artifacts.deck_save_recovery_core.git_blob_sha1, expectedCoreBlob);
  assert.equal(manifest.artifacts.hate_peer_presence_core.git_blob_sha1, expectedPresenceCoreBlob);
});

test('build aborts on stale Browser blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  await writeFile(source, 'current bytes');
  await writeFile(coreSource, 'current core bytes');
  await writeFile(presenceCoreSource, 'current presence bytes');
  await assert.rejects(
    () => buildPackage({ source, coreSource, presenceCoreSource, dist: path.join(dir, 'dist'), expectedBlob: '0000000000000000000000000000000000000000' }),
    /Browser blob mismatch/,
  );
});

test('build aborts on stale deck-save recovery core blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const bytes = Buffer.from('current bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, 'current core bytes');
  await writeFile(presenceCoreSource, 'current presence bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      presenceCoreSource,
      dist: path.join(dir, 'dist'),
      expectedBlob: gitBlobSha1(bytes),
      expectedCoreBlob: '0000000000000000000000000000000000000000',
    }),
    /Deck save recovery core blob mismatch/,
  );
});

test('build aborts on stale HATE peer presence core blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const bytes = Buffer.from('current bytes');
  const coreBytes = Buffer.from('current core bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  await writeFile(presenceCoreSource, 'current presence bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      presenceCoreSource,
      dist: path.join(dir, 'dist'),
      expectedBlob: gitBlobSha1(bytes),
      expectedCoreBlob: gitBlobSha1(coreBytes),
      expectedPresenceCoreBlob: '0000000000000000000000000000000000000000',
    }),
    /HATE peer presence core blob mismatch/,
  );
});

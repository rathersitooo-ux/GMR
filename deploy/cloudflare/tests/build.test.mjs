import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPackage } from '../scripts/build.mjs';

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

test('build copies Browser and local runtime dependency bytes exactly and emits deterministic provenance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const dist = path.join(dir, 'dist');
  const bytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n<script src="./deck-save-recovery-core.mjs"></script>\n', 'utf8');
  const coreBytes = Buffer.from('globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n', 'utf8');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  const blob = gitBlobSha1(bytes);
  const coreBlob = gitBlobSha1(coreBytes);

  const first = await buildPackage({
    source,
    coreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    sourceCommit: 'abc123',
  });
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(bytes), true);
  assert.equal((await readFile(path.join(dist, 'deck-save-recovery-core.mjs'))).equals(coreBytes), true);
  assert.equal(first.git_blob_sha1, blob);
  assert.equal(first.source_commit, 'abc123');
  assert.equal(first.artifacts.index_html.git_blob_sha1, blob);
  assert.equal(first.artifacts.index_html.output, 'index.html');
  assert.equal(first.artifacts.deck_save_recovery_core.git_blob_sha1, coreBlob);
  assert.equal(first.artifacts.deck_save_recovery_core.output, 'deck-save-recovery-core.mjs');

  const manifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  await buildPackage({
    source,
    coreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    sourceCommit: 'abc123',
  });
  const manifest2 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  assert.equal(manifest1, manifest2);
});

test('build aborts on stale Browser blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  await writeFile(source, 'current bytes');
  await writeFile(coreSource, 'current core bytes');
  await assert.rejects(
    () => buildPackage({ source, coreSource, dist: path.join(dir, 'dist'), expectedBlob: '0000000000000000000000000000000000000000' }),
    /Browser blob mismatch/,
  );
});

test('build aborts on stale deck-save recovery core blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const bytes = Buffer.from('current bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, 'current core bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      dist: path.join(dir, 'dist'),
      expectedBlob: gitBlobSha1(bytes),
      expectedCoreBlob: '0000000000000000000000000000000000000000',
    }),
    /Deck save recovery core blob mismatch/,
  );
});

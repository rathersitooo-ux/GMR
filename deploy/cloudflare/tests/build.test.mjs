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

test('build copies Browser bytes exactly and emits deterministic provenance', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const dist = path.join(dir, 'dist');
  const bytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n', 'utf8');
  await writeFile(source, bytes);
  const blob = gitBlobSha1(bytes);
  const first = await buildPackage({ source, dist, expectedBlob: blob, sourceCommit: 'abc123' });
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(bytes), true);
  assert.equal(first.git_blob_sha1, blob);
  assert.equal(first.source_commit, 'abc123');
  const manifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  await buildPackage({ source, dist, expectedBlob: blob, sourceCommit: 'abc123' });
  const manifest2 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  assert.equal(manifest1, manifest2);
});

test('build aborts on stale Browser blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  await writeFile(source, 'current bytes');
  await assert.rejects(() => buildPackage({ source, dist: path.join(dir, 'dist'), expectedBlob: '0000000000000000000000000000000000000000' }), /Browser blob mismatch/);
});

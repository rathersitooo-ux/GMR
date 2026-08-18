import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildVersionManifest,
  serializeVersionManifest,
} from '../scripts/generate-version-manifest.mjs';

const VALID_SHA = '0123456789abcdef0123456789abcdef01234567';
const VALID_PUBLISHED_AT = '2026-08-18T23:15:00+09:00';

test('buildVersionManifest binds build_id to exact package source_commit', () => {
  assert.deepEqual(
    buildVersionManifest({ packageManifest: { source_commit: VALID_SHA }, publishedAt: VALID_PUBLISHED_AT }),
    {
      schema: 'GAMEROAD_BROWSER_VERSION_V1',
      channel: 'current',
      build_id: VALID_SHA,
      published_at: VALID_PUBLISHED_AT,
      reload_policy: 'never-force-during-match',
    },
  );
});

test('serializeVersionManifest is byte-identical for identical authorized inputs', () => {
  const input = { packageManifest: { source_commit: VALID_SHA }, publishedAt: VALID_PUBLISHED_AT };
  assert.equal(serializeVersionManifest(input), serializeVersionManifest(input));
  assert.equal(
    serializeVersionManifest(input),
    '{\n  "schema": "GAMEROAD_BROWSER_VERSION_V1",\n  "channel": "current",\n  "build_id": "0123456789abcdef0123456789abcdef01234567",\n  "published_at": "2026-08-18T23:15:00+09:00",\n  "reload_policy": "never-force-during-match"\n}\n',
  );
});

test('source_commit fails closed when absent, malformed, or uppercase', () => {
  for (const source_commit of [undefined, 'abc', VALID_SHA.toUpperCase()]) {
    assert.throws(
      () => buildVersionManifest({ packageManifest: { source_commit }, publishedAt: VALID_PUBLISHED_AT }),
      /source_commit/,
    );
  }
});

test('published_at must be explicit valid RFC3339 and is never inferred', () => {
  for (const publishedAt of [undefined, '', '2026-08-18T23:15:00', '2026-02-30T23:15:00Z', 'not-a-time']) {
    assert.throws(
      () => buildVersionManifest({ packageManifest: { source_commit: VALID_SHA }, publishedAt }),
      /published_at/,
    );
  }
});

test('CLI writes deterministic manifest from package manifest plus explicit publish time', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gameroad-version-manifest-'));
  const packagePath = join(dir, 'manifest.json');
  const outputPath = join(dir, 'gameroad-version.json');
  await writeFile(packagePath, `${JSON.stringify({ source_commit: VALID_SHA })}\n`, 'utf8');

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const scriptPath = resolve(thisDir, '../scripts/generate-version-manifest.mjs');
  const run = spawnSync(process.execPath, [scriptPath, '--package-manifest', packagePath, '--published-at', VALID_PUBLISHED_AT, '--output', outputPath], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  assert.equal(
    await readFile(outputPath, 'utf8'),
    serializeVersionManifest({ packageManifest: { source_commit: VALID_SHA }, publishedAt: VALID_PUBLISHED_AT }),
  );
});

test('CLI fails closed instead of deriving missing published_at', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gameroad-version-manifest-'));
  const packagePath = join(dir, 'manifest.json');
  const outputPath = join(dir, 'gameroad-version.json');
  await writeFile(packagePath, `${JSON.stringify({ source_commit: VALID_SHA })}\n`, 'utf8');

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const scriptPath = resolve(thisDir, '../scripts/generate-version-manifest.mjs');
  const run = spawnSync(process.execPath, [scriptPath, '--package-manifest', packagePath, '--output', outputPath], { encoding: 'utf8' });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /published-at/);
});

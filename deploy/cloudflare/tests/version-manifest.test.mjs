import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  VERSION_MANIFEST_CHANNEL,
  VERSION_MANIFEST_FILENAME,
  VERSION_MANIFEST_RELOAD_POLICY,
  VERSION_MANIFEST_SCHEMA,
  createVersionManifest,
  serializeVersionManifest,
  writeVersionManifest,
} from '../scripts/generate-version-manifest.mjs';

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PUBLISHED_AT = '2026-08-18T14:04:00Z';

test('creates the formal Browser version manifest from explicit release identity inputs', () => {
  assert.deepEqual(createVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT }), {
    schema: VERSION_MANIFEST_SCHEMA,
    channel: VERSION_MANIFEST_CHANNEL,
    build_id: SOURCE_COMMIT,
    published_at: PUBLISHED_AT,
    reload_policy: VERSION_MANIFEST_RELOAD_POLICY,
  });
});

test('serialization is byte-identical for identical explicit inputs', () => {
  const input = { sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
  const first = serializeVersionManifest(input);
  const second = serializeVersionManifest(input);
  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), true);
});

test('fails closed for missing, short, or uppercase source commits', () => {
  for (const sourceCommit of [undefined, '', 'abc123', SOURCE_COMMIT.toUpperCase()]) {
    assert.throws(
      () => createVersionManifest({ sourceCommit, publishedAt: PUBLISHED_AT }),
      /exact lowercase 40-hex/,
    );
  }
});

test('fails closed unless published_at is an explicit RFC3339 timestamp', () => {
  for (const publishedAt of [undefined, '', '2026-08-18', 'not-a-time']) {
    assert.throws(
      () => createVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt }),
      /explicit RFC3339/,
    );
  }
});

test('writes exactly gameroad-version.json bytes to an explicit output path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gameroad-version-'));
  const outputPath = join(root, VERSION_MANIFEST_FILENAME);
  try {
    const expected = serializeVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
    const written = await writeVersionManifest({ outputPath, sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
    assert.equal(written, expected);
    assert.equal(await readFile(outputPath, 'utf8'), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('write path is explicit and has no implicit output fallback', async () => {
  await assert.rejects(
    writeVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT }),
    /outputPath is required/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  TargetError,
  buildFeed,
  dedupe,
  fetchOne,
  loadTargets,
  parseStatusUrl,
} from '../tools/x-feed.mjs';

test('parses x.com public status URL', () => {
  assert.deepEqual(parseStatusUrl('https://x.com/example/status/1234567890'), {
    username: 'example',
    statusId: '1234567890',
  });
});

test('parses twitter.com URL with query string', () => {
  assert.deepEqual(parseStatusUrl('https://twitter.com/example/status/1234567890?s=20'), {
    username: 'example',
    statusId: '1234567890',
  });
});

test('parses FxTwitter and FixupX status URLs', () => {
  assert.deepEqual(parseStatusUrl('https://fxtwitter.com/example/status/1234567890'), {
    username: 'example',
    statusId: '1234567890',
  });
  assert.deepEqual(parseStatusUrl('https://fixupx.com/example/status/1234567890'), {
    username: 'example',
    statusId: '1234567890',
  });
});

test('rejects non-status and unsupported URLs', () => {
  assert.throws(() => parseStatusUrl('https://x.com/example'), TargetError);
  assert.throws(() => parseStatusUrl('https://example.com/a/status/123'), TargetError);
});

test('target file ignores comments and blank lines while dedupe preserves first order', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmr-x-feed-'));
  try {
    const targetPath = path.join(tempDir, 'targets.txt');
    await fs.writeFile(
      targetPath,
      '# comment\n\nhttps://x.com/a/status/1\nhttps://x.com/a/status/1\nhttps://x.com/b/status/2\n',
      'utf8',
    );
    const loaded = await loadTargets(targetPath);
    assert.deepEqual(loaded, [
      'https://x.com/a/status/1',
      'https://x.com/a/status/1',
      'https://x.com/b/status/2',
    ]);
    assert.deepEqual(dedupe(loaded), [
      'https://x.com/a/status/1',
      'https://x.com/b/status/2',
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('fetchOne normalizes provider URL and keeps public canonical X URL', async () => {
  let observedUrl = null;
  const result = await fetchOne('https://twitter.com/example/status/42?s=20', {
    fetchFn: async (url) => {
      observedUrl = url;
      return {
        ok: true,
        status: 200,
        async json() {
          return { tweet: { id: '42', text: 'public post' } };
        },
      };
    },
  });

  assert.equal(observedUrl, 'https://api.fxtwitter.com/example/status/42');
  assert.equal(result.requested_url, 'https://twitter.com/example/status/42?s=20');
  assert.equal(result.canonical_url, 'https://x.com/example/status/42');
  assert.equal(result.provider_url, 'https://api.fxtwitter.com/example/status/42');
  assert.deepEqual(result.tweet, { id: '42', text: 'public post' });
});

test('buildFeed dedupes targets, preserves successes, and records failures', async () => {
  const seen = [];
  const { document, ok } = await buildFeed(
    [
      'https://x.com/a/status/1',
      'https://x.com/a/status/1',
      'https://x.com/b/status/2',
    ],
    {
      now: () => new Date('2026-09-16T00:00:00.000Z'),
      fetchOneFn: async (target) => {
        seen.push(target);
        if (target.includes('/b/')) throw new Error('provider unavailable');
        return { requested_url: target, tweet: { id: '1' } };
      },
    },
  );

  assert.deepEqual(seen, [
    'https://x.com/a/status/1',
    'https://x.com/b/status/2',
  ]);
  assert.equal(ok, false);
  assert.equal(document.version, 1);
  assert.equal(document.updated_at_utc, '2026-09-16T00:00:00.000Z');
  assert.equal(document.provider, 'FxTwitter');
  assert.equal(document.items.length, 1);
  assert.deepEqual(document.errors, [
    { target: 'https://x.com/b/status/2', error: 'provider unavailable' },
  ]);
});

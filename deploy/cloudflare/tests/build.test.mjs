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
  const navigationCoreSource = path.join(dir, 'screen-navigation-core.mjs');
  const replayAdapterSource = path.join(dir, 'battle-replay-live-adapter.mjs');
  const replayCoreSource = path.join(dir, 'battle-replay-core.mjs');
  const cardPresentationCoreSource = path.join(dir, 'card-presentation-core.mjs');
  const dist = path.join(dir, 'dist');
  const bytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n<script src="./deck-save-recovery-core.mjs"></script>\n', 'utf8');
  const coreBytes = Buffer.from('globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n', 'utf8');
  const presenceCoreBytes = Buffer.from('export const HATE_PEER_PRESENCE_CORE = Object.freeze({});\n', 'utf8');
  const navigationCoreBytes = Buffer.from('export function resolveScreenNavigation(){ return { ok: true }; }\n', 'utf8');
  const replayAdapterBytes = Buffer.from("import './battle-replay-core.mjs';\nimport './card-presentation-core.mjs';\n", 'utf8');
  const replayCoreBytes = Buffer.from('export const BATTLE_REPLAY_CORE = Object.freeze({});\n', 'utf8');
  const cardPresentationCoreBytes = Buffer.from('export const CARD_PRESENTATION_CORE = Object.freeze({});\n', 'utf8');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  await writeFile(presenceCoreSource, presenceCoreBytes);
  await writeFile(navigationCoreSource, navigationCoreBytes);
  await writeFile(replayAdapterSource, replayAdapterBytes);
  await writeFile(replayCoreSource, replayCoreBytes);
  await writeFile(cardPresentationCoreSource, cardPresentationCoreBytes);
  const blob = gitBlobSha1(bytes);
  const coreBlob = gitBlobSha1(coreBytes);
  const presenceCoreBlob = gitBlobSha1(presenceCoreBytes);
  const navigationCoreBlob = gitBlobSha1(navigationCoreBytes);
  const replayAdapterBlob = gitBlobSha1(replayAdapterBytes);
  const replayCoreBlob = gitBlobSha1(replayCoreBytes);
  const cardPresentationCoreBlob = gitBlobSha1(cardPresentationCoreBytes);

  const first = await buildPackage({
    source,
    coreSource,
    presenceCoreSource,
    navigationCoreSource,
    replayAdapterSource,
    replayCoreSource,
    cardPresentationCoreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    expectedPresenceCoreBlob: presenceCoreBlob,
    expectedNavigationCoreBlob: navigationCoreBlob,
    expectedReplayAdapterBlob: replayAdapterBlob,
    expectedReplayCoreBlob: replayCoreBlob,
    expectedCardPresentationCoreBlob: cardPresentationCoreBlob,
    sourceCommit: 'abc123',
  });
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(bytes), true);
  assert.equal((await readFile(path.join(dist, 'deck-save-recovery-core.mjs'))).equals(coreBytes), true);
  assert.equal((await readFile(path.join(dist, 'hate-peer-presence-core.mjs'))).equals(presenceCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'screen-navigation-core.mjs'))).equals(navigationCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'battle-replay-live-adapter.mjs'))).equals(replayAdapterBytes), true);
  assert.equal((await readFile(path.join(dist, 'battle-replay-core.mjs'))).equals(replayCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'card-presentation-core.mjs'))).equals(cardPresentationCoreBytes), true);
  assert.equal(
    await readFile(path.join(dist, '_headers'), 'utf8'),
    '/\n  Cache-Control: no-cache, no-store\n\n/index.html\n  Cache-Control: no-cache, no-store\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n',
  );
  assert.equal(first.git_blob_sha1, blob);
  assert.equal(first.source_commit, 'abc123');
  assert.equal(first.artifacts.index_html.git_blob_sha1, blob);
  assert.equal(first.artifacts.index_html.output, 'index.html');
  assert.equal(first.artifacts.deck_save_recovery_core.git_blob_sha1, coreBlob);
  assert.equal(first.artifacts.deck_save_recovery_core.output, 'deck-save-recovery-core.mjs');
  assert.equal(first.artifacts.hate_peer_presence_core.git_blob_sha1, presenceCoreBlob);
  assert.equal(first.artifacts.hate_peer_presence_core.output, 'hate-peer-presence-core.mjs');
  assert.equal(first.artifacts.screen_navigation_core.git_blob_sha1, navigationCoreBlob);
  assert.equal(first.artifacts.screen_navigation_core.output, 'screen-navigation-core.mjs');
  assert.equal(first.artifacts.battle_replay_live_adapter.git_blob_sha1, replayAdapterBlob);
  assert.equal(first.artifacts.battle_replay_live_adapter.output, 'battle-replay-live-adapter.mjs');
  assert.equal(first.artifacts.battle_replay_core.git_blob_sha1, replayCoreBlob);
  assert.equal(first.artifacts.battle_replay_core.output, 'battle-replay-core.mjs');
  assert.equal(first.artifacts.card_presentation_core.git_blob_sha1, cardPresentationCoreBlob);
  assert.equal(first.artifacts.card_presentation_core.output, 'card-presentation-core.mjs');

  const manifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  await buildPackage({
    source,
    coreSource,
    presenceCoreSource,
    navigationCoreSource,
    replayAdapterSource,
    replayCoreSource,
    cardPresentationCoreSource,
    dist,
    expectedBlob: blob,
    expectedCoreBlob: coreBlob,
    expectedPresenceCoreBlob: presenceCoreBlob,
    expectedNavigationCoreBlob: navigationCoreBlob,
    expectedReplayAdapterBlob: replayAdapterBlob,
    expectedReplayCoreBlob: replayCoreBlob,
    expectedCardPresentationCoreBlob: cardPresentationCoreBlob,
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
  const navigationCoreBytes = await readFile(path.join(repoRoot, 'browser/screen-navigation-core.mjs'));
  const replayAdapterBytes = await readFile(path.join(repoRoot, 'browser/battle-replay-live-adapter.mjs'));
  const replayCoreBytes = await readFile(path.join(repoRoot, 'browser/battle-replay-core.mjs'));
  const cardPresentationCoreBytes = await readFile(path.join(repoRoot, 'browser/card-presentation-core.mjs'));
  const expectedBlob = gitBlobSha1(browserBytes);
  const expectedCoreBlob = 'a21514cd3562005066298b2902f46da7c14f3caa';
  const expectedPresenceCoreBlob = '698516da1f89099c4cb15152bb98174473f77534';
  const expectedNavigationCoreBlob = '771798cba911978256976da1275ef3d1e546ce5a';
  const expectedReplayAdapterBlob = '8abccb62f744811f150eb7f732223d50ce3be321';
  const expectedReplayCoreBlob = '48aaf3f2809ee7f9282fa9db68e4e7f79bf8e860';
  const expectedCardPresentationCoreBlob = '5dbd31ce856b412a7572ce213eb9d764c1b547de';
  const sourceCommit = 'candidate-current-tree';

  assert.equal(gitBlobSha1(coreBytes), expectedCoreBlob);
  assert.equal(gitBlobSha1(presenceCoreBytes), expectedPresenceCoreBlob);
  assert.equal(gitBlobSha1(navigationCoreBytes), expectedNavigationCoreBlob);
  assert.equal(gitBlobSha1(replayAdapterBytes), expectedReplayAdapterBlob);
  assert.equal(gitBlobSha1(replayCoreBytes), expectedReplayCoreBlob);
  assert.equal(gitBlobSha1(cardPresentationCoreBytes), expectedCardPresentationCoreBlob);
  const manifest = await buildPackage({
    dist,
    expectedBlob,
    expectedCoreBlob,
    expectedPresenceCoreBlob,
    expectedNavigationCoreBlob,
    expectedReplayAdapterBlob,
    expectedReplayCoreBlob,
    expectedCardPresentationCoreBlob,
    sourceCommit,
  });

  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true);
  assert.equal((await readFile(path.join(dist, 'deck-save-recovery-core.mjs'))).equals(coreBytes), true);
  assert.equal((await readFile(path.join(dist, 'hate-peer-presence-core.mjs'))).equals(presenceCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'screen-navigation-core.mjs'))).equals(navigationCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'battle-replay-live-adapter.mjs'))).equals(replayAdapterBytes), true);
  assert.equal((await readFile(path.join(dist, 'battle-replay-core.mjs'))).equals(replayCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'card-presentation-core.mjs'))).equals(cardPresentationCoreBytes), true);
  assert.equal(manifest.source_commit, sourceCommit);
  assert.equal(manifest.artifacts.index_html.git_blob_sha1, expectedBlob);
  assert.equal(manifest.artifacts.deck_save_recovery_core.git_blob_sha1, expectedCoreBlob);
  assert.equal(manifest.artifacts.hate_peer_presence_core.git_blob_sha1, expectedPresenceCoreBlob);
  assert.equal(manifest.artifacts.screen_navigation_core.git_blob_sha1, expectedNavigationCoreBlob);
  assert.equal(manifest.artifacts.battle_replay_live_adapter.git_blob_sha1, expectedReplayAdapterBlob);
  assert.equal(manifest.artifacts.battle_replay_core.git_blob_sha1, expectedReplayCoreBlob);
  assert.equal(manifest.artifacts.card_presentation_core.git_blob_sha1, expectedCardPresentationCoreBlob);
});

test('build aborts on stale Browser blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const navigationCoreSource = path.join(dir, 'screen-navigation-core.mjs');
  await writeFile(source, 'current bytes');
  await writeFile(coreSource, 'current core bytes');
  await writeFile(presenceCoreSource, 'current presence bytes');
  await writeFile(navigationCoreSource, 'current navigation bytes');
  await assert.rejects(
    () => buildPackage({ source, coreSource, presenceCoreSource, navigationCoreSource, dist: path.join(dir, 'dist'), expectedBlob: '0000000000000000000000000000000000000000' }),
    /Browser blob mismatch/,
  );
});

test('build aborts on stale deck-save recovery core blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const navigationCoreSource = path.join(dir, 'screen-navigation-core.mjs');
  const bytes = Buffer.from('current bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, 'current core bytes');
  await writeFile(presenceCoreSource, 'current presence bytes');
  await writeFile(navigationCoreSource, 'current navigation bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      presenceCoreSource,
      navigationCoreSource,
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
  const navigationCoreSource = path.join(dir, 'screen-navigation-core.mjs');
  const bytes = Buffer.from('current bytes');
  const coreBytes = Buffer.from('current core bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  await writeFile(presenceCoreSource, 'current presence bytes');
  await writeFile(navigationCoreSource, 'current navigation bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      presenceCoreSource,
      navigationCoreSource,
      dist: path.join(dir, 'dist'),
      expectedBlob: gitBlobSha1(bytes),
      expectedCoreBlob: gitBlobSha1(coreBytes),
      expectedPresenceCoreBlob: '0000000000000000000000000000000000000000',
    }),
    /HATE peer presence core blob mismatch/,
  );
});

test('build aborts on stale screen navigation core blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const coreSource = path.join(dir, 'deck-save-recovery-core.mjs');
  const presenceCoreSource = path.join(dir, 'hate-peer-presence-core.mjs');
  const navigationCoreSource = path.join(dir, 'screen-navigation-core.mjs');
  const bytes = Buffer.from('current bytes');
  const coreBytes = Buffer.from('current core bytes');
  const presenceCoreBytes = Buffer.from('current presence bytes');
  await writeFile(source, bytes);
  await writeFile(coreSource, coreBytes);
  await writeFile(presenceCoreSource, presenceCoreBytes);
  await writeFile(navigationCoreSource, 'current navigation bytes');
  await assert.rejects(
    () => buildPackage({
      source,
      coreSource,
      presenceCoreSource,
      navigationCoreSource,
      dist: path.join(dir, 'dist'),
      expectedBlob: gitBlobSha1(bytes),
      expectedCoreBlob: gitBlobSha1(coreBytes),
      expectedPresenceCoreBlob: gitBlobSha1(presenceCoreBytes),
      expectedNavigationCoreBlob: '0000000000000000000000000000000000000000',
    }),
    /Screen navigation core blob mismatch/,
  );
});

test('build aborts on stale Battle Replay live adapter blob expectation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const replayAdapterSource = path.join(dir, 'battle-replay-live-adapter.mjs');
  await writeFile(replayAdapterSource, "import './battle-replay-core.mjs';\n");
  await assert.rejects(
    () => buildPackage({
      replayAdapterSource,
      dist: path.join(dir, 'dist'),
      expectedReplayAdapterBlob: '0000000000000000000000000000000000000000',
    }),
    /Battle replay live adapter blob mismatch/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../scripts/build.mjs';
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

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

const dependencyContract = [
  {
    file: 'deck-save-recovery-core.mjs',
    source: 'browser/deck-save-recovery-core.mjs',
    sourceArg: 'coreSource',
    expectedArg: 'expectedCoreBlob',
    artifact: 'deck_save_recovery_core',
    fixture: 'globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n',
    currentBlob: 'a21514cd3562005066298b2902f46da7c14f3caa',
  },
  {
    file: 'hate-peer-presence-core.mjs',
    source: 'browser/hate-peer-presence-core.mjs',
    sourceArg: 'presenceCoreSource',
    expectedArg: 'expectedPresenceCoreBlob',
    artifact: 'hate_peer_presence_core',
    fixture: 'export const HATE_PEER_PRESENCE_CORE = Object.freeze({});\n',
    currentBlob: '698516da1f89099c4cb15152bb98174473f77534',
  },
  {
    file: 'screen-navigation-core.mjs',
    source: 'browser/screen-navigation-core.mjs',
    sourceArg: 'navigationCoreSource',
    expectedArg: 'expectedNavigationCoreBlob',
    artifact: 'screen_navigation_core',
    fixture: 'export function resolveScreenNavigation(){ return { ok: true }; }\n',
    currentBlob: 'f6ecc066982c89ca5080087820c061114846518b',
  },
  {
    file: 'battle-replay-live-adapter.mjs',
    source: 'browser/battle-replay-live-adapter.mjs',
    sourceArg: 'replayAdapterSource',
    expectedArg: 'expectedReplayAdapterBlob',
    artifact: 'battle_replay_live_adapter',
    fixture: "import './battle-replay-core.mjs';\nimport './card-presentation-core.mjs';\n",
    currentBlob: '8abccb62f744811f150eb7f732223d50ce3be321',
  },
  {
    file: 'battle-replay-core.mjs',
    source: 'browser/battle-replay-core.mjs',
    sourceArg: 'replayCoreSource',
    expectedArg: 'expectedReplayCoreBlob',
    artifact: 'battle_replay_core',
    fixture: 'export const BATTLE_REPLAY_CORE = Object.freeze({});\n',
    currentBlob: '48aaf3f2809ee7f9282fa9db68e4e7f79bf8e860',
  },
  {
    file: 'card-presentation-core.mjs',
    source: 'browser/card-presentation-core.mjs',
    sourceArg: 'cardPresentationCoreSource',
    expectedArg: 'expectedCardPresentationCoreBlob',
    artifact: 'card_presentation_core',
    fixture: 'export const CARD_PRESENTATION_CORE = Object.freeze({});\n',
    currentBlob: '5dbd31ce856b412a7572ce213eb9d764c1b547de',
  },
  {
    file: 'ui-state-feedback-core.mjs',
    source: 'browser/ui-state-feedback-core.mjs',
    sourceArg: 'uiStateFeedbackCoreSource',
    expectedArg: 'expectedUiStateFeedbackCoreBlob',
    artifact: 'ui_state_feedback_core',
    fixture: "export const UI_STATE_FEEDBACK_CORE = Object.freeze({ schema: 'fixture' });\n",
    currentBlob: 'bcc5e8b9313b441ed81614a56c24700f5aa7fdc8',
  },
  {
    file: 'ui-state-feedback-ready-plan-adapter.mjs',
    source: 'browser/ui-state-feedback-ready-plan-adapter.mjs',
    sourceArg: 'uiStateFeedbackReadyPlanAdapterSource',
    expectedArg: 'expectedUiStateFeedbackReadyPlanAdapterBlob',
    artifact: 'ui_state_feedback_ready_plan_adapter',
    fixture: "import './ui-state-feedback-core.mjs';\nexport const READY_PLAN_ADAPTER = Object.freeze({});\n",
    currentBlob: '1a3315ec07774dc2f9bd2d316e7a7e4d71f9b7a2',
  },
];

function expectedVersionManifest() {
  return {
    schema: VERSION_MANIFEST_SCHEMA,
    channel: VERSION_MANIFEST_CHANNEL,
    build_id: SOURCE_COMMIT,
    published_at: PUBLISHED_AT,
    reload_policy: VERSION_MANIFEST_RELOAD_POLICY,
  };
}

test('build copies Browser, runtime dependencies, and formal version manifest deterministically', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const dist = path.join(dir, 'dist');
  const browserBytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n', 'utf8');
  await writeFile(source, browserBytes);

  const options = {
    source,
    dist,
    expectedBlob: gitBlobSha1(browserBytes),
    sourceCommit: SOURCE_COMMIT,
    publishedAt: PUBLISHED_AT,
  };
  const expected = new Map();

  for (const dep of dependencyContract) {
    const depPath = path.join(dir, dep.file);
    const bytes = Buffer.from(dep.fixture, 'utf8');
    await writeFile(depPath, bytes);
    options[dep.sourceArg] = depPath;
    options[dep.expectedArg] = gitBlobSha1(bytes);
    expected.set(dep.file, bytes);
  }

  const first = await buildPackage(options);
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true);
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(dist, dep.file))).equals(expected.get(dep.file)), true);
    assert.equal(first.artifacts[dep.artifact].git_blob_sha1, options[dep.expectedArg]);
    assert.equal(first.artifacts[dep.artifact].output, dep.file);
  }
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')),
    expectedVersionManifest(),
  );
  assert.equal(
    await readFile(path.join(dist, '_headers'), 'utf8'),
    '/\n  Cache-Control: no-cache, no-store\n\n/index.html\n  Cache-Control: no-cache, no-store\n\n/gameroad-version.json\n  Cache-Control: no-store\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n',
  );
  assert.equal(first.git_blob_sha1, options.expectedBlob);
  assert.equal(first.source_commit, SOURCE_COMMIT);
  assert.equal(first.artifacts.index_html.output, 'index.html');
  assert.equal(first.artifacts.browser_version_manifest.output, VERSION_MANIFEST_FILENAME);

  const packageManifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  const versionManifest1 = await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8');
  await buildPackage(options);
  const packageManifest2 = await readFile(path.join(dist, 'manifest.json'), 'utf8');
  const versionManifest2 = await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8');
  assert.equal(packageManifest1, packageManifest2);
  assert.equal(versionManifest1, versionManifest2);
});

test('build packages the exact current production Browser dependency set with version identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-current-public-pack-'));
  const dist = path.join(dir, 'dist');
  const browserBytes = await readFile(path.join(repoRoot, 'browser/GAMEROAD.html'));
  const options = {
    dist,
    expectedBlob: gitBlobSha1(browserBytes),
    sourceCommit: SOURCE_COMMIT,
    publishedAt: PUBLISHED_AT,
  };
  const currentBytes = new Map();

  for (const dep of dependencyContract) {
    const bytes = await readFile(path.join(repoRoot, dep.source));
    assert.equal(gitBlobSha1(bytes), dep.currentBlob);
    options[dep.expectedArg] = dep.currentBlob;
    currentBytes.set(dep.file, bytes);
  }

  const manifest = await buildPackage(options);
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true);
  assert.equal(manifest.source_commit, SOURCE_COMMIT);
  assert.equal(manifest.artifacts.index_html.git_blob_sha1, options.expectedBlob);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')),
    expectedVersionManifest(),
  );
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(dist, dep.file))).equals(currentBytes.get(dep.file)), true);
    assert.equal(manifest.artifacts[dep.artifact].git_blob_sha1, dep.currentBlob);
  }
});

test('build fails closed on stale Browser or packaged dependency blob expectations', async () => {
  const staleCases = [
    ['expectedBlob', /Browser blob mismatch/],
    ['expectedCoreBlob', /Deck save recovery core blob mismatch/],
    ['expectedPresenceCoreBlob', /HATE peer presence core blob mismatch/],
    ['expectedNavigationCoreBlob', /Screen navigation core blob mismatch/],
    ['expectedReplayAdapterBlob', /Battle replay live adapter blob mismatch/],
    ['expectedReplayCoreBlob', /Battle replay core blob mismatch/],
    ['expectedCardPresentationCoreBlob', /Card presentation core blob mismatch/],
    ['expectedUiStateFeedbackCoreBlob', /UI state feedback core blob mismatch/],
    ['expectedUiStateFeedbackReadyPlanAdapterBlob', /UI state feedback ready-plan adapter blob mismatch/],
  ];

  for (const [expectedArg, errorPattern] of staleCases) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-stale-'));
    await assert.rejects(
      () => buildPackage({
        dist: path.join(dir, 'dist'),
        sourceCommit: SOURCE_COMMIT,
        publishedAt: PUBLISHED_AT,
        [expectedArg]: '0000000000000000000000000000000000000000',
      }),
      errorPattern,
    );
  }
});

test('build fails closed before package output for invalid release identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-version-invalid-'));
  await assert.rejects(
    () => buildPackage({
      dist: path.join(dir, 'dist-a'),
      sourceCommit: 'abc123',
      publishedAt: PUBLISHED_AT,
    }),
    /exact lowercase 40-hex/,
  );
  await assert.rejects(
    () => buildPackage({
      dist: path.join(dir, 'dist-b'),
      sourceCommit: SOURCE_COMMIT,
      publishedAt: '2026-08-19',
    }),
    /explicit RFC3339/,
  );
});

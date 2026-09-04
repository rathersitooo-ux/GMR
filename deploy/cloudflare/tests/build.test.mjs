import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function validateSnapshotOutputName(output) {
  assert.equal(typeof output, 'string', 'snapshot artifact output must be a string');
  assert.ok(output.length > 0, 'snapshot artifact output must not be empty');
  assert.equal(path.isAbsolute(output), false, `snapshot artifact output must be relative: ${output}`);
  assert.equal(output.includes('\\'), false, `snapshot artifact output must not contain backslashes: ${output}`);
  assert.equal(path.posix.normalize(output), output, `snapshot artifact output must be normalized: ${output}`);
  assert.ok(
    output.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
    `snapshot artifact output must not contain empty/dot traversal segments: ${output}`,
  );
}

async function validateRollbackSnapshot({ snapshotDir, expectedSourceCommit, expectedManifestSha256, expectedHeadersSha256 }) {
  const manifestBytes = await readFile(path.join(snapshotDir, 'manifest.json'));
  assert.equal(sha256(manifestBytes), expectedManifestSha256, 'snapshot manifest digest mismatch');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(manifest.schema, 'gameroad.public-pack.v1');
  assert.equal(manifest.source_commit, expectedSourceCommit, 'snapshot source_commit mismatch');
  assert.ok(manifest.artifacts && typeof manifest.artifacts === 'object');
  const outputs = new Map();
  for (const artifact of Object.values(manifest.artifacts)) {
    validateSnapshotOutputName(artifact.output);
    assert.equal(outputs.has(artifact.output), false, `duplicate snapshot output: ${artifact.output}`);
    const bytes = await readFile(path.join(snapshotDir, artifact.output));
    assert.equal(bytes.length, artifact.bytes, `snapshot artifact byte count mismatch: ${artifact.output}`);
    assert.equal(sha256(bytes), artifact.sha256, `snapshot artifact hash mismatch: ${artifact.output}`);
    outputs.set(artifact.output, bytes);
  }
  assert.ok(outputs.size > 0, 'snapshot must contain declared artifacts');
  assert.equal(manifest.artifacts.index_html.sha256, manifest.sha256);
  assert.equal(manifest.artifacts.index_html.bytes, manifest.bytes);
  const headersBytes = await readFile(path.join(snapshotDir, '_headers'));
  assert.equal(sha256(headersBytes), expectedHeadersSha256, 'snapshot _headers digest mismatch');
  return { manifest, manifestBytes, headersBytes, outputs };
}

async function restoreRollbackSnapshot({ snapshotDir, targetDir, expectedSourceCommit, expectedManifestSha256, expectedHeadersSha256 }) {
  const snapshot = path.resolve(snapshotDir);
  const target = path.resolve(targetDir);
  assert.notEqual(snapshot, target, 'snapshot and target directories must differ');
  assert.notEqual(target, path.parse(target).root, 'rollback target must not be a filesystem root');
  const snapshotToTarget = path.relative(snapshot, target);
  const targetToSnapshot = path.relative(target, snapshot);
  assert.ok(snapshotToTarget.startsWith('..') && targetToSnapshot.startsWith('..'), 'snapshot and target directories must not be nested');
  const validated = await validateRollbackSnapshot({ snapshotDir: snapshot, expectedSourceCommit, expectedManifestSha256, expectedHeadersSha256 });
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const [output, bytes] of validated.outputs) {
    const outputPath = path.join(target, output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes);
  }
  await writeFile(path.join(target, '_headers'), validated.headersBytes);
  await writeFile(path.join(target, 'manifest.json'), validated.manifestBytes);
  for (const [output, bytes] of validated.outputs) assert.equal((await readFile(path.join(target, output))).equals(bytes), true);
  assert.equal((await readFile(path.join(target, '_headers'))).equals(validated.headersBytes), true);
  assert.equal((await readFile(path.join(target, 'manifest.json'))).equals(validated.manifestBytes), true);
  return validated.manifest;
}

const dependencyContract = [
  { file: 'deck-save-recovery-core.mjs', source: 'browser/deck-save-recovery-core.mjs', sourceArg: 'coreSource', expectedArg: 'expectedCoreBlob', artifact: 'deck_save_recovery_core', fixture: 'globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n', currentBlob: 'd29fde280b3eb7c5f760b162987e04bda3446258' },
  { file: 'deck-save-ack-core.mjs', source: 'browser/deck-save-ack-core.mjs', sourceArg: 'deckSaveAckCoreSource', expectedArg: 'expectedDeckSaveAckCoreBlob', artifact: 'deck_save_ack_core', fixture: 'export function createDeckMatchStartSnapshot(){ return Object.freeze({}); }\n', currentBlob: 'e62c901c2cf78d8459dd3474072c5b735ac9c449' },
  { file: 'hate-peer-presence-core.mjs', source: 'browser/hate-peer-presence-core.mjs', sourceArg: 'presenceCoreSource', expectedArg: 'expectedPresenceCoreBlob', artifact: 'hate_peer_presence_core', fixture: 'export const HATE_PEER_PRESENCE_CORE = Object.freeze({});\n', currentBlob: '522c6132e4b49c0a0df15690927da511c1e40f43' },
  { file: 'screen-navigation-core.mjs', source: 'browser/screen-navigation-core.mjs', sourceArg: 'navigationCoreSource', expectedArg: 'expectedNavigationCoreBlob', artifact: 'screen_navigation_core', fixture: 'export function resolveScreenNavigation(){ return { ok: true }; }\n', currentBlob: 'd9b7bd0bcd882514336cbe3d029792a0dda84267' },
  { file: 'battle-replay-live-adapter.mjs', source: 'browser/battle-replay-live-adapter.mjs', sourceArg: 'replayAdapterSource', expectedArg: 'expectedReplayAdapterBlob', artifact: 'battle_replay_live_adapter', fixture: "import './battle-replay-core.mjs';\nimport './card-presentation-core.mjs';\nimport './battle-conveyor-presentation-core.mjs';\nimport './partner-battle-event-log-projection.mjs';\n", currentBlob: '6721a1f1f7204ae2de529bf924d028b5fe111fe0' },
  { file: 'partner-battle-event-log-projection.mjs', source: 'browser/partner-battle-event-log-projection.mjs', sourceArg: 'partnerBattleEventProjectionSource', expectedArg: 'expectedPartnerBattleEventProjectionBlob', artifact: 'partner_battle_event_log_projection', fixture: "export const PARTNER_BATTLE_EVENT_PROJECTION = Object.freeze({ schema: 'fixture' });\n", currentBlob: 'bb479042a1669ffe3d7217b0afeb9fa8afd666ae' },
  { file: 'battle-board-naki-4p-visual-binding.mjs', source: 'browser/battle-board-naki-4p-visual-binding.mjs', sourceArg: 'naki4pBoardVisualBindingSource', expectedArg: 'expectedNaki4pBoardVisualBindingBlob', artifact: 'battle_board_naki_4p_visual_binding', fixture: "export const NAKI_4P_BOARD_VISUAL_BINDING = Object.freeze({});\n", currentBlob: '35da814ac389908698bcd4aa78345ea583ab724d' },
  { file: 'battle-replay-core.mjs', source: 'browser/battle-replay-core.mjs', sourceArg: 'replayCoreSource', expectedArg: 'expectedReplayCoreBlob', artifact: 'battle_replay_core', fixture: 'export const BATTLE_REPLAY_CORE = Object.freeze({});\n', currentBlob: 'c2900ee933c6a3db82f0b0337124bc638e40c929' },
  { file: 'card-presentation-core.mjs', source: 'browser/card-presentation-core.mjs', sourceArg: 'cardPresentationCoreSource', expectedArg: 'expectedCardPresentationCoreBlob', artifact: 'card_presentation_core', fixture: 'export const CARD_PRESENTATION_CORE = Object.freeze({});\n', currentBlob: 'a98d982e3686425edec3d8122d61aff73d2eeec8' },
  { file: 'battle-conveyor-presentation-core.mjs', source: 'browser/battle-conveyor-presentation-core.mjs', sourceArg: 'battleConveyorCoreSource', expectedArg: 'expectedBattleConveyorCoreBlob', artifact: 'battle_conveyor_presentation_core', fixture: 'export const BATTLE_CONVEYOR_PRESENTATION_CORE = Object.freeze({});\n', currentBlob: '1d84e253a0a4c88c9c9969407c95c6155fe057ec' },
  { file: 'board-facility-state-core.classic.js', source: 'browser/board-facility-state-core.classic.js', sourceArg: 'boardFacilityClassicSource', expectedArg: 'expectedBoardFacilityClassicBlob', artifact: 'board_facility_classic', fixture: 'globalThis.GAMEROAD_BOARD_FACILITY_STATE_CORE = Object.freeze({});\n', currentBlob: '3227ed18855c39d8205d0aef07889f17f0d45f15' },
  { file: 'board-facility-state-core.mjs', source: 'browser/board-facility-state-core.mjs', sourceArg: 'boardFacilityCoreSource', expectedArg: 'expectedBoardFacilityCoreBlob', artifact: 'board_facility_core', fixture: 'export const BOARD_FACILITY_STATE_CORE = Object.freeze({});\n', currentBlob: '105f16e8dd8df7fd04611723fe8cb2bf089525e0' },
  { file: 'board-facility-runtime-mount.mjs', source: 'browser/board-facility-runtime-mount.mjs', sourceArg: 'boardFacilityRuntimeMountSource', expectedArg: 'expectedBoardFacilityRuntimeMountBlob', artifact: 'board_facility_runtime_mount', fixture: "import './board-facility-state-core.mjs';\nexport const BOARD_FACILITY_RUNTIME_MOUNT = Object.freeze({});\n", currentBlob: 'def54903a77c5914f2df11d98362b0f4e8eaf77c' },
  { file: 'ui-state-feedback-core.mjs', source: 'browser/ui-state-feedback-core.mjs', sourceArg: 'uiStateFeedbackCoreSource', expectedArg: 'expectedUiStateFeedbackCoreBlob', artifact: 'ui_state_feedback_core', fixture: "export const UI_STATE_FEEDBACK_CORE = Object.freeze({ schema: 'fixture' });\n", currentBlob: '32d6d73b8c849a92af8458e9bdf7a22793fd03e4' },
  { file: 'ui-state-feedback-ready-plan-adapter.mjs', source: 'browser/ui-state-feedback-ready-plan-adapter.mjs', sourceArg: 'uiStateFeedbackReadyPlanAdapterSource', expectedArg: 'expectedUiStateFeedbackReadyPlanAdapterBlob', artifact: 'ui_state_feedback_ready_plan_adapter', fixture: "import './ui-state-feedback-core.mjs';\nexport const READY_PLAN_ADAPTER = Object.freeze({});\n", currentBlob: 'c03292900b4d58384b80846a0b56f21b9acaf70b' },
  { file: 'field-music-policy-core.mjs', source: 'browser/field-music-policy-core.mjs', sourceArg: 'fieldMusicPolicyCoreSource', expectedArg: 'expectedFieldMusicPolicyCoreBlob', artifact: 'field_music_policy_core', fixture: "export const FIELD_MUSIC_POLICY_CORE = Object.freeze({ schema: 'fixture' });\n", currentBlob: '60da3257edd7c1065761f54cc8ade9ca1c2c4c62' },
  { file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: "import './partner-legal-action-adapter.mjs';\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({});\n", currentBlob: 'efde1b23042f98cca930d997d79fa1374a186e76' },
  { file: 'partner-legal-action-adapter.mjs', source: 'browser/partner-legal-action-adapter.mjs', sourceArg: 'partnerLegalActionAdapterSource', expectedArg: 'expectedPartnerLegalActionAdapterBlob', artifact: 'partner_legal_action_adapter', fixture: "import '../tools/advice-collective-eval.mjs';\nexport const PARTNER_LEGAL_ACTION_ADAPTER = Object.freeze({});\n", currentBlob: 'f32b3dbcba54d1ab0538fc43a8b935353510f990' },
  { file: 'tools/advice-collective-eval.mjs', source: 'tools/advice-collective-eval.mjs', sourceArg: 'adviceCollectiveEvalSource', expectedArg: 'expectedAdviceCollectiveEvalBlob', artifact: 'advice_collective_eval', fixture: 'export const ADVICE_COLLECTIVE_EVAL = Object.freeze({});\n', currentBlob: '3cc7eb964493eb1e7cc022c420f7d49fad1be420' },
];

function expectedVersionManifest() { return { schema: VERSION_MANIFEST_SCHEMA, channel: VERSION_MANIFEST_CHANNEL, build_id: SOURCE_COMMIT, published_at: PUBLISHED_AT, reload_policy: VERSION_MANIFEST_RELOAD_POLICY }; }

test('build copies Browser, runtime dependencies, and formal version manifest deterministically', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-'));
  const source = path.join(dir, 'GAMEROAD.html');
  const dist = path.join(dir, 'dist');
  const browserBytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n', 'utf8');
  await writeFile(source, browserBytes);
  const options = { source, dist, expectedBlob: gitBlobSha1(browserBytes), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
  const expected = new Map();
  for (const dep of dependencyContract) {
    const depPath = path.join(dir, dep.file); const bytes = Buffer.from(dep.fixture, 'utf8');
    await mkdir(path.dirname(depPath), { recursive: true }); await writeFile(depPath, bytes);
    options[dep.sourceArg] = depPath; options[dep.expectedArg] = gitBlobSha1(bytes); expected.set(dep.file, bytes);
  }
  const first = await buildPackage(options);
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true);
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(dist, dep.file))).equals(expected.get(dep.file)), true);
    assert.equal(first.artifacts[dep.artifact].git_blob_sha1, options[dep.expectedArg]);
    assert.equal(first.artifacts[dep.artifact].output, dep.file);
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')), expectedVersionManifest());
  assert.equal(await readFile(path.join(dist, '_headers'), 'utf8'), '/\n  Cache-Control: no-cache, no-store\n\n/index.html\n  Cache-Control: no-cache, no-store\n\n/gameroad-version.json\n  Cache-Control: no-store\n\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
  assert.equal(first.git_blob_sha1, options.expectedBlob); assert.equal(first.source_commit, SOURCE_COMMIT);
  assert.equal(first.artifacts.index_html.output, 'index.html'); assert.equal(first.artifacts.browser_version_manifest.output, VERSION_MANIFEST_FILENAME);
  const packageManifest1 = await readFile(path.join(dist, 'manifest.json'), 'utf8'); const versionManifest1 = await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8');
  await buildPackage(options);
  const packageManifest2 = await readFile(path.join(dist, 'manifest.json'), 'utf8'); const versionManifest2 = await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8');
  assert.equal(packageManifest1, packageManifest2); assert.equal(versionManifest1, versionManifest2);
});

test('recursive dependency verifier follows Partner advice imports and fails closed on missing nested output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-transitive-')); const dist = path.join(dir, 'dist');
  await mkdir(path.join(dist, 'tools'), { recursive: true });
  const browserBytes = Buffer.from('<script type="module">import("./partner-advice-runtime-mount.mjs")</script>\n', 'utf8');
  await writeFile(path.join(dist, 'partner-advice-runtime-mount.mjs'), "import './partner-legal-action-adapter.mjs';\n");
  await writeFile(path.join(dist, 'partner-legal-action-adapter.mjs'), "import '../tools/advice-collective-eval.mjs';\n");
  await writeFile(path.join(dist, 'tools/advice-collective-eval.mjs'), 'export const ready = true;\n');
  assert.deepEqual(await assertBrowserRuntimeDependencyCompleteness(browserBytes, dist), ['partner-advice-runtime-mount.mjs', 'partner-legal-action-adapter.mjs', 'tools/advice-collective-eval.mjs']);
  await rm(path.join(dist, 'tools/advice-collective-eval.mjs'));
  await assert.rejects(() => assertBrowserRuntimeDependencyCompleteness(browserBytes, dist), /Public package missing Browser runtime dependency: \.\/tools\/advice-collective-eval\.mjs/);
});

test('dependency verifier detects inline static module imports and fails closed when output is missing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-static-import-'));
  const dist = path.join(dir, 'dist');
  await mkdir(dist, { recursive: true });
  const browserBytes = Buffer.from('<script type="module">import { createDeckMatchStartSnapshot } from "./deck-save-ack-core.mjs";</script>\n', 'utf8');
  await assert.rejects(() => assertBrowserRuntimeDependencyCompleteness(browserBytes, dist), /Public package missing Browser runtime dependency: \.\/deck-save-ack-core\.mjs/);
  await writeFile(path.join(dist, 'deck-save-ack-core.mjs'), 'export function createDeckMatchStartSnapshot(){ return Object.freeze({}); }\n', 'utf8');
  assert.deepEqual(await assertBrowserRuntimeDependencyCompleteness(browserBytes, dist), ['deck-save-ack-core.mjs']);
});

test('build packages the exact current production Browser dependency set with version identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-current-public-pack-')); const dist = path.join(dir, 'dist');
  const browserBytes = await readFile(path.join(repoRoot, 'browser/GAMEROAD.html'));
  const options = { dist, expectedBlob: gitBlobSha1(browserBytes), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT }; const currentBytes = new Map();
  for (const dep of dependencyContract) {
    const bytes = await readFile(path.join(repoRoot, dep.source)); assert.equal(gitBlobSha1(bytes), dep.currentBlob);
    options[dep.expectedArg] = dep.currentBlob; currentBytes.set(dep.file, bytes);
  }
  const manifest = await buildPackage(options);
  assert.equal((await readFile(path.join(dist, 'index.html'))).equals(browserBytes), true); assert.equal(manifest.source_commit, SOURCE_COMMIT);
  assert.equal(manifest.artifacts.index_html.git_blob_sha1, options.expectedBlob);
  assert.deepEqual(JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')), expectedVersionManifest());
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(dist, dep.file))).equals(currentBytes.get(dep.file)), true); assert.equal(manifest.artifacts[dep.artifact].git_blob_sha1, dep.currentBlob);
  }
  const partnerConversationCoreBytes = await readFile(path.join(repoRoot, 'browser/partner-conversation-core.mjs'));
  const partnerSaasunaSourceBytes = await readFile(path.join(repoRoot, 'browser/partner-saasuna-conversation-source.mjs'));
  assert.equal((await readFile(path.join(dist, 'partner-conversation-core.mjs'))).equals(partnerConversationCoreBytes), true);
  assert.equal((await readFile(path.join(dist, 'partner-saasuna-conversation-source.mjs'))).equals(partnerSaasunaSourceBytes), true);
  assert.equal(manifest.artifacts.partner_conversation_core.git_blob_sha1, gitBlobSha1(partnerConversationCoreBytes));
  assert.equal(manifest.artifacts.partner_saasuna_conversation_source.git_blob_sha1, gitBlobSha1(partnerSaasunaSourceBytes));
});

test('isolated rollback drill restores a validated package and rejects corruption before target mutation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-rollback-drill-')); const source = path.join(dir, 'GAMEROAD.html'); const snapshot = path.join(dir, 'snapshot'); const target = path.join(dir, 'isolated-target');
  const browserBytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n<main>rollback-source</main>\n', 'utf8'); await writeFile(source, browserBytes);
  const options = { source, dist: snapshot, expectedBlob: gitBlobSha1(browserBytes), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
  for (const dep of dependencyContract) {
    const depPath = path.join(dir, `snapshot-${dep.file}`); const bytes = Buffer.from(dep.fixture, 'utf8'); await mkdir(path.dirname(depPath), { recursive: true }); await writeFile(depPath, bytes);
    options[dep.sourceArg] = depPath; options[dep.expectedArg] = gitBlobSha1(bytes);
  }
  await buildPackage(options);
  const trustedManifestBytes = await readFile(path.join(snapshot, 'manifest.json')); const trustedHeadersBytes = await readFile(path.join(snapshot, '_headers'));
  const expectedManifestSha256 = sha256(trustedManifestBytes); const expectedHeadersSha256 = sha256(trustedHeadersBytes);
  await mkdir(target, { recursive: true }); await writeFile(path.join(target, 'index.html'), 'corrupted deployed bytes\n', 'utf8'); await writeFile(path.join(target, 'stale-undeclared.txt'), 'remove me\n', 'utf8');
  const restored = await restoreRollbackSnapshot({ snapshotDir: snapshot, targetDir: target, expectedSourceCommit: SOURCE_COMMIT, expectedManifestSha256, expectedHeadersSha256 });
  assert.equal(restored.source_commit, SOURCE_COMMIT);
  for (const artifact of Object.values(restored.artifacts)) assert.equal((await readFile(path.join(target, artifact.output))).equals(await readFile(path.join(snapshot, artifact.output))), true, `restored artifact must be byte-exact: ${artifact.output}`);
  assert.equal((await readFile(path.join(target, 'manifest.json'))).equals(trustedManifestBytes), true); assert.equal((await readFile(path.join(target, '_headers'))).equals(trustedHeadersBytes), true);
  await assert.rejects(() => readFile(path.join(target, 'stale-undeclared.txt')), /ENOENT/);
  await writeFile(path.join(target, 'prevalidation-sentinel.txt'), 'target must remain untouched\n', 'utf8'); const originalSnapshotIndex = await readFile(path.join(snapshot, 'index.html'));
  await writeFile(path.join(snapshot, 'index.html'), Buffer.concat([originalSnapshotIndex, Buffer.from('CORRUPT')]));
  await assert.rejects(() => restoreRollbackSnapshot({ snapshotDir: snapshot, targetDir: target, expectedSourceCommit: SOURCE_COMMIT, expectedManifestSha256, expectedHeadersSha256 }), /snapshot artifact (byte count|hash) mismatch: index\.html/);
  assert.equal(await readFile(path.join(target, 'prevalidation-sentinel.txt'), 'utf8'), 'target must remain untouched\n'); assert.equal((await readFile(path.join(target, 'index.html'))).equals(browserBytes), true);
});

test('build fails closed on stale Browser or packaged dependency blob expectations', async () => {
  const staleCases = [['expectedBlob', /Browser blob mismatch/], ['expectedCoreBlob', /Deck save recovery core blob mismatch/], ['expectedDeckSaveAckCoreBlob', /Deck save ACK core blob mismatch/], ['expectedPresenceCoreBlob', /HATE peer presence core blob mismatch/], ['expectedNavigationCoreBlob', /Screen navigation core blob mismatch/], ['expectedReplayAdapterBlob', /Battle replay live adapter blob mismatch/], ['expectedPartnerBattleEventProjectionBlob', /Partner battle event projection blob mismatch/], ['expectedNaki4pBoardVisualBindingBlob', /Naki 4P actual-board visual binding blob mismatch/], ['expectedReplayCoreBlob', /Battle replay core blob mismatch/], ['expectedCardPresentationCoreBlob', /Card presentation core blob mismatch/], ['expectedBattleConveyorCoreBlob', /Battle conveyor presentation core blob mismatch/], ['expectedBoardFacilityClassicBlob', /Board facility classic bridge blob mismatch/], ['expectedBoardFacilityCoreBlob', /Board facility core blob mismatch/], ['expectedBoardFacilityRuntimeMountBlob', /Board facility runtime mount blob mismatch/], ['expectedUiStateFeedbackCoreBlob', /UI state feedback core blob mismatch/], ['expectedUiStateFeedbackReadyPlanAdapterBlob', /UI state feedback ready-plan adapter blob mismatch/], ['expectedFieldMusicPolicyCoreBlob', /Field music policy core blob mismatch/], ['expectedPartnerAdviceRuntimeMountBlob', /Partner advice runtime mount blob mismatch/], ['expectedPartnerLegalActionAdapterBlob', /Partner legal action adapter blob mismatch/], ['expectedAdviceCollectiveEvalBlob', /Advice collective evaluator blob mismatch/]];
  for (const [expectedArg, errorPattern] of staleCases) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-stale-'));
    await assert.rejects(() => buildPackage({ dist: path.join(dir, 'dist'), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT, [expectedArg]: '0000000000000000000000000000000000000000' }), errorPattern);
  }
});

test('build fails closed before package output for invalid release identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-version-invalid-'));
  await assert.rejects(() => buildPackage({ dist: path.join(dir, 'dist-a'), sourceCommit: 'abc123', publishedAt: PUBLISHED_AT }), /exact lowercase 40-hex/);
  await assert.rejects(() => buildPackage({ dist: path.join(dir, 'dist-b'), sourceCommit: SOURCE_COMMIT, publishedAt: '2026-08-19' }), /explicit RFC3339/);
});
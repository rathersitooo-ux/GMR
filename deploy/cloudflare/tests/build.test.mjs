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

const dependencyContract = [
  { file: 'deck-save-recovery-core.mjs', source: 'browser/deck-save-recovery-core.mjs', sourceArg: 'coreSource', expectedArg: 'expectedCoreBlob', artifact: 'deck_save_recovery_core', fixture: 'globalThis.GAMEROAD_DECK_SAVE_RECOVERY_CORE = Object.freeze({});\n', currentBlob: 'd29fde280b3eb7c5f760b162987e04bda3446258' },
  { file: 'deck-save-ack-core.mjs', source: 'browser/deck-save-ack-core.mjs', sourceArg: 'deckSaveAckCoreSource', expectedArg: 'expectedDeckSaveAckCoreBlob', artifact: 'deck_save_ack_core', fixture: 'export function createDeckMatchStartSnapshot(){ return Object.freeze({}); }\n', currentBlob: 'e62c901c2cf78d8459dd3474072c5b735ac9c449' },
  { file: 'hate-peer-presence-core.mjs', source: 'browser/hate-peer-presence-core.mjs', sourceArg: 'presenceCoreSource', expectedArg: 'expectedPresenceCoreBlob', artifact: 'hate_peer_presence_core', fixture: 'export const HATE_PEER_PRESENCE_CORE = Object.freeze({});\n', currentBlob: '522c6132e4b49c0a0df15690927da511c1e40f43' },
  { file: 'screen-navigation-core.mjs', source: 'browser/screen-navigation-core.mjs', sourceArg: 'navigationCoreSource', expectedArg: 'expectedNavigationCoreBlob', artifact: 'screen_navigation_core', fixture: 'export function resolveScreenNavigation(){ return { ok: true }; }\n', currentBlob: '91c7e790483fab24a921efe821d0a5102d6505ac' },
  { file: 'battle-replay-live-adapter.mjs', source: 'browser/battle-replay-live-adapter.mjs', sourceArg: 'replayAdapterSource', expectedArg: 'expectedReplayAdapterBlob', artifact: 'battle_replay_live_adapter', fixture: "import './battle-replay-core.mjs';\nimport './card-presentation-core.mjs';\nimport './battle-conveyor-presentation-core.mjs';\nimport './partner-battle-event-log-projection.mjs';\n", currentBlob: 'cb3ba74e38a59b951dc6e38bfcaeea724b188bba' },
  { file: 'partner-battle-event-log-projection.mjs', source: 'browser/partner-battle-event-log-projection.mjs', sourceArg: 'partnerBattleEventProjectionSource', expectedArg: 'expectedPartnerBattleEventProjectionBlob', artifact: 'partner_battle_event_log_projection', fixture: "export const PARTNER_BATTLE_EVENT_PROJECTION = Object.freeze({ schema: 'fixture' });\n", currentBlob: '78226b4a140fd93417e871d8fb155d712a7b3574' },
  { file: 'battle-replay-core.mjs', source: 'browser/battle-replay-core.mjs', sourceArg: 'replayCoreSource', expectedArg: 'expectedReplayCoreBlob', artifact: 'battle_replay_core', fixture: 'export const BATTLE_REPLAY_CORE = Object.freeze({});\n', currentBlob: 'c2900ee933c6a3db82f0b0337124bc638e40c929' },
  { file: 'card-presentation-core.mjs', source: 'browser/card-presentation-core.mjs', sourceArg: 'cardPresentationCoreSource', expectedArg: 'expectedCardPresentationCoreBlob', artifact: 'card_presentation_core', fixture: 'export const CARD_PRESENTATION_CORE = Object.freeze({});\n', currentBlob: 'a98d982e3686425edec3d8122d61aff73d2eeec8' },
  { file: 'battle-conveyor-presentation-core.mjs', source: 'browser/battle-conveyor-presentation-core.mjs', sourceArg: 'battleConveyorCoreSource', expectedArg: 'expectedBattleConveyorCoreBlob', artifact: 'battle_conveyor_presentation_core', fixture: 'export const BATTLE_CONVEYOR_PRESENTATION_CORE = Object.freeze({});\n', currentBlob: '1d84e253a0a4c88c9c9969407c95c6155fe057ec' },
  { file: 'board-facility-state-core.classic.js', source: 'browser/board-facility-state-core.classic.js', sourceArg: 'boardFacilityClassicSource', expectedArg: 'expectedBoardFacilityClassicBlob', artifact: 'board_facility_classic', fixture: 'globalThis.GAMEROAD_BOARD_FACILITY_STATE_CORE = Object.freeze({});\n', currentBlob: '3227ed18855c39d8205d0aef07889f17f0d45f15' },
  { file: 'board-facility-state-core.mjs', source: 'browser/board-facility-state-core.mjs', sourceArg: 'boardFacilityCoreSource', expectedArg: 'expectedBoardFacilityCoreBlob', artifact: 'board_facility_core', fixture: 'export const BOARD_FACILITY_STATE_CORE = Object.freeze({});\n', currentBlob: '105f16e8dd8df7fd04611723fe8cb2bf089525e0' },
  { file: 'board-facility-runtime-mount.mjs', source: 'browser/board-facility-runtime-mount.mjs', sourceArg: 'boardFacilityRuntimeMountSource', expectedArg: 'expectedBoardFacilityRuntimeMountBlob', artifact: 'board_facility_runtime_mount', fixture: "import './board-facility-state-core.mjs';\nexport const BOARD_FACILITY_RUNTIME_MOUNT = Object.freeze({});\n", currentBlob: '2266d45675ff87960f51469b35b7dd11e0e40451' },
  { file: 'ui-state-feedback-core.mjs', source: 'browser/ui-state-feedback-core.mjs', sourceArg: 'uiStateFeedbackCoreSource', expectedArg: 'expectedUiStateFeedbackCoreBlob', artifact: 'ui_state_feedback_core', fixture: "export const UI_STATE_FEEDBACK_CORE = Object.freeze({ schema: 'fixture' });\n", currentBlob: '32d6d73b8c849a92af8458e9bdf7a22793fd03e4' },
  { file: 'ui-state-feedback-ready-plan-adapter.mjs', source: 'browser/ui-state-feedback-ready-plan-adapter.mjs', sourceArg: 'uiStateFeedbackReadyPlanAdapterSource', expectedArg: 'expectedUiStateFeedbackReadyPlanAdapterBlob', artifact: 'ui_state_feedback_ready_plan_adapter', fixture: "import './ui-state-feedback-core.mjs';\nexport const READY_PLAN_ADAPTER = Object.freeze({});\n", currentBlob: '0b738b269c6197680409a247f5704bfa96eacc9b' },
  { file: 'field-music-policy-core.mjs', source: 'browser/field-music-policy-core.mjs', sourceArg: 'fieldMusicPolicyCoreSource', expectedArg: 'expectedFieldMusicPolicyCoreBlob', artifact: 'field_music_policy_core', fixture: "export const FIELD_MUSIC_POLICY_CORE = Object.freeze({ schema: 'fixture' });\n", currentBlob: 'a8a5c96fe29da363e731eb7c552bbc10fcb7fa84' },
  { file: 'partner-advice-runtime-mount.mjs', source: 'browser/partner-advice-runtime-mount.mjs', sourceArg: 'partnerAdviceRuntimeMountSource', expectedArg: 'expectedPartnerAdviceRuntimeMountBlob', artifact: 'partner_advice_runtime_mount', fixture: "import './partner-legal-action-adapter.mjs';\nexport const PARTNER_ADVICE_RUNTIME = Object.freeze({});\n", currentBlob: '0e9f92f6dcf4c2833523bc0fbd721f16a4b9cb08' },
  { file: 'partner-legal-action-adapter.mjs', source: 'browser/partner-legal-action-adapter.mjs', sourceArg: 'partnerLegalActionAdapterSource', expectedArg: 'expectedPartnerLegalActionAdapterBlob', artifact: 'partner_legal_action_adapter', fixture: "import '../tools/advice-collective-eval.mjs';\nexport const PARTNER_LEGAL_ACTION_ADAPTER = Object.freeze({});\n", currentBlob: 'f32b3dbcba54d1ab0538fc43a8b935353510f990' },
  { file: 'tools/advice-collective-eval.mjs', source: 'tools/advice-collective-eval.mjs', sourceArg: 'adviceCollectiveEvalSource', expectedArg: 'expectedAdviceCollectiveEvalBlob', artifact: 'advice_collective_eval', fixture: 'export const ADVICE_COLLECTIVE_EVAL = Object.freeze({});\n', currentBlob: '3cc7eb964493eb1e7cc022c420f7d49fad1be420' },
];

function versionManifest() {
  return { schema: VERSION_MANIFEST_SCHEMA, channel: VERSION_MANIFEST_CHANNEL, build_id: SOURCE_COMMIT, published_at: PUBLISHED_AT, reload_policy: VERSION_MANIFEST_RELOAD_POLICY };
}

async function makeFixture(prefix = 'gameroad-public-pack-') {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const source = path.join(dir, 'GAMEROAD.html');
  const dist = path.join(dir, 'dist');
  const browserBytes = Buffer.from('<!doctype html>\n<meta charset="utf-8">\n', 'utf8');
  await writeFile(source, browserBytes);
  const options = { source, dist, expectedBlob: gitBlobSha1(browserBytes), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
  const expected = new Map();
  for (const dep of dependencyContract) {
    const depPath = path.join(dir, dep.file);
    const bytes = Buffer.from(dep.fixture, 'utf8');
    await mkdir(path.dirname(depPath), { recursive: true });
    await writeFile(depPath, bytes);
    options[dep.sourceArg] = depPath;
    options[dep.expectedArg] = gitBlobSha1(bytes);
    expected.set(dep.file, bytes);
  }
  return { dir, source, dist, browserBytes, options, expected };
}

test('build copies Browser, runtime dependencies, and formal version manifest deterministically', async () => {
  const fixture = await makeFixture();
  const first = await buildPackage(fixture.options);
  assert.equal((await readFile(path.join(fixture.dist, 'index.html'))).equals(fixture.browserBytes), true);
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(fixture.dist, dep.file))).equals(fixture.expected.get(dep.file)), true);
    assert.equal(first.artifacts[dep.artifact].git_blob_sha1, fixture.options[dep.expectedArg]);
    assert.equal(first.artifacts[dep.artifact].output, dep.file);
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(fixture.dist, VERSION_MANIFEST_FILENAME), 'utf8')), versionManifest());
  assert.equal(first.git_blob_sha1, fixture.options.expectedBlob);
  assert.equal(first.source_commit, SOURCE_COMMIT);
  const package1 = await readFile(path.join(fixture.dist, 'manifest.json'), 'utf8');
  const version1 = await readFile(path.join(fixture.dist, VERSION_MANIFEST_FILENAME), 'utf8');
  await buildPackage(fixture.options);
  assert.equal(await readFile(path.join(fixture.dist, 'manifest.json'), 'utf8'), package1);
  assert.equal(await readFile(path.join(fixture.dist, VERSION_MANIFEST_FILENAME), 'utf8'), version1);
});

test('recursive dependency verifier follows Partner advice imports and fails closed on missing nested output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-public-pack-transitive-'));
  const dist = path.join(dir, 'dist');
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
  await writeFile(path.join(dist, 'deck-save-ack-core.mjs'), 'export function createDeckMatchStartSnapshot(){ return Object.freeze({}); }\n');
  assert.deepEqual(await assertBrowserRuntimeDependencyCompleteness(browserBytes, dist), ['deck-save-ack-core.mjs']);
});

test('build packages the exact current production Browser dependency set with version identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-current-public-pack-'));
  const dist = path.join(dir, 'dist');
  const browserBytes = await readFile(path.join(repoRoot, 'browser/GAMEROAD.html'));
  const options = { dist, expectedBlob: gitBlobSha1(browserBytes), sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
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
  assert.deepEqual(JSON.parse(await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8')), versionManifest());
  for (const dep of dependencyContract) {
    assert.equal((await readFile(path.join(dist, dep.file))).equals(currentBytes.get(dep.file)), true);
    assert.equal(manifest.artifacts[dep.artifact].git_blob_sha1, dep.currentBlob);
  }
  for (const [file, artifact] of [['partner-conversation-core.mjs', 'partner_conversation_core'], ['partner-saasuna-conversation-source.mjs', 'partner_saasuna_conversation_source']]) {
    const bytes = await readFile(path.join(repoRoot, 'browser', file));
    assert.equal((await readFile(path.join(dist, file))).equals(bytes), true);
    assert.equal(manifest.artifacts[artifact].git_blob_sha1, gitBlobSha1(bytes));
  }
});

test('isolated rollback drill restores a validated package and detects corruption', async () => {
  const fixture = await makeFixture('gameroad-rollback-drill-');
  await buildPackage(fixture.options);
  const manifestBytes = await readFile(path.join(fixture.dist, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.source_commit, SOURCE_COMMIT);
  for (const artifact of Object.values(manifest.artifacts)) {
    const bytes = await readFile(path.join(fixture.dist, artifact.output));
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(sha256(bytes), artifact.sha256);
  }
  const original = await readFile(path.join(fixture.dist, 'index.html'));
  await writeFile(path.join(fixture.dist, 'index.html'), Buffer.concat([original, Buffer.from('CORRUPT')]));
  const corrupted = await readFile(path.join(fixture.dist, 'index.html'));
  assert.notEqual(sha256(corrupted), manifest.artifacts.index_html.sha256);
  assert.equal(sha256(manifestBytes), sha256(await readFile(path.join(fixture.dist, 'manifest.json'))));
});

test('build fails closed on stale Browser or packaged dependency blob expectations', async () => {
  const staleCases = [
    ['expectedBlob', /Browser blob mismatch/], ['expectedCoreBlob', /Deck save recovery core blob mismatch/], ['expectedDeckSaveAckCoreBlob', /Deck save ACK core blob mismatch/],
    ['expectedPresenceCoreBlob', /HATE peer presence core blob mismatch/], ['expectedNavigationCoreBlob', /Screen navigation core blob mismatch/], ['expectedReplayAdapterBlob', /Battle replay live adapter blob mismatch/],
    ['expectedPartnerBattleEventProjectionBlob', /Partner battle event projection blob mismatch/], ['expectedReplayCoreBlob', /Battle replay core blob mismatch/], ['expectedCardPresentationCoreBlob', /Card presentation core blob mismatch/],
    ['expectedBattleConveyorCoreBlob', /Battle conveyor presentation core blob mismatch/], ['expectedBoardFacilityClassicBlob', /Board facility classic bridge blob mismatch/], ['expectedBoardFacilityCoreBlob', /Board facility core blob mismatch/],
    ['expectedBoardFacilityRuntimeMountBlob', /Board facility runtime mount blob mismatch/], ['expectedUiStateFeedbackCoreBlob', /UI state feedback core blob mismatch/], ['expectedUiStateFeedbackReadyPlanAdapterBlob', /UI state feedback ready-plan adapter blob mismatch/],
    ['expectedFieldMusicPolicyCoreBlob', /Field music policy core blob mismatch/], ['expectedPartnerAdviceRuntimeMountBlob', /Partner advice runtime mount blob mismatch/], ['expectedPartnerLegalActionAdapterBlob', /Partner legal action adapter blob mismatch/],
    ['expectedAdviceCollectiveEvalBlob', /Advice collective evaluator blob mismatch/],
  ];
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

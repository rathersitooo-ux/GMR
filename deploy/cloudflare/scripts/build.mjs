import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  VERSION_MANIFEST_FILENAME,
  serializeVersionManifest,
} from './generate-version-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const defaultSource = path.join(repoRoot, 'browser/GAMEROAD.html');
const defaultCoreSource = path.join(repoRoot, 'browser/deck-save-recovery-core.mjs');
const defaultPresenceCoreSource = path.join(repoRoot, 'browser/hate-peer-presence-core.mjs');
const defaultNavigationCoreSource = path.join(repoRoot, 'browser/screen-navigation-core.mjs');
const defaultReplayAdapterSource = path.join(repoRoot, 'browser/battle-replay-live-adapter.mjs');
const defaultReplayCoreSource = path.join(repoRoot, 'browser/battle-replay-core.mjs');
const defaultCardPresentationCoreSource = path.join(repoRoot, 'browser/card-presentation-core.mjs');
const defaultBoardFacilityClassicSource = path.join(repoRoot, 'browser/board-facility-state-core.classic.js');
const defaultBoardFacilityCoreSource = path.join(repoRoot, 'browser/board-facility-state-core.mjs');
const defaultBoardFacilityRuntimeMountSource = path.join(repoRoot, 'browser/board-facility-runtime-mount.mjs');
const defaultUiStateFeedbackCoreSource = path.join(repoRoot, 'browser/ui-state-feedback-core.mjs');
const defaultUiStateFeedbackReadyPlanAdapterSource = path.join(repoRoot, 'browser/ui-state-feedback-ready-plan-adapter.mjs');
const defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');

function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function provenance(source, output, input, blob) {
  return {
    source,
    output,
    git_blob_sha1: blob,
    sha256: sha256(input),
    bytes: input.length,
  };
}

export async function buildPackage({
  source = defaultSource,
  coreSource = defaultCoreSource,
  presenceCoreSource = defaultPresenceCoreSource,
  navigationCoreSource = defaultNavigationCoreSource,
  replayAdapterSource = defaultReplayAdapterSource,
  replayCoreSource = defaultReplayCoreSource,
  cardPresentationCoreSource = defaultCardPresentationCoreSource,
  boardFacilityClassicSource = defaultBoardFacilityClassicSource,
  boardFacilityCoreSource = defaultBoardFacilityCoreSource,
  boardFacilityRuntimeMountSource = defaultBoardFacilityRuntimeMountSource,
  uiStateFeedbackCoreSource = defaultUiStateFeedbackCoreSource,
  uiStateFeedbackReadyPlanAdapterSource = defaultUiStateFeedbackReadyPlanAdapterSource,
  dist = defaultDist,
  expectedBlob = '',
  expectedCoreBlob = '',
  expectedPresenceCoreBlob = '',
  expectedNavigationCoreBlob = '',
  expectedReplayAdapterBlob = '',
  expectedReplayCoreBlob = '',
  expectedCardPresentationCoreBlob = '',
  expectedBoardFacilityClassicBlob = '',
  expectedBoardFacilityCoreBlob = '',
  expectedBoardFacilityRuntimeMountBlob = '',
  expectedUiStateFeedbackCoreBlob = '',
  expectedUiStateFeedbackReadyPlanAdapterBlob = '',
  sourceCommit = '',
  publishedAt = '',
} = {}) {
  const input = await readFile(source);
  const coreInput = await readFile(coreSource);
  const presenceCoreInput = await readFile(presenceCoreSource);
  const navigationCoreInput = await readFile(navigationCoreSource);
  const replayAdapterInput = await readFile(replayAdapterSource);
  const replayCoreInput = await readFile(replayCoreSource);
  const cardPresentationCoreInput = await readFile(cardPresentationCoreSource);
  const boardFacilityClassicInput = await readFile(boardFacilityClassicSource);
  const boardFacilityCoreInput = await readFile(boardFacilityCoreSource);
  const boardFacilityRuntimeMountInput = await readFile(boardFacilityRuntimeMountSource);
  const uiStateFeedbackCoreInput = await readFile(uiStateFeedbackCoreSource);
  const uiStateFeedbackReadyPlanAdapterInput = await readFile(uiStateFeedbackReadyPlanAdapterSource);
  const blob = gitBlobSha1(input);
  const coreBlob = gitBlobSha1(coreInput);
  const presenceCoreBlob = gitBlobSha1(presenceCoreInput);
  const navigationCoreBlob = gitBlobSha1(navigationCoreInput);
  const replayAdapterBlob = gitBlobSha1(replayAdapterInput);
  const replayCoreBlob = gitBlobSha1(replayCoreInput);
  const cardPresentationCoreBlob = gitBlobSha1(cardPresentationCoreInput);
  const boardFacilityClassicBlob = gitBlobSha1(boardFacilityClassicInput);
  const boardFacilityCoreBlob = gitBlobSha1(boardFacilityCoreInput);
  const boardFacilityRuntimeMountBlob = gitBlobSha1(boardFacilityRuntimeMountInput);
  const uiStateFeedbackCoreBlob = gitBlobSha1(uiStateFeedbackCoreInput);
  const uiStateFeedbackReadyPlanAdapterBlob = gitBlobSha1(uiStateFeedbackReadyPlanAdapterInput);
  if (expectedBlob && blob !== expectedBlob) {
    throw new Error(`Browser blob mismatch: expected=${expectedBlob} actual=${blob}`);
  }
  if (expectedCoreBlob && coreBlob !== expectedCoreBlob) {
    throw new Error(`Deck save recovery core blob mismatch: expected=${expectedCoreBlob} actual=${coreBlob}`);
  }
  if (expectedPresenceCoreBlob && presenceCoreBlob !== expectedPresenceCoreBlob) {
    throw new Error(`HATE peer presence core blob mismatch: expected=${expectedPresenceCoreBlob} actual=${presenceCoreBlob}`);
  }
  if (expectedNavigationCoreBlob && navigationCoreBlob !== expectedNavigationCoreBlob) {
    throw new Error(`Screen navigation core blob mismatch: expected=${expectedNavigationCoreBlob} actual=${navigationCoreBlob}`);
  }
  if (expectedReplayAdapterBlob && replayAdapterBlob !== expectedReplayAdapterBlob) {
    throw new Error(`Battle replay live adapter blob mismatch: expected=${expectedReplayAdapterBlob} actual=${replayAdapterBlob}`);
  }
  if (expectedReplayCoreBlob && replayCoreBlob !== expectedReplayCoreBlob) {
    throw new Error(`Battle replay core blob mismatch: expected=${expectedReplayCoreBlob} actual=${replayCoreBlob}`);
  }
  if (expectedCardPresentationCoreBlob && cardPresentationCoreBlob !== expectedCardPresentationCoreBlob) {
    throw new Error(`Card presentation core blob mismatch: expected=${expectedCardPresentationCoreBlob} actual=${cardPresentationCoreBlob}`);
  }
  if (expectedBoardFacilityClassicBlob && boardFacilityClassicBlob !== expectedBoardFacilityClassicBlob) {
    throw new Error(`Board facility classic bridge blob mismatch: expected=${expectedBoardFacilityClassicBlob} actual=${boardFacilityClassicBlob}`);
  }
  if (expectedBoardFacilityCoreBlob && boardFacilityCoreBlob !== expectedBoardFacilityCoreBlob) {
    throw new Error(`Board facility core blob mismatch: expected=${expectedBoardFacilityCoreBlob} actual=${boardFacilityCoreBlob}`);
  }
  if (expectedBoardFacilityRuntimeMountBlob && boardFacilityRuntimeMountBlob !== expectedBoardFacilityRuntimeMountBlob) {
    throw new Error(`Board facility runtime mount blob mismatch: expected=${expectedBoardFacilityRuntimeMountBlob} actual=${boardFacilityRuntimeMountBlob}`);
  }
  if (expectedUiStateFeedbackCoreBlob && uiStateFeedbackCoreBlob !== expectedUiStateFeedbackCoreBlob) {
    throw new Error(`UI state feedback core blob mismatch: expected=${expectedUiStateFeedbackCoreBlob} actual=${uiStateFeedbackCoreBlob}`);
  }
  if (
    expectedUiStateFeedbackReadyPlanAdapterBlob
    && uiStateFeedbackReadyPlanAdapterBlob !== expectedUiStateFeedbackReadyPlanAdapterBlob
  ) {
    throw new Error(
      `UI state feedback ready-plan adapter blob mismatch: expected=${expectedUiStateFeedbackReadyPlanAdapterBlob} actual=${uiStateFeedbackReadyPlanAdapterBlob}`,
    );
  }

  const versionManifestBytes = serializeVersionManifest({ sourceCommit, publishedAt });
  const versionManifestBuffer = Buffer.from(versionManifestBytes, 'utf8');

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const outputPath = path.join(dist, 'index.html');
  await writeFile(outputPath, input);
  const roundTrip = await readFile(outputPath);
  if (!input.equals(roundTrip)) throw new Error('dist/index.html is not byte-identical to Browser source');

  const coreOutputPath = path.join(dist, 'deck-save-recovery-core.mjs');
  await writeFile(coreOutputPath, coreInput);
  const coreRoundTrip = await readFile(coreOutputPath);
  if (!coreInput.equals(coreRoundTrip)) {
    throw new Error('dist/deck-save-recovery-core.mjs is not byte-identical to Browser dependency source');
  }

  const presenceCoreOutputPath = path.join(dist, 'hate-peer-presence-core.mjs');
  await writeFile(presenceCoreOutputPath, presenceCoreInput);
  const presenceCoreRoundTrip = await readFile(presenceCoreOutputPath);
  if (!presenceCoreInput.equals(presenceCoreRoundTrip)) {
    throw new Error('dist/hate-peer-presence-core.mjs is not byte-identical to Browser dependency source');
  }

  const navigationCoreOutputPath = path.join(dist, 'screen-navigation-core.mjs');
  await writeFile(navigationCoreOutputPath, navigationCoreInput);
  const navigationCoreRoundTrip = await readFile(navigationCoreOutputPath);
  if (!navigationCoreInput.equals(navigationCoreRoundTrip)) {
    throw new Error('dist/screen-navigation-core.mjs is not byte-identical to Browser dependency source');
  }

  const replayAdapterOutputPath = path.join(dist, 'battle-replay-live-adapter.mjs');
  await writeFile(replayAdapterOutputPath, replayAdapterInput);
  const replayAdapterRoundTrip = await readFile(replayAdapterOutputPath);
  if (!replayAdapterInput.equals(replayAdapterRoundTrip)) {
    throw new Error('dist/battle-replay-live-adapter.mjs is not byte-identical to Browser dependency source');
  }

  const replayCoreOutputPath = path.join(dist, 'battle-replay-core.mjs');
  await writeFile(replayCoreOutputPath, replayCoreInput);
  const replayCoreRoundTrip = await readFile(replayCoreOutputPath);
  if (!replayCoreInput.equals(replayCoreRoundTrip)) {
    throw new Error('dist/battle-replay-core.mjs is not byte-identical to Browser dependency source');
  }

  const cardPresentationCoreOutputPath = path.join(dist, 'card-presentation-core.mjs');
  await writeFile(cardPresentationCoreOutputPath, cardPresentationCoreInput);
  const cardPresentationCoreRoundTrip = await readFile(cardPresentationCoreOutputPath);
  if (!cardPresentationCoreInput.equals(cardPresentationCoreRoundTrip)) {
    throw new Error('dist/card-presentation-core.mjs is not byte-identical to Browser dependency source');
  }

  const boardFacilityClassicOutputPath = path.join(dist, 'board-facility-state-core.classic.js');
  await writeFile(boardFacilityClassicOutputPath, boardFacilityClassicInput);
  const boardFacilityClassicRoundTrip = await readFile(boardFacilityClassicOutputPath);
  if (!boardFacilityClassicInput.equals(boardFacilityClassicRoundTrip)) {
    throw new Error('dist/board-facility-state-core.classic.js is not byte-identical to Browser dependency source');
  }

  const boardFacilityCoreOutputPath = path.join(dist, 'board-facility-state-core.mjs');
  await writeFile(boardFacilityCoreOutputPath, boardFacilityCoreInput);
  const boardFacilityCoreRoundTrip = await readFile(boardFacilityCoreOutputPath);
  if (!boardFacilityCoreInput.equals(boardFacilityCoreRoundTrip)) {
    throw new Error('dist/board-facility-state-core.mjs is not byte-identical to Browser dependency source');
  }

  const boardFacilityRuntimeMountOutputPath = path.join(dist, 'board-facility-runtime-mount.mjs');
  await writeFile(boardFacilityRuntimeMountOutputPath, boardFacilityRuntimeMountInput);
  const boardFacilityRuntimeMountRoundTrip = await readFile(boardFacilityRuntimeMountOutputPath);
  if (!boardFacilityRuntimeMountInput.equals(boardFacilityRuntimeMountRoundTrip)) {
    throw new Error('dist/board-facility-runtime-mount.mjs is not byte-identical to Browser dependency source');
  }

  const uiStateFeedbackCoreOutputPath = path.join(dist, 'ui-state-feedback-core.mjs');
  await writeFile(uiStateFeedbackCoreOutputPath, uiStateFeedbackCoreInput);
  const uiStateFeedbackCoreRoundTrip = await readFile(uiStateFeedbackCoreOutputPath);
  if (!uiStateFeedbackCoreInput.equals(uiStateFeedbackCoreRoundTrip)) {
    throw new Error('dist/ui-state-feedback-core.mjs is not byte-identical to Browser dependency source');
  }

  const uiStateFeedbackReadyPlanAdapterOutputPath = path.join(dist, 'ui-state-feedback-ready-plan-adapter.mjs');
  await writeFile(uiStateFeedbackReadyPlanAdapterOutputPath, uiStateFeedbackReadyPlanAdapterInput);
  const uiStateFeedbackReadyPlanAdapterRoundTrip = await readFile(uiStateFeedbackReadyPlanAdapterOutputPath);
  if (!uiStateFeedbackReadyPlanAdapterInput.equals(uiStateFeedbackReadyPlanAdapterRoundTrip)) {
    throw new Error('dist/ui-state-feedback-ready-plan-adapter.mjs is not byte-identical to Browser dependency source');
  }

  const versionManifestOutputPath = path.join(dist, VERSION_MANIFEST_FILENAME);
  await writeFile(versionManifestOutputPath, versionManifestBytes, 'utf8');
  const versionManifestRoundTrip = await readFile(versionManifestOutputPath, 'utf8');
  if (versionManifestRoundTrip !== versionManifestBytes) {
    throw new Error(`dist/${VERSION_MANIFEST_FILENAME} is not byte-identical to generated version manifest`);
  }

  const headers = [
    '/',
    '  Cache-Control: no-cache, no-store',
    '',
    '/index.html',
    '  Cache-Control: no-cache, no-store',
    '',
    `/${VERSION_MANIFEST_FILENAME}`,
    '  Cache-Control: no-store',
    '',
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '',
  ].join('\n');
  await writeFile(path.join(dist, '_headers'), headers, 'utf8');

  const manifest = {
    schema: 'gameroad.public-pack.v1',
    source: 'browser/GAMEROAD.html',
    source_commit: String(sourceCommit || ''),
    git_blob_sha1: blob,
    sha256: sha256(input),
    bytes: input.length,
    artifacts: {
      index_html: provenance('browser/GAMEROAD.html', 'index.html', input, blob),
      deck_save_recovery_core: provenance(
        'browser/deck-save-recovery-core.mjs',
        'deck-save-recovery-core.mjs',
        coreInput,
        coreBlob,
      ),
      hate_peer_presence_core: provenance(
        'browser/hate-peer-presence-core.mjs',
        'hate-peer-presence-core.mjs',
        presenceCoreInput,
        presenceCoreBlob,
      ),
      screen_navigation_core: provenance(
        'browser/screen-navigation-core.mjs',
        'screen-navigation-core.mjs',
        navigationCoreInput,
        navigationCoreBlob,
      ),
      battle_replay_live_adapter: provenance(
        'browser/battle-replay-live-adapter.mjs',
        'battle-replay-live-adapter.mjs',
        replayAdapterInput,
        replayAdapterBlob,
      ),
      battle_replay_core: provenance(
        'browser/battle-replay-core.mjs',
        'battle-replay-core.mjs',
        replayCoreInput,
        replayCoreBlob,
      ),
      card_presentation_core: provenance(
        'browser/card-presentation-core.mjs',
        'card-presentation-core.mjs',
        cardPresentationCoreInput,
        cardPresentationCoreBlob,
      ),
      board_facility_classic: provenance(
        'browser/board-facility-state-core.classic.js',
        'board-facility-state-core.classic.js',
        boardFacilityClassicInput,
        boardFacilityClassicBlob,
      ),
      board_facility_core: provenance(
        'browser/board-facility-state-core.mjs',
        'board-facility-state-core.mjs',
        boardFacilityCoreInput,
        boardFacilityCoreBlob,
      ),
      board_facility_runtime_mount: provenance(
        'browser/board-facility-runtime-mount.mjs',
        'board-facility-runtime-mount.mjs',
        boardFacilityRuntimeMountInput,
        boardFacilityRuntimeMountBlob,
      ),
      ui_state_feedback_core: provenance(
        'browser/ui-state-feedback-core.mjs',
        'ui-state-feedback-core.mjs',
        uiStateFeedbackCoreInput,
        uiStateFeedbackCoreBlob,
      ),
      ui_state_feedback_ready_plan_adapter: provenance(
        'browser/ui-state-feedback-ready-plan-adapter.mjs',
        'ui-state-feedback-ready-plan-adapter.mjs',
        uiStateFeedbackReadyPlanAdapterInput,
        uiStateFeedbackReadyPlanAdapterBlob,
      ),
      browser_version_manifest: {
        source: 'build-package-release-identity',
        output: VERSION_MANIFEST_FILENAME,
        sha256: sha256(versionManifestBuffer),
        bytes: versionManifestBuffer.length,
      },
    },
  };
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') out.source = path.resolve(argv[++i]);
    else if (a === '--core-source') out.coreSource = path.resolve(argv[++i]);
    else if (a === '--presence-core-source') out.presenceCoreSource = path.resolve(argv[++i]);
    else if (a === '--navigation-core-source') out.navigationCoreSource = path.resolve(argv[++i]);
    else if (a === '--replay-adapter-source') out.replayAdapterSource = path.resolve(argv[++i]);
    else if (a === '--replay-core-source') out.replayCoreSource = path.resolve(argv[++i]);
    else if (a === '--card-presentation-core-source') out.cardPresentationCoreSource = path.resolve(argv[++i]);
    else if (a === '--board-facility-classic-source') out.boardFacilityClassicSource = path.resolve(argv[++i]);
    else if (a === '--board-facility-core-source') out.boardFacilityCoreSource = path.resolve(argv[++i]);
    else if (a === '--board-facility-runtime-mount-source') out.boardFacilityRuntimeMountSource = path.resolve(argv[++i]);
    else if (a === '--ui-state-feedback-core-source') out.uiStateFeedbackCoreSource = path.resolve(argv[++i]);
    else if (a === '--ui-state-feedback-ready-plan-adapter-source') out.uiStateFeedbackReadyPlanAdapterSource = path.resolve(argv[++i]);
    else if (a === '--dist') out.dist = path.resolve(argv[++i]);
    else if (a === '--expected-blob') out.expectedBlob = argv[++i] || '';
    else if (a === '--expected-core-blob') out.expectedCoreBlob = argv[++i] || '';
    else if (a === '--expected-presence-core-blob') out.expectedPresenceCoreBlob = argv[++i] || '';
    else if (a === '--expected-navigation-core-blob') out.expectedNavigationCoreBlob = argv[++i] || '';
    else if (a === '--expected-replay-adapter-blob') out.expectedReplayAdapterBlob = argv[++i] || '';
    else if (a === '--expected-replay-core-blob') out.expectedReplayCoreBlob = argv[++i] || '';
    else if (a === '--expected-card-presentation-core-blob') out.expectedCardPresentationCoreBlob = argv[++i] || '';
    else if (a === '--expected-board-facility-classic-blob') out.expectedBoardFacilityClassicBlob = argv[++i] || '';
    else if (a === '--expected-board-facility-core-blob') out.expectedBoardFacilityCoreBlob = argv[++i] || '';
    else if (a === '--expected-board-facility-runtime-mount-blob') out.expectedBoardFacilityRuntimeMountBlob = argv[++i] || '';
    else if (a === '--expected-ui-state-feedback-core-blob') out.expectedUiStateFeedbackCoreBlob = argv[++i] || '';
    else if (a === '--expected-ui-state-feedback-ready-plan-adapter-blob') out.expectedUiStateFeedbackReadyPlanAdapterBlob = argv[++i] || '';
    else if (a === '--source-commit') out.sourceCommit = argv[++i] || '';
    else if (a === '--published-at') out.publishedAt = argv[++i] || '';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await buildPackage(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

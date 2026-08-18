import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const defaultSource = path.join(repoRoot, 'browser/GAMEROAD.html');
const defaultCoreSource = path.join(repoRoot, 'browser/deck-save-recovery-core.mjs');
const defaultPresenceCoreSource = path.join(repoRoot, 'browser/hate-peer-presence-core.mjs');
const defaultNavigationCoreSource = path.join(repoRoot, 'browser/screen-navigation-core.mjs');
const defaultReplayAdapterSource = path.join(repoRoot, 'browser/battle-replay-live-adapter.mjs');
const defaultReplayCoreSource = path.join(repoRoot, 'browser/battle-replay-core.mjs');
const defaultCardPresentationCoreSource = path.join(repoRoot, 'browser/card-presentation-core.mjs');
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
  dist = defaultDist,
  expectedBlob = '',
  expectedCoreBlob = '',
  expectedPresenceCoreBlob = '',
  expectedNavigationCoreBlob = '',
  expectedReplayAdapterBlob = '',
  expectedReplayCoreBlob = '',
  expectedCardPresentationCoreBlob = '',
  sourceCommit = '',
} = {}) {
  const input = await readFile(source);
  const coreInput = await readFile(coreSource);
  const presenceCoreInput = await readFile(presenceCoreSource);
  const navigationCoreInput = await readFile(navigationCoreSource);
  const replayAdapterInput = await readFile(replayAdapterSource);
  const replayCoreInput = await readFile(replayCoreSource);
  const cardPresentationCoreInput = await readFile(cardPresentationCoreSource);
  const blob = gitBlobSha1(input);
  const coreBlob = gitBlobSha1(coreInput);
  const presenceCoreBlob = gitBlobSha1(presenceCoreInput);
  const navigationCoreBlob = gitBlobSha1(navigationCoreInput);
  const replayAdapterBlob = gitBlobSha1(replayAdapterInput);
  const replayCoreBlob = gitBlobSha1(replayCoreInput);
  const cardPresentationCoreBlob = gitBlobSha1(cardPresentationCoreInput);
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

  const headers = [
    '/',
    '  Cache-Control: no-cache, no-store',
    '',
    '/index.html',
    '  Cache-Control: no-cache, no-store',
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
    else if (a === '--dist') out.dist = path.resolve(argv[++i]);
    else if (a === '--expected-blob') out.expectedBlob = argv[++i] || '';
    else if (a === '--expected-core-blob') out.expectedCoreBlob = argv[++i] || '';
    else if (a === '--expected-presence-core-blob') out.expectedPresenceCoreBlob = argv[++i] || '';
    else if (a === '--expected-navigation-core-blob') out.expectedNavigationCoreBlob = argv[++i] || '';
    else if (a === '--expected-replay-adapter-blob') out.expectedReplayAdapterBlob = argv[++i] || '';
    else if (a === '--expected-replay-core-blob') out.expectedReplayCoreBlob = argv[++i] || '';
    else if (a === '--expected-card-presentation-core-blob') out.expectedCardPresentationCoreBlob = argv[++i] || '';
    else if (a === '--source-commit') out.sourceCommit = argv[++i] || '';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await buildPackage(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

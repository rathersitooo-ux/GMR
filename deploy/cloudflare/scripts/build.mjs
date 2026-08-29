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
const defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');

const RUNTIME_SPECS = Object.freeze([
  { option: 'coreSource', expected: 'expectedCoreBlob', source: 'browser/deck-save-recovery-core.mjs', output: 'deck-save-recovery-core.mjs', artifact: 'deck_save_recovery_core', label: 'Deck save recovery core', sourceFlag: '--core-source', expectedFlag: '--expected-core-blob' },
  { option: 'deckSaveAckCoreSource', expected: 'expectedDeckSaveAckCoreBlob', source: 'browser/deck-save-ack-core.mjs', output: 'deck-save-ack-core.mjs', artifact: 'deck_save_ack_core', label: 'Deck save ACK core', sourceFlag: '--deck-save-ack-core-source', expectedFlag: '--expected-deck-save-ack-core-blob' },
  { option: 'presenceCoreSource', expected: 'expectedPresenceCoreBlob', source: 'browser/hate-peer-presence-core.mjs', output: 'hate-peer-presence-core.mjs', artifact: 'hate_peer_presence_core', label: 'HATE peer presence core', sourceFlag: '--presence-core-source', expectedFlag: '--expected-presence-core-blob' },
  { option: 'navigationCoreSource', expected: 'expectedNavigationCoreBlob', source: 'browser/screen-navigation-core.mjs', output: 'screen-navigation-core.mjs', artifact: 'screen_navigation_core', label: 'Screen navigation core', sourceFlag: '--navigation-core-source', expectedFlag: '--expected-navigation-core-blob' },
  { option: 'postMatchAutoqueueCoreSource', expected: 'expectedPostMatchAutoqueueCoreBlob', source: 'browser/post-match-autoqueue-core.mjs', output: 'post-match-autoqueue-core.mjs', artifact: 'post_match_autoqueue_core', label: 'Post-match autoqueue core', sourceFlag: '--post-match-autoqueue-core-source', expectedFlag: '--expected-post-match-autoqueue-core-blob' },
  { option: 'replayAdapterSource', expected: 'expectedReplayAdapterBlob', source: 'browser/battle-replay-live-adapter.mjs', output: 'battle-replay-live-adapter.mjs', artifact: 'battle_replay_live_adapter', label: 'Battle replay live adapter', sourceFlag: '--replay-adapter-source', expectedFlag: '--expected-replay-adapter-blob' },
  { option: 'partnerBattleEventProjectionSource', expected: 'expectedPartnerBattleEventProjectionBlob', source: 'browser/partner-battle-event-log-projection.mjs', output: 'partner-battle-event-log-projection.mjs', artifact: 'partner_battle_event_log_projection', label: 'Partner battle event projection', sourceFlag: '--partner-battle-event-projection-source', expectedFlag: '--expected-partner-battle-event-projection-blob' },
  { option: 'replayCoreSource', expected: 'expectedReplayCoreBlob', source: 'browser/battle-replay-core.mjs', output: 'battle-replay-core.mjs', artifact: 'battle_replay_core', label: 'Battle replay core', sourceFlag: '--replay-core-source', expectedFlag: '--expected-replay-core-blob' },
  { option: 'cardPresentationCoreSource', expected: 'expectedCardPresentationCoreBlob', source: 'browser/card-presentation-core.mjs', output: 'card-presentation-core.mjs', artifact: 'card_presentation_core', label: 'Card presentation core', sourceFlag: '--card-presentation-core-source', expectedFlag: '--expected-card-presentation-core-blob' },
  { option: 'battleConveyorCoreSource', expected: 'expectedBattleConveyorCoreBlob', source: 'browser/battle-conveyor-presentation-core.mjs', output: 'battle-conveyor-presentation-core.mjs', artifact: 'battle_conveyor_presentation_core', label: 'Battle conveyor presentation core', sourceFlag: '--battle-conveyor-core-source', expectedFlag: '--expected-battle-conveyor-core-blob' },
  { option: 'boardFacilityClassicSource', expected: 'expectedBoardFacilityClassicBlob', source: 'browser/board-facility-state-core.classic.js', output: 'board-facility-state-core.classic.js', artifact: 'board_facility_classic', label: 'Board facility classic bridge', sourceFlag: '--board-facility-classic-source', expectedFlag: '--expected-board-facility-classic-blob' },
  { option: 'boardFacilityCoreSource', expected: 'expectedBoardFacilityCoreBlob', source: 'browser/board-facility-state-core.mjs', output: 'board-facility-state-core.mjs', artifact: 'board_facility_core', label: 'Board facility core', sourceFlag: '--board-facility-core-source', expectedFlag: '--expected-board-facility-core-blob' },
  { option: 'boardFacilityRuntimeMountSource', expected: 'expectedBoardFacilityRuntimeMountBlob', source: 'browser/board-facility-runtime-mount.mjs', output: 'board-facility-runtime-mount.mjs', artifact: 'board_facility_runtime_mount', label: 'Board facility runtime mount', sourceFlag: '--board-facility-runtime-mount-source', expectedFlag: '--expected-board-facility-runtime-mount-blob' },
  { option: 'partnerConversationCoreSource', expected: 'expectedPartnerConversationCoreBlob', source: 'browser/partner-conversation-core.mjs', output: 'partner-conversation-core.mjs', artifact: 'partner_conversation_core', label: 'Partner conversation core', sourceFlag: '--partner-conversation-core-source', expectedFlag: '--expected-partner-conversation-core-blob' },
  { option: 'saasunaConversationSource', expected: 'expectedSaasunaConversationSourceBlob', source: 'browser/partner-saasuna-conversation-source.mjs', output: 'partner-saasuna-conversation-source.mjs', artifact: 'partner_saasuna_conversation_source', label: 'Saasuna conversation source', sourceFlag: '--saasuna-conversation-source', expectedFlag: '--expected-saasuna-conversation-source-blob' },
  { option: 'uiStateFeedbackCoreSource', expected: 'expectedUiStateFeedbackCoreBlob', source: 'browser/ui-state-feedback-core.mjs', output: 'ui-state-feedback-core.mjs', artifact: 'ui_state_feedback_core', label: 'UI state feedback core', sourceFlag: '--ui-state-feedback-core-source', expectedFlag: '--expected-ui-state-feedback-core-blob' },
  { option: 'uiStateFeedbackReadyPlanAdapterSource', expected: 'expectedUiStateFeedbackReadyPlanAdapterBlob', source: 'browser/ui-state-feedback-ready-plan-adapter.mjs', output: 'ui-state-feedback-ready-plan-adapter.mjs', artifact: 'ui_state_feedback_ready_plan_adapter', label: 'UI state feedback ready-plan adapter', sourceFlag: '--ui-state-feedback-ready-plan-adapter-source', expectedFlag: '--expected-ui-state-feedback-ready-plan-adapter-blob' },
  { option: 'fieldMusicPolicyCoreSource', expected: 'expectedFieldMusicPolicyCoreBlob', source: 'browser/field-music-policy-core.mjs', output: 'field-music-policy-core.mjs', artifact: 'field_music_policy_core', label: 'Field music policy core', sourceFlag: '--field-music-policy-core-source', expectedFlag: '--expected-field-music-policy-core-blob' },
  { option: 'homeCards2p5dPresentationSource', source: 'browser/home-cards-2p5d-presentation.mjs', output: 'home-cards-2p5d-presentation.mjs', artifact: 'home_cards_2p5d_presentation', label: 'Home Cards 2.5D presentation', sourceFlag: '--home-cards-2p5d-presentation-source' },
  { option: 'homeBootRuntimeMountSource', expected: 'expectedHomeBootRuntimeMountBlob', source: 'browser/home-boot-runtime-mount.mjs', output: 'home-boot-runtime-mount.mjs', artifact: 'home_boot_runtime_mount', label: 'Home Boot runtime mount', sourceFlag: '--home-boot-runtime-mount-source', expectedFlag: '--expected-home-boot-runtime-mount-blob' },
  { option: 'homeShellPresentationCoreSource', expected: 'expectedHomeShellPresentationCoreBlob', source: 'browser/home-shell-presentation-core.mjs', output: 'home-shell-presentation-core.mjs', artifact: 'home_shell_presentation_core', label: 'Home shell presentation core', sourceFlag: '--home-shell-presentation-core-source', expectedFlag: '--expected-home-shell-presentation-core-blob' },
  { option: 'homeThemeOrientationSource', expected: 'expectedHomeThemeOrientationBlob', source: 'browser/home-theme-orientation-core.mjs', output: 'home-theme-orientation-core.mjs', artifact: 'home_theme_orientation_core', label: 'Home theme/orientation core', sourceFlag: '--home-theme-orientation-source', expectedFlag: '--expected-home-theme-orientation-blob' },
  { option: 'partnerAdviceRuntimeMountSource', expected: 'expectedPartnerAdviceRuntimeMountBlob', source: 'browser/partner-advice-runtime-mount.mjs', output: 'partner-advice-runtime-mount.mjs', artifact: 'partner_advice_runtime_mount', label: 'Partner advice runtime mount', sourceFlag: '--partner-advice-runtime-mount-source', expectedFlag: '--expected-partner-advice-runtime-mount-blob' },
  { option: 'partnerLegalActionAdapterSource', expected: 'expectedPartnerLegalActionAdapterBlob', source: 'browser/partner-legal-action-adapter.mjs', output: 'partner-legal-action-adapter.mjs', artifact: 'partner_legal_action_adapter', label: 'Partner legal action adapter', sourceFlag: '--partner-legal-action-adapter-source', expectedFlag: '--expected-partner-legal-action-adapter-blob' },
  { option: 'adviceCollectiveEvalSource', expected: 'expectedAdviceCollectiveEvalBlob', source: 'tools/advice-collective-eval.mjs', output: 'tools/advice-collective-eval.mjs', artifact: 'advice_collective_eval', label: 'Advice collective evaluator', sourceFlag: '--advice-collective-eval-source', expectedFlag: '--expected-advice-collective-eval-blob' },
]);

const ASSET_SPECS = Object.freeze([
  { option: 'homeLandscapeAssetSource', source: 'assets/visual/home/home-illustration-landscape.webp', output: 'assets/visual/home/home-illustration-landscape.webp', artifact: 'home_illustration_landscape', sourceFlag: '--home-landscape-asset-source' },
  { option: 'homePortraitAssetSource', source: 'assets/visual/home/home-illustration-portrait.webp', output: 'assets/visual/home/home-illustration-portrait.webp', artifact: 'home_illustration_portrait', sourceFlag: '--home-portrait-asset-source' },
]);

const SFX_SPECS = Object.freeze([
  { option: 'clickSfxSource', source: 'assets/audio/sfx/click_002.ogg', output: 'click_002.ogg', artifact: 'sfx_click_002', blob: '4564b888c25143eaed79c384a5ce02054813a41c', sourceFlag: '--click-sfx-source' },
  { option: 'cardSlideSfxSource', source: 'assets/audio/sfx/cardSlide6.ogg', output: 'cardSlide6.ogg', artifact: 'sfx_card_slide_6', blob: 'b0090036bd9c0d48c3f6d79fd77eaf30901b6a05', sourceFlag: '--card-slide-sfx-source' },
  { option: 'cardPlaceSfxSource', source: 'assets/audio/sfx/cardPlace1.ogg', output: 'cardPlace1.ogg', artifact: 'sfx_card_place_1', blob: '42bbfa8ea2daaadd237c48287388c7c931cc817e', sourceFlag: '--card-place-sfx-source' },
]);

function gitBlobSha1(buffer) {
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`)).update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function provenance(source, output, input, blob) {
  return { source, output, git_blob_sha1: blob, sha256: sha256(input), bytes: input.length };
}

function localModuleRefs(sourceText) {
  const refs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'\"]*?\s+from\s*)?(['\"])(\.{1,2}\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1/g,
    /\bimport\s*\(\s*(['\"])(\.{1,2}\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) refs.add(match[2]);
  }
  return [...refs].sort();
}

function resolvePublicModuleOutput(parentOutput, ref) {
  const parentDir = path.posix.dirname(`/${String(parentOutput || '')}`);
  const resolved = path.posix.normalize(path.posix.join(parentDir, ref));
  const output = resolved.replace(/^\/+/, '');
  if (!output || output.includes('\\') || output === '.' || output === '..') {
    throw new Error(`Unsupported Browser runtime dependency path in public package: ${ref}`);
  }
  return output;
}

export async function assertBrowserRuntimeDependencyCompleteness(browserInput, dist) {
  const html = Buffer.isBuffer(browserInput) ? browserInput.toString('utf8') : String(browserInput ?? '');
  const refs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:[^'\"]*?\s+from\s*)?(['\"])(\.\/[^'\"?#]+\.(?:mjs|js))(?:[?#][^'\"]*)?\1/g,
    /\bimport\s*\(\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1\s*\)/g,
    /<script\b[^>]*\bsrc\s*=\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1[^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) refs.add(match[2]);
  }

  const pending = [];
  for (const ref of refs) {
    const output = ref.slice(2);
    if (!output || output.includes('/') || output.includes('\\') || output === '.' || output === '..') {
      throw new Error(`Unsupported Browser runtime dependency path in public package: ${ref}`);
    }
    pending.push(output);
  }

  const visited = new Set();
  while (pending.length > 0) {
    const output = pending.shift();
    if (visited.has(output)) continue;
    visited.add(output);
    let bytes;
    try {
      bytes = await readFile(path.join(dist, output));
    } catch (error) {
      if (error?.code === 'ENOENT') throw new Error(`Public package missing Browser runtime dependency: ./${output}`);
      throw error;
    }
    if (!/\.(?:mjs|js)$/i.test(output)) continue;
    for (const ref of localModuleRefs(bytes.toString('utf8'))) {
      const dependencyOutput = resolvePublicModuleOutput(output, ref);
      if (!visited.has(dependencyOutput)) pending.push(dependencyOutput);
    }
  }
  return [...visited].sort();
}

async function readSpec(spec, options) {
  const sourcePath = options[spec.option] ?? path.join(repoRoot, spec.source);
  const input = await readFile(sourcePath);
  const blob = gitBlobSha1(input);
  if (spec.expected && options[spec.expected] && blob !== options[spec.expected]) {
    throw new Error(`${spec.label} blob mismatch: expected=${options[spec.expected]} actual=${blob}`);
  }
  if (spec.blob && blob !== spec.blob) {
    const name = spec.artifact === 'sfx_click_002' ? 'click' : spec.artifact === 'sfx_card_slide_6' ? 'card-slide' : 'card-place';
    throw new Error(`Formal ${name} SFX blob mismatch: expected=${spec.blob} actual=${blob}`);
  }
  return { ...spec, input, blob };
}

async function writeArtifact(dist, item, kind = 'Browser dependency') {
  const outputPath = path.join(dist, item.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, item.input);
  const roundTrip = await readFile(outputPath);
  if (!item.input.equals(roundTrip)) throw new Error(`dist/${item.output} is not byte-identical to ${kind} source`);
}

export async function buildPackage(options = {}) {
  const source = options.source ?? defaultSource;
  const dist = options.dist ?? defaultDist;
  const input = await readFile(source);
  const blob = gitBlobSha1(input);
  if (options.expectedBlob && blob !== options.expectedBlob) {
    throw new Error(`Browser blob mismatch: expected=${options.expectedBlob} actual=${blob}`);
  }

  const runtime = [];
  for (const spec of RUNTIME_SPECS) runtime.push(await readSpec(spec, options));
  const sfx = [];
  for (const spec of SFX_SPECS) sfx.push(await readSpec(spec, options));
  const assets = [];
  for (const spec of ASSET_SPECS) assets.push(await readSpec(spec, options));

  const versionManifestBytes = serializeVersionManifest({
    sourceCommit: options.sourceCommit ?? '',
    publishedAt: options.publishedAt ?? '',
  });
  const versionManifestBuffer = Buffer.from(versionManifestBytes, 'utf8');

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, 'index.html'), input);
  if (!input.equals(await readFile(path.join(dist, 'index.html')))) {
    throw new Error('dist/index.html is not byte-identical to Browser source');
  }

  for (const item of runtime) await writeArtifact(dist, item);
  for (const item of sfx) await writeArtifact(dist, item, 'formal selected SFX');
  for (const item of assets) await writeArtifact(dist, item, 'Home visual');

  await assertBrowserRuntimeDependencyCompleteness(input, dist);

  await writeFile(path.join(dist, VERSION_MANIFEST_FILENAME), versionManifestBytes, 'utf8');
  if (await readFile(path.join(dist, VERSION_MANIFEST_FILENAME), 'utf8') !== versionManifestBytes) {
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

  const artifacts = {
    index_html: provenance('browser/GAMEROAD.html', 'index.html', input, blob),
  };
  for (const item of runtime) artifacts[item.artifact] = provenance(item.source, item.output, item.input, item.blob);
  for (const item of assets) artifacts[item.artifact] = provenance(item.source, item.output, item.input, item.blob);
  for (const item of sfx) artifacts[item.artifact] = provenance(item.source, item.output, item.input, item.blob);
  artifacts.browser_version_manifest = {
    source: 'build-package-release-identity',
    output: VERSION_MANIFEST_FILENAME,
    sha256: sha256(versionManifestBuffer),
    bytes: versionManifestBuffer.length,
  };

  const manifest = {
    schema: 'gameroad.public-pack.v1',
    source: 'browser/GAMEROAD.html',
    source_commit: String(options.sourceCommit || ''),
    git_blob_sha1: blob,
    sha256: sha256(input),
    bytes: input.length,
    artifacts,
  };
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const CLI_OPTION_MAP = new Map([
  ['--source', 'source'],
  ['--dist', 'dist'],
  ['--expected-blob', 'expectedBlob'],
  ['--source-commit', 'sourceCommit'],
  ['--published-at', 'publishedAt'],
]);
for (const spec of [...RUNTIME_SPECS, ...SFX_SPECS, ...ASSET_SPECS]) {
  if (spec.sourceFlag) CLI_OPTION_MAP.set(spec.sourceFlag, spec.option);
  if (spec.expectedFlag) CLI_OPTION_MAP.set(spec.expectedFlag, spec.expected);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = CLI_OPTION_MAP.get(argv[i]);
    if (!key) throw new Error(`Unknown argument: ${argv[i]}`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for argument: ${argv[i - 1]}`);
    out[key] = key.endsWith('Source') || key === 'source' || key === 'dist' ? path.resolve(value) : value;
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await buildPackage(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

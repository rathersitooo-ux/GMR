from pathlib import Path

p = Path('deploy/cloudflare/scripts/build.mjs')
text = p.read_text(encoding='utf-8')


def rep(old, new):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'fail closed: expected one anchor, got {count}: {old[:100]!r}')
    text = text.replace(old, new, 1)


rep(
    "const defaultNavigationCoreSource = path.join(repoRoot, 'browser/screen-navigation-core.mjs');\n",
    "const defaultNavigationCoreSource = path.join(repoRoot, 'browser/screen-navigation-core.mjs');\n"
    "const defaultPostMatchAutoqueueCoreSource = path.join(repoRoot, 'browser/post-match-autoqueue-core.mjs');\n",
)

helper = r'''export async function assertBrowserRuntimeDependencyCompleteness(browserInput, dist) {
  const html = Buffer.isBuffer(browserInput) ? browserInput.toString('utf8') : String(browserInput ?? '');
  const refs = new Set();
  const patterns = [
    /\bimport\s*\(\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1\s*\)/g,
    /<script\b[^>]*\bsrc\s*=\s*(['"])(\.\/[^'"?#]+\.(?:mjs|js))(?:[?#][^'"]*)?\1[^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) refs.add(match[2]);
  }
  for (const ref of refs) {
    const output = ref.slice(2);
    if (!output || output.includes('/') || output.includes('\\') || output === '.' || output === '..') {
      throw new Error(`Unsupported Browser runtime dependency path in public package: ${ref}`);
    }
    try {
      await readFile(path.join(dist, output));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Public package missing Browser runtime dependency: ${ref}`);
      }
      throw error;
    }
  }
  return [...refs].sort();
}

'''
rep('export async function buildPackage({\n', helper + 'export async function buildPackage({\n')
rep(
    '  navigationCoreSource = defaultNavigationCoreSource,\n',
    '  navigationCoreSource = defaultNavigationCoreSource,\n'
    '  postMatchAutoqueueCoreSource = defaultPostMatchAutoqueueCoreSource,\n',
)
rep(
    "  expectedNavigationCoreBlob = '',\n",
    "  expectedNavigationCoreBlob = '',\n  expectedPostMatchAutoqueueCoreBlob = '',\n",
)
rep(
    '  const navigationCoreInput = await readFile(navigationCoreSource);\n',
    '  const navigationCoreInput = await readFile(navigationCoreSource);\n'
    '  const postMatchAutoqueueCoreInput = await readFile(postMatchAutoqueueCoreSource);\n',
)
rep(
    '  const navigationCoreBlob = gitBlobSha1(navigationCoreInput);\n',
    '  const navigationCoreBlob = gitBlobSha1(navigationCoreInput);\n'
    '  const postMatchAutoqueueCoreBlob = gitBlobSha1(postMatchAutoqueueCoreInput);\n',
)
rep(
    "  if (expectedReplayAdapterBlob && replayAdapterBlob !== expectedReplayAdapterBlob) {\n",
    "  if (expectedPostMatchAutoqueueCoreBlob && postMatchAutoqueueCoreBlob !== expectedPostMatchAutoqueueCoreBlob) {\n"
    "    throw new Error(`Post-match autoqueue core blob mismatch: expected=${expectedPostMatchAutoqueueCoreBlob} actual=${postMatchAutoqueueCoreBlob}`);\n"
    "  }\n"
    "  if (expectedReplayAdapterBlob && replayAdapterBlob !== expectedReplayAdapterBlob) {\n",
)
rep(
    "  const replayAdapterOutputPath = path.join(dist, 'battle-replay-live-adapter.mjs');\n",
    "  const postMatchAutoqueueCoreOutputPath = path.join(dist, 'post-match-autoqueue-core.mjs');\n"
    "  await writeFile(postMatchAutoqueueCoreOutputPath, postMatchAutoqueueCoreInput);\n"
    "  const postMatchAutoqueueCoreRoundTrip = await readFile(postMatchAutoqueueCoreOutputPath);\n"
    "  if (!postMatchAutoqueueCoreInput.equals(postMatchAutoqueueCoreRoundTrip)) {\n"
    "    throw new Error('dist/post-match-autoqueue-core.mjs is not byte-identical to Browser dependency source');\n"
    "  }\n\n"
    "  const replayAdapterOutputPath = path.join(dist, 'battle-replay-live-adapter.mjs');\n",
)
rep(
    '  for (const [outputName, sourceInput] of [\n',
    '  await assertBrowserRuntimeDependencyCompleteness(input, dist);\n\n'
    '  for (const [outputName, sourceInput] of [\n',
)
rep(
    "      battle_replay_live_adapter: provenance(\n",
    "      post_match_autoqueue_core: provenance(\n"
    "        'browser/post-match-autoqueue-core.mjs',\n"
    "        'post-match-autoqueue-core.mjs',\n"
    "        postMatchAutoqueueCoreInput,\n"
    "        postMatchAutoqueueCoreBlob,\n"
    "      ),\n"
    "      battle_replay_live_adapter: provenance(\n",
)
rep(
    "    else if (a === '--replay-adapter-source') out.replayAdapterSource = path.resolve(argv[++i]);\n",
    "    else if (a === '--post-match-autoqueue-core-source') out.postMatchAutoqueueCoreSource = path.resolve(argv[++i]);\n"
    "    else if (a === '--replay-adapter-source') out.replayAdapterSource = path.resolve(argv[++i]);\n",
)
rep(
    "    else if (a === '--expected-replay-adapter-blob') out.expectedReplayAdapterBlob = argv[++i] || '';\n",
    "    else if (a === '--expected-post-match-autoqueue-core-blob') out.expectedPostMatchAutoqueueCoreBlob = argv[++i] || '';\n"
    "    else if (a === '--expected-replay-adapter-blob') out.expectedReplayAdapterBlob = argv[++i] || '';\n",
)

p.write_text(text, encoding='utf-8')

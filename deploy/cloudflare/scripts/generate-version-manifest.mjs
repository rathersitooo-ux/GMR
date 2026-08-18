import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const VERSION_MANIFEST_SCHEMA = 'GAMEROAD_BROWSER_VERSION_V1';
export const VERSION_MANIFEST_CHANNEL = 'current';
export const VERSION_MANIFEST_RELOAD_POLICY = 'never-force-during-match';
export const VERSION_MANIFEST_FILENAME = 'gameroad-version.json';

const LOWER_HEX_40 = /^[0-9a-f]{40}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function requireSourceCommit(sourceCommit) {
  if (typeof sourceCommit !== 'string' || !LOWER_HEX_40.test(sourceCommit)) {
    throw new TypeError('sourceCommit must be the exact lowercase 40-hex public package source commit');
  }
  return sourceCommit;
}

function requirePublishedAt(publishedAt) {
  if (
    typeof publishedAt !== 'string' ||
    !RFC3339.test(publishedAt) ||
    !Number.isFinite(Date.parse(publishedAt))
  ) {
    throw new TypeError('publishedAt must be an explicit RFC3339 timestamp');
  }
  return publishedAt;
}

export function createVersionManifest({ sourceCommit, publishedAt } = {}) {
  const exactSourceCommit = requireSourceCommit(sourceCommit);
  const explicitPublishedAt = requirePublishedAt(publishedAt);

  return Object.freeze({
    schema: VERSION_MANIFEST_SCHEMA,
    channel: VERSION_MANIFEST_CHANNEL,
    build_id: exactSourceCommit,
    published_at: explicitPublishedAt,
    reload_policy: VERSION_MANIFEST_RELOAD_POLICY,
  });
}

export function serializeVersionManifest(input) {
  return `${JSON.stringify(createVersionManifest(input), null, 2)}\n`;
}

export async function writeVersionManifest({ outputPath, sourceCommit, publishedAt } = {}) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    throw new TypeError('outputPath is required');
  }
  const bytes = serializeVersionManifest({ sourceCommit, publishedAt });
  await writeFile(outputPath, bytes, 'utf8');
  return bytes;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--source-commit', '--published-at', '--output'].includes(flag)) {
      throw new TypeError(`unknown argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new TypeError(`missing value for ${flag}`);
    }
    values[flag] = value;
    index += 1;
  }
  return {
    sourceCommit: values['--source-commit'],
    publishedAt: values['--published-at'],
    outputPath: values['--output'],
  };
}

async function main() {
  await writeVersionManifest(parseArgs(process.argv.slice(2)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION_SCHEMA = 'GAMEROAD_BROWSER_VERSION_V1';
export const VERSION_CHANNEL = 'current';
export const RELOAD_POLICY = 'never-force-during-match';

const SOURCE_COMMIT_RE = /^[0-9a-f]{40}$/;
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export function assertPublishedAt(value) {
  if (typeof value !== 'string') {
    throw new TypeError('published_at must be an explicit RFC3339 string');
  }
  const match = RFC3339_RE.exec(value);
  if (!match) {
    throw new Error('published_at must be RFC3339 with an explicit timezone');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) {
    throw new Error('published_at contains an invalid RFC3339 date or time');
  }
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error('published_at must parse as an RFC3339 instant');
  }
  return value;
}

export function buildVersionManifest({ packageManifest, publishedAt }) {
  assertPlainObject(packageManifest, 'package manifest');
  const sourceCommit = packageManifest.source_commit;
  if (typeof sourceCommit !== 'string' || !SOURCE_COMMIT_RE.test(sourceCommit)) {
    throw new Error('package manifest source_commit must be an exact lowercase 40-hex commit SHA');
  }
  assertPublishedAt(publishedAt);

  return {
    schema: VERSION_SCHEMA,
    channel: VERSION_CHANNEL,
    build_id: sourceCommit,
    published_at: publishedAt,
    reload_policy: RELOAD_POLICY,
  };
}

export function serializeVersionManifest(input) {
  return `${JSON.stringify(buildVersionManifest(input), null, 2)}\n`;
}

function parseCliArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!['--package-manifest', '--published-at', '--output'].includes(key)) {
      throw new Error(`unknown argument: ${key}`);
    }
    if (values.has(key)) {
      throw new Error(`duplicate argument: ${key}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`missing value for ${key}`);
    }
    values.set(key, value);
    index += 1;
  }
  for (const required of ['--package-manifest', '--published-at', '--output']) {
    if (!values.has(required)) {
      throw new Error(`missing required argument: ${required}`);
    }
  }
  return values;
}

export async function runCli(argv) {
  const args = parseCliArgs(argv);
  const packageManifestPath = resolve(args.get('--package-manifest'));
  const outputPath = resolve(args.get('--output'));
  let packageManifest;
  try {
    packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`unable to read valid package manifest JSON: ${error.message}`);
  }

  const content = serializeVersionManifest({
    packageManifest,
    publishedAt: args.get('--published-at'),
  });
  await writeFile(outputPath, content, 'utf8');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

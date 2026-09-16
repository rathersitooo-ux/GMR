#!/usr/bin/env node
/**
 * Fetch public X status URLs without an X API key via FxTwitter's public JSON API.
 *
 * This bridge intentionally handles only already-known public status URLs. It does
 * not authenticate to X, enumerate timelines, or bypass privacy/access controls.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_TARGETS = path.join(ROOT, 'data', 'x-feed-targets.txt');
export const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'x_feed.json');

const STATUS_RE = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com)\/([^/?#]+)\/status\/(\d+)(?:[/?#].*)?$/i;

export class TargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TargetError';
  }
}

export function parseStatusUrl(url) {
  const candidate = String(url ?? '').trim();
  const match = STATUS_RE.exec(candidate);
  if (!match) {
    throw new TargetError(
      'expected a public X/Twitter status URL like https://x.com/user/status/1234567890',
    );
  }
  return { username: match[1], statusId: match[2] };
}

export async function loadTargets(filePath = DEFAULT_TARGETS) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export function dedupe(values) {
  const seen = new Set();
  const result = [];
  for (const rawValue of values ?? []) {
    const value = String(rawValue);
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

export async function fetchOne(url, { timeoutMs = 20_000, fetchFn = globalThis.fetch } = {}) {
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is unavailable in this Node runtime');
  }

  const { username, statusId } = parseStatusUrl(url);
  const apiUrl = `https://api.fxtwitter.com/${username}/status/${statusId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GMR-X-Free-Bridge/1.0 (+https://github.com/rathersitooo-ux/GMR)',
      },
      signal: controller.signal,
    });

    if (!response?.ok) {
      const status = Number.isFinite(response?.status) ? response.status : 'unknown';
      throw new Error(`FxTwitter returned HTTP ${status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`FxTwitter returned invalid JSON: ${error?.message ?? error}`);
    }

    return {
      requested_url: url,
      canonical_url: `https://x.com/${username}/status/${statusId}`,
      provider_url: apiUrl,
      tweet: payload?.tweet ?? payload,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`FxTwitter request timed out after ${timeoutMs}ms`);
    }
    if (error instanceof TargetError) throw error;
    if (String(error?.message ?? '').startsWith('FxTwitter ')) throw error;
    throw new Error(`FxTwitter request failed: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function buildFeed(
  targets,
  { timeoutMs = 20_000, fetchOneFn = fetchOne, now = () => new Date() } = {},
) {
  const items = [];
  const errors = [];

  for (const target of dedupe(targets)) {
    try {
      items.push(await fetchOneFn(target, { timeoutMs }));
    } catch (error) {
      errors.push({ target, error: String(error?.message ?? error) });
    }
  }

  return {
    document: {
      version: 1,
      updated_at_utc: now().toISOString(),
      provider: 'FxTwitter',
      items,
      errors,
    },
    ok: errors.length === 0,
  };
}

export function parseArgs(argv) {
  const args = {
    targets: [],
    targetsFile: DEFAULT_TARGETS,
    output: DEFAULT_OUTPUT,
    timeoutMs: 20_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--target') {
      if (!next) throw new Error('--target requires a URL');
      args.targets.push(next);
      index += 1;
    } else if (token === '--targets-file') {
      if (!next) throw new Error('--targets-file requires a path');
      args.targetsFile = path.resolve(next);
      index += 1;
    } else if (token === '--output') {
      if (!next) throw new Error('--output requires a path');
      args.output = path.resolve(next);
      index += 1;
    } else if (token === '--timeout') {
      if (!next) throw new Error('--timeout requires seconds');
      const seconds = Number(next);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('--timeout must be a positive number');
      }
      args.timeoutMs = seconds * 1000;
      index += 1;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
  }

  return args;
}

export function usage() {
  return [
    'Usage: node tools/x-feed.mjs [options]',
    '',
    'Options:',
    '  --target URL         public X/Twitter status URL; may be repeated',
    '  --targets-file PATH  target list file (default: data/x-feed-targets.txt)',
    '  --output PATH        output JSON (default: data/x_feed.json)',
    '  --timeout SECONDS    HTTP timeout per post (default: 20)',
    '  -h, --help           show this help',
  ].join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 2;
  }

  if (args.help) {
    console.log(usage());
    return 0;
  }

  const targets = [...(await loadTargets(args.targetsFile)), ...args.targets];
  const { document, ok } = await buildFeed(targets, { timeoutMs: args.timeoutMs });
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(
    `wrote ${document.items.length} post(s), ${document.errors.length} error(s) to ${args.output}`,
  );
  return ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const defaultSource = path.join(repoRoot, 'browser/GAMEROAD.html');
const defaultDist = path.join(repoRoot, 'deploy/cloudflare/dist');

function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return createHash('sha1').update(header).update(buffer).digest('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function buildPackage({ source = defaultSource, dist = defaultDist, expectedBlob = '', sourceCommit = '' } = {}) {
  const input = await readFile(source);
  const blob = gitBlobSha1(input);
  if (expectedBlob && blob !== expectedBlob) {
    throw new Error(`Browser blob mismatch: expected=${expectedBlob} actual=${blob}`);
  }
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  const outputPath = path.join(dist, 'index.html');
  await writeFile(outputPath, input);
  const roundTrip = await readFile(outputPath);
  if (!input.equals(roundTrip)) throw new Error('dist/index.html is not byte-identical to Browser source');

  const headers = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n';
  await writeFile(path.join(dist, '_headers'), headers, 'utf8');

  const manifest = {
    schema: 'gameroad.public-pack.v1',
    source: 'browser/GAMEROAD.html',
    source_commit: String(sourceCommit || ''),
    git_blob_sha1: blob,
    sha256: sha256(input),
    bytes: input.length,
  };
  await writeFile(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source') out.source = path.resolve(argv[++i]);
    else if (a === '--dist') out.dist = path.resolve(argv[++i]);
    else if (a === '--expected-blob') out.expectedBlob = argv[++i] || '';
    else if (a === '--source-commit') out.sourceCommit = argv[++i] || '';
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await buildPackage(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

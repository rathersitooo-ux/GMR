import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditZeroCash } from '../tools/zero-cash-runtime-audit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePolicy = path.resolve(here, '../config/zero-cash-runtime-policy.json');

async function fixture(mutator = async () => {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gmr-zero-cash-'));
  for (const dir of ['config', '.github/workflows', 'deploy/cloudflare/relay/src']) await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, 'config/zero-cash-runtime-policy.json'), await readFile(sourcePolicy));
  await writeFile(path.join(root, '.github/workflows/cloudflare-public-deploy.yml'), `name: deploy\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx --yes wrangler@4 deploy --config deploy/cloudflare/relay/wrangler.toml\n      - run: npx --yes wrangler@4 pages deploy dist --project-name gameroad\n`);
  await writeFile(path.join(root, '.github/workflows/ci.yml'), `name: ci\non:\n  pull_request:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/upload-artifact@v4\n        with:\n          name: evidence\n          path: reports\n          retention-days: 1\n`);
  await writeFile(path.join(root, 'deploy/cloudflare/relay/wrangler.toml'), `[exports.GAMEROADFriendRoomRelay]\ntype = "durable-object"\nstorage = "sqlite"\n`);
  await writeFile(path.join(root, 'deploy/cloudflare/relay/src/relay-worker.mjs'), `export class Relay { x(ctx){ ctx.acceptWebSocket({}); return ctx.getWebSockets(); } }\n`);
  await mutator(root);
  return root;
}

const run = (root, opts = {}) => auditZeroCash({ root, policyPath: path.join(root, 'config/zero-cash-runtime-policy.json'), repositoryVisibility: 'public', now: new Date('2026-08-26T14:20:00Z'), ...opts });

test('current-like public/free fixture passes repository guard but retains external Cloudflare-plan hold', async () => {
  const root = await fixture(); const r = await run(root);
  assert.equal(r.status, 'PASS_WITH_EXTERNAL_HOLD');
  assert.equal(r.zeroCashDefaultPath, true);
  assert.equal(r.literalZeroCashVerified, false);
  assert.equal(r.counts.errors, 0);
  assert.ok(r.findings.some((f) => f.code === 'CLOUDFLARE_ACCOUNT_PLAN_EXTERNAL'));
});

test('automatic paid fallback is rejected', async () => {
  const root = await fixture(async (root) => { const p = JSON.parse(await readFile(path.join(root,'config/zero-cash-runtime-policy.json'),'utf8')); p.automaticPaidFallbackAllowed = true; await writeFile(path.join(root,'config/zero-cash-runtime-policy.json'), JSON.stringify(p)); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'AUTO_PAID_FALLBACK_NOT_DISABLED'));
});

test('private repository is rejected for free standard-runner guarantee', async () => {
  const root = await fixture(); const r = await run(root, { repositoryVisibility: 'private' });
  assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'REPOSITORY_NOT_PUBLIC'));
});

test('unknown or paid runner is rejected', async () => {
  const root = await fixture(async (root) => { await writeFile(path.join(root,'.github/workflows/ci.yml'), `jobs:\n  test:\n    runs-on: ubuntu-8-core\n`); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'NON_FREE_OR_UNKNOWN_RUNNER'));
});

test('unbounded artifact retention is rejected', async () => {
  const root = await fixture(async (root) => { await writeFile(path.join(root,'.github/workflows/ci.yml'), `jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/upload-artifact@v4\n        with:\n          name: x\n          path: x\n`); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'ARTIFACT_RETENTION_UNBOUNDED_BY_WORKFLOW'));
});

test('paid-only Durable Object backend is rejected', async () => {
  const root = await fixture(async (root) => { await writeFile(path.join(root,'deploy/cloudflare/relay/wrangler.toml'), `storage = "kv"\n`); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'PAID_ONLY_DURABLE_OBJECT_BACKEND'));
});

test('non-hibernating Durable Object websocket relay is rejected', async () => {
  const root = await fixture(async (root) => { await writeFile(path.join(root,'deploy/cloudflare/relay/src/relay-worker.mjs'), `export class Relay {}\n`); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'DURABLE_OBJECT_HIBERNATION_API_REQUIRED'));
});

test('stale provider limits are rejected', async () => {
  const root = await fixture(async (root) => { const p = JSON.parse(await readFile(path.join(root,'config/zero-cash-runtime-policy.json'),'utf8')); p.providerEvidence.lastVerified = '2025-01-01'; await writeFile(path.join(root,'config/zero-cash-runtime-policy.json'), JSON.stringify(p)); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'PROVIDER_EVIDENCE_STALE'));
});

test('automatic workflow with paid API credential is rejected', async () => {
  const root = await fixture(async (root) => { await writeFile(path.join(root,'.github/workflows/paid.yml'), 'on:\n  push:\njobs:\n  x:\n    runs-on: ubuntu-latest\n    env:\n      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n'); });
  const r = await run(root); assert.equal(r.status, 'FAIL'); assert.ok(r.findings.some((f) => f.code === 'AUTOMATIC_PAID_API_CAPABLE_WORKFLOW'));
});

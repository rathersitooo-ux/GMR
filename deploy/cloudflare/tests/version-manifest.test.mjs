import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  VERSION_MANIFEST_CHANNEL,
  VERSION_MANIFEST_FILENAME,
  VERSION_MANIFEST_RELOAD_POLICY,
  VERSION_MANIFEST_SCHEMA,
  createVersionManifest,
  serializeVersionManifest,
  writeVersionManifest,
} from '../scripts/generate-version-manifest.mjs';

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567';
const PUBLISHED_AT = '2026-08-18T14:04:00Z';
const REQUIRED_GATE_NAME = 'GAMEROAD Required Gate';
const REQUIRED_GATE_APP = 'github-actions';
const LIVE_ADMISSION_RETRY_MS = 5000;
const LIVE_ADMISSION_MAX_ATTEMPTS = 36;

function exactSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

export function evaluateDeployAdmission({ pushSha, pullRequests, checkRunsByHead }) {
  if (!exactSha(pushSha)) return { ok: false, reason: 'invalid_push_sha' };
  if (!Array.isArray(pullRequests)) return { ok: false, reason: 'pull_requests_unavailable' };

  const candidates = pullRequests.filter((pr) =>
    pr
    && pr.state === 'closed'
    && Boolean(pr.merged_at)
    && pr.base?.ref === 'main'
    && pr.merge_commit_sha === pushSha
    && exactSha(pr.head?.sha)
  );
  if (candidates.length === 0) return { ok: false, reason: 'no_merged_pr_for_main_sha' };
  if (candidates.length !== 1) return { ok: false, reason: 'ambiguous_merged_pr_for_main_sha' };

  const pr = candidates[0];
  const headSha = pr.head.sha;
  const runs = checkRunsByHead?.[headSha];
  if (!Array.isArray(runs)) return { ok: false, reason: 'required_gate_checks_unavailable' };
  const matching = runs
    .filter((run) =>
      run
      && run.name === REQUIRED_GATE_NAME
      && run.head_sha === headSha
      && run.app?.slug === REQUIRED_GATE_APP
    )
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  if (matching.length === 0) return { ok: false, reason: 'required_gate_missing_for_exact_pr_head' };
  const latest = matching[0];
  if (latest.status !== 'completed') return { ok: false, reason: 'required_gate_not_completed' };
  if (latest.conclusion !== 'success') {
    return { ok: false, reason: `required_gate_not_success:${latest.conclusion || 'none'}` };
  }

  return {
    ok: true,
    reason: 'merged_pr_exact_head_required_gate_pass',
    prNumber: pr.number,
    prHeadSha: headSha,
    mergeCommitSha: pushSha,
    requiredGateCheckRunId: latest.id,
  };
}

export function assertDeployAdmission(input) {
  const result = evaluateDeployAdmission(input);
  if (!result.ok) throw new Error(`DEPLOY_ADMISSION_FAIL ${result.reason}`);
  return result;
}

function fakePr({ number = 7, headSha = SOURCE_COMMIT, mergeSha = '1111111111111111111111111111111111111111', base = 'main' } = {}) {
  return { number, state: 'closed', merged_at: '2026-08-27T00:00:00Z', base: { ref: base }, head: { sha: headSha }, merge_commit_sha: mergeSha };
}

function fakeCheck({ id = 10, headSha = SOURCE_COMMIT, conclusion = 'success', status = 'completed', app = REQUIRED_GATE_APP } = {}) {
  return { id, name: REQUIRED_GATE_NAME, head_sha: headSha, status, conclusion, app: { slug: app } };
}

async function githubPublicJson(pathname) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GAMEROAD-public-deploy-admission-r40',
    },
  });
  if (!response.ok) {
    throw new Error(`DEPLOY_ADMISSION_FAIL github_api_${response.status}`);
  }
  return response.json();
}

function shouldRunLiveDeployAdmission() {
  return process.env.GITHUB_ACTIONS === 'true'
    && ['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME || '')
    && process.env.GITHUB_REF === 'refs/heads/main';
}

test('creates the formal Browser version manifest from explicit release identity inputs', () => {
  assert.deepEqual(createVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT }), {
    schema: VERSION_MANIFEST_SCHEMA,
    channel: VERSION_MANIFEST_CHANNEL,
    build_id: SOURCE_COMMIT,
    published_at: PUBLISHED_AT,
    reload_policy: VERSION_MANIFEST_RELOAD_POLICY,
  });
});

test('serialization is byte-identical for identical explicit inputs', () => {
  const input = { sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT };
  const first = serializeVersionManifest(input);
  const second = serializeVersionManifest(input);
  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), true);
});

test('fails closed for missing, short, or uppercase source commits', () => {
  for (const sourceCommit of [undefined, '', 'abc123', SOURCE_COMMIT.toUpperCase()]) {
    assert.throws(
      () => createVersionManifest({ sourceCommit, publishedAt: PUBLISHED_AT }),
      /exact lowercase 40-hex/,
    );
  }
});

test('fails closed unless published_at is an explicit RFC3339 timestamp', () => {
  for (const publishedAt of [undefined, '', '2026-08-18', 'not-a-time']) {
    assert.throws(
      () => createVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt }),
      /explicit RFC3339/,
    );
  }
});

test('writes exactly gameroad-version.json bytes to an explicit output path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gameroad-version-'));
  const outputPath = join(root, VERSION_MANIFEST_FILENAME);
  try {
    const expected = serializeVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
    const written = await writeVersionManifest({ outputPath, sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT });
    assert.equal(written, expected);
    assert.equal(await readFile(outputPath, 'utf8'), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('write path is explicit and has no implicit output fallback', async () => {
  await assert.rejects(
    writeVersionManifest({ sourceCommit: SOURCE_COMMIT, publishedAt: PUBLISHED_AT }),
    /outputPath is required/,
  );
});

test('deploy admission rejects direct or otherwise unassociated main SHA', () => {
  const mergeSha = '1111111111111111111111111111111111111111';
  assert.deepEqual(
    evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [], checkRunsByHead: {} }),
    { ok: false, reason: 'no_merged_pr_for_main_sha' },
  );
});

test('deploy admission rejects wrong base, mismatched merge SHA, and ambiguous merged PR identity', () => {
  const mergeSha = '1111111111111111111111111111111111111111';
  assert.equal(evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [fakePr({ mergeSha, base: 'dev' })], checkRunsByHead: {} }).ok, false);
  assert.equal(evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [fakePr({ mergeSha: '2222222222222222222222222222222222222222' })], checkRunsByHead: {} }).ok, false);
  assert.deepEqual(
    evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [fakePr({ number: 7, mergeSha }), fakePr({ number: 8, mergeSha })], checkRunsByHead: {} }),
    { ok: false, reason: 'ambiguous_merged_pr_for_main_sha' },
  );
});

test('deploy admission rejects missing, failed, non-GitHub-Actions, or stale-latest Required Gate evidence', () => {
  const mergeSha = '1111111111111111111111111111111111111111';
  const pr = fakePr({ mergeSha });
  const byHead = (runs) => ({ [SOURCE_COMMIT]: runs });
  assert.deepEqual(evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [pr], checkRunsByHead: byHead([]) }), { ok: false, reason: 'required_gate_missing_for_exact_pr_head' });
  assert.deepEqual(evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [pr], checkRunsByHead: byHead([fakeCheck({ conclusion: 'failure' })]) }), { ok: false, reason: 'required_gate_not_success:failure' });
  assert.deepEqual(evaluateDeployAdmission({ pushSha: mergeSha, pullRequests: [pr], checkRunsByHead: byHead([fakeCheck({ app: 'other-app' })]) }), { ok: false, reason: 'required_gate_missing_for_exact_pr_head' });
  assert.deepEqual(
    evaluateDeployAdmission({
      pushSha: mergeSha,
      pullRequests: [pr],
      checkRunsByHead: byHead([fakeCheck({ id: 10, conclusion: 'success' }), fakeCheck({ id: 11, conclusion: 'failure' })]),
    }),
    { ok: false, reason: 'required_gate_not_success:failure' },
  );
});

test('deploy admission accepts one merged PR whose exact head latest Required Gate succeeded', () => {
  const mergeSha = '1111111111111111111111111111111111111111';
  const result = assertDeployAdmission({
    pushSha: mergeSha,
    pullRequests: [fakePr({ number: 42, mergeSha })],
    checkRunsByHead: { [SOURCE_COMMIT]: [fakeCheck({ id: 25 })] },
  });
  assert.equal(result.prNumber, 42);
  assert.equal(result.prHeadSha, SOURCE_COMMIT);
  assert.equal(result.mergeCommitSha, mergeSha);
  assert.equal(result.requiredGateCheckRunId, 25);
});

test('live public deploy admission requires merged PR plus exact-head Required Gate', { skip: !shouldRunLiveDeployAdmission() }, async () => {
  const pushSha = process.env.GITHUB_SHA || '';
  const repository = process.env.GITHUB_REPOSITORY || '';
  assert.match(repository, /^[^/]+\/[^/]+$/);
  const pullRequests = await githubPublicJson(`/repos/${repository}/commits/${pushSha}/pulls`);
  const candidateHeads = [...new Set(
    pullRequests
      .filter((pr) => pr?.state === 'closed' && pr?.merged_at && pr?.base?.ref === 'main' && pr?.merge_commit_sha === pushSha && exactSha(pr?.head?.sha))
      .map((pr) => pr.head.sha),
  )];

  let evidence = null;
  let lastReason = 'required_gate_checks_unavailable';
  for (let attempt = 1; attempt <= LIVE_ADMISSION_MAX_ATTEMPTS; attempt += 1) {
    const checkRunsByHead = {};
    for (const headSha of candidateHeads) {
      const payload = await githubPublicJson(`/repos/${repository}/commits/${headSha}/check-runs?per_page=100`);
      checkRunsByHead[headSha] = payload?.check_runs;
    }

    const result = evaluateDeployAdmission({ pushSha, pullRequests, checkRunsByHead });
    if (result.ok) {
      evidence = result;
      break;
    }

    lastReason = result.reason;
    const retryable = [
      'required_gate_checks_unavailable',
      'required_gate_missing_for_exact_pr_head',
      'required_gate_not_completed',
    ].includes(result.reason);
    if (!retryable || attempt === LIVE_ADMISSION_MAX_ATTEMPTS) {
      throw new Error(`DEPLOY_ADMISSION_FAIL ${result.reason}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LIVE_ADMISSION_RETRY_MS));
  }

  if (!evidence) throw new Error(`DEPLOY_ADMISSION_FAIL ${lastReason}`);
  process.stdout.write(`DEPLOY_ADMISSION PASS pr=${evidence.prNumber} pr_head=${evidence.prHeadSha} merge=${evidence.mergeCommitSha} required_gate_check=${evidence.requiredGateCheckRunId}\n`);
});

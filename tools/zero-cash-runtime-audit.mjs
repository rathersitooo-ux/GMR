#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTOMATIC_TRIGGERS = ['push:', 'pull_request:', 'schedule:', 'repository_dispatch:'];

function result(level, code, detail, file = null) {
  return { level, code, detail, ...(file ? { file } : {}) };
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

function rel(root, p) { return path.relative(root, p).replaceAll(path.sep, '/'); }

function scalarRunnerLabels(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*runs-on:\s*(.+?)\s*(?:#.*)?$/);
    if (!m) continue;
    const raw = m[1].trim().replace(/^['"]|['"]$/g, '');
    rows.push(raw);
  }
  return rows;
}

function hasAutomaticTrigger(text) {
  return AUTOMATIC_TRIGGERS.some((token) => new RegExp(`^\\s{0,4}${token.replace(':', '\\:')}`, 'm').test(text));
}

function artifactUploadBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/uses:\s*actions\/upload-artifact@/i.test(lines[i])) continue;
    const baseIndent = lines[i].match(/^\s*/)?.[0].length ?? 0;
    const window = [lines[i]];
    for (let j = i + 1; j < Math.min(lines.length, i + 18); j++) {
      const indent = lines[j].match(/^\s*/)?.[0].length ?? 0;
      if (lines[j].trim() && indent <= Math.max(0, baseIndent - 2)) break;
      window.push(lines[j]);
    }
    blocks.push(window.join('\n'));
  }
  return blocks;
}

function retentionDays(block) {
  const m = block.match(/retention-days:\s*['"]?(\d+)['"]?/i);
  return m ? Number(m[1]) : null;
}

export async function auditZeroCash({ root, policyPath, repositoryVisibility = null, now = new Date() }) {
  root = path.resolve(root);
  policyPath = path.resolve(policyPath ?? path.join(root, 'config/zero-cash-runtime-policy.json'));
  const findings = [];
  let policy;
  try { policy = JSON.parse(await fs.readFile(policyPath, 'utf8')); }
  catch (e) {
    return { schema: 'gameroad.zero-cash-audit.v1', status: 'FAIL', zeroCashDefaultPath: false, findings: [result('ERROR', 'POLICY_UNREADABLE', String(e?.message || e), rel(root, policyPath))] };
  }

  if (policy.schema !== 'gameroad.zero-cash-runtime-policy.v1') findings.push(result('ERROR', 'POLICY_SCHEMA_INVALID', String(policy.schema)));
  if (policy.cashSpendAllowed !== false) findings.push(result('ERROR', 'CASH_SPEND_NOT_DISABLED', 'cashSpendAllowed must be false'));
  if (policy.automaticPaidFallbackAllowed !== false) findings.push(result('ERROR', 'AUTO_PAID_FALLBACK_NOT_DISABLED', 'automaticPaidFallbackAllowed must be false'));
  if (policy.quotaExhaustionBehavior !== 'DEGRADE_PAUSE_OR_FAIL_CLOSED') findings.push(result('ERROR', 'QUOTA_BEHAVIOR_NOT_ZERO_CASH', String(policy.quotaExhaustionBehavior)));
  if (policy.unknownBillingStateBehavior !== 'HOLD') findings.push(result('ERROR', 'UNKNOWN_BILLING_MUST_HOLD', String(policy.unknownBillingStateBehavior)));

  const verified = Date.parse(`${policy.providerEvidence?.lastVerified ?? ''}T00:00:00Z`);
  const maxAgeDays = Number(policy.providerEvidence?.maxAgeDays);
  if (!Number.isFinite(verified) || !Number.isFinite(maxAgeDays)) findings.push(result('ERROR', 'PROVIDER_EVIDENCE_DATE_INVALID', 'lastVerified/maxAgeDays required'));
  else if ((now.getTime() - verified) / DAY_MS > maxAgeDays) findings.push(result('ERROR', 'PROVIDER_EVIDENCE_STALE', `provider evidence older than ${maxAgeDays} days`));

  const requiredSources = [
    'developers.cloudflare.com/workers/platform/limits',
    'developers.cloudflare.com/durable-objects/platform/pricing',
    'docs.github.com/en/actions/concepts/billing-and-usage',
    'docs.github.com/en/site-policy/github-terms',
  ];
  const sources = Array.isArray(policy.providerEvidence?.sources) ? policy.providerEvidence.sources.join('\n') : '';
  for (const source of requiredSources) if (!sources.includes(source)) findings.push(result('ERROR', 'PRIMARY_SOURCE_MISSING', source));

  if (repositoryVisibility && repositoryVisibility !== policy.github?.requiredVisibility) {
    findings.push(result('ERROR', 'REPOSITORY_NOT_PUBLIC', `expected=${policy.github?.requiredVisibility} actual=${repositoryVisibility}`));
  } else if (!repositoryVisibility) {
    findings.push(result('WARN', 'REPOSITORY_VISIBILITY_UNVERIFIED_LOCAL', 'CI must supply/verify public repository visibility'));
  }

  for (const file of policy.currentRequiredFiles ?? []) {
    if (!(await exists(path.join(root, file)))) findings.push(result('ERROR', 'REQUIRED_CURRENT_FILE_MISSING', file, file));
  }

  const workflowDir = path.join(root, '.github/workflows');
  const workflowFiles = (await walk(workflowDir)).filter((p) => /\.ya?ml$/i.test(p));
  const allowedRunners = new Set(policy.github?.allowedStandardRunnerLabels ?? []);
  for (const file of workflowFiles) {
    const text = await fs.readFile(file, 'utf8');
    const name = rel(root, file);
    for (const runner of scalarRunnerLabels(text)) {
      if (runner.includes('${{')) findings.push(result('ERROR', 'DYNAMIC_RUNNER_UNVERIFIED', runner, name));
      else if (!allowedRunners.has(runner)) findings.push(result('ERROR', 'NON_FREE_OR_UNKNOWN_RUNNER', runner, name));
    }
    for (const block of artifactUploadBlocks(text)) {
      const days = retentionDays(block);
      if (days === null) findings.push(result('ERROR', 'ARTIFACT_RETENTION_UNBOUNDED_BY_WORKFLOW', 'upload-artifact must declare retention-days', name));
      else if (days > Number(policy.github?.maxArtifactRetentionDays ?? 3)) findings.push(result('ERROR', 'ARTIFACT_RETENTION_TOO_LONG', `${days} days`, name));
    }

    const paidTokens = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'RUNPOD_API_KEY', 'REPLICATE_API_TOKEN', 'TOGETHER_API_KEY'];
    const present = paidTokens.filter((token) => text.includes(token));
    if (present.length && hasAutomaticTrigger(text)) findings.push(result('ERROR', 'AUTOMATIC_PAID_API_CAPABLE_WORKFLOW', present.join(','), name));
  }

  const wrangler = path.join(root, 'deploy/cloudflare/relay/wrangler.toml');
  if (await exists(wrangler)) {
    const text = await fs.readFile(wrangler, 'utf8');
    if (!/^\s*storage\s*=\s*["']sqlite["']\s*$/m.test(text)) findings.push(result('ERROR', 'DURABLE_OBJECT_NOT_SQLITE_FREE_BACKEND', 'Free plan requires SQLite-backed Durable Objects', rel(root, wrangler)));
    if (/^\s*storage\s*=\s*["'](?:kv|key-value)["']\s*$/mi.test(text)) findings.push(result('ERROR', 'PAID_ONLY_DURABLE_OBJECT_BACKEND', 'KV-backed Durable Objects are not allowed in zero-cash path', rel(root, wrangler)));
  }

  const relay = path.join(root, 'deploy/cloudflare/relay/src/relay-worker.mjs');
  if (await exists(relay)) {
    const text = await fs.readFile(relay, 'utf8');
    if (!text.includes('acceptWebSocket(') || !text.includes('getWebSockets(')) findings.push(result('ERROR', 'DURABLE_OBJECT_HIBERNATION_API_REQUIRED', 'relay must use Durable Objects WebSocket hibernation API', rel(root, relay)));
  }

  const deploy = path.join(root, '.github/workflows/cloudflare-public-deploy.yml');
  if (await exists(deploy)) {
    const text = await fs.readFile(deploy, 'utf8');
    for (const required of ['wrangler@4 deploy', 'pages deploy dist']) {
      if (!text.includes(required)) findings.push(result('ERROR', 'CURRENT_DEPLOY_ROUTE_UNRECOGNIZED', required, rel(root, deploy)));
    }
    if (/\b(?:--paid|workers_paid|standard_usage|paid_plan)\b/i.test(text)) findings.push(result('ERROR', 'EXPLICIT_PAID_CLOUDFLARE_MODE', 'paid mode token found', rel(root, deploy)));
  }

  if (policy.cloudflare?.requiredWorkersPlan !== 'free') findings.push(result('ERROR', 'CLOUDFLARE_PLAN_POLICY_NOT_FREE', String(policy.cloudflare?.requiredWorkersPlan)));
  if (policy.cloudflare?.accountPlanVerification !== 'EXTERNAL_BILLING_READ_REQUIRED') findings.push(result('ERROR', 'CLOUDFLARE_ACCOUNT_PLAN_GATE_WEAK', String(policy.cloudflare?.accountPlanVerification)));
  findings.push(result('HOLD', 'CLOUDFLARE_ACCOUNT_PLAN_EXTERNAL', 'Repository guard cannot prove the live Cloudflare account is on Workers Free. Verify with Cloudflare Billing Read or dashboard before claiming literal zero cash.'));

  const errors = findings.filter((f) => f.level === 'ERROR');
  const holds = findings.filter((f) => f.level === 'HOLD');
  const status = errors.length ? 'FAIL' : holds.length ? 'PASS_WITH_EXTERNAL_HOLD' : 'PASS';
  return {
    schema: 'gameroad.zero-cash-audit.v1',
    generatedAt: now.toISOString(),
    status,
    zeroCashDefaultPath: errors.length === 0,
    literalZeroCashVerified: errors.length === 0 && holds.length === 0,
    counts: { errors: errors.length, holds: holds.length, warnings: findings.filter((f) => f.level === 'WARN').length },
    findings,
    invariants: {
      cashSpendAllowed: false,
      automaticPaidFallbackAllowed: false,
      quotaExhaustionBehavior: 'DEGRADE_PAUSE_OR_FAIL_CLOSED',
      githubActionsScope: policy.github?.actionsUsageScope,
      cloudflareRequiredPlan: policy.cloudflare?.requiredWorkersPlan,
    },
  };
}

async function cli() {
  const args = process.argv.slice(2);
  const get = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const root = path.resolve(get('--root', process.cwd()));
  const policyPath = path.resolve(get('--policy', path.join(root, 'config/zero-cash-runtime-policy.json')));
  const repositoryVisibility = get('--repository-visibility', process.env.GMR_REPOSITORY_VISIBILITY || null);
  const output = get('--output', null);
  const report = await auditZeroCash({ root, policyPath, repositoryVisibility });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (output) { await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true }); await fs.writeFile(path.resolve(output), json); }
  process.stdout.write(json);
  if (report.status === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli().catch((e) => { console.error(e?.stack || String(e)); process.exitCode = 1; });

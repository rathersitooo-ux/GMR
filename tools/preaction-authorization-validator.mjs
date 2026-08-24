#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MANIFEST_PREFIX = 'data/preaction-authorizations/';
const MANIFEST_SUFFIX = '.json';
const RISK_CLASSES = new Set([
  'LOW_REVERSIBLE',
  'MATERIAL_STANDARD',
  'MATERIAL_NOVEL',
  'HIGH_CONSEQUENCE',
  'IRREVERSIBLE_OR_EXTERNAL',
]);
const REHEARSAL_STATUSES = new Set(['PASS', 'N_A_ALT_ORACLE']);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function isAuthorizationPath(path) {
  return path.startsWith(MANIFEST_PREFIX) && path.endsWith(MANIFEST_SUFFIX);
}

export function isMaterialPath(path) {
  if (isAuthorizationPath(path)) return false;
  if (path === 'README.md' || path.startsWith('docs/')) return false;
  // Codex/agent bootstrap markdown changes execution behavior and remain material.
  if (path === 'AGENTS.md' || path === 'CODEX_HANDOFF_CURRENT.md' || path === 'CODEX_4WINDOW_LAUNCH_CURRENT.md') return true;
  // Fail closed for repository content outside explicitly documentation-only paths.
  return true;
}

function requiredString(manifest, key) {
  return typeof manifest[key] === 'string' && manifest[key].trim().length > 0;
}

export function validateManifest(manifest, manifestPath) {
  const required = [
    'schemaVersion', 'recordId', 'taskId', 'workUnitKey', 'acquireKey',
    'riskClass', 'predictionStatus', 'predictionEvidenceId',
    'rehearsalStatus', 'rehearsalEvidenceId', 'proceedToken',
    'authorizationBaseSha',
  ];
  for (const key of required) {
    if (!requiredString(manifest, key)) return { ok: false, reason: `manifest_missing_${key}` };
  }
  if (manifest.schemaVersion !== 'gameroad-preaction-v1') return { ok: false, reason: 'manifest_schema' };
  if (!RISK_CLASSES.has(manifest.riskClass)) return { ok: false, reason: 'manifest_risk_class' };
  if (manifest.riskClass === 'LOW_REVERSIBLE') return { ok: false, reason: 'material_pr_cannot_use_low_reversible' };
  if (manifest.predictionStatus !== 'PASS') return { ok: false, reason: 'prediction_not_pass' };
  if (!REHEARSAL_STATUSES.has(manifest.rehearsalStatus)) return { ok: false, reason: 'rehearsal_not_pass' };
  if (!/^[0-9a-f]{40}$/i.test(manifest.authorizationBaseSha)) return { ok: false, reason: 'authorization_base_sha' };
  const expectedPath = `${MANIFEST_PREFIX}${manifest.recordId}${MANIFEST_SUFFIX}`;
  if (manifestPath !== expectedPath) return { ok: false, reason: 'record_path_mismatch' };
  const prefix = `PROCEED|${manifest.recordId}|PREACTION_PROCEED_ALLOWED|${manifest.riskClass}|`;
  if (!manifest.proceedToken.startsWith(prefix)) return { ok: false, reason: 'proceed_token_shape' };
  if (!Array.isArray(manifest.scope) || manifest.scope.length === 0 || manifest.scope.some((p) => typeof p !== 'string' || !p)) {
    return { ok: false, reason: 'manifest_scope' };
  }
  if (new Set(manifest.scope).size !== manifest.scope.length) return { ok: false, reason: 'manifest_scope_duplicate' };
  return { ok: true, reason: 'manifest_valid' };
}

export function evaluateAuthorization({ commits, manifest, manifestPath, changedPaths, manifestPresentAtHead = false }) {
  const manifestCheck = validateManifest(manifest, manifestPath);
  if (!manifestCheck.ok) return manifestCheck;
  const materialChanged = changedPaths.filter(isMaterialPath);
  if (materialChanged.length === 0) return { ok: true, reason: 'nonmaterial_pr' };
  if (!Array.isArray(commits) || commits.length === 0) return { ok: false, reason: 'no_branch_commits' };
  const first = commits[0];
  if (first.parentSha !== manifest.authorizationBaseSha) return { ok: false, reason: 'authorization_not_first_from_base' };
  if (first.paths.length !== 1 || first.paths[0] !== manifestPath) return { ok: false, reason: 'first_commit_not_manifest_only' };
  const outOfScope = materialChanged.filter((p) => !manifest.scope.includes(p));
  if (outOfScope.length) return { ok: false, reason: `material_path_out_of_scope:${outOfScope.join(',')}` };
  if (manifestPresentAtHead) return { ok: false, reason: 'authorization_manifest_must_be_cleanup_deleted_before_merge' };
  return { ok: true, reason: 'preaction_authorized' };
}

export function validateRepositoryAuthorization({ baseSha, headSha, changedPathsFile }) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha) || !/^[0-9a-f]{40}$/i.test(headSha)) {
    return { ok: false, reason: 'invalid_base_or_head_sha' };
  }
  const changedPaths = fs.readFileSync(changedPathsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  if (!changedPaths.some(isMaterialPath)) return { ok: true, reason: 'nonmaterial_pr' };

  // The manifest is intentionally the first branch commit and is deleted before final merge.
  const firstParent = git(['rev-list', '--reverse', '--first-parent', `${baseSha}..${headSha}`]).split(/\r?\n/).filter(Boolean);
  if (firstParent.length === 0) return { ok: false, reason: 'no_branch_commits' };
  const firstCommit = firstParent[0];
  const parentSha = git(['rev-parse', `${firstCommit}^`]);
  const firstPaths = git(['diff-tree', '--no-commit-id', '--name-only', '-r', firstCommit]).split(/\r?\n/).filter(Boolean);
  const manifestPaths = firstPaths.filter(isAuthorizationPath);
  if (manifestPaths.length !== 1 || firstPaths.length !== 1) {
    return { ok: false, reason: 'first_commit_not_manifest_only' };
  }
  const manifestPath = manifestPaths[0];
  let manifest;
  try {
    manifest = JSON.parse(git(['show', `${firstCommit}:${manifestPath}`]));
  } catch (error) {
    return { ok: false, reason: `manifest_read_or_parse:${error.message}` };
  }
  let present = true;
  try {
    execFileSync('git', ['cat-file', '-e', `${headSha}:${manifestPath}`], { stdio: 'ignore' });
  } catch {
    present = false;
  }
  return evaluateAuthorization({
    commits: [{ sha: firstCommit, parentSha, paths: firstPaths }],
    manifest,
    manifestPath,
    changedPaths,
    manifestPresentAtHead: present,
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') out.baseSha = argv[++i];
    else if (argv[i] === '--head') out.headSha = argv[++i];
    else if (argv[i] === '--changed') out.changedPathsFile = argv[++i];
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseSha || !args.headSha || !args.changedPathsFile) {
    console.error('usage: preaction-authorization-validator.mjs --base <sha> --head <sha> --changed <path-file>');
    process.exit(2);
  }
  const result = validateRepositoryAuthorization(args);
  console.log(`PREACTION_AUTHORIZATION ${result.ok ? 'PASS' : 'FAIL'} ${result.reason}`);
  if (!result.ok) process.exit(1);
}

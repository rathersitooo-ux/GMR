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
const STATE_MODEL_VERSION = 'STATE_MODEL_V1';
const LEASE_AUTHORITY = 'CURRENT_ACTIVE_LEASES';
const MAX_LEASE_MS = 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PARENT_TASK_SUMMARY_RANGE = /\bO(?:\d+)?:S(?:\d+)?\b/i;
const PARENT_TASK_SUMMARY_CONTEXT = /(GAMEROAD\s*全作業一覧|全作業一覧|ParentTask|parent[-_\s]*summary|central)/i;
const FORMULA_REPAIR_MARKER = /formula[-_\s]*repair/i;
const REUSE_DISCOVERY_GATE_VERSION = 'R1';
const REUSE_DISPOSITIONS = new Set([
  'REUSE_AS_IS',
  'ADAPT',
  'COMPOSE',
  'BUILD',
  'DEFER',
  'NOT_APPLICABLE',
]);
const SOLUTION_SEARCH_STATUSES = new Set(['PASS', 'NOT_APPLICABLE']);
const PREACTION_CONTROL_PLANE_PATHS = new Set([
  '.github/workflows/gameroad-required-gate.yml',
  'tools/preaction-authorization-validator.mjs',
  'tests/preaction-authorization-validator.test.mjs',
]);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function isAuthorizationPath(path) {
  return path.startsWith(MANIFEST_PREFIX) && path.endsWith(MANIFEST_SUFFIX);
}

export function isMaterialPath(path) {
  if (isAuthorizationPath(path)) return false;
  if (path === 'README.md' || path.startsWith('docs/')) return false;
  if (path === 'AGENTS.md' || path === 'CODEX_HANDOFF_CURRENT.md' || path === 'CODEX_4WINDOW_LAUNCH_CURRENT.md') return true;
  return true;
}

function isConstructionCandidatePath(path) {
  if (!isMaterialPath(path)) return false;
  if (path.startsWith('tests/') || path.startsWith('data/')) return false;
  if (path === 'AGENTS.md' || path === 'CODEX_HANDOFF_CURRENT.md' || path === 'CODEX_4WINDOW_LAUNCH_CURRENT.md') return false;
  return true;
}

function requiredString(manifest, key) {
  return typeof manifest[key] === 'string' && manifest[key].trim().length > 0;
}

function validateStringList(value, key) {
  if (!Array.isArray(value) || value.length === 0 || value.some((p) => typeof p !== 'string' || !p)) {
    return { ok: false, reason: `${key}_invalid` };
  }
  if (new Set(value).size !== value.length) return { ok: false, reason: `${key}_duplicate` };
  return { ok: true };
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function parseJstMinute(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) JST$/.exec(value);
  if (!match) return NaN;
  const [, year, month, day, hour, minute] = match;
  const ms = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
  if (!Number.isFinite(ms)) return NaN;
  const normalized = new Date(ms + (9 * 60 * 60 * 1000)).toISOString().slice(0, 16).replace('T', ' ');
  if (normalized !== `${year}-${month}-${day} ${hour}:${minute}`) return NaN;
  return ms;
}

function targetsParentTaskSummary(exactMutableResources) {
  return exactMutableResources
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .some((segment) => PARENT_TASK_SUMMARY_CONTEXT.test(segment) && PARENT_TASK_SUMMARY_RANGE.test(segment));
}

function validateExactMutableResources(manifest) {
  for (const path of manifest.scope) {
    if (!manifest.leaseExactMutableResources.includes(path)) {
      return { ok: false, reason: `lease_exact_mutable_scope_mismatch:${path}` };
    }
  }

  if (!targetsParentTaskSummary(manifest.leaseExactMutableResources)) {
    return { ok: true, reason: 'lease_exact_mutable_resources_valid' };
  }

  if (manifest.taskId !== 'OPS-STATE-SYNC-001') {
    return { ok: false, reason: 'parenttask_summary_mutation_forbidden:task' };
  }
  if (!FORMULA_REPAIR_MARKER.test(manifest.workUnitKey)) {
    return { ok: false, reason: 'parenttask_summary_mutation_forbidden:workunit' };
  }
  const targetSegments = manifest.leaseExactMutableResources
    .split(/[;\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => PARENT_TASK_SUMMARY_CONTEXT.test(segment) && PARENT_TASK_SUMMARY_RANGE.test(segment));
  if (targetSegments.some((segment) => !FORMULA_REPAIR_MARKER.test(segment))) {
    return { ok: false, reason: 'parenttask_summary_mutation_forbidden:not_formula_repair_only' };
  }
  return { ok: true, reason: 'parenttask_summary_formula_repair_authorized' };
}

function validateLeaseWitness(manifest, nowMs) {
  if (manifest.stateModelVersion !== STATE_MODEL_VERSION) return { ok: false, reason: 'lease_state_model_version' };
  if (manifest.leaseAuthority !== LEASE_AUTHORITY) return { ok: false, reason: 'lease_authority' };
  if (manifest.leaseState !== 'ACTIVE') return { ok: false, reason: 'lease_state_not_active' };
  if (manifest.leaseTaskId !== manifest.taskId) return { ok: false, reason: 'lease_identity_mismatch:taskId' };
  if (manifest.leaseWorkUnitKey !== manifest.workUnitKey) return { ok: false, reason: 'lease_identity_mismatch:workUnitKey' };
  if (manifest.leaseAcquireKey !== manifest.acquireKey) return { ok: false, reason: 'lease_identity_mismatch:acquireKey' };
  if (!/^CURRENT_ACTIVE_LEASES!A\d+:L\d+$/.test(manifest.leaseSnapshotReadbackRef)) {
    return { ok: false, reason: 'lease_snapshot_readback_ref' };
  }

  const scopeCheck = validateStringList(manifest.leaseScope, 'lease_scope');
  if (!scopeCheck.ok) return scopeCheck;
  if (!sameStringSet(manifest.scope, manifest.leaseScope)) return { ok: false, reason: 'lease_scope_mismatch' };

  const exactMutableCheck = validateExactMutableResources(manifest);
  if (!exactMutableCheck.ok) return exactMutableCheck;

  const readbackMs = parseJstMinute(manifest.leaseSnapshotReadbackAtJst);
  const untilMs = parseJstMinute(manifest.leaseUntilJst);
  if (!Number.isFinite(readbackMs)) return { ok: false, reason: 'lease_snapshot_readback_time' };
  if (!Number.isFinite(untilMs)) return { ok: false, reason: 'lease_until_time' };
  if (readbackMs > nowMs + MAX_CLOCK_SKEW_MS) return { ok: false, reason: 'lease_snapshot_readback_in_future' };
  if (untilMs <= readbackMs) return { ok: false, reason: 'lease_window_nonpositive' };
  if (untilMs - readbackMs > MAX_LEASE_MS) return { ok: false, reason: 'lease_window_over_one_hour' };
  if (untilMs <= nowMs) return { ok: false, reason: 'lease_expired_at_validation' };

  return { ok: true, reason: exactMutableCheck.reason };
}

function validateReuseDiscovery(manifest, { newMaterialPaths = [] } = {}) {
  const novel = manifest.riskClass === 'MATERIAL_NOVEL';
  const newConstruction = newMaterialPaths.some(isConstructionCandidatePath);
  if (!novel && !newConstruction) return { ok: true, reason: 'reuse_discovery_not_required' };

  for (const key of ['solutionSignature', 'reuseDisposition', 'solutionSearchStatus', 'reuseDecisionEvidenceId']) {
    if (!requiredString(manifest, key)) return { ok: false, reason: `reuse_gate_missing_${key}` };
  }
  if (!REUSE_DISPOSITIONS.has(manifest.reuseDisposition)) {
    return { ok: false, reason: 'reuse_gate_disposition' };
  }
  if (!SOLUTION_SEARCH_STATUSES.has(manifest.solutionSearchStatus)) {
    return { ok: false, reason: 'reuse_gate_search_status' };
  }
  if (manifest.reuseDisposition === 'DEFER') {
    return { ok: false, reason: 'reuse_gate_defer_cannot_authorize_mutation' };
  }
  if (manifest.reuseDisposition === 'NOT_APPLICABLE') {
    if (novel) return { ok: false, reason: 'reuse_gate_novel_cannot_be_not_applicable' };
    if (manifest.solutionSearchStatus !== 'NOT_APPLICABLE') {
      return { ok: false, reason: 'reuse_gate_not_applicable_status' };
    }
    if (!requiredString(manifest, 'reuseNotApplicableReason')) {
      return { ok: false, reason: 'reuse_gate_missing_reuseNotApplicableReason' };
    }
    return { ok: true, reason: 'reuse_discovery_not_applicable_with_reason' };
  }

  if (manifest.solutionSearchStatus !== 'PASS') {
    return { ok: false, reason: 'reuse_gate_search_not_pass' };
  }
  const evidenceCheck = validateStringList(manifest.solutionSearchEvidence, 'solution_search_evidence');
  if (!evidenceCheck.ok) return { ok: false, reason: `reuse_gate_${evidenceCheck.reason}` };
  if (manifest.reuseDisposition === 'BUILD' && !requiredString(manifest, 'buildResidualReason')) {
    return { ok: false, reason: 'reuse_gate_build_residual_reason_required' };
  }
  return { ok: true, reason: `reuse_discovery_${manifest.reuseDisposition.toLowerCase()}` };
}

export function validateManifest(manifest, manifestPath, { nowMs = Date.now() } = {}) {
  const required = [
    'schemaVersion', 'recordId', 'taskId', 'workUnitKey', 'acquireKey',
    'riskClass', 'predictionStatus', 'predictionEvidenceId',
    'rehearsalStatus', 'rehearsalEvidenceId', 'proceedToken',
    'authorizationBaseSha', 'stateModelVersion', 'leaseAuthority', 'leaseState',
    'leaseTaskId', 'leaseWorkUnitKey', 'leaseAcquireKey',
    'leaseSnapshotReadbackAtJst', 'leaseUntilJst', 'leaseSnapshotReadbackRef',
    'leaseExactMutableResources',
  ];
  for (const key of required) {
    if (!requiredString(manifest, key)) return { ok: false, reason: `manifest_missing_${key}` };
  }
  if (manifest.schemaVersion !== 'gameroad-preaction-v3') return { ok: false, reason: 'manifest_schema' };
  if (!RISK_CLASSES.has(manifest.riskClass)) return { ok: false, reason: 'manifest_risk_class' };
  if (manifest.riskClass === 'LOW_REVERSIBLE') return { ok: false, reason: 'material_pr_cannot_use_low_reversible' };
  if (manifest.predictionStatus !== 'PASS') return { ok: false, reason: 'prediction_not_pass' };
  if (!REHEARSAL_STATUSES.has(manifest.rehearsalStatus)) return { ok: false, reason: 'rehearsal_not_pass' };
  if (!/^[0-9a-f]{40}$/i.test(manifest.authorizationBaseSha)) return { ok: false, reason: 'authorization_base_sha' };
  const expectedPath = `${MANIFEST_PREFIX}${manifest.recordId}${MANIFEST_SUFFIX}`;
  if (manifestPath !== expectedPath) return { ok: false, reason: 'record_path_mismatch' };
  const prefix = `PROCEED|${manifest.recordId}|PREACTION_PROCEED_ALLOWED|${manifest.riskClass}|`;
  if (!manifest.proceedToken.startsWith(prefix)) return { ok: false, reason: 'proceed_token_shape' };

  const scopeCheck = validateStringList(manifest.scope, 'manifest_scope');
  if (!scopeCheck.ok) return scopeCheck;

  return validateLeaseWitness(manifest, nowMs);
}

function validateBaseAdvance({ manifest, currentBaseSha, baseAdvanceIsAncestor, baseAdvanceChangedPaths = [] }) {
  if (!currentBaseSha || currentBaseSha === manifest.authorizationBaseSha) {
    return { ok: true, reason: 'authorization_base_current' };
  }
  if (!baseAdvanceIsAncestor) {
    return { ok: false, reason: 'authorization_base_not_ancestor_of_current_base' };
  }
  const overlap = [...new Set(baseAdvanceChangedPaths)].filter(
    (path) => manifest.scope.includes(path) || PREACTION_CONTROL_PLANE_PATHS.has(path),
  );
  if (overlap.length) {
    return { ok: false, reason: `authorization_base_advance_overlap:${overlap.join(',')}` };
  }
  return { ok: true, reason: 'authorization_base_advance_nonoverlap' };
}

export function evaluateAuthorization({
  commits,
  manifest,
  manifestPath,
  changedPaths,
  historyPaths = changedPaths,
  newMaterialPaths = [],
  manifestPresentAtHead = false,
  enforceReuseDiscovery = false,
  currentBaseSha = manifest?.authorizationBaseSha,
  baseAdvanceIsAncestor = true,
  baseAdvanceChangedPaths = [],
  nowMs = Date.now(),
}) {
  const manifestCheck = validateManifest(manifest, manifestPath, { nowMs });
  if (!manifestCheck.ok) return manifestCheck;
  const allObservedPaths = [...new Set([...(changedPaths || []), ...(historyPaths || [])])];
  const materialChanged = allObservedPaths.filter(isMaterialPath);
  if (materialChanged.length === 0) return { ok: true, reason: 'nonmaterial_pr' };

  if (enforceReuseDiscovery) {
    const reuseCheck = validateReuseDiscovery(manifest, { newMaterialPaths });
    if (!reuseCheck.ok) return reuseCheck;
  }

  if (!Array.isArray(commits) || commits.length === 0) return { ok: false, reason: 'no_branch_commits' };
  const first = commits[0];
  if (first.parentSha !== manifest.authorizationBaseSha) return { ok: false, reason: 'authorization_not_first_from_base' };
  if (first.paths.length !== 1 || first.paths[0] !== manifestPath) return { ok: false, reason: 'first_commit_not_manifest_only' };

  const baseAdvanceCheck = validateBaseAdvance({
    manifest,
    currentBaseSha,
    baseAdvanceIsAncestor,
    baseAdvanceChangedPaths,
  });
  if (!baseAdvanceCheck.ok) return baseAdvanceCheck;

  const outOfScope = materialChanged.filter((p) => !manifest.scope.includes(p));
  if (outOfScope.length) return { ok: false, reason: `material_path_out_of_scope:${outOfScope.join(',')}` };
  if (manifestPresentAtHead) return { ok: false, reason: 'authorization_manifest_must_be_cleanup_deleted_before_merge' };
  return { ok: true, reason: 'preaction_authorized' };
}

function baseHasReuseDiscoveryGate(baseSha) {
  try {
    const source = git(['show', `${baseSha}:tools/preaction-authorization-validator.mjs`]);
    return source.includes(`const REUSE_DISCOVERY_GATE_VERSION = '${REUSE_DISCOVERY_GATE_VERSION}';`);
  } catch {
    return false;
  }
}

function isAncestor(ancestorSha, descendantSha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestorSha, descendantSha], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function validateRepositoryAuthorization({ baseSha, headSha, changedPathsFile }) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha) || !/^[0-9a-f]{40}$/i.test(headSha)) {
    return { ok: false, reason: 'invalid_base_or_head_sha' };
  }
  const changedPaths = fs.readFileSync(changedPathsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const mergeBaseSha = git(['merge-base', baseSha, headSha]);
  const branchCommits = git(['rev-list', '--reverse', '--first-parent', `${mergeBaseSha}..${headSha}`]).split(/\r?\n/).filter(Boolean);
  if (branchCommits.length === 0) {
    return changedPaths.some(isMaterialPath)
      ? { ok: false, reason: 'no_branch_commits' }
      : { ok: true, reason: 'nonmaterial_pr' };
  }
  const historyPaths = branchCommits.flatMap((commitSha) =>
    git(['diff-tree', '--no-commit-id', '--name-only', '-r', commitSha]).split(/\r?\n/).filter(Boolean),
  );
  const allObservedPaths = [...new Set([...changedPaths, ...historyPaths])];
  if (!allObservedPaths.some(isMaterialPath)) return { ok: true, reason: 'nonmaterial_pr' };

  const firstCommit = branchCommits[0];
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

  const newMaterialPaths = git(['diff', '--diff-filter=A', '--name-only', mergeBaseSha, headSha])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(isMaterialPath);
  const enforceReuseDiscovery = baseHasReuseDiscoveryGate(baseSha);
  const baseAdvanceIsAncestor = isAncestor(manifest.authorizationBaseSha, baseSha);
  const baseAdvanceChangedPaths = baseAdvanceIsAncestor && baseSha !== manifest.authorizationBaseSha
    ? git(['diff', '--name-only', manifest.authorizationBaseSha, baseSha]).split(/\r?\n/).filter(Boolean)
    : [];

  return evaluateAuthorization({
    commits: [{ sha: firstCommit, parentSha, paths: firstPaths }],
    manifest,
    manifestPath,
    changedPaths,
    historyPaths,
    newMaterialPaths,
    manifestPresentAtHead: present,
    enforceReuseDiscovery,
    currentBaseSha: baseSha,
    baseAdvanceIsAncestor,
    baseAdvanceChangedPaths,
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

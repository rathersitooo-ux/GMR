#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isAuthorizationPath,
  isMaterialPath,
  validateManifest,
  validateRepositoryAuthorization,
} from './preaction-authorization-validator.mjs';

const REQUIRED_GATE_PATH = '.github/workflows/gameroad-required-gate.yml';
const PUBLIC_PACKAGE_TEST = 'deploy/cloudflare/tests/build.test.mjs';
const LOCAL_HOOK_PATH = '.githooks/pre-push';

function git(args, { cwd = process.cwd() } = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function runNode(args, { cwd = process.cwd(), stdio = 'inherit' } = {}) {
  execFileSync(process.execPath, args, { cwd, stdio });
}

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function existsAtHead(repoRoot, relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function isExecutableCandidate(relPath) {
  if (relPath === LOCAL_HOOK_PATH) return true;
  if (relPath.startsWith('.github/workflows/')) return true;
  if (/^(browser|roblox|unity|tools|tests)\//.test(relPath)) return true;
  if (/^playwright.*\.mjs$/.test(relPath)) return true;
  if (/\.(?:js|mjs|cjs|ts|tsx|lua|luau|html|css)$/.test(relPath)) return true;
  if (relPath === 'package.json' || relPath === 'package-lock.json') return true;
  return false;
}

function conventionalCounterpart(relPath, fileExists = () => false) {
  let match = /^(browser|tools)\/(.+)\.mjs$/.exec(relPath);
  if (match) {
    const testPath = `tests/${match[2]}.test.mjs`;
    return fileExists(testPath) ? testPath : null;
  }

  match = /^tests\/(.+)\.test\.mjs$/.exec(relPath);
  if (match) {
    const candidates = [`browser/${match[1]}.mjs`, `tools/${match[1]}.mjs`].filter(fileExists);
    return candidates.length === 1 ? relPath : null;
  }
  return null;
}

function isExplicitRequiredGatePath(relPath, workflowSource) {
  if (!workflowSource) return false;
  const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s'\"|])${escaped}(?=[\\s'\"|)\\\\]|$)`, 'm').test(workflowSource);
}

export function findUnmappedExecutablePaths(
  changedPaths,
  {
    fileExists = () => false,
    workflowSource = '',
  } = {},
) {
  const unmapped = [];
  for (const relPath of changedPaths) {
    if (!isExecutableCandidate(relPath)) continue;
    if (!fileExists(relPath)) continue; // deletion safety stays authoritative in Required Gate
    if (relPath === LOCAL_HOOK_PATH) continue;
    if (conventionalCounterpart(relPath, fileExists)) continue;
    if (isExplicitRequiredGatePath(relPath, workflowSource)) continue;
    unmapped.push(relPath);
  }
  return [...new Set(unmapped)].sort();
}

export function deriveConventionalTests(changedPaths, { fileExists = () => false } = {}) {
  const tests = new Set();
  for (const relPath of changedPaths) {
    if (!fileExists(relPath)) continue;
    const match = /^(browser|tools)\/(.+)\.mjs$/.exec(relPath);
    if (match) {
      const testPath = `tests/${match[2]}.test.mjs`;
      if (fileExists(testPath)) tests.add(testPath);
      continue;
    }
    const testMatch = /^tests\/(.+)\.test\.mjs$/.exec(relPath);
    if (testMatch) {
      const modules = [`browser/${testMatch[1]}.mjs`, `tools/${testMatch[1]}.mjs`].filter(fileExists);
      if (modules.length === 1) tests.add(relPath);
    }
  }
  return [...tests].sort();
}

export function classifyPrepushShape({ changedPaths, branchCommits, headManifestPaths }) {
  const materialChanged = changedPaths.filter(isMaterialPath);
  if (branchCommits.length === 1 && headManifestPaths.length === 1 && changedPaths.length === 1 && changedPaths.every(isAuthorizationPath)) {
    return { kind: 'authorization_bootstrap', materialChanged };
  }
  if (materialChanged.length === 0 && changedPaths.some(isAuthorizationPath)) {
    return { kind: 'invalid_authorization_shape', materialChanged };
  }
  if (materialChanged.length === 0) return { kind: 'nonmaterial', materialChanged };
  if (branchCommits.length === 0) return { kind: 'no_commits', materialChanged };
  return { kind: 'material', materialChanged };
}

export function validateAuthorizationBootstrap({
  baseSha,
  headSha,
  commits,
  firstParentSha,
  firstPaths,
  manifestPath,
  manifest,
  nowMs = Date.now(),
}) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha) || !/^[0-9a-f]{40}$/i.test(headSha)) {
    return { ok: false, reason: 'invalid_base_or_head_sha' };
  }
  if (!Array.isArray(commits) || commits.length !== 1) {
    return { ok: false, reason: 'authorization_bootstrap_requires_single_commit' };
  }
  if (commits[0] !== headSha) return { ok: false, reason: 'authorization_bootstrap_head_mismatch' };
  if (firstParentSha !== baseSha) return { ok: false, reason: 'authorization_not_first_from_base' };
  if (!Array.isArray(firstPaths) || firstPaths.length !== 1 || firstPaths[0] !== manifestPath || !isAuthorizationPath(manifestPath)) {
    return { ok: false, reason: 'first_commit_not_manifest_only' };
  }
  if (!manifest || manifest.authorizationBaseSha !== baseSha) {
    return { ok: false, reason: 'authorization_base_sha_mismatch' };
  }
  return validateManifest(manifest, manifestPath, { nowMs });
}

function readBootstrap(repoRoot, baseSha, headSha, branchCommits) {
  const firstCommit = branchCommits[0];
  const firstParentSha = git(['rev-parse', `${firstCommit}^`], { cwd: repoRoot });
  const firstPaths = splitLines(git(['diff-tree', '--no-commit-id', '--name-only', '-r', firstCommit], { cwd: repoRoot }));
  const manifestPaths = firstPaths.filter(isAuthorizationPath);
  if (manifestPaths.length !== 1) {
    return { ok: false, reason: 'first_commit_not_manifest_only' };
  }
  const manifestPath = manifestPaths[0];
  let manifest;
  try {
    manifest = JSON.parse(git(['show', `${firstCommit}:${manifestPath}`], { cwd: repoRoot }));
  } catch (error) {
    return { ok: false, reason: `manifest_read_or_parse:${error.message}` };
  }
  return validateAuthorizationBootstrap({
    baseSha,
    headSha,
    commits: branchCommits,
    firstParentSha,
    firstPaths,
    manifestPath,
    manifest,
  });
}

function resolveCurrentBranch(repoRoot) {
  try {
    return git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repoRoot });
  } catch {
    return '';
  }
}

function readWorkflowSource(repoRoot) {
  const workflowPath = path.join(repoRoot, REQUIRED_GATE_PATH);
  return fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
}

export function runPrepushGate({ baseSha, headSha = 'HEAD', repoRoot = process.cwd(), executeTests = true } = {}) {
  const resolvedHead = git(['rev-parse', headSha], { cwd: repoRoot });
  const resolvedBase = git(['rev-parse', baseSha], { cwd: repoRoot });
  const mergeBase = git(['merge-base', resolvedBase, resolvedHead], { cwd: repoRoot });
  const changedPaths = splitLines(git(['diff', '--name-only', mergeBase, resolvedHead], { cwd: repoRoot }));
  const branchCommits = splitLines(git(['rev-list', '--reverse', '--first-parent', `${mergeBase}..${resolvedHead}`], { cwd: repoRoot }));

  const headManifestPaths = changedPaths.filter((relPath) => {
    if (!isAuthorizationPath(relPath)) return false;
    try {
      execFileSync('git', ['cat-file', '-e', `${resolvedHead}:${relPath}`], { cwd: repoRoot, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });

  const shape = classifyPrepushShape({ changedPaths, branchCommits, headManifestPaths });
  if (shape.kind === 'authorization_bootstrap') {
    const bootstrap = readBootstrap(repoRoot, resolvedBase, resolvedHead, branchCommits);
    return { ...bootstrap, changedPaths, bootstrap: true };
  }
  if (shape.kind === 'invalid_authorization_shape') {
    return { ok: false, reason: 'authorization_bootstrap_shape_invalid', changedPaths };
  }
  if (shape.kind === 'nonmaterial') return { ok: true, reason: 'nonmaterial_push', changedPaths };
  if (shape.kind === 'no_commits') return { ok: false, reason: 'no_branch_commits', changedPaths };

  const branch = resolveCurrentBranch(repoRoot);
  if (branch === 'main' || branch === 'master') {
    return { ok: false, reason: `direct_material_push_forbidden:${branch}`, changedPaths };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameroad-prepush-'));
  const changedFile = path.join(tempDir, 'changed.txt');
  fs.writeFileSync(changedFile, `${changedPaths.join('\n')}\n`, 'utf8');
  try {
    const auth = validateRepositoryAuthorization({
      baseSha: resolvedBase,
      headSha: resolvedHead,
      changedPathsFile: changedFile,
    });
    if (!auth.ok) return { ...auth, changedPaths };

    const workflowSource = readWorkflowSource(repoRoot);
    const fileExists = (relPath) => existsAtHead(repoRoot, relPath);
    const unmapped = findUnmappedExecutablePaths(changedPaths, { fileExists, workflowSource });
    if (unmapped.length) {
      return { ok: false, reason: `unmapped_executable_paths:${unmapped.join(',')}`, changedPaths };
    }

    if (executeTests) {
      const conventionalTests = deriveConventionalTests(changedPaths, { fileExists });
      for (const testPath of conventionalTests) runNode(['--test', testPath], { cwd: repoRoot });
      if (!fileExists(PUBLIC_PACKAGE_TEST)) {
        return { ok: false, reason: `public_package_test_missing:${PUBLIC_PACKAGE_TEST}`, changedPaths };
      }
      runNode(['--test', PUBLIC_PACKAGE_TEST], { cwd: repoRoot });
    }

    return { ok: true, reason: 'prepush_required_gate_pass', changedPaths };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') out.baseSha = argv[++i];
    else if (argv[i] === '--head') out.headSha = argv[++i];
    else if (argv[i] === '--repo') out.repoRoot = argv[++i];
    else if (argv[i] === '--no-tests') out.executeTests = false;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.baseSha) {
    console.error('usage: prepush-required-gate.mjs --base <sha/ref> [--head <sha/ref>] [--repo <path>] [--no-tests]');
    process.exit(2);
  }
  try {
    const result = runPrepushGate(args);
    console.log(`PREPUSH_REQUIRED_GATE ${result.ok ? 'PASS' : 'FAIL'} ${result.reason}`);
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(`PREPUSH_REQUIRED_GATE FAIL exception:${error.message}`);
    process.exit(1);
  }
}

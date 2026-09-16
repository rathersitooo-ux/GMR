import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  packetFromIssueBody,
  validateFreePacket,
  buildPrompt,
  validateModelPatch,
} from '../tools/free-autopilot-worker.mjs';

function packet(overrides = {}) {
  return {
    schemaVersion: 'gameroad-executor-bus-v1',
    kind: 'queue',
    taskId: 'TASK-1',
    workUnitKey: 'WU-1',
    acquireKey: 'ACQ-1',
    baseRef: 'a'.repeat(40),
    executorClass: 'FREE_LOCAL_CODER',
    exactInputs: ['fresh CURRENT task row', 'fresh active lease readback'],
    exactMutableResources: ['browser/example.mjs', 'tests/example.test.mjs'],
    readOnlyResources: ['browser/read-only.mjs'],
    doNotChange: ['browser/other.mjs'],
    fixedAssumptions: ['Sol already resolved the product decision.'],
    procedure: ['Read exact inputs.', 'Patch only declared mutable paths.', 'Run focused tests.'],
    noInferenceBoundary: ['Do not invent rules, priorities, owners, or missing values.'],
    userEndState: 'Fix the bounded example.',
    realOutputTarget: 'A minimal tested candidate patch.',
    acceptance: ['Focused test passes.', 'No unrelated files change.'],
    stopConditions: ['Stop on stale base, ambiguity, missing context, or scope mismatch.'],
    returnPayload: ['status', 'evidence', 'unresolved', 'producedRefs', 'nextAction'],
    resumeCondition: 'Return a draft candidate PR.',
    executorCapabilityHint: 'FREE_LOCAL_CODER',
    ...overrides,
  };
}

test('accepts explicitly opted-in bounded procedure-first queue packet', () => {
  const result = validateFreePacket(packet());
  assert.equal(result.ok, true);
  assert.deepEqual(result.packet.exactMutableResources, ['browser/example.mjs', 'tests/example.test.mjs']);
});

test('rejects packets without free local coder opt-in', () => {
  const result = validateFreePacket(packet({ executorCapabilityHint: '' }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /opt_in/);
});

test('rejects direct free-coder packets missing procedure-first closure', () => {
  for (const key of ['executorClass', 'exactInputs', 'fixedAssumptions', 'procedure', 'noInferenceBoundary', 'stopConditions', 'returnPayload']) {
    const input = packet();
    delete input[key];
    const result = validateFreePacket(input);
    assert.equal(result.ok, false, key);
    assert.match(result.reason, /procedure_first_required/, key);
  }
});

test('rejects control-plane and traversal mutation', () => {
  for (const target of ['.github/workflows/evil.yml', 'data/preaction-authorizations/x.json', '../escape']) {
    const result = validateFreePacket(packet({ exactMutableResources: [target, 'tests/example.test.mjs'] }));
    assert.equal(result.ok, false, target);
  }
});

test('requires at least one focused node test path', () => {
  const result = validateFreePacket(packet({ exactMutableResources: ['browser/example.mjs'] }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /focused_test_path_required/);
});

test('parses normal executor bus issue body', () => {
  const p = packet();
  const body = `hello\n\`\`\`executor-bus\n${JSON.stringify(p)}\n\`\`\`\n`;
  const result = packetFromIssueBody(body);
  assert.equal(result.ok, true);
  assert.equal(result.packet.acquireKey, 'ACQ-1');
});

test('buildPrompt includes Sol-decided procedure, boundaries, stop rules and bounded context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-autopilot-'));
  fs.mkdirSync(path.join(root, 'browser'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'browser/example.mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'tests/example.test.mjs'), 'test placeholder\n');
  const prompt = buildPrompt(packet(), root);
  assert.match(prompt, /EXECUTOR_CLASS: FREE_LOCAL_CODER/);
  assert.match(prompt, /ORDERED_PROCEDURE:/);
  assert.match(prompt, /Patch only declared mutable paths/);
  assert.match(prompt, /NO_INFERENCE_BOUNDARY:/);
  assert.match(prompt, /STOP_FAIL_CLOSE:/);
  assert.match(prompt, /RETURN_PAYLOAD_REQUIREMENTS:/);
  assert.match(prompt, /browser\/example\.mjs/);
  assert.match(prompt, /export const value = 1/);
  assert.match(prompt, /executor, not a planner/);
});

test('truncates oversized file context before model prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-autopilot-limit-'));
  fs.mkdirSync(path.join(root, 'browser'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'browser/example.mjs'), 'x'.repeat(50000));
  fs.writeFileSync(path.join(root, 'tests/example.test.mjs'), 'y'.repeat(50000));
  const prompt = buildPrompt(packet(), root);
  assert.match(prompt, /TRUNCATED|CONTEXT_LIMIT_REACHED/);
  assert.ok(prompt.length < 40000);
});

test('accepts in-scope unified diff', () => {
  const output = `diff --git a/browser/example.mjs b/browser/example.mjs\nindex 1111111..2222222 100644\n--- a/browser/example.mjs\n+++ b/browser/example.mjs\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n`;
  const result = validateModelPatch(packet(), output);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changedPaths, ['browser/example.mjs']);
});

test('rejects scope escape in model patch', () => {
  const output = `diff --git a/browser/other.mjs b/browser/other.mjs\nindex 1111111..2222222 100644\n--- a/browser/other.mjs\n+++ b/browser/other.mjs\n@@ -1 +1 @@\n-a\n+b\n`;
  const result = validateModelPatch(packet(), output);
  assert.equal(result.ok, false);
  assert.match(result.reason, /out_of_scope/);
});

test('rejects binary and rename patches', () => {
  const binary = `diff --git a/browser/example.mjs b/browser/example.mjs\nGIT binary patch\n`;
  const renamed = `diff --git a/browser/example.mjs b/browser/example.mjs\nrename from browser/example.mjs\nrename to browser/new.mjs\n`;
  assert.equal(validateModelPatch(packet(), binary).ok, false);
  assert.equal(validateModelPatch(packet(), renamed).ok, false);
});

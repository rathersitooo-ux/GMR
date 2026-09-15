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
    exactMutableResources: ['browser/example.mjs', 'tests/example.test.mjs'],
    doNotChange: ['browser/other.mjs'],
    userEndState: 'Fix the bounded example.',
    realOutputTarget: 'A minimal tested candidate patch.',
    acceptance: ['Focused test passes.', 'No unrelated files change.'],
    resumeCondition: 'Return a draft PR candidate.',
    executorCapabilityHint: 'FREE_LOCAL_CODER',
    ...overrides,
  };
}

test('accepts explicitly opted-in bounded queue packet', () => {
  const result = validateFreePacket(packet());
  assert.equal(result.ok, true);
  assert.deepEqual(result.packet.exactMutableResources, ['browser/example.mjs', 'tests/example.test.mjs']);
});

test('rejects packets without free local coder opt-in', () => {
  const result = validateFreePacket(packet({ executorCapabilityHint: '' }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /opt_in/);
});

test('rejects control-plane and traversal mutation', () => {
  for (const target of ['.github/workflows/evil.yml', 'data/preaction-authorizations/x.json', '../escape']) {
    const result = validateFreePacket(packet({ exactMutableResources: [target] }));
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

test('buildPrompt includes only bounded context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-autopilot-'));
  fs.mkdirSync(path.join(root, 'browser'));
  fs.mkdirSync(path.join(root, 'tests'));
  fs.writeFileSync(path.join(root, 'browser/example.mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'tests/example.test.mjs'), 'test placeholder\n');
  const prompt = buildPrompt(packet(), root);
  assert.match(prompt, /browser\/example\.mjs/);
  assert.match(prompt, /export const value = 1/);
  assert.match(prompt, /Output exactly one unified git diff/);
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

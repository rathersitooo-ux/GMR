import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMA_VERSION,
  parseFencedJson,
  normalizeQueuePacket,
  normalizeResultPacket,
} from '../tools/executor-bus-packet.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'queue',
    taskId: 'TASK-1',
    workUnitKey: 'WU-1',
    acquireKey: 'ACQ-1',
    baseRef: '0123456789abcdef0123456789abcdef01234567',
    executorClass: 'GITHUB_AUTOMATION',
    exactInputs: ['fresh CURRENT task row', 'fresh active lease readback'],
    exactMutableResources: ['path/a'],
    readOnlyResources: ['path/read-only'],
    doNotChange: ['path/b'],
    fixedAssumptions: ['Sol has already resolved task and specification decisions.'],
    procedure: ['Read exact inputs.', 'Change only exact mutable resources.', 'Run declared acceptance checks.'],
    noInferenceBoundary: ['Do not infer product rules, priority, ownership, or missing values.'],
    userEndState: 'Ship one bounded transport result.',
    realOutputTarget: 'A verified result packet.',
    acceptance: ['identity matches', 'evidence exists'],
    stopConditions: ['Stop on stale base, lease mismatch, ambiguity, or out-of-scope change.'],
    returnPayload: ['status', 'evidence', 'unresolved', 'producedRefs', 'nextAction'],
    resumeCondition: 'Return to HEAD for current actual audit.',
    executorCapabilityHint: 'code executor',
    ...overrides,
  };
}

function result(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'result',
    taskId: 'TASK-1',
    workUnitKey: 'WU-1',
    acquireKey: 'ACQ-1',
    status: 'RETURNED',
    evidence: ['artifact://one'],
    unresolved: [],
    producedRefs: ['commit:abc'],
    nextAction: 'HEAD audit',
    ...overrides,
  };
}

test('parses one executor-bus fenced JSON payload', () => {
  const text = `before\n\`\`\`executor-bus\n${JSON.stringify(queue())}\n\`\`\`\nafter`;
  const parsed = parseFencedJson(text, 'executor-bus');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.acquireKey, 'ACQ-1');
});

test('accepts bounded procedure-first queue packet', () => {
  const checked = normalizeQueuePacket(queue());
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.packet.exactMutableResources, ['path/a']);
  assert.deepEqual(checked.packet.procedure, [
    'Read exact inputs.',
    'Change only exact mutable resources.',
    'Run declared acceptance checks.',
  ]);
});

test('rejects queue packet without mutable resources', () => {
  const checked = normalizeQueuePacket(queue({ exactMutableResources: [] }));
  assert.equal(checked.ok, false);
  assert.match(checked.reason, /exactMutableResources_required/);
});

test('rejects queue packet missing any procedure-first decision closure field', () => {
  for (const key of [
    'executorClass',
    'exactInputs',
    'fixedAssumptions',
    'procedure',
    'noInferenceBoundary',
    'stopConditions',
    'returnPayload',
  ]) {
    const input = queue();
    delete input[key];
    const checked = normalizeQueuePacket(input);
    assert.equal(checked.ok, false, key);
    assert.match(checked.reason, new RegExp(`${key}_(?:must_be_array|required|must_be_string)`), key);
  }
});

test('rejects mutable resources that are also read-only or do-not-change', () => {
  for (const overrides of [
    { readOnlyResources: ['path/a'] },
    { doNotChange: ['path/a'] },
  ]) {
    const checked = normalizeQueuePacket(queue(overrides));
    assert.equal(checked.ok, false);
    assert.match(checked.reason, /mutable_immutable_overlap/);
  }
});

test('rejects arbitrary command fields even though bus never executes them', () => {
  const checked = normalizeQueuePacket(queue({ command: 'rm -rf /' }));
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'forbidden_key:command');
});

test('accepts result with exact queue identity', () => {
  const q = normalizeQueuePacket(queue());
  const checked = normalizeResultPacket(result(), q.packet);
  assert.equal(checked.ok, true);
  assert.equal(checked.packet.status, 'RETURNED');
});

test('rejects result that crosses acquire identity', () => {
  const q = normalizeQueuePacket(queue());
  const checked = normalizeResultPacket(result({ acquireKey: 'OTHER' }), q.packet);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'identity_mismatch:acquireKey');
});

test('transport status cannot claim product SUCCESS', () => {
  const q = normalizeQueuePacket(queue());
  const checked = normalizeResultPacket(result({ status: 'SUCCESS' }), q.packet);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'result_status');
});

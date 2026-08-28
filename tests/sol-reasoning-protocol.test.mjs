import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_VERSION } from '../tools/executor-bus-packet.mjs';
import { packReasoningPacket } from '../tools/executor-bus-packet-compressor.mjs';
import {
  SOL_REASONING_PROTOCOL_VERSION,
  buildSolPrompt,
  buildSolRequest,
  parseSolResponse,
  validateSolRequest,
  validateSolResponse,
} from '../tools/sol-reasoning-protocol.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'queue',
    taskId: 'TASK-1',
    workUnitKey: 'WORK-1',
    acquireKey: 'ACQ-1',
    baseRef: '0123456789abcdef0123456789abcdef01234567',
    exactMutableResources: ['src/a.mjs', 'tests/**'],
    doNotChange: ['src/protected.mjs', '.github/workflows/**'],
    userEndState: 'Produce one bounded implementation decision.',
    realOutputTarget: 'A correlated plan that an executor can review.',
    acceptance: ['scope stays bounded', 'tests prove the decision'],
    resumeCondition: 'Return to HEAD for current actual audit.',
    executorCapabilityHint: 'reasoning only',
    ...overrides,
  };
}

function packet(source = queue()) {
  const packed = packReasoningPacket(source, [
    { id: 'observed', text: 'Observed behavior is X.', required: true },
    { id: 'failed', text: 'Previous attempt Y failed.', priority: 10 },
  ]);
  assert.equal(packed.ok, true);
  return packed.packet;
}

function goodResponse(request, source = queue(), overrides = {}) {
  return {
    protocolVersion: SOL_REASONING_PROTOCOL_VERSION,
    kind: 'response',
    requestId: request.requestId,
    taskId: request.taskId,
    workUnitKey: request.workUnitKey,
    acquireKey: request.acquireKey,
    reasoningPacketFingerprint: request.reasoningPacketFingerprint,
    disposition: 'PLAN',
    cause: ['The observed state points to one bounded cause.'],
    decision: 'Change only the authorized module and add focused verification.',
    filesToChange: ['src/a.mjs', 'tests/focused.test.mjs'],
    doNotTouch: source.doNotChange,
    implementationOrder: ['change src/a.mjs', 'add focused test'],
    tests: ['run focused test'],
    rollback: ['revert the two authorized file changes'],
    uncertainties: [],
    evidenceRequests: [],
    acceptanceCoverage: source.acceptance.map((acceptance) => ({
      acceptance,
      coveredBy: [`plan/test coverage for: ${acceptance}`],
    })),
    ...overrides,
  };
}

test('builds a deterministic request correlated to the reasoning packet', () => {
  const reasoning = packet();
  const first = buildSolRequest(reasoning, { mode: 'ROOT_CAUSE', question: 'What should change?' });
  const second = buildSolRequest(reasoning, { mode: 'ROOT_CAUSE', question: 'What should change?' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.request, second.request);
  assert.equal(first.request.taskId, 'TASK-1');
  assert.equal(first.request.workUnitKey, 'WORK-1');
  assert.equal(first.request.acquireKey, 'ACQ-1');
});

test('rejects a tampered request even when task identity still looks valid', () => {
  const reasoning = packet();
  const built = buildSolRequest(reasoning, { question: 'Original question' });
  const tampered = { ...built.request, question: 'Changed question' };
  const checked = validateSolRequest(tampered, reasoning);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'request_id_mismatch');
});

test('accepts a fully correlated bounded plan', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the bounded repair.' });
  const checked = validateSolResponse(goodResponse(built.request, source), built.request, reasoning);
  assert.equal(checked.ok, true);
  assert.equal(checked.response.disposition, 'PLAN');
});

test('rejects a response crossing acquire identity', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, { acquireKey: 'OTHER' }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'response_correlation_mismatch:acquireKey');
});

test('rejects file mutation outside exact mutable scope', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, { filesToChange: ['src/not-owned.mjs'] }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'file_outside_mutable_scope:src/not-owned.mjs');
});

test('allows a file under an authorized /** scope', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, {
      filesToChange: ['tests/deep/focused.test.mjs'],
      implementationOrder: ['add focused test'],
      tests: ['run focused test'],
      rollback: ['remove focused test'],
    }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, true);
});

test('rejects omission of queue do-not-change authority', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, { doNotTouch: ['src/protected.mjs'] }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'missing_do_not_touch:.github/workflows/**');
});

test('rejects response-local do-not-touch overlap with a proposed file', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, { doNotTouch: [...source.doNotChange, 'src/a.mjs'] }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'file_response_do_not_touch_overlap:src/a.mjs');
});

test('requires exact coverage for every acceptance clause', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const response = goodResponse(built.request, source);
  response.acceptanceCoverage = response.acceptanceCoverage.slice(0, 1);
  const checked = validateSolResponse(response, built.request, reasoning);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'acceptanceCoverage_count');
});

test('rejects fake SUCCESS-style dispositions', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, { disposition: 'SUCCESS' }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'disposition_not_allowed');
});

test('NEEDS_EVIDENCE must request missing evidence', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, {
      disposition: 'NEEDS_EVIDENCE',
      filesToChange: [],
      implementationOrder: [],
      tests: [],
      rollback: [],
      evidenceRequests: [],
    }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'needs_evidence_requests_required');
});

test('NO_CHANGE cannot smuggle implementation work', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const checked = validateSolResponse(
    goodResponse(built.request, source, {
      disposition: 'NO_CHANGE',
      filesToChange: [],
      implementationOrder: ['edit anyway'],
    }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'no_change_implementation_forbidden');
});

test('parser requires exactly one fenced Sol response', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const response = JSON.stringify(goodResponse(built.request, source));
  const single = parseSolResponse(`before\n\`\`\`sol-reasoning-response\n${response}\n\`\`\`\nafter`, built.request, reasoning);
  assert.equal(single.ok, true);
  const double = parseSolResponse(
    `\`\`\`sol-reasoning-response\n${response}\n\`\`\`\n\`\`\`sol-reasoning-response\n${response}\n\`\`\``,
    built.request,
    reasoning,
  );
  assert.equal(double.ok, false);
  assert.equal(double.reason, 'multiple_fences:sol-reasoning-response');
});

test('prompt is deterministic and explicitly forbids execution claims', () => {
  const reasoning = packet();
  const first = buildSolPrompt(reasoning, { mode: 'REVIEW', question: 'Review the decision.' });
  const second = buildSolPrompt(reasoning, { mode: 'REVIEW', question: 'Review the decision.' });
  assert.equal(first.ok, true);
  assert.equal(first.prompt, second.prompt);
  assert.match(first.prompt, /Do not claim execution/);
  assert.match(first.prompt, /sol-reasoning-response/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_VERSION } from '../tools/executor-bus-packet.mjs';
import { packReasoningPacket } from '../tools/executor-bus-packet-compressor.mjs';
import { encodeEvidenceContextText } from '../tools/jit-evidence-compiler.mjs';
import {
  SOL_REASONING_PROTOCOL_VERSION,
  buildSolPrompt,
  buildSolRequest,
  parseSolResponse,
  validateEvidenceClaims,
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

function canonicalEvidence({ id, state, role, text, required = false, priority = 0, tier = 'HOT', claimMode = 'CURRENT' }) {
  return {
    id,
    text: encodeEvidenceContextText({
      id,
      tier,
      state,
      role,
      claimMode,
      authorityClass: 'TEST_FIXTURE',
      version: 'fixture-v1',
      provenance: 'tests/sol-reasoning-protocol.test.mjs',
      freshness: 'CURRENT_TEST_FIXTURE',
      text,
    }),
    required,
    priority,
  };
}

function evidenceContext() {
  return [
    canonicalEvidence({ id: 'user:directive', state: 'CURRENT_AUTHORITY', role: 'USER', text: 'User requested the bounded implementation outcome.', required: true }),
    canonicalEvidence({ id: 'authority:current', state: 'CURRENT_AUTHORITY', role: 'AUTHORITY', text: 'Current authority permits src/a.mjs and tests only.', required: true }),
    canonicalEvidence({ id: 'actual:observed', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DIRECT_ACTUAL', text: 'Observed behavior is X.', required: true }),
    canonicalEvidence({ id: 'test:focused', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DISCRIMINATING_TEST', text: 'Focused discriminator shows X changes when factor A changes.', priority: 10 }),
    canonicalEvidence({ id: 'counter:failed', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'COUNTEREVIDENCE', text: 'Alternative explanation B remains counterevidence unless discriminated.', priority: 10 }),
  ];
}

function packet(source = queue()) {
  const packed = packReasoningPacket(source, evidenceContext());
  assert.equal(packed.ok, true);
  return packed.packet;
}

function rootCauseFields(request) {
  if (request.mode !== 'ROOT_CAUSE') {
    return {
      claims: [],
      selectedCauseClaimId: '',
      decisionBasisRefs: ['authority:current', 'actual:observed'],
    };
  }
  return {
    claims: [{
      id: 'root-a',
      kind: 'ROOT_CAUSE',
      statement: 'Factor A causes the observed bounded failure.',
      status: 'ESTABLISHED',
      evidenceRefs: ['actual:observed', 'test:focused'],
      counterEvidenceRefs: ['counter:failed'],
      discriminatingTestRefs: ['test:focused'],
      nextDiscriminator: '',
    }],
    selectedCauseClaimId: 'root-a',
    decisionBasisRefs: ['authority:current', 'actual:observed', 'test:focused'],
  };
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
    cause: ['Plain-language explanation only; evidence bindings are authoritative.'],
    ...rootCauseFields(request),
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

test('accepts a fully correlated bounded plan with frozen evidence refs', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the bounded repair.' });
  const checked = validateSolResponse(goodResponse(built.request, source), built.request, reasoning);
  assert.equal(checked.ok, true);
  assert.equal(checked.response.disposition, 'PLAN');
  assert.deepEqual(checked.response.decisionBasisRefs, ['authority:current', 'actual:observed']);
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
      claims: [],
      selectedCauseClaimId: '',
      decisionBasisRefs: [],
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
      claims: [],
      selectedCauseClaimId: '',
      decisionBasisRefs: [],
      implementationOrder: ['edit anyway'],
    }),
    built.request,
    reasoning,
  );
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'no_change_implementation_forbidden');
});

test('ROOT_CAUSE PLAN rejects a plausible hypothesis without discriminator', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { mode: 'ROOT_CAUSE', question: 'Find the actual cause.' });
  const response = goodResponse(built.request, source);
  response.claims = [{
    id: 'guess-a',
    kind: 'ROOT_CAUSE',
    statement: 'A is plausible.',
    status: 'HYPOTHESIS',
    evidenceRefs: ['actual:observed'],
    counterEvidenceRefs: ['counter:failed'],
    discriminatingTestRefs: [],
    nextDiscriminator: 'Run A/B.',
  }];
  response.selectedCauseClaimId = 'guess-a';
  response.decisionBasisRefs = ['authority:current', 'actual:observed'];
  const checked = validateSolResponse(response, built.request, reasoning);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'evidence_root_cause_plan_established_cause_required');
});

test('ROOT_CAUSE PLAN rejects established label without discriminating test evidence', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { mode: 'ROOT_CAUSE', question: 'Find the actual cause.' });
  const response = goodResponse(built.request, source);
  response.claims[0].discriminatingTestRefs = [];
  const checked = validateSolResponse(response, built.request, reasoning);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'evidence_claim_0_root_cause_discriminating_test_required');
});

test('mutating plan rejects invented evidence ids absent from frozen packet', () => {
  const source = queue();
  const reasoning = packet(source);
  const built = buildSolRequest(reasoning, { question: 'Choose the repair.' });
  const response = goodResponse(built.request, source, {
    decisionBasisRefs: ['authority:current', 'actual:invented-after-answer'],
  });
  const checked = validateSolResponse(response, built.request, reasoning);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'evidence_decisionBasisRefs_unknown_ref:actual:invented-after-answer');
});

test('regression: writable project state cannot establish global behavior root cause', () => {
  const checked = validateEvidenceClaims({
    mode: 'ROOT_CAUSE',
    disposition: 'PLAN',
    filesToChange: ['project/ops-rule'],
    claims: [{
      id: 'drive-is-root',
      kind: 'ROOT_CAUSE',
      statement: 'Writable project Drive is the correct global repair surface.',
      status: 'ESTABLISHED',
      evidenceRefs: ['actual:observed'],
      counterEvidenceRefs: ['counter:failed'],
      discriminatingTestRefs: [],
      nextDiscriminator: '',
    }],
    selectedCauseClaimId: 'drive-is-root',
    decisionBasisRefs: ['user:directive', 'actual:observed'],
  }, evidenceContext());
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'claim_0_root_cause_discriminating_test_required');
});

test('typed-looking raw context cannot satisfy mutation evidence gates', () => {
  const checked = validateEvidenceClaims({
    mode: 'DESIGN_DECISION',
    disposition: 'PLAN',
    filesToChange: ['src/a.mjs'],
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: ['authority:looks-valid', 'actual:looks-valid'],
  }, [
    { id: 'authority:looks-valid', text: 'Not compiler-certified authority.' },
    { id: 'actual:looks-valid', text: 'Not compiler-certified actual evidence.' },
  ]);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'mutating_plan_authority_basis_required');
});

test('ID prefix cannot spoof a canonical evidence class', () => {
  const context = [
    canonicalEvidence({ id: 'authority:spoof', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DIRECT_ACTUAL', text: 'Actual evidence wearing an authority-looking ID.' }),
    canonicalEvidence({ id: 'actual:real', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DIRECT_ACTUAL', text: 'Actual evidence.' }),
  ];
  const checked = validateEvidenceClaims({
    mode: 'DESIGN_DECISION',
    disposition: 'PLAN',
    filesToChange: ['src/a.mjs'],
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: ['authority:spoof', 'actual:real'],
  }, context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'mutating_plan_authority_basis_required');
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

test('prompt is deterministic and makes prose causes non-authoritative', () => {
  const reasoning = packet();
  const first = buildSolPrompt(reasoning, { mode: 'REVIEW', question: 'Review the decision.' });
  const second = buildSolPrompt(reasoning, { mode: 'REVIEW', question: 'Review the decision.' });
  assert.equal(first.ok, true);
  assert.equal(first.prompt, second.prompt);
  assert.match(first.prompt, /Do not claim execution/);
  assert.match(first.prompt, /non-authoritative/);
  assert.match(first.prompt, /A plausible story is not an established cause/);
  assert.match(first.prompt, /opaque identifiers/);
  assert.match(first.prompt, /sol-reasoning-response/);
});

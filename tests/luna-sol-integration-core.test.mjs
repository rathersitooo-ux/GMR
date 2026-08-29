import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeEvidenceContextText } from '../tools/jit-evidence-compiler.mjs';
import { INTEGRATION_STATUS, runLunaSolDecision } from '../tools/luna-sol-integration-core.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: 'gameroad-executor-bus-v1',
    kind: 'queue',
    taskId: 'task-1',
    workUnitKey: 'unit-1',
    acquireKey: 'acquire-1',
    baseRef: 'main@abc',
    exactMutableResources: ['tools/example.mjs'],
    doNotChange: ['protected/**'],
    userEndState: 'Resolve the bounded task safely.',
    realOutputTarget: 'A reviewed implementation decision.',
    acceptance: ['scope is preserved', 'decision is evidence-backed'],
    resumeCondition: 'Resume only with matching evidence.',
    executorCapabilityHint: 'browser driver injected by executor',
    ...overrides,
  };
}

function canonicalEvidence({ id, state, role, text, required = false, priority = 0 }) {
  return {
    id,
    text: encodeEvidenceContextText({
      id,
      tier: 'HOT',
      state,
      role,
      claimMode: 'CURRENT',
      authorityClass: 'TEST_FIXTURE',
      version: 'fixture-v1',
      provenance: 'tests/luna-sol-integration-core.test.mjs',
      freshness: 'CURRENT_TEST_FIXTURE',
      text,
    }),
    required,
    priority,
  };
}

function evidenceContext() {
  return [
    canonicalEvidence({ id: 'user:directive', state: 'CURRENT_AUTHORITY', role: 'USER', text: 'User requested the bounded change.', required: true }),
    canonicalEvidence({ id: 'authority:current', state: 'CURRENT_AUTHORITY', role: 'AUTHORITY', text: 'Current authority allows tools/example.mjs.', required: true }),
    canonicalEvidence({ id: 'actual:state', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DIRECT_ACTUAL', text: 'Current actual directly exhibits the target condition.', required: true }),
    canonicalEvidence({ id: 'test:discriminator', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'DISCRIMINATING_TEST', text: 'A/B discriminator isolates factor X.', priority: 10 }),
    canonicalEvidence({ id: 'counter:alternative', state: 'CURRENT_EXECUTION_EVIDENCE', role: 'COUNTEREVIDENCE', text: 'Alternative Y is explicit counterevidence.', priority: 10 }),
  ];
}

function localEvidence() {
  return {
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: ['authority:current', 'actual:state'],
  };
}

function establishedLocalRepairEvidence() {
  return {
    claims: [{
      id: 'root-x',
      kind: 'ROOT_CAUSE',
      statement: 'Factor X causes the bounded failure.',
      status: 'ESTABLISHED',
      evidenceRefs: ['actual:state', 'test:discriminator'],
      counterEvidenceRefs: ['counter:alternative'],
      discriminatingTestRefs: ['test:discriminator'],
      nextDiscriminator: '',
    }],
    selectedCauseClaimId: 'root-x',
    decisionBasisRefs: ['authority:current', 'actual:state', 'test:discriminator'],
  };
}

function parseRequest(submittedText) {
  const match = submittedText.match(/REQUEST:\n(\{[^\n]+\})/);
  assert.ok(match, 'request JSON should be present in submitted transport message');
  return JSON.parse(match[1]);
}

function responseFor(submittedText, overrides = {}) {
  const request = parseRequest(submittedText);
  const markerMatch = submittedText.match(/\[GAMEROAD_SOL_RESPONSE packetId="[^"]+" correlationId="[^"]+"\]/);
  assert.ok(markerMatch, 'correlation marker should be present in submitted transport message');
  const response = {
    protocolVersion: request.protocolVersion,
    kind: 'response',
    requestId: request.requestId,
    taskId: request.taskId,
    workUnitKey: request.workUnitKey,
    acquireKey: request.acquireKey,
    reasoningPacketFingerprint: request.reasoningPacketFingerprint,
    disposition: 'PLAN',
    cause: ['Plain-language explanation only.'],
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: ['authority:current', 'actual:state'],
    decision: 'Change only the scoped example file after executor review.',
    filesToChange: ['tools/example.mjs'],
    doNotTouch: ['protected/**'],
    implementationOrder: ['review the plan', 'change tools/example.mjs'],
    tests: ['run the focused acceptance test'],
    rollback: ['revert tools/example.mjs'],
    uncertainties: [],
    evidenceRequests: [],
    acceptanceCoverage: [
      { acceptance: 'scope is preserved', coveredBy: ['filesToChange and doNotTouch validation'] },
      { acceptance: 'decision is evidence-backed', coveredBy: ['frozen decisionBasisRefs'] },
    ],
    ...overrides,
  };
  return `${markerMatch[0]}\n\`\`\`sol-reasoning-response\n${JSON.stringify(response)}\n\`\`\``;
}

function fakeDriver({ responseMutator } = {}) {
  const state = { submits: 0, submittedText: '' };
  return {
    state,
    async inspectContext() {
      return {
        pageReady: true,
        loading: false,
        composerReady: true,
        conversationId: 'conv-1',
        lastAssistantTurnId: 'assistant-0',
      };
    },
    async submitMessage({ text }) {
      state.submits += 1;
      state.submittedText = text;
      return { accepted: true, userTurnId: 'user-1' };
    },
    async waitForAssistantTurn() {
      const base = responseFor(state.submittedText);
      return {
        state: 'completed',
        turnId: 'assistant-1',
        conversationId: 'conv-1',
        complete: true,
        truncated: false,
        text: responseMutator ? responseMutator(base, state.submittedText) : base,
      };
    },
  };
}

test('local decision grants mutation only after frozen evidence validation', async () => {
  const source = queue();
  const result = await runLunaSolDecision({
    queuePacket: source,
    context: evidenceContext(),
    localEvidence: localEvidence(),
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, INTEGRATION_STATUS.LOCAL_EXECUTE);
  assert.equal(result.mayMutate, true);
  assert.equal(result.queuePacket.acquireKey, source.acquireKey);
  assert.deepEqual(result.queuePacket.exactMutableResources, source.exactMutableResources);
  assert.ok(result.reasoningPacketFingerprint);
});

test('local route without evidence cannot grant mutation permission', async () => {
  const result = await runLunaSolDecision({
    queuePacket: queue(),
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.PACKET_REJECTED);
  assert.equal(result.reason, 'local_evidence_required');
  assert.equal(result.mayMutate, false);
});

test('local decision without a queue cannot grant mutation permission', async () => {
  const result = await runLunaSolDecision({
    context: evidenceContext(),
    localEvidence: localEvidence(),
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.PACKET_REJECTED);
  assert.equal(result.reason, 'local_mutation_queue_required');
  assert.equal(result.mayMutate, false);
});

test('malformed local mutation queue fails closed before mutation permission', async () => {
  const result = await runLunaSolDecision({
    queuePacket: queue({ exactMutableResources: [] }),
    context: evidenceContext(),
    localEvidence: localEvidence(),
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.PACKET_REJECTED);
  assert.match(result.reason, /^queue_/);
  assert.equal(result.mayMutate, false);
});

test('known local failure repair requires an established discriminated root cause', async () => {
  const accepted = await runLunaSolDecision({
    queuePacket: queue(),
    context: evidenceContext(),
    localEvidence: establishedLocalRepairEvidence(),
    routerInput: {
      failureCount: 1,
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.mayMutate, true);

  const hypothesis = establishedLocalRepairEvidence();
  hypothesis.claims[0].status = 'HYPOTHESIS';
  hypothesis.claims[0].discriminatingTestRefs = [];
  hypothesis.claims[0].nextDiscriminator = 'Run the missing A/B test.';
  const rejected = await runLunaSolDecision({
    queuePacket: queue(),
    context: evidenceContext(),
    localEvidence: hypothesis,
    routerInput: {
      failureCount: 1,
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'local_evidence_root_cause_plan_established_cause_required');
  assert.equal(rejected.mayMutate, false);
});

test('Sol-required decision without a driver fails closed as HOLD', async () => {
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, INTEGRATION_STATUS.HOLD);
  assert.equal(result.mayMutate, false);
  assert.equal(result.routeDecision.reasonCodes[0], 'SOL_REQUIRED_TRANSPORT_UNAVAILABLE');
});

test('validated Sol PLAN returns a proposal but never mutation permission', async () => {
  const driver = fakeDriver();
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    context: evidenceContext(),
  }, { driver });
  assert.equal(result.ok, true);
  assert.equal(result.status, INTEGRATION_STATUS.SOL_RESPONSE_VALIDATED);
  assert.equal(result.response.disposition, 'PLAN');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION');
  assert.equal(driver.state.submits, 1);
});

test('Sol PLAN inventing evidence after the packet is rejected', async () => {
  const driver = fakeDriver({
    responseMutator(base) {
      const marker = base.split('\n')[0];
      const fenced = base.match(/```sol-reasoning-response\n([\s\S]*?)\n```/);
      const response = JSON.parse(fenced[1]);
      response.decisionBasisRefs = ['authority:current', 'actual:invented-after-answer'];
      return `${marker}\n\`\`\`sol-reasoning-response\n${JSON.stringify(response)}\n\`\`\``;
    },
  });
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    context: evidenceContext(),
  }, { driver });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.RESPONSE_REJECTED);
  assert.match(result.reason, /unknown_ref:actual:invented-after-answer/);
  assert.equal(result.mayMutate, false);
});

test('NO_CHANGE remains non-mutating and is surfaced distinctly to executor review', async () => {
  const driver = fakeDriver({
    responseMutator(base, submittedText) {
      const request = parseRequest(submittedText);
      const marker = base.split('\n')[0];
      const response = {
        protocolVersion: request.protocolVersion,
        kind: 'response',
        requestId: request.requestId,
        taskId: request.taskId,
        workUnitKey: request.workUnitKey,
        acquireKey: request.acquireKey,
        reasoningPacketFingerprint: request.reasoningPacketFingerprint,
        disposition: 'NO_CHANGE',
        cause: ['current evidence already satisfies the bounded requirement'],
        claims: [],
        selectedCauseClaimId: '',
        decisionBasisRefs: [],
        decision: 'Do not mutate the target.',
        filesToChange: [],
        doNotTouch: ['protected/**'],
        implementationOrder: [],
        tests: ['verify acceptance without mutation'],
        rollback: [],
        uncertainties: [],
        evidenceRequests: [],
        acceptanceCoverage: [
          { acceptance: 'scope is preserved', coveredBy: ['no files change'] },
          { acceptance: 'decision is evidence-backed', coveredBy: ['acceptance verification'] },
        ],
      };
      return `${marker}\n\`\`\`sol-reasoning-response\n${JSON.stringify(response)}\n\`\`\``;
    },
  });
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    context: evidenceContext(),
  }, { driver });
  assert.equal(result.ok, true);
  assert.equal(result.response.disposition, 'NO_CHANGE');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE');
});

test('missing transport correlation marker is rejected before protocol adoption', async () => {
  const driver = fakeDriver({
    responseMutator(base) {
      return base.split('\n').slice(1).join('\n');
    },
  });
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    context: evidenceContext(),
  }, { driver });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.TRANSPORT_FAILED);
  assert.equal(result.reason, 'CORRELATION_MISMATCH');
  assert.equal(result.mayMutate, false);
});

test('out-of-scope Sol file proposal is rejected by protocol validation', async () => {
  const driver = fakeDriver({
    responseMutator(base) {
      const marker = base.split('\n')[0];
      const fenced = base.match(/```sol-reasoning-response\n([\s\S]*?)\n```/);
      const response = JSON.parse(fenced[1]);
      response.filesToChange = ['outside/not-allowed.mjs'];
      return `${marker}\n\`\`\`sol-reasoning-response\n${JSON.stringify(response)}\n\`\`\``;
    },
  });
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    context: evidenceContext(),
  }, { driver });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.RESPONSE_REJECTED);
  assert.match(result.reason, /file_outside_mutable_scope/);
  assert.equal(result.mayMutate, false);
});

test('required context that cannot fit the packet budget fails before browser submission', async () => {
  const driver = fakeDriver();
  const result = await runLunaSolDecision({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    maxWireBytes: 900,
    context: [{ id: 'actual:required-large', text: 'x'.repeat(600), required: true }],
  }, { driver });
  assert.equal(result.ok, false);
  assert.equal(result.status, INTEGRATION_STATUS.PACKET_REJECTED);
  assert.equal(result.mayMutate, false);
  assert.equal(driver.state.submits, 0);
});

test('human-only boundary is HOLD even when a browser driver exists', async () => {
  const driver = fakeDriver();
  const result = await runLunaSolDecision({
    routerInput: { humanOnly: true, forceSol: true },
    queuePacket: queue(),
  }, { driver });
  assert.equal(result.ok, true);
  assert.equal(result.status, INTEGRATION_STATUS.HOLD);
  assert.equal(result.routeDecision.reasonCodes[0], 'HUMAN_ONLY_ACTION');
  assert.equal(result.mayMutate, false);
  assert.equal(driver.state.submits, 0);
});

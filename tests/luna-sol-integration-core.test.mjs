import assert from 'node:assert/strict';
import test from 'node:test';

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
    cause: ['bounded evidence indicates a single scoped change'],
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
      { acceptance: 'decision is evidence-backed', coveredBy: ['cause and tests'] },
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

test('local decision does not require or invoke browser transport', async () => {
  const result = await runLunaSolDecision({
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
    context: [{ id: 'failure', text: 'A prior approach failed safely.', priority: 20, required: true }],
  }, { driver });
  assert.equal(result.ok, true);
  assert.equal(result.status, INTEGRATION_STATUS.SOL_RESPONSE_VALIDATED);
  assert.equal(result.response.disposition, 'PLAN');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION');
  assert.equal(driver.state.submits, 1);
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
  const result = await runLunaSolDecision({ routerInput: { forceSol: true }, queuePacket: queue() }, { driver });
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
  const result = await runLunaSolDecision({ routerInput: { forceSol: true }, queuePacket: queue() }, { driver });
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
  const result = await runLunaSolDecision({ routerInput: { forceSol: true }, queuePacket: queue() }, { driver });
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
    context: [{ id: 'required-large', text: 'x'.repeat(600), required: true }],
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

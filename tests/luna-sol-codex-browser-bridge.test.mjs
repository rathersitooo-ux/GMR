import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_BROWSER_BRIDGE_STATUS,
  prepareLunaSolCodexDispatch,
  resumeLunaSolCodexDispatch,
} from '../tools/luna-sol-codex-browser-bridge.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: 'gameroad-executor-bus-v1',
    kind: 'queue',
    taskId: 'task-codex-bridge',
    workUnitKey: 'unit-codex-bridge',
    acquireKey: 'acquire-codex-bridge',
    baseRef: 'main@abc',
    exactMutableResources: ['tools/example.mjs'],
    doNotChange: ['protected/**'],
    userEndState: 'Resolve the bounded task safely.',
    realOutputTarget: 'A reviewed implementation decision.',
    acceptance: ['scope is preserved', 'decision is evidence-backed'],
    resumeCondition: 'Resume only with matching evidence.',
    executorCapabilityHint: 'Codex in-app browser available after approval',
    ...overrides,
  };
}

function browserContext(overrides = {}) {
  return {
    pageReady: true,
    loading: false,
    composerReady: true,
    conversationId: 'chatgpt-conversation-1',
    lastAssistantTurnId: 'assistant-0',
    ...overrides,
  };
}

function prepareSol(overrides = {}) {
  return prepareLunaSolCodexDispatch({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    browserCapabilityConfirmed: true,
    browserContext: browserContext(),
    context: [
      { id: 'failure', text: 'A prior bounded attempt failed without mutation leakage.', priority: 20, required: true },
    ],
    ...overrides,
  });
}

function responseFor(prepared, overrides = {}) {
  const request = prepared.bundle.solRequest;
  const response = {
    protocolVersion: request.protocolVersion,
    kind: 'response',
    requestId: request.requestId,
    taskId: request.taskId,
    workUnitKey: request.workUnitKey,
    acquireKey: request.acquireKey,
    reasoningPacketFingerprint: request.reasoningPacketFingerprint,
    disposition: 'PLAN',
    cause: ['bounded evidence supports one scoped change'],
    decision: 'Review and change only the scoped example file.',
    filesToChange: ['tools/example.mjs'],
    doNotTouch: ['protected/**'],
    implementationOrder: ['review the Sol decision', 'change tools/example.mjs'],
    tests: ['run the focused acceptance test'],
    rollback: ['revert tools/example.mjs'],
    uncertainties: [],
    evidenceRequests: [],
    acceptanceCoverage: [
      { acceptance: 'scope is preserved', coveredBy: ['mutable and protected scope validation'] },
      { acceptance: 'decision is evidence-backed', coveredBy: ['cause and focused test'] },
    ],
    ...overrides,
  };
  return `${prepared.bundle.transportRequest.responseMarker}\n\`\`\`sol-reasoning-response\n${JSON.stringify(response)}\n\`\`\``;
}

function evidenceFor(prepared, overrides = {}) {
  return {
    submitted: true,
    state: 'completed',
    conversationId: prepared.bundle.browserContext.conversationId,
    assistantTurnId: 'assistant-1',
    complete: true,
    truncated: false,
    responseText: responseFor(prepared),
    ...overrides,
  };
}

test('local route remains local and does not require browser evidence', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.LOCAL_EXECUTE);
  assert.equal(result.mayMutate, true);
});

test('Sol route without confirmed Codex browser capability fails closed as HOLD', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: { forceSol: true },
    queuePacket: queue(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.HOLD);
  assert.equal(result.mayMutate, false);
  assert.equal(result.routeDecision.reasonCodes[0], 'SOL_REQUIRED_TRANSPORT_UNAVAILABLE');
});

test('Sol route requires stable browser preflight identity before message construction', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    browserCapabilityConfirmed: true,
    browserContext: browserContext({ lastAssistantTurnId: '' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.BROWSER_PREFLIGHT_REQUIRED);
  assert.equal(result.reason, 'browser_baseline_assistant_turn_id_required');
  assert.equal(result.mayMutate, false);
});

test('malformed expected conversation input returns a structured preflight rejection', () => {
  const result = prepareSol({
    sol: { expectedConversationId: 42 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.BROWSER_PREFLIGHT_REQUIRED);
  assert.equal(result.reason, 'expectedConversationId_must_be_string');
  assert.equal(result.mayMutate, false);
});

test('malformed transport timeout returns a structured transport rejection', () => {
  const result = prepareSol({
    sol: { timeoutMs: -1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.TRANSPORT_REQUEST_REJECTED);
  assert.equal(result.reason, 'timeoutMs_must_be_positive_integer');
  assert.equal(result.mayMutate, false);
});

test('prepared Sol route emits one bounded browser action and serializable correlation bundle', () => {
  const result = prepareSol();
  assert.equal(result.ok, true);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.BROWSER_ACTION_REQUIRED);
  assert.equal(result.mayMutate, false);
  assert.equal(result.browserAction.kind, 'CODEX_BROWSER_SEND_AND_CAPTURE');
  assert.equal(result.browserAction.expectedConversationId, 'chatgpt-conversation-1');
  assert.equal(result.browserAction.baselineAssistantTurnId, 'assistant-0');
  assert.match(result.browserAction.message, /GAMEROAD_SOL_PACKET/);
  assert.ok(result.browserAction.message.includes(result.bundle.transportRequest.responseMarker));
  assert.doesNotThrow(() => JSON.stringify(result.bundle));
});

test('resume rejects a stale assistant turn', () => {
  const prepared = prepareSol();
  const result = resumeLunaSolCodexDispatch(
    prepared.bundle,
    evidenceFor(prepared, { assistantTurnId: 'assistant-0' }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.BROWSER_EVIDENCE_REJECTED);
  assert.equal(result.reason, 'browser_response_stale_turn');
  assert.equal(result.mayMutate, false);
});

test('resume rejects wrong conversation evidence', () => {
  const prepared = prepareSol();
  const result = resumeLunaSolCodexDispatch(
    prepared.bundle,
    evidenceFor(prepared, { conversationId: 'different-conversation' }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'browser_response_conversation_mismatch');
});

test('resume rejects response missing exact transport correlation marker', () => {
  const prepared = prepareSol();
  const result = resumeLunaSolCodexDispatch(
    prepared.bundle,
    evidenceFor(prepared, { responseText: '```sol-reasoning-response\n{}\n```' }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'browser_response_correlation_marker_missing');
});

test('validated Sol PLAN remains a reviewed proposal and never grants mutation', () => {
  const prepared = prepareSol();
  const result = resumeLunaSolCodexDispatch(prepared.bundle, evidenceFor(prepared));
  assert.equal(result.ok, true);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.SOL_RESPONSE_VALIDATED);
  assert.equal(result.response.disposition, 'PLAN');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION');
});

test('validated NO_CHANGE remains non-mutating and surfaces acceptance verification', () => {
  const prepared = prepareSol();
  const noChangeText = responseFor(prepared, {
    disposition: 'NO_CHANGE',
    decision: 'No mutation is required by current evidence.',
    filesToChange: [],
    implementationOrder: [],
    tests: [],
    rollback: [],
  });
  const result = resumeLunaSolCodexDispatch(
    prepared.bundle,
    evidenceFor(prepared, { responseText: noChangeText }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.response.disposition, 'NO_CHANGE');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE');
});

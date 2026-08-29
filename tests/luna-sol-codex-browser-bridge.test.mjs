import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_BROWSER_BRIDGE_STATUS,
  CODEX_BROWSER_ROUNDTRIP_RECEIPT_SCHEMA_VERSION,
  prepareLunaSolCodexDispatch,
  resumeLunaSolCodexDispatch,
  verifyLunaSolCodexRoundTripReceipt,
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

function evidenceItem(overrides = {}) {
  return {
    id: 'failure-current',
    tier: 'HOT',
    state: 'CURRENT_EXECUTION_EVIDENCE',
    role: 'FAILURE_EVIDENCE',
    claimMode: 'CURRENT',
    text: 'A prior bounded attempt failed without mutation leakage.',
    available: true,
    required: true,
    priority: 20,
    resolves: [],
    emitsIssues: [],
    authorityClass: 'bounded-test',
    version: 'r1',
    provenance: 'test fixture',
    freshness: 'current',
    ...overrides,
  };
}

function jitEvidence(overrides = {}) {
  return {
    schemaVersion: 'gameroad-jit-evidence-v1',
    decisionQuestion: 'What bounded decision is required before mutation?',
    requiredHotIds: ['authority-current', 'failure-current'],
    evidence: [
      evidenceItem({
        id: 'authority-current',
        state: 'CURRENT_AUTHORITY',
        role: 'AUTHORITY',
        text: 'Current authority permits only the bounded example target.',
        priority: 30,
        authorityClass: 'CURRENT_AUTHORITY',
      }),
      evidenceItem(),
    ],
    issues: [],
    relations: [],
    maxContextBytes: 3000,
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
      {
        id: 'raw-bypass',
        text: 'RAW-CONTEXT-MUST-NOT-REACH-SOL',
        priority: 999,
        required: true,
      },
    ],
    jitEvidence: jitEvidence(),
    ...overrides,
  });
}

function selectedSolRef(prepared, evidenceClass) {
  const match = prepared.bundle.evidenceSelection.solEvidenceRefs
    .find((item) => item.evidenceClass === evidenceClass);
  assert.ok(match, `missing ${evidenceClass} evidence binding`);
  return match.solRef;
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
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: [
      selectedSolRef(prepared, 'authority'),
      selectedSolRef(prepared, 'actual'),
    ],
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

test('local route remains local and does not require browser or JIT evidence', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: {
      acceptanceKnown: true,
      rootCauseKnown: true,
      implementationRisk: 'LOW',
      reversibility: 'EASY',
    },
    queuePacket: queue(),
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

test('Sol route requires stable browser preflight identity before JIT evidence is evaluated', () => {
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

test('Sol route with valid browser preflight requires JIT evidence before message construction', () => {
  const result = prepareLunaSolCodexDispatch({
    routerInput: { forceSol: true },
    queuePacket: queue(),
    browserCapabilityConfirmed: true,
    browserContext: browserContext(),
    context: [{ id: 'raw', text: 'raw context', required: true }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REQUIRED);
  assert.equal(result.reason, 'jit_evidence_required');
  assert.equal(result.mayMutate, false);
  assert.equal(result.browserAction, undefined);
});

test('malformed JIT evidence is rejected before browser action', () => {
  const result = prepareSol({
    jitEvidence: { ...jitEvidence(), schemaVersion: 'wrong-schema' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REJECTED);
  assert.equal(result.reason, 'jit_evidence:schema_version');
  assert.equal(result.browserAction, undefined);
});

test('unresolved material evidence returns retrieval ids instead of a browser action', () => {
  const packet = jitEvidence();
  packet.issues = [{ id: 'missing-authority', material: true, resolved: false }];
  packet.evidence.push(evidenceItem({
    id: 'authority-missing',
    tier: 'WARM',
    state: 'CURRENT_AUTHORITY',
    role: 'AUTHORITY',
    text: '',
    available: false,
    required: false,
    priority: 10,
    resolves: ['missing-authority'],
    authorityClass: 'current',
  }));
  packet.relations = [{
    fromIssue: 'missing-authority',
    toEvidence: 'authority-missing',
    material: true,
    kind: 'MATERIAL_RELATION',
  }];

  const result = prepareSol({ jitEvidence: packet });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_NEEDED);
  assert.deepEqual(result.nextRetrievalIds, ['authority-missing']);
  assert.deepEqual(result.unresolvedIssues, ['missing-authority']);
  assert.equal(result.browserAction, undefined);
});

test('evidence budget blockage stops before browser action', () => {
  const packet = jitEvidence({ maxContextBytes: 1800 });
  packet.issues = [{ id: 'large-detail', material: true, resolved: false }];
  packet.evidence.push(evidenceItem({
    id: 'large-warm',
    tier: 'WARM',
    state: 'CURRENT_ARTIFACT',
    role: 'DETAIL',
    text: 'x'.repeat(2000),
    available: true,
    required: false,
    priority: 10,
    resolves: ['large-detail'],
  }));
  packet.relations = [{
    fromIssue: 'large-detail',
    toEvidence: 'large-warm',
    material: true,
    kind: 'MATERIAL_RELATION',
  }];

  const result = prepareSol({ jitEvidence: packet });
  assert.equal(result.ok, false);
  assert.equal(result.status, CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_BUDGET_BLOCKED);
  assert.deepEqual(result.unresolvedIssues, ['large-detail']);
  assert.equal(result.browserAction, undefined);
});

test('READY JIT evidence is the only context allowed into the Sol reasoning packet', () => {
  const packet = jitEvidence();
  packet.evidence.push(evidenceItem({
    id: 'quarantined-secret',
    tier: 'QUARANTINE',
    state: 'INPUT_PROHIBITED',
    role: 'HISTORICAL',
    claimMode: 'REFERENCE',
    text: 'MUST-NOT-REACH-SOL',
    available: true,
    required: false,
    priority: 1000,
    authorityClass: 'forbidden',
    version: 'old',
    freshness: 'historical',
  }));

  const result = prepareSol({ jitEvidence: packet });
  assert.equal(result.ok, true);
  const wireContext = JSON.stringify(result.bundle.reasoningPacket.c);
  assert.match(wireContext, /authority-current/);
  assert.match(wireContext, /failure-current/);
  assert.match(wireContext, /GAMEROAD_EVIDENCE_CONTEXT_V1/);
  assert.doesNotMatch(wireContext, /RAW-CONTEXT-MUST-NOT-REACH-SOL/);
  assert.doesNotMatch(wireContext, /MUST-NOT-REACH-SOL/);
  assert.equal(result.bundle.evidenceSelection.status, 'READY');
  assert.deepEqual(
    result.bundle.evidenceSelection.selectedEvidence.map((item) => item.id),
    ['authority-current', 'failure-current'],
  );
  assert.equal(result.bundle.evidenceSelection.solEvidenceRefs.length, 2);
  assert.equal(
    result.bundle.evidenceSelection.solEvidenceRefs.find((item) => item.id === 'authority-current').evidenceClass,
    'authority',
  );
  assert.equal(
    result.bundle.evidenceSelection.solEvidenceRefs.find((item) => item.id === 'failure-current').evidenceClass,
    'actual',
  );
  assert.ok(['LEGACY_TYPED_ALIAS', 'CANONICAL_METADATA'].includes(
    result.bundle.evidenceSelection.solEvidenceBindingMode,
  ));
});

test('evidence class comes from trusted metadata instead of a spoofable source id prefix', () => {
  const packet = jitEvidence();
  packet.requiredHotIds = ['authority-current', 'authority:spoofed-failure'];
  packet.evidence = packet.evidence.map((item) => item.id === 'failure-current'
    ? { ...item, id: 'authority:spoofed-failure' }
    : item);

  const result = prepareSol({ jitEvidence: packet });
  assert.equal(result.ok, true);
  const binding = result.bundle.evidenceSelection.solEvidenceRefs
    .find((item) => item.id === 'authority:spoofed-failure');
  assert.equal(binding.evidenceClass, 'actual');
  if (result.bundle.evidenceSelection.solEvidenceBindingMode === 'LEGACY_TYPED_ALIAS') {
    assert.match(binding.solRef, /^actual:/);
    assert.notEqual(binding.solRef, 'authority:spoofed-failure');
  } else {
    assert.equal(binding.solRef, 'authority:spoofed-failure');
  }
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
  assert.equal(result.bundle.evidenceSelection.status, 'READY');
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

test('validated Sol PLAN remains a reviewed proposal and emits a deterministic round-trip receipt', () => {
  const prepared = prepareSol();
  const evidence = evidenceFor(prepared);
  const first = resumeLunaSolCodexDispatch(prepared.bundle, evidence);
  const second = resumeLunaSolCodexDispatch(prepared.bundle, evidence);
  assert.equal(first.ok, true);
  assert.equal(first.status, CODEX_BROWSER_BRIDGE_STATUS.SOL_RESPONSE_VALIDATED);
  assert.equal(first.response.disposition, 'PLAN');
  assert.equal(first.mayMutate, false);
  assert.equal(first.executorAction, 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION');
  assert.deepEqual(first.roundTripReceipt, second.roundTripReceipt);
  assert.equal(first.roundTripReceipt.schemaVersion, CODEX_BROWSER_ROUNDTRIP_RECEIPT_SCHEMA_VERSION);
  assert.equal(first.roundTripReceipt.baselineAssistantTurnId, 'assistant-0');
  assert.equal(first.roundTripReceipt.assistantTurnId, 'assistant-1');
  assert.equal(first.roundTripReceipt.mayMutate, false);
  assert.match(first.roundTripReceipt.responseSha256, /^[a-f0-9]{64}$/);
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
  assert.equal(result.roundTripReceipt.disposition, 'NO_CHANGE');
  assert.equal(result.mayMutate, false);
  assert.equal(result.executorAction, 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE');
});

test('round-trip receipt verifies against the original bundle and browser evidence', () => {
  const prepared = prepareSol();
  const evidence = evidenceFor(prepared);
  const resumed = resumeLunaSolCodexDispatch(prepared.bundle, evidence);
  const verified = verifyLunaSolCodexRoundTripReceipt(resumed.roundTripReceipt, prepared.bundle, evidence);
  assert.equal(verified.ok, true);
  assert.equal(verified.status, CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_VERIFIED);
  assert.equal(verified.mayMutate, false);
  assert.deepEqual(verified.receipt, resumed.roundTripReceipt);
});

test('tampered round-trip receipt is rejected even when source browser evidence remains valid', () => {
  const prepared = prepareSol();
  const evidence = evidenceFor(prepared);
  const resumed = resumeLunaSolCodexDispatch(prepared.bundle, evidence);
  const tampered = {
    ...resumed.roundTripReceipt,
    assistantTurnId: 'assistant-forged',
  };
  const verified = verifyLunaSolCodexRoundTripReceipt(tampered, prepared.bundle, evidence);
  assert.equal(verified.ok, false);
  assert.equal(verified.status, CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_REJECTED);
  assert.equal(verified.reason, 'roundtrip_receipt_mismatch');
  assert.equal(verified.mayMutate, false);
});

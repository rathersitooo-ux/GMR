import { createHash } from 'node:crypto';

import { normalizeQueuePacket } from './executor-bus-packet.mjs';
import { packReasoningPacket } from './executor-bus-packet-compressor.mjs';
import { buildTransportMessage, normalizeTransportRequest } from './chatgpt-browser-transport-core.mjs';
import { compileJitEvidencePacket } from './jit-evidence-compiler.mjs';
import { ROUTES, routeLunaSol } from './luna-sol-router-core.mjs';
import * as SolReasoningProtocol from './sol-reasoning-protocol.mjs';

const { buildSolPrompt, parseSolResponse } = SolReasoningProtocol;

export const CODEX_BROWSER_BRIDGE_SCHEMA_VERSION = 'gameroad-codex-browser-bridge-v1';
export const CODEX_BROWSER_ROUNDTRIP_RECEIPT_SCHEMA_VERSION = 'gameroad-codex-browser-roundtrip-receipt-v1';

export const CODEX_BROWSER_BRIDGE_STATUS = Object.freeze({
  LOCAL_EXECUTE: 'LOCAL_EXECUTE',
  HOLD: 'HOLD',
  JIT_EVIDENCE_REQUIRED: 'JIT_EVIDENCE_REQUIRED',
  JIT_EVIDENCE_REJECTED: 'JIT_EVIDENCE_REJECTED',
  JIT_EVIDENCE_NEEDED: 'JIT_EVIDENCE_NEEDED',
  JIT_EVIDENCE_BUDGET_BLOCKED: 'JIT_EVIDENCE_BUDGET_BLOCKED',
  PACKET_REJECTED: 'PACKET_REJECTED',
  PROMPT_REJECTED: 'PROMPT_REJECTED',
  TRANSPORT_REQUEST_REJECTED: 'TRANSPORT_REQUEST_REJECTED',
  BROWSER_PREFLIGHT_REQUIRED: 'BROWSER_PREFLIGHT_REQUIRED',
  BROWSER_ACTION_REQUIRED: 'BROWSER_ACTION_REQUIRED',
  BROWSER_EVIDENCE_REJECTED: 'BROWSER_EVIDENCE_REJECTED',
  RESPONSE_REJECTED: 'RESPONSE_REJECTED',
  SOL_RESPONSE_VALIDATED: 'SOL_RESPONSE_VALIDATED',
  ROUNDTRIP_RECEIPT_REJECTED: 'ROUNDTRIP_RECEIPT_REJECTED',
  ROUNDTRIP_RECEIPT_VERIFIED: 'ROUNDTRIP_RECEIPT_VERIFIED',
});

const SOL_ROUTES = new Set([
  ROUTES.SOL_PRECHECK,
  ROUTES.SOL_FAILURE_REQUERY,
  ROUTES.SOL_ESCALATE,
]);

const ROUNDTRIP_RECEIPT_KEYS = new Set([
  'schemaVersion',
  'kind',
  'taskId',
  'workUnitKey',
  'acquireKey',
  'requestId',
  'reasoningPacketFingerprint',
  'packetId',
  'transportCorrelationId',
  'transportResponseMarker',
  'conversationId',
  'baselineAssistantTurnId',
  'assistantTurnId',
  'responseSha256',
  'disposition',
  'validatedStatus',
  'mayMutate',
]);

const SOL_CANONICAL_EVIDENCE_ENVELOPE_VERSION = 'gameroad-evidence-context-v1';
const CURRENT_EVIDENCE_STATES = new Set([
  'CURRENT_AUTHORITY',
  'CURRENT_ARTIFACT',
  'CURRENT_EXECUTION_EVIDENCE',
]);
const AUTHORITY_ROLES = new Set(['AUTHORITY']);
const USER_ROLES = new Set(['USER', 'USER_INTENT', 'USER_REQUEST']);
const ACTUAL_ROLES = new Set(['ACTUAL', 'DIRECT_ACTUAL', 'CURRENT_ACTUAL', 'EXECUTION_EVIDENCE', 'FAILURE_EVIDENCE']);
const TEST_ROLES = new Set(['TEST', 'DISCRIMINATING_TEST', 'ACCEPTANCE_TEST', 'VERIFICATION_TEST', 'TEST_RESULT']);
const COUNTER_ROLES = new Set(['COUNTER', 'COUNTEREVIDENCE', 'COUNTER_EVIDENCE', 'CONTRARY_EVIDENCE']);

function cleanString(value, name, { optional = false, max = 4096 } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (!out && !optional) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function fail(status, routeDecision, reason, extras = {}) {
  return {
    ok: false,
    status,
    mayMutate: false,
    routeDecision,
    reason,
    ...extras,
  };
}

function routeMode(route) {
  if (route === ROUTES.SOL_FAILURE_REQUERY || route === ROUTES.SOL_ESCALATE) {
    return 'FAILURE_RECOVERY';
  }
  return 'DESIGN_DECISION';
}

function routeQuestion(route) {
  if (route === ROUTES.SOL_FAILURE_REQUERY || route === ROUTES.SOL_ESCALATE) {
    return 'Given the bounded packet and failure evidence, what is the safest next decision before another mutation attempt?';
  }
  return 'What bounded decision is required before mutation while preserving every acceptance clause and mutable boundary?';
}

function identityFromPrompt(promptBuilt) {
  return {
    packetId: `grp1:${promptBuilt.request.reasoningPacketFingerprint}`,
    correlationId: `sol:${promptBuilt.request.requestId}`,
  };
}

function hashText(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validateMutationQueue(queuePacket) {
  if (!queuePacket) return { ok: false, reason: 'local_mutation_queue_required' };
  const checked = normalizeQueuePacket(queuePacket);
  if (!checked.ok) return { ok: false, reason: `queue_${checked.reason}` };
  return checked;
}

function normalizeBrowserContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('browser_context_must_be_object');
  }
  return {
    pageReady: input.pageReady === true,
    loading: input.loading === true,
    composerReady: input.composerReady === true,
    appError: input.appError == null ? '' : String(input.appError),
    conversationId: cleanString(input.conversationId ?? '', 'browser_context_conversationId', { optional: true, max: 500 }),
    lastAssistantTurnId: cleanString(input.lastAssistantTurnId ?? '', 'browser_context_lastAssistantTurnId', { optional: true, max: 500 }),
  };
}

function preflightProblem(context, expectedConversationId) {
  if (!context.pageReady || context.loading) return 'browser_page_not_ready';
  if (context.appError) return `browser_app_error:${context.appError}`;
  if (!context.composerReady) return 'browser_composer_not_ready';
  if (!context.conversationId) return 'browser_conversation_id_required';
  if (!context.lastAssistantTurnId) return 'browser_baseline_assistant_turn_id_required';
  if (expectedConversationId && context.conversationId !== expectedConversationId) {
    return `browser_wrong_conversation:expected=${expectedConversationId};actual=${context.conversationId}`;
  }
  return '';
}

function normalizePreparedBundle(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('prepared_bundle_must_be_object');
  if (input.schemaVersion !== CODEX_BROWSER_BRIDGE_SCHEMA_VERSION) throw new Error('prepared_bundle_schema_version');
  if (!input.reasoningPacket) throw new Error('prepared_bundle_reasoning_packet_required');
  if (!input.solRequest || typeof input.solRequest !== 'object') throw new Error('prepared_bundle_sol_request_required');
  if (!input.transportRequest || typeof input.transportRequest !== 'object') throw new Error('prepared_bundle_transport_request_required');
  if (!input.browserContext || typeof input.browserContext !== 'object') throw new Error('prepared_bundle_browser_context_required');
  return input;
}

function normalizeBrowserEvidence(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('browser_evidence_must_be_object');
  }
  return {
    submitted: input.submitted === true,
    state: cleanString(input.state ?? '', 'browser_evidence_state', { optional: true, max: 80 }),
    conversationId: cleanString(input.conversationId ?? '', 'browser_evidence_conversationId', { optional: true, max: 500 }),
    assistantTurnId: cleanString(input.assistantTurnId ?? '', 'browser_evidence_assistantTurnId', { optional: true, max: 500 }),
    complete: input.complete === true,
    truncated: input.truncated === true,
    responseText: cleanString(input.responseText ?? '', 'browser_evidence_responseText', { optional: true, max: 200000 }),
    appError: input.appError == null ? '' : String(input.appError),
  };
}

function validateBrowserEvidence(bundle, evidence) {
  if (!evidence.submitted) return 'browser_submit_not_confirmed';
  if (evidence.state && evidence.state !== 'completed') return `browser_assistant_state:${evidence.state}`;
  if (evidence.appError) return `browser_app_error:${evidence.appError}`;
  if (!evidence.conversationId) return 'browser_response_conversation_id_required';
  if (evidence.conversationId !== bundle.browserContext.conversationId) return 'browser_response_conversation_mismatch';
  if (!evidence.assistantTurnId) return 'browser_response_assistant_turn_id_required';
  if (evidence.assistantTurnId === bundle.browserContext.lastAssistantTurnId) return 'browser_response_stale_turn';
  if (!evidence.complete) return 'browser_response_not_complete';
  if (evidence.truncated) return 'browser_response_truncated';
  if (!evidence.responseText) return 'browser_response_empty';
  if (!evidence.responseText.includes(bundle.transportRequest.responseMarker)) return 'browser_response_correlation_marker_missing';
  return '';
}

function buildRoundTripReceipt(bundle, evidence, parsed) {
  return {
    schemaVersion: CODEX_BROWSER_ROUNDTRIP_RECEIPT_SCHEMA_VERSION,
    kind: 'codex-sol-browser-roundtrip',
    taskId: bundle.solRequest.taskId,
    workUnitKey: bundle.solRequest.workUnitKey,
    acquireKey: bundle.solRequest.acquireKey,
    requestId: bundle.solRequest.requestId,
    reasoningPacketFingerprint: bundle.solRequest.reasoningPacketFingerprint,
    packetId: bundle.transportRequest.packetId,
    transportCorrelationId: bundle.transportRequest.correlationId,
    transportResponseMarker: bundle.transportRequest.responseMarker,
    conversationId: evidence.conversationId,
    baselineAssistantTurnId: bundle.browserContext.lastAssistantTurnId,
    assistantTurnId: evidence.assistantTurnId,
    responseSha256: hashText(evidence.responseText),
    disposition: parsed.response.disposition,
    validatedStatus: CODEX_BROWSER_BRIDGE_STATUS.SOL_RESPONSE_VALIDATED,
    mayMutate: false,
  };
}

function normalizeRoundTripReceipt(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('roundtrip_receipt_must_be_object');
  for (const key of Object.keys(input)) {
    if (!ROUNDTRIP_RECEIPT_KEYS.has(key)) throw new Error(`roundtrip_receipt_unknown_key:${key}`);
  }
  for (const key of ROUNDTRIP_RECEIPT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) throw new Error(`roundtrip_receipt_missing_key:${key}`);
  }
  const receipt = {
    schemaVersion: cleanString(input.schemaVersion, 'roundtrip_receipt_schemaVersion', { max: 120 }),
    kind: cleanString(input.kind, 'roundtrip_receipt_kind', { max: 80 }),
    taskId: cleanString(input.taskId, 'roundtrip_receipt_taskId', { max: 240 }),
    workUnitKey: cleanString(input.workUnitKey, 'roundtrip_receipt_workUnitKey', { max: 240 }),
    acquireKey: cleanString(input.acquireKey, 'roundtrip_receipt_acquireKey', { max: 300 }),
    requestId: cleanString(input.requestId, 'roundtrip_receipt_requestId', { max: 120 }),
    reasoningPacketFingerprint: cleanString(input.reasoningPacketFingerprint, 'roundtrip_receipt_reasoningPacketFingerprint', { max: 120 }),
    packetId: cleanString(input.packetId, 'roundtrip_receipt_packetId', { max: 300 }),
    transportCorrelationId: cleanString(input.transportCorrelationId, 'roundtrip_receipt_transportCorrelationId', { max: 300 }),
    transportResponseMarker: cleanString(input.transportResponseMarker, 'roundtrip_receipt_transportResponseMarker', { max: 500 }),
    conversationId: cleanString(input.conversationId, 'roundtrip_receipt_conversationId', { max: 500 }),
    baselineAssistantTurnId: cleanString(input.baselineAssistantTurnId, 'roundtrip_receipt_baselineAssistantTurnId', { max: 500 }),
    assistantTurnId: cleanString(input.assistantTurnId, 'roundtrip_receipt_assistantTurnId', { max: 500 }),
    responseSha256: cleanString(input.responseSha256, 'roundtrip_receipt_responseSha256', { max: 64 }),
    disposition: cleanString(input.disposition, 'roundtrip_receipt_disposition', { max: 40 }),
    validatedStatus: cleanString(input.validatedStatus, 'roundtrip_receipt_validatedStatus', { max: 80 }),
    mayMutate: input.mayMutate,
  };
  if (receipt.schemaVersion !== CODEX_BROWSER_ROUNDTRIP_RECEIPT_SCHEMA_VERSION) throw new Error('roundtrip_receipt_schema_version');
  if (receipt.kind !== 'codex-sol-browser-roundtrip') throw new Error('roundtrip_receipt_kind');
  if (!/^[a-f0-9]{64}$/.test(receipt.responseSha256)) throw new Error('roundtrip_receipt_response_sha256');
  if (receipt.validatedStatus !== CODEX_BROWSER_BRIDGE_STATUS.SOL_RESPONSE_VALIDATED) throw new Error('roundtrip_receipt_validated_status');
  if (receipt.mayMutate !== false) throw new Error('roundtrip_receipt_may_mutate_false_required');
  if (receipt.assistantTurnId === receipt.baselineAssistantTurnId) throw new Error('roundtrip_receipt_stale_turn');
  return receipt;
}

function trustedSolEvidenceClass(item) {
  if (!item || item.tier !== 'HOT' || item.claimMode !== 'CURRENT' || !CURRENT_EVIDENCE_STATES.has(item.state)) return '';
  const role = String(item.role ?? '').trim().toUpperCase();
  if (item.state === 'CURRENT_AUTHORITY' && AUTHORITY_ROLES.has(role)) return 'authority';
  if (item.state === 'CURRENT_AUTHORITY' && USER_ROLES.has(role)) return 'user';
  if (item.state === 'CURRENT_EXECUTION_EVIDENCE' && TEST_ROLES.has(role)) return 'test';
  if (item.state === 'CURRENT_EXECUTION_EVIDENCE' && COUNTER_ROLES.has(role)) return 'counter';
  if (
    (item.state === 'CURRENT_ARTIFACT' || item.state === 'CURRENT_EXECUTION_EVIDENCE')
    && ACTUAL_ROLES.has(role)
  ) return 'actual';
  return '';
}

function legacyTypedEvidenceRef(item, evidenceClass) {
  const digest = createHash('sha256').update(item.id, 'utf8').digest('base64url').slice(0, 22);
  return `${evidenceClass}:${digest}`;
}

function bindJitEvidenceForSol(compiled) {
  const canonicalMetadataSupported = SolReasoningProtocol.SOL_EVIDENCE_CONTEXT_ENVELOPE_VERSION
    === SOL_CANONICAL_EVIDENCE_ENVELOPE_VERSION;
  const metadataById = new Map(compiled.selectedEvidence.map((item) => [item.id, item]));
  const seenRefs = new Set();
  const solEvidenceRefs = [];
  const contextItems = compiled.contextItems.map((contextItem) => {
    const metadata = metadataById.get(contextItem.id);
    if (!metadata) throw new Error(`selected_metadata_missing:${contextItem.id}`);
    const evidenceClass = trustedSolEvidenceClass(metadata);
    const solRef = !canonicalMetadataSupported && evidenceClass
      ? legacyTypedEvidenceRef(metadata, evidenceClass)
      : contextItem.id;
    if (seenRefs.has(solRef)) throw new Error(`sol_evidence_ref_collision:${solRef}`);
    seenRefs.add(solRef);
    solEvidenceRefs.push({
      id: contextItem.id,
      solRef,
      evidenceClass,
    });
    return solRef === contextItem.id ? contextItem : { ...contextItem, id: solRef };
  });
  return {
    mode: canonicalMetadataSupported ? 'CANONICAL_METADATA' : 'LEGACY_TYPED_ALIAS',
    contextItems,
    solEvidenceRefs,
  };
}

function evidenceSelectionSummary(compiled, binding) {
  return {
    schemaVersion: compiled.schemaVersion,
    decisionQuestion: compiled.decisionQuestion,
    status: compiled.status,
    selectedEvidence: compiled.selectedEvidence,
    includedByTier: compiled.includedByTier,
    unresolvedIssues: compiled.unresolvedIssues,
    metrics: compiled.metrics,
    solEvidenceBindingMode: binding.mode,
    solEvidenceRefs: binding.solEvidenceRefs,
  };
}

export function prepareLunaSolCodexDispatch(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('codex_bridge_input_must_be_object');
  }

  const queuePacket = input.queuePacket ?? null;
  const browserCapabilityConfirmed = input.browserCapabilityConfirmed === true;
  const routeDecision = routeLunaSol({
    ...(input.routerInput ?? {}),
    transportAvailable: browserCapabilityConfirmed,
    packetReady: Boolean(queuePacket),
  });

  if (routeDecision.route === ROUTES.LOCAL_EXECUTE) {
    const queueChecked = validateMutationQueue(queuePacket);
    if (!queueChecked.ok) {
      return fail(CODEX_BROWSER_BRIDGE_STATUS.PACKET_REJECTED, routeDecision, queueChecked.reason);
    }
    return {
      ok: true,
      status: CODEX_BROWSER_BRIDGE_STATUS.LOCAL_EXECUTE,
      mayMutate: true,
      routeDecision,
      queuePacket: queueChecked.packet,
      executorAction: 'LOCAL_ACCEPTANCE_BOUNDED_EXECUTION',
    };
  }

  if (routeDecision.route === ROUTES.HOLD) {
    return {
      ok: true,
      status: CODEX_BROWSER_BRIDGE_STATUS.HOLD,
      mayMutate: false,
      routeDecision,
      executorAction: routeDecision.reasonCodes.includes('SOL_REQUIRED_TRANSPORT_UNAVAILABLE')
        ? 'CONFIRM_CODEX_BROWSER_CAPABILITY_AND_RETRY_PREPARE'
        : 'STOP_AND_RESOLVE_HOLD',
    };
  }

  if (!SOL_ROUTES.has(routeDecision.route)) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.HOLD, routeDecision, `unsupported_route:${routeDecision.route}`);
  }

  let browserContext;
  try {
    browserContext = normalizeBrowserContext(input.browserContext ?? {});
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.BROWSER_PREFLIGHT_REQUIRED, routeDecision, error.message ?? String(error));
  }

  let expectedConversationId;
  try {
    expectedConversationId = cleanString(
      input.sol?.expectedConversationId ?? '',
      'expectedConversationId',
      { optional: true, max: 500 },
    );
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.BROWSER_PREFLIGHT_REQUIRED, routeDecision, error.message ?? String(error), {
      executorAction: 'REPAIR_SOL_BROWSER_PREFLIGHT_INPUT_AND_RETRY_PREPARE',
    });
  }

  const preflightIssue = preflightProblem(browserContext, expectedConversationId);
  if (preflightIssue) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.BROWSER_PREFLIGHT_REQUIRED, routeDecision, preflightIssue, {
      executorAction: 'INSPECT_CODEX_BROWSER_CONTEXT_AND_RETRY_PREPARE',
      requiredBrowserContext: [
        'pageReady=true',
        'loading=false',
        'composerReady=true',
        'stable conversationId',
        'stable lastAssistantTurnId captured before submit',
      ],
    });
  }

  if (!input.jitEvidence) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REQUIRED, routeDecision, 'jit_evidence_required', {
      executorAction: 'BUILD_JIT_EVIDENCE_PACKET_AND_RETRY_PREPARE',
      nextRetrievalIds: [],
    });
  }

  const compiled = compileJitEvidencePacket(input.jitEvidence);
  if (!compiled.ok) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REJECTED, routeDecision, `jit_evidence:${compiled.reason}`, {
      evidenceStatus: compiled.status ?? null,
      evidenceMetrics: compiled.metrics ?? null,
      executorAction: 'REPAIR_JIT_EVIDENCE_PACKET_AND_RETRY_PREPARE',
    });
  }

  if (compiled.status === 'NEEDS_EVIDENCE') {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_NEEDED, routeDecision, 'jit_evidence:needs_evidence', {
      nextRetrievalIds: compiled.nextRetrievalIds,
      unresolvedIssues: compiled.unresolvedIssues,
      evidenceMetrics: compiled.metrics,
      executorAction: 'RETRIEVE_JIT_EVIDENCE_AND_RETRY_PREPARE',
    });
  }

  if (compiled.status === 'BUDGET_BLOCKED') {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_BUDGET_BLOCKED, routeDecision, 'jit_evidence:budget_blocked', {
      nextRetrievalIds: compiled.nextRetrievalIds,
      unresolvedIssues: compiled.unresolvedIssues,
      evidenceMetrics: compiled.metrics,
      executorAction: 'REDUCE_OR_REPRIORITIZE_JIT_EVIDENCE_AND_RETRY_PREPARE',
    });
  }

  if (compiled.status !== 'READY') {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REJECTED, routeDecision, `jit_evidence:unexpected_status:${compiled.status}`, {
      evidenceMetrics: compiled.metrics ?? null,
      executorAction: 'REPAIR_JIT_EVIDENCE_PACKET_AND_RETRY_PREPARE',
    });
  }

  let solEvidenceBinding;
  try {
    solEvidenceBinding = bindJitEvidenceForSol(compiled);
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.JIT_EVIDENCE_REJECTED, routeDecision, `jit_evidence_binding:${error.message ?? String(error)}`, {
      evidenceMetrics: compiled.metrics ?? null,
      executorAction: 'REPAIR_JIT_EVIDENCE_PACKET_AND_RETRY_PREPARE',
    });
  }

  const packed = packReasoningPacket(queuePacket, solEvidenceBinding.contextItems, {
    maxWireBytes: input.maxWireBytes ?? 3000,
  });
  if (!packed.ok) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.PACKET_REJECTED, routeDecision, packed.reason, {
      packetMetrics: packed.metrics ?? null,
    });
  }

  const promptBuilt = buildSolPrompt(packed.packet, {
    mode: input.sol?.mode ?? routeMode(routeDecision.route),
    question: input.sol?.question ?? routeQuestion(routeDecision.route),
  });
  if (!promptBuilt.ok) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.PROMPT_REJECTED, routeDecision, promptBuilt.reason, {
      packetMetrics: packed.metrics,
    });
  }

  const { packetId, correlationId } = identityFromPrompt(promptBuilt);
  let transportRequest;
  try {
    transportRequest = normalizeTransportRequest({
      taskId: promptBuilt.request.taskId,
      workUnitKey: promptBuilt.request.workUnitKey,
      acquireKey: promptBuilt.request.acquireKey,
      packetId,
      correlationId,
      prompt: promptBuilt.prompt,
      expectedConversationId: browserContext.conversationId,
      timeoutMs: input.sol?.timeoutMs,
      idempotencyKey: input.sol?.idempotencyKey,
    });
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.TRANSPORT_REQUEST_REJECTED, routeDecision, error.message ?? String(error), {
      packetMetrics: packed.metrics,
      executorAction: 'REPAIR_TRANSPORT_REQUEST_INPUT_AND_RETRY_PREPARE',
    });
  }

  const bundle = {
    schemaVersion: CODEX_BROWSER_BRIDGE_SCHEMA_VERSION,
    routeDecision,
    reasoningPacket: packed.packet,
    solRequest: promptBuilt.request,
    transportRequest,
    browserContext,
    evidenceSelection: evidenceSelectionSummary(compiled, solEvidenceBinding),
  };

  return {
    ok: true,
    status: CODEX_BROWSER_BRIDGE_STATUS.BROWSER_ACTION_REQUIRED,
    mayMutate: false,
    routeDecision,
    packetMetrics: packed.metrics,
    bundle,
    browserAction: {
      kind: 'CODEX_BROWSER_SEND_AND_CAPTURE',
      targetHost: 'chatgpt.com',
      expectedConversationId: browserContext.conversationId,
      baselineAssistantTurnId: browserContext.lastAssistantTurnId,
      message: buildTransportMessage(transportRequest),
      requiredEvidence: [
        'submit accepted exactly once',
        'same conversationId as preflight',
        'new assistantTurnId different from baseline',
        'assistant state completed',
        'response complete and not truncated',
        'full responseText including exact correlation marker',
      ],
      retryRule: 'After a confirmed submit, never resend merely because response collection is uncertain; inspect the same conversation first.',
    },
    executorAction: 'USE_CODEX_BROWSER_ONCE_THEN_RESUME_WITH_EVIDENCE',
  };
}

export function resumeLunaSolCodexDispatch(preparedBundle, browserEvidence) {
  let bundle;
  let evidence;
  try {
    bundle = normalizePreparedBundle(preparedBundle);
    evidence = normalizeBrowserEvidence(browserEvidence);
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.BROWSER_EVIDENCE_REJECTED, null, error.message ?? String(error));
  }

  const evidenceIssue = validateBrowserEvidence(bundle, evidence);
  if (evidenceIssue) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.BROWSER_EVIDENCE_REJECTED, bundle.routeDecision, evidenceIssue, {
      executorAction: 'DO_NOT_MUTATE;REPAIR_OR_RECAPTURE_BROWSER_EVIDENCE',
    });
  }

  const parsed = parseSolResponse(evidence.responseText, bundle.solRequest, bundle.reasoningPacket);
  if (!parsed.ok) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.RESPONSE_REJECTED, bundle.routeDecision, parsed.reason, {
      executorAction: 'DO_NOT_MUTATE;REJECT_UNVALIDATED_SOL_RESPONSE',
    });
  }

  return {
    ok: true,
    status: CODEX_BROWSER_BRIDGE_STATUS.SOL_RESPONSE_VALIDATED,
    mayMutate: false,
    routeDecision: bundle.routeDecision,
    request: bundle.solRequest,
    response: parsed.response,
    browserEvidence: {
      conversationId: evidence.conversationId,
      assistantTurnId: evidence.assistantTurnId,
      complete: evidence.complete,
      truncated: evidence.truncated,
    },
    roundTripReceipt: buildRoundTripReceipt(bundle, evidence, parsed),
    executorAction: parsed.response.disposition === 'NO_CHANGE'
      ? 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE'
      : 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION',
  };
}

export function verifyLunaSolCodexRoundTripReceipt(receiptInput, preparedBundle, browserEvidence) {
  let receipt;
  try {
    receipt = normalizeRoundTripReceipt(receiptInput);
  } catch (error) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_REJECTED, null, error.message ?? String(error));
  }

  const resumed = resumeLunaSolCodexDispatch(preparedBundle, browserEvidence);
  if (!resumed.ok) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_REJECTED, resumed.routeDecision ?? null, `roundtrip_source_${resumed.reason ?? resumed.status}`);
  }

  const expected = resumed.roundTripReceipt;
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
    return fail(CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_REJECTED, resumed.routeDecision, 'roundtrip_receipt_mismatch');
  }

  return {
    ok: true,
    status: CODEX_BROWSER_BRIDGE_STATUS.ROUNDTRIP_RECEIPT_VERIFIED,
    mayMutate: false,
    routeDecision: resumed.routeDecision,
    receipt,
    executorAction: 'ARCHIVE_ROUNDTRIP_RECEIPT_WITH_BROWSER_EVIDENCE',
  };
}

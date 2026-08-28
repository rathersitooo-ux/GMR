import { normalizeQueuePacket } from './executor-bus-packet.mjs';
import { packReasoningPacket } from './executor-bus-packet-compressor.mjs';
import { buildTransportMessage, normalizeTransportRequest } from './chatgpt-browser-transport-core.mjs';
import { ROUTES, routeLunaSol } from './luna-sol-router-core.mjs';
import { buildSolPrompt, parseSolResponse } from './sol-reasoning-protocol.mjs';

export const CODEX_BROWSER_BRIDGE_SCHEMA_VERSION = 'gameroad-codex-browser-bridge-v1';

export const CODEX_BROWSER_BRIDGE_STATUS = Object.freeze({
  LOCAL_EXECUTE: 'LOCAL_EXECUTE',
  HOLD: 'HOLD',
  PACKET_REJECTED: 'PACKET_REJECTED',
  PROMPT_REJECTED: 'PROMPT_REJECTED',
  TRANSPORT_REQUEST_REJECTED: 'TRANSPORT_REQUEST_REJECTED',
  BROWSER_PREFLIGHT_REQUIRED: 'BROWSER_PREFLIGHT_REQUIRED',
  BROWSER_ACTION_REQUIRED: 'BROWSER_ACTION_REQUIRED',
  BROWSER_EVIDENCE_REJECTED: 'BROWSER_EVIDENCE_REJECTED',
  RESPONSE_REJECTED: 'RESPONSE_REJECTED',
  SOL_RESPONSE_VALIDATED: 'SOL_RESPONSE_VALIDATED',
});

const SOL_ROUTES = new Set([
  ROUTES.SOL_PRECHECK,
  ROUTES.SOL_FAILURE_REQUERY,
  ROUTES.SOL_ESCALATE,
]);

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

  const packed = packReasoningPacket(queuePacket, input.context ?? [], {
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
    executorAction: parsed.response.disposition === 'NO_CHANGE'
      ? 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE'
      : 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION',
  };
}

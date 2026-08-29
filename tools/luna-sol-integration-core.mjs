import { normalizeQueuePacket } from './executor-bus-packet.mjs';
import { packReasoningPacket, unpackReasoningPacket } from './executor-bus-packet-compressor.mjs';
import { createChatGptBrowserTransport } from './chatgpt-browser-transport-core.mjs';
import { ROUTES, routeLunaSol } from './luna-sol-router-core.mjs';
import { buildSolPrompt, parseSolResponse, validateEvidenceClaims } from './sol-reasoning-protocol.mjs';

export const INTEGRATION_STATUS = Object.freeze({
  LOCAL_EXECUTE: 'LOCAL_EXECUTE',
  HOLD: 'HOLD',
  PACKET_REJECTED: 'PACKET_REJECTED',
  PROMPT_REJECTED: 'PROMPT_REJECTED',
  TRANSPORT_FAILED: 'TRANSPORT_FAILED',
  RESPONSE_REJECTED: 'RESPONSE_REJECTED',
  SOL_RESPONSE_VALIDATED: 'SOL_RESPONSE_VALIDATED',
});

const SOL_ROUTES = new Set([
  ROUTES.SOL_PRECHECK,
  ROUTES.SOL_FAILURE_REQUERY,
  ROUTES.SOL_ESCALATE,
]);

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

function routeQuestion(routeDecision) {
  if (routeDecision.route === ROUTES.SOL_FAILURE_REQUERY || routeDecision.route === ROUTES.SOL_ESCALATE) {
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

function transportReady(driver) {
  return Boolean(
    driver
      && typeof driver === 'object'
      && typeof driver.inspectContext === 'function'
      && typeof driver.submitMessage === 'function'
      && typeof driver.waitForAssistantTurn === 'function',
  );
}

function validateMutationQueue(queuePacket) {
  if (!queuePacket) return { ok: false, reason: 'local_mutation_queue_required' };
  const checked = normalizeQueuePacket(queuePacket);
  if (!checked.ok) return { ok: false, reason: `queue_${checked.reason}` };
  return checked;
}

function freezeEvidence(queuePacket, context, maxWireBytes) {
  const packed = packReasoningPacket(queuePacket, context ?? [], { maxWireBytes });
  if (!packed.ok) return packed;
  const unpacked = unpackReasoningPacket(packed.packet);
  if (!unpacked.ok) return { ok: false, reason: `unpack_${unpacked.reason}`, metrics: packed.metrics };
  return {
    ok: true,
    packet: packed.packet,
    metrics: packed.metrics,
    fingerprint: unpacked.fingerprint,
    context: unpacked.context,
  };
}

function declaredLocalEvidenceRefs(localEvidence) {
  const refs = new Set(localEvidence?.decisionBasisRefs ?? []);
  for (const claim of localEvidence?.claims ?? []) {
    for (const key of ['evidenceRefs', 'counterEvidenceRefs', 'discriminatingTestRefs']) {
      for (const ref of claim?.[key] ?? []) refs.add(ref);
    }
  }
  return refs;
}

function promoteDeclaredContextRefs(context, localEvidence) {
  const declaredRefs = declaredLocalEvidenceRefs(localEvidence);
  return (context ?? []).map((item) => (
    item && typeof item === 'object' && !Array.isArray(item) && declaredRefs.has(item.id)
      ? { ...item, required: true }
      : item
  ));
}

function localEvidenceMode(routeDecision) {
  return routeDecision.reasonCodes.includes('KNOWN_LOCAL_REPAIR') ? 'ROOT_CAUSE' : 'DESIGN_DECISION';
}

function validateLocalMutationEvidence(input, queuePacket, routeDecision) {
  const localEvidence = input.localEvidence && typeof input.localEvidence === 'object' && !Array.isArray(input.localEvidence)
    ? input.localEvidence
    : null;
  if (!localEvidence) {
    return { ok: false, reason: 'local_evidence_required', metrics: null, fingerprint: null };
  }
  const frozenContext = promoteDeclaredContextRefs(input.context ?? [], localEvidence);
  const frozen = freezeEvidence(queuePacket, frozenContext, input.maxWireBytes ?? 3000);
  if (!frozen.ok) return { ok: false, reason: `local_evidence_packet_${frozen.reason}`, metrics: frozen.metrics ?? null };
  const checked = validateEvidenceClaims({
    mode: localEvidenceMode(routeDecision),
    disposition: 'PLAN',
    filesToChange: queuePacket.exactMutableResources,
    claims: localEvidence.claims ?? [],
    selectedCauseClaimId: localEvidence.selectedCauseClaimId ?? '',
    decisionBasisRefs: localEvidence.decisionBasisRefs ?? [],
  }, frozen.context);
  if (!checked.ok) {
    return {
      ok: false,
      reason: `local_evidence_${checked.reason}`,
      metrics: frozen.metrics,
      fingerprint: frozen.fingerprint,
    };
  }
  return {
    ok: true,
    evidence: checked,
    metrics: frozen.metrics,
    fingerprint: frozen.fingerprint,
  };
}

export async function runLunaSolDecision(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('integration_input_must_be_object');
  }

  const queuePacket = input.queuePacket ?? null;
  const driver = options.driver ?? input.driver ?? null;
  const routeDecision = routeLunaSol({
    ...(input.routerInput ?? {}),
    transportAvailable: transportReady(driver),
    packetReady: Boolean(queuePacket),
  });

  if (routeDecision.route === ROUTES.LOCAL_EXECUTE) {
    const queueChecked = validateMutationQueue(queuePacket);
    if (!queueChecked.ok) {
      return fail(INTEGRATION_STATUS.PACKET_REJECTED, routeDecision, queueChecked.reason);
    }
    const evidenceChecked = validateLocalMutationEvidence(input, queueChecked.packet, routeDecision);
    if (!evidenceChecked.ok) {
      return fail(INTEGRATION_STATUS.PACKET_REJECTED, routeDecision, evidenceChecked.reason, {
        packetMetrics: evidenceChecked.metrics ?? null,
        reasoningPacketFingerprint: evidenceChecked.fingerprint ?? null,
      });
    }
    return {
      ok: true,
      status: INTEGRATION_STATUS.LOCAL_EXECUTE,
      mayMutate: true,
      routeDecision,
      queuePacket: queueChecked.packet,
      packetMetrics: evidenceChecked.metrics,
      reasoningPacketFingerprint: evidenceChecked.fingerprint,
      evidence: evidenceChecked.evidence,
      executorAction: 'LOCAL_ACCEPTANCE_BOUNDED_EXECUTION',
    };
  }

  if (routeDecision.route === ROUTES.HOLD) {
    return {
      ok: true,
      status: INTEGRATION_STATUS.HOLD,
      mayMutate: false,
      routeDecision,
      executorAction: 'STOP_AND_RESOLVE_HOLD',
    };
  }

  if (!SOL_ROUTES.has(routeDecision.route)) {
    return fail(INTEGRATION_STATUS.HOLD, routeDecision, `unsupported_route:${routeDecision.route}`);
  }

  const packed = packReasoningPacket(queuePacket, input.context ?? [], {
    maxWireBytes: input.maxWireBytes ?? 3000,
  });
  if (!packed.ok) {
    return fail(INTEGRATION_STATUS.PACKET_REJECTED, routeDecision, packed.reason, {
      packetMetrics: packed.metrics ?? null,
    });
  }

  const promptBuilt = buildSolPrompt(packed.packet, {
    mode: input.sol?.mode ?? routeMode(routeDecision.route),
    question: input.sol?.question ?? routeQuestion(routeDecision),
  });
  if (!promptBuilt.ok) {
    return fail(INTEGRATION_STATUS.PROMPT_REJECTED, routeDecision, promptBuilt.reason, {
      packetMetrics: packed.metrics,
    });
  }

  const { packetId, correlationId } = identityFromPrompt(promptBuilt);
  let transport;
  try {
    transport = createChatGptBrowserTransport({ driver });
  } catch (error) {
    return fail(INTEGRATION_STATUS.HOLD, routeDecision, error.message ?? String(error), {
      packetMetrics: packed.metrics,
    });
  }

  const transportResult = await transport.run({
    taskId: promptBuilt.request.taskId,
    workUnitKey: promptBuilt.request.workUnitKey,
    acquireKey: promptBuilt.request.acquireKey,
    packetId,
    correlationId,
    prompt: promptBuilt.prompt,
    expectedConversationId: input.sol?.expectedConversationId ?? '',
    timeoutMs: input.sol?.timeoutMs,
    idempotencyKey: input.sol?.idempotencyKey,
  });

  if (!transportResult.ok) {
    return fail(INTEGRATION_STATUS.TRANSPORT_FAILED, routeDecision, transportResult.status, {
      packetMetrics: packed.metrics,
      transport: transportResult,
      request: promptBuilt.request,
    });
  }

  const parsed = parseSolResponse(transportResult.responseText, promptBuilt.request, packed.packet);
  if (!parsed.ok) {
    return fail(INTEGRATION_STATUS.RESPONSE_REJECTED, routeDecision, parsed.reason, {
      packetMetrics: packed.metrics,
      transport: transportResult,
      request: promptBuilt.request,
    });
  }

  return {
    ok: true,
    status: INTEGRATION_STATUS.SOL_RESPONSE_VALIDATED,
    mayMutate: false,
    routeDecision,
    packetMetrics: packed.metrics,
    request: promptBuilt.request,
    response: parsed.response,
    transport: transportResult,
    executorAction: parsed.response.disposition === 'NO_CHANGE'
      ? 'REVIEW_NO_CHANGE_AND_VERIFY_ACCEPTANCE'
      : 'REVIEW_SOL_DECISION_BEFORE_ANY_MUTATION',
  };
}

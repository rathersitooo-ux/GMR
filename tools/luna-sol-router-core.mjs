export const ROUTER_SCHEMA_VERSION = 'gameroad-luna-sol-router-v2';

export const ROUTES = Object.freeze({
  LOCAL_EXECUTE: 'LOCAL_EXECUTE',
  SOL_PRECHECK: 'SOL_PRECHECK',
  SOL_FAILURE_REQUERY: 'SOL_FAILURE_REQUERY',
  SOL_ESCALATE: 'SOL_ESCALATE',
  HOLD: 'HOLD',
});

const SCOPE_BREADTH = new Set(['LOCAL', 'MULTI_FILE', 'CROSS_CUTTING']);
const IMPLEMENTATION_RISK = new Set(['LOW', 'MEDIUM', 'HIGH']);
const REVERSIBILITY = new Set(['EASY', 'COSTLY', 'IRREVERSIBLE']);

function cleanEnum(value, name, allowed, fallback) {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== 'string' || !allowed.has(candidate)) {
    throw new Error(`${name}_invalid`);
  }
  return candidate;
}

function cleanBoolean(value, name, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${name}_must_be_boolean`);
  return value;
}

function cleanFailureCount(value) {
  if (value == null) return 0;
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw new Error('failureCount_must_be_nonnegative_integer');
  }
  return value;
}

function cleanOptionalString(value, name, max = 300) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

export function normalizeRouterInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('router_input_must_be_object');
  }

  return {
    taskId: cleanOptionalString(input.taskId, 'taskId', 240),
    workUnitKey: cleanOptionalString(input.workUnitKey, 'workUnitKey', 240),
    acquireKey: cleanOptionalString(input.acquireKey, 'acquireKey', 300),
    scopeBreadth: cleanEnum(input.scopeBreadth, 'scopeBreadth', SCOPE_BREADTH, 'LOCAL'),
    specConflict: cleanBoolean(input.specConflict, 'specConflict', false),
    materialUnknowns: cleanBoolean(input.materialUnknowns, 'materialUnknowns', false),
    requiresDesignDecision: cleanBoolean(input.requiresDesignDecision, 'requiresDesignDecision', false),
    implementationRisk: cleanEnum(input.implementationRisk, 'implementationRisk', IMPLEMENTATION_RISK, 'LOW'),
    reversibility: cleanEnum(input.reversibility, 'reversibility', REVERSIBILITY, 'EASY'),
    acceptanceKnown: cleanBoolean(input.acceptanceKnown, 'acceptanceKnown', false),
    failureCount: cleanFailureCount(input.failureCount),
    rootCauseKnown: cleanBoolean(input.rootCauseKnown, 'rootCauseKnown', false),
    transportAvailable: cleanBoolean(input.transportAvailable, 'transportAvailable', true),
    packetReady: cleanBoolean(input.packetReady, 'packetReady', true),
    capabilityBlocked: cleanBoolean(input.capabilityBlocked, 'capabilityBlocked', false),
    humanOnly: cleanBoolean(input.humanOnly, 'humanOnly', false),
    forceSol: cleanBoolean(input.forceSol, 'forceSol', false),
    sharedResourceRisk: cleanBoolean(input.sharedResourceRisk, 'sharedResourceRisk', false),
  };
}

function decision(input, route, reasonCodes, nextAction, extras = {}) {
  const needsSol = route === ROUTES.SOL_PRECHECK || route === ROUTES.SOL_FAILURE_REQUERY || route === ROUTES.SOL_ESCALATE
    || reasonCodes.includes('SOL_REQUIRED_TRANSPORT_UNAVAILABLE')
    || reasonCodes.includes('SOL_REQUIRED_PACKET_NOT_READY');
  const needsPacket = needsSol;
  return {
    schemaVersion: ROUTER_SCHEMA_VERSION,
    route,
    needsSol,
    needsPacket,
    // Routing is eligibility only. Mutation authority is granted downstream only
    // after the queue and frozen evidence basis pass deterministic validation.
    mayMutate: false,
    reasonCodes: [...reasonCodes],
    nextAction,
    facts: {
      scopeBreadth: input.scopeBreadth,
      implementationRisk: input.implementationRisk,
      reversibility: input.reversibility,
      failureCount: input.failureCount,
      acceptanceKnown: input.acceptanceKnown,
      rootCauseKnown: input.rootCauseKnown,
      transportAvailable: input.transportAvailable,
      packetReady: input.packetReady,
    },
    ...extras,
  };
}

function hold(input, code, nextAction, extras = {}) {
  return decision(input, ROUTES.HOLD, [code], nextAction, extras);
}

function solRequiredButUnavailable(input, intendedRoute, reasons) {
  if (!input.transportAvailable) {
    return hold(
      input,
      'SOL_REQUIRED_TRANSPORT_UNAVAILABLE',
      'Restore an approved Sol transport, then re-run routing without mutating the target.',
      { intendedRoute, intendedReasonCodes: reasons },
    );
  }
  if (!input.packetReady) {
    return hold(
      input,
      'SOL_REQUIRED_PACKET_NOT_READY',
      'Build the decision packet, then re-run routing without mutating the target.',
      { intendedRoute, intendedReasonCodes: reasons },
    );
  }
  return null;
}

function returnSolRoute(input, route, reasons, nextAction) {
  const unavailable = solRequiredButUnavailable(input, route, reasons);
  if (unavailable) return unavailable;
  return decision(input, route, reasons, nextAction);
}

export function routeLunaSol(rawInput = {}) {
  const input = normalizeRouterInput(rawInput);

  if (input.humanOnly) {
    return hold(input, 'HUMAN_ONLY_ACTION', 'Stop automation and request the required human action or authorization.');
  }
  if (input.capabilityBlocked) {
    return hold(input, 'CAPABILITY_BLOCKED', 'Stop mutation and resolve the missing execution capability first.');
  }

  if (input.failureCount >= 2) {
    return returnSolRoute(
      input,
      ROUTES.SOL_ESCALATE,
      ['REPEATED_SAME_CLASS_FAILURE'],
      'Escalate the failure packet to Sol before another implementation attempt.',
    );
  }

  if (input.failureCount === 1) {
    const safeKnownRepair = input.rootCauseKnown
      && input.implementationRisk === 'LOW'
      && input.reversibility === 'EASY'
      && !input.sharedResourceRisk
      && !input.specConflict
      && !input.materialUnknowns
      && !input.requiresDesignDecision;

    if (safeKnownRepair) {
      return decision(
        input,
        ROUTES.LOCAL_EXECUTE,
        ['KNOWN_LOCAL_REPAIR'],
        'Local execution is eligible only after the frozen evidence basis independently validates the known repair.',
      );
    }

    return returnSolRoute(
      input,
      ROUTES.SOL_FAILURE_REQUERY,
      ['FAILED_ATTEMPT_REQUIRES_REQUERY'],
      'Send failure evidence to Sol before another mutation attempt.',
    );
  }

  if (input.forceSol) {
    return returnSolRoute(
      input,
      ROUTES.SOL_PRECHECK,
      ['EXPLICIT_SOL_ESCALATION'],
      'Run Sol precheck before mutation.',
    );
  }

  const unresolvedDesign = input.specConflict || input.materialUnknowns || input.requiresDesignDecision;
  const crossCuttingUnresolved = input.scopeBreadth === 'CROSS_CUTTING' && (!input.acceptanceKnown || !input.rootCauseKnown);
  const highConsequenceUnresolved = (
    input.implementationRisk === 'HIGH'
    || input.reversibility === 'IRREVERSIBLE'
    || input.sharedResourceRisk
  ) && (!input.acceptanceKnown || !input.rootCauseKnown || unresolvedDesign);

  if (unresolvedDesign || crossCuttingUnresolved || highConsequenceUnresolved) {
    const reasons = [];
    if (input.specConflict) reasons.push('SPEC_CONFLICT');
    if (input.materialUnknowns) reasons.push('MATERIAL_UNKNOWNS');
    if (input.requiresDesignDecision) reasons.push('DESIGN_DECISION_REQUIRED');
    if (crossCuttingUnresolved) reasons.push('CROSS_CUTTING_UNRESOLVED');
    if (highConsequenceUnresolved) reasons.push('HIGH_CONSEQUENCE_UNRESOLVED');
    return returnSolRoute(
      input,
      ROUTES.SOL_PRECHECK,
      reasons,
      'Run Sol precheck and resolve the decision boundary before mutation.',
    );
  }

  return decision(
    input,
    ROUTES.LOCAL_EXECUTE,
    ['LOCAL_DECISION_SUFFICIENT'],
    'Local execution is eligible; validate the frozen evidence basis before granting mutation authority.',
  );
}

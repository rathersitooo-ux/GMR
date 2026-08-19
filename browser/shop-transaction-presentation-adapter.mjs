import {
  createUIFeedbackState,
  applyUIFeedbackEvent,
  projectUIFeedback,
} from './ui-state-feedback-core.mjs';

export const SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA = 'gameroad.shop-transaction-presentation-adapter.v1';

const PHASES = new Set([
  'SELECTED',
  'CONFIRM_OPEN',
  'PENDING_OR_UNKNOWN',
  'SUCCESS',
  'FAILURE',
  'RETURN',
]);
const TRANSACTION_PHASES = new Set(['PENDING_OR_UNKNOWN', 'SUCCESS', 'FAILURE']);

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function validatePhase(phase) {
  nonEmpty(phase, 'phase');
  if (!PHASES.has(phase)) throw new Error(`unsupported Shop presentation phase: ${phase}`);
  return phase;
}

function requireCurrentRequestIdentity({phase, requestId, currentRequestId}) {
  if (!TRANSACTION_PHASES.has(phase)) return null;
  const eventRequestId = nonEmpty(requestId, 'requestId');
  const authorityRequestId = nonEmpty(currentRequestId, 'currentRequestId');
  if (eventRequestId !== authorityRequestId) throw new Error('stale or mismatched Shop request identity');
  return authorityRequestId;
}

function reasonFor(phase, reason) {
  if (typeof reason === 'string' && reason.trim() !== '') return reason;
  switch (phase) {
    case 'SELECTED': return 'shop_selected';
    case 'CONFIRM_OPEN': return 'shop_confirm_open';
    case 'PENDING_OR_UNKNOWN': return 'shop_pending_or_unknown';
    case 'SUCCESS': return 'shop_success_confirmed';
    case 'FAILURE': return 'shop_failure_confirmed';
    case 'RETURN': return 'shop_return';
    default: throw new Error(`unsupported Shop presentation phase: ${phase}`);
  }
}

/**
 * Purely projects caller-authoritative Shop transaction state into shared UI feedback.
 * It never decides price, currency, product, ownership, rewards, retry eligibility,
 * or transaction success.
 */
export function projectShopTransactionPresentation({
  config,
  phase,
  requestId = null,
  currentRequestId = null,
  role = 'shop_purchase',
  reason,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const checkedPhase = validatePhase(phase);
  const matchedRequestId = requireCurrentRequestIdentity({
    phase: checkedPhase,
    requestId,
    currentRequestId,
  });
  const selected = checkedPhase !== 'RETURN';
  const resolvedReason = reasonFor(checkedPhase, reason);

  let state = createUIFeedbackState({
    config,
    role,
    reason: resolvedReason,
    selected,
    reducedMotion,
    lowPerf,
  });

  if (checkedPhase === 'PENDING_OR_UNKNOWN') {
    state = applyUIFeedbackEvent(state, {
      type: 'BEGIN_PENDING',
      token: matchedRequestId,
      reason: resolvedReason,
    });
  } else if (checkedPhase === 'SUCCESS' || checkedPhase === 'FAILURE') {
    state = applyUIFeedbackEvent(state, {
      type: 'BEGIN_PENDING',
      token: matchedRequestId,
      reason: 'shop_pending_or_unknown',
    });
    state = applyUIFeedbackEvent(state, {
      type: checkedPhase === 'SUCCESS' ? 'ACK_CONFIRMED' : 'ACK_FAILED',
      token: matchedRequestId,
      reason: resolvedReason,
    });
  }

  return Object.freeze({
    schema: SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA,
    phase: checkedPhase,
    requestId: matchedRequestId,
    feedback: projectUIFeedback(state),
  });
}

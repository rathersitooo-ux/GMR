import {
  createUIFeedbackState,
  applyUIFeedbackEvent,
  projectUIFeedback,
} from './ui-state-feedback-core.mjs';

export const SHOP_TRANSACTION_PRESENTATION_ADAPTER_SCHEMA = 'gameroad.shop-transaction-presentation-adapter.v1';
export const FANART_SHOP_CATALOG_SCHEMA = 'gameroad.fanart-shop-catalog.v1';

const PHASES = new Set([
  'SELECTED',
  'CONFIRM_OPEN',
  'PENDING_OR_UNKNOWN',
  'SUCCESS',
  'FAILURE',
  'RETURN',
]);
const TRANSACTION_PHASES = new Set(['PENDING_OR_UNKNOWN', 'SUCCESS', 'FAILURE']);
const FORBIDDEN_FANART_GAMEPLAY_FIELDS = new Set([
  'ability', 'abilities', 'effect', 'effects', 'power', 'cost', 'number', 'suit', 'trigger', 'activationCondition',
]);

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function token(value, max = 256) {
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out && out.length <= max ? out : null;
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

function validateApprovedFanArtShopItem(raw) {
  const reasons = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok:false, reasons:['invalid-item'], item:null, identity:null};

  for (const field of FORBIDDEN_FANART_GAMEPLAY_FIELDS) {
    if (Object.hasOwn(raw, field)) reasons.push(`gameplay-field-forbidden:${field}`);
  }

  const workId = token(raw.workId, 96);
  const workVersion = token(raw.workVersion, 96);
  const title = token(raw.title, 160);
  const creatorDisplayName = token(raw.creatorDisplayName, 160);
  const creatorUserId = token(raw.creatorUserId, 128);
  const submissionRecordId = token(raw.submissionRecordId, 128);
  const approvalRecordId = token(raw.approvalRecordId, 128);
  const targetCardId = token(raw.targetCardId, 128);
  const imageAssetId = token(raw.imageAssetId, 256);

  if (!workId) reasons.push('workId-invalid');
  if (!workVersion) reasons.push('workVersion-invalid');
  if (!title) reasons.push('title-invalid');
  if (!creatorDisplayName) reasons.push('creatorDisplayName-invalid');
  if (!creatorUserId) reasons.push('creatorUserId-invalid');
  if (!submissionRecordId) reasons.push('submissionRecordId-invalid');
  if (!approvalRecordId) reasons.push('approvalRecordId-invalid');
  if (!targetCardId) reasons.push('targetCardId-invalid');
  if (!imageAssetId) reasons.push('imageAssetId-invalid');
  if (raw.formalApprovalState !== 'APPROVED') reasons.push('formal-approval-not-approved');
  if (raw.approvedBy !== 'HUMAN') reasons.push('formal-approval-not-human');
  if (raw.imageReviewState !== 'APPROVED') reasons.push('image-review-not-approved');
  if (raw.gameUseApproved !== true) reasons.push('game-use-not-approved');
  if (raw.shopUseApproved !== true) reasons.push('shop-use-not-approved');

  const acquisition = raw.acquisition;
  if (!acquisition || typeof acquisition !== 'object' || Array.isArray(acquisition)) {
    reasons.push('acquisition-missing');
  } else {
    if (acquisition.state !== 'READY') reasons.push('acquisition-not-ready');
    const productId = token(acquisition.productId, 128);
    const currency = token(acquisition.currency, 32);
    const price = Number.isSafeInteger(acquisition.price) && acquisition.price > 0 ? acquisition.price : null;
    if (!productId) reasons.push('productId-invalid');
    if (currency !== 'HONEY') reasons.push('currency-must-be-honey');
    if (price == null) reasons.push('price-invalid');
  }

  const identity = workId && workVersion ? `${workId}@${workVersion}` : null;
  if (reasons.length) return {ok:false, reasons:[...new Set(reasons)].sort(), item:null, identity};

  return {
    ok:true,
    reasons:[],
    identity,
    item:Object.freeze({
      workId,
      workVersion,
      title,
      creatorDisplayName,
      targetCardId,
      imageAssetId,
      acquisition:Object.freeze({
        productId: acquisition.productId.trim(),
        currency: 'HONEY',
        price: acquisition.price,
      }),
      actions:Object.freeze(['VIEW', 'ACQUIRE']),
    }),
  };
}

/**
 * Projects caller-authoritative formally approved fan-art records into Shop-visible data.
 * Fail-closed contract from the current FanArt authority:
 * - zero works => section hidden
 * - any malformed/inconsistent/duplicate catalog entry => whole catalog hidden
 * - Human approval, image review, game/shop use approval and acquisition authority are mandatory
 * - acquisition must already carry an explicit HONEY price/product identity
 * - candidate/formal provenance internals are validation-only and are not exposed to the client projection
 * - user listing/trading/resale stay disabled
 *
 * This function never approves art, decides a price, assigns a product, grants ownership,
 * or mutates gameplay/card ability semantics.
 */
export function projectApprovedFanArtShopCatalog({works = []} = {}) {
  if (!Array.isArray(works)) throw new Error('works must be an array');
  if (works.length === 0) {
    return Object.freeze({
      schema:FANART_SHOP_CATALOG_SCHEMA,
      visible:false,
      items:Object.freeze([]),
      catalogState:'EMPTY_NO_FORMAL_WORK',
      reasons:Object.freeze([]),
      userListingAllowed:false,
      tradingAllowed:false,
      resaleAllowed:false,
    });
  }

  const projected = [];
  const reasons = [];
  const identities = new Set();
  for (const raw of works) {
    const result = validateApprovedFanArtShopItem(raw);
    if (result.identity && identities.has(result.identity)) reasons.push(`duplicate-work-version:${result.identity}`);
    if (result.identity) identities.add(result.identity);
    if (!result.ok) reasons.push(...result.reasons.map((reason)=>`${result.identity ?? 'unknown'}:${reason}`));
    if (result.ok) projected.push(result.item);
  }

  if (reasons.length > 0) {
    return Object.freeze({
      schema:FANART_SHOP_CATALOG_SCHEMA,
      visible:false,
      items:Object.freeze([]),
      catalogState:'STOPPED_INVALID_CATALOG',
      reasons:Object.freeze([...new Set(reasons)].sort()),
      userListingAllowed:false,
      tradingAllowed:false,
      resaleAllowed:false,
    });
  }

  return Object.freeze({
    schema:FANART_SHOP_CATALOG_SCHEMA,
    visible:true,
    items:Object.freeze(projected),
    catalogState:'READY',
    reasons:Object.freeze([]),
    userListingAllowed:false,
    tradingAllowed:false,
    resaleAllowed:false,
  });
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

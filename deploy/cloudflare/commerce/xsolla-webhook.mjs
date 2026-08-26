export const XSOLLA_VERIFIED_WEBHOOK_SCHEMA = 'gameroad.xsolla-verified-webhook.v1';
export const XSOLLA_VERIFICATION_STATE = 'VERIFIED_BY_SERVER_AUTHORITY';

const SUPPORTED_NOTIFICATION_TYPES = new Set([
  'user_validation',
  'order_paid',
  'order_canceled',
]);

const encoder = new TextEncoder();

function nonEmpty(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeScalarId(value, field) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return nonEmpty(value, field);
}

function jsonResponse(status, code, message, headers = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function authorizationSignature(authorization) {
  if (typeof authorization !== 'string') return null;
  const match = /^Signature\s+([0-9a-fA-F]{40})$/.exec(authorization.trim());
  return match ? match[1].toLowerCase() : null;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexBytes(value) {
  if (!/^[0-9a-f]{40}$/.test(value)) return null;
  const out = new Uint8Array(20);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqualBytes(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
    return false;
  }
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(left, right);
  }
  // Standards-compatible runtimes do not all expose timingSafeEqual. Keep the
  // comparison branch-free over equal-length byte arrays as a conservative fallback.
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

export async function computeXsollaSignature(rawBody, secret) {
  if (typeof rawBody !== 'string') throw new Error('rawBody must be a string');
  const secretValue = nonEmpty(secret, 'secret');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto subtle API is required');
  const digest = await subtle.digest('SHA-1', encoder.encode(`${rawBody}${secretValue}`));
  return hex(new Uint8Array(digest));
}

export async function verifyXsollaSignature({ rawBody, authorization, secret } = {}) {
  const provided = authorizationSignature(authorization);
  if (!provided) return false;
  let expected;
  try {
    expected = await computeXsollaSignature(rawBody, secret);
  } catch {
    return false;
  }
  const providedBytes = hexBytes(provided);
  const expectedBytes = hexBytes(expected);
  return providedBytes != null && expectedBytes != null && timingSafeEqualBytes(providedBytes, expectedBytes);
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array');
  return Object.freeze(items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`items[${index}] must be an object`);
    }
    const sku = nonEmpty(item.sku, `items[${index}].sku`);
    const quantity = item.quantity == null ? 1 : Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`items[${index}].quantity must be a positive safe integer`);
    }
    return Object.freeze({ providerSku: sku, quantity });
  }));
}

export function normalizeVerifiedXsollaWebhook(payload, { expectedProjectId } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object');
  }
  const notificationType = nonEmpty(payload.notification_type, 'notification_type');
  if (!SUPPORTED_NOTIFICATION_TYPES.has(notificationType)) {
    throw new Error(`unsupported notification_type: ${notificationType}`);
  }

  const projectId = normalizeScalarId(payload.settings?.project_id, 'settings.project_id');
  const expected = normalizeScalarId(expectedProjectId, 'expectedProjectId');
  if (projectId !== expected) throw new Error('Xsolla project identity mismatch');

  const base = {
    schema: XSOLLA_VERIFIED_WEBHOOK_SCHEMA,
    provider: 'xsolla',
    notificationType,
    providerProjectId: projectId,
    verificationState: XSOLLA_VERIFICATION_STATE,
    authorityGrantAllowed: false,
    ownershipMutationAllowed: false,
    saveMutationAllowed: false,
    reversalMutationAllowed: false,
  };

  if (notificationType === 'user_validation') {
    const providerUserId = normalizeScalarId(payload.user?.id, 'user.id');
    return Object.freeze({
      ...base,
      providerEventKey: `user_validation:${providerUserId}`,
      providerUserId,
      providerOrderId: null,
      providerItems: Object.freeze([]),
      sandbox: null,
    });
  }

  const providerUserId = normalizeScalarId(payload.user?.external_id, 'user.external_id');
  const providerOrderId = normalizeScalarId(payload.order?.id, 'order.id');
  const mode = typeof payload.order?.mode === 'string' ? payload.order.mode.trim().toLowerCase() : '';
  const sandbox = mode === '' ? null : mode === 'sandbox';
  const providerItems = notificationType === 'order_paid'
    ? normalizeItems(payload.items)
    : Object.freeze([]);

  return Object.freeze({
    ...base,
    providerEventKey: `${notificationType}:${providerOrderId}`,
    providerUserId,
    providerOrderId,
    providerItems,
    sandbox,
  });
}

export async function handleXsollaWebhookRequest({
  request,
  secret,
  expectedProjectId,
  onVerifiedEvent = null,
} = {}) {
  if (!(request instanceof Request)) throw new Error('request must be a Request');
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
  }
  if (typeof secret !== 'string' || secret.trim() === '' || expectedProjectId == null || String(expectedProjectId).trim() === '') {
    return jsonResponse(503, 'COMMERCE_CONFIGURATION_UNAVAILABLE', 'Commerce webhook configuration is unavailable.');
  }

  const rawBody = await request.text();
  const authorization = request.headers.get('authorization');
  if (!await verifyXsollaSignature({ rawBody, authorization, secret })) {
    return jsonResponse(400, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, 'INVALID_PAYLOAD', 'Webhook payload must be valid JSON.');
  }

  let event;
  try {
    event = normalizeVerifiedXsollaWebhook(payload, { expectedProjectId });
  } catch (error) {
    return jsonResponse(400, 'INVALID_PAYLOAD', error instanceof Error ? error.message : 'Invalid webhook payload.');
  }

  if (typeof onVerifiedEvent !== 'function') {
    return jsonResponse(503, 'COMMERCE_AUTHORITY_UNAVAILABLE', 'Authoritative commerce processing is unavailable.');
  }

  let authorityResult;
  try {
    authorityResult = await onVerifiedEvent(event);
  } catch {
    return jsonResponse(503, 'COMMERCE_AUTHORITY_FAILURE', 'Authoritative commerce processing failed.');
  }

  if (authorityResult?.decision === 'ACKNOWLEDGE') {
    let authorityEvidenceId;
    try {
      authorityEvidenceId = nonEmpty(authorityResult.authorityEvidenceId, 'authorityResult.authorityEvidenceId');
    } catch {
      return jsonResponse(503, 'COMMERCE_AUTHORITY_INVALID_RESULT', 'Authoritative commerce processing returned incomplete evidence.');
    }
    return new Response(null, {
      status: 204,
      headers: { 'x-gameroad-commerce-evidence': authorityEvidenceId },
    });
  }

  if (event.notificationType === 'user_validation' && authorityResult?.decision === 'INVALID_USER') {
    return jsonResponse(400, 'INVALID_USER', 'User was not accepted by game authority.');
  }

  return jsonResponse(503, 'COMMERCE_AUTHORITY_NOT_COMMITTED', 'Authoritative commerce processing did not confirm completion.');
}

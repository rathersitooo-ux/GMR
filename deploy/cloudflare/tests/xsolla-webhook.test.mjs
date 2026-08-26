import assert from 'node:assert/strict';
import test from 'node:test';

import {
  XSOLLA_VERIFICATION_STATE,
  computeXsollaSignature,
  handleXsollaWebhookRequest,
  normalizeVerifiedXsollaWebhook,
  verifyXsollaSignature,
} from '../commerce/xsolla-webhook.mjs';

const SECRET = 'xsolla-test-secret';
const PROJECT_ID = '18404';

function raw(payload) {
  return JSON.stringify(payload);
}

async function signedRequest(payloadOrRaw, { secret = SECRET, authorization = null, method = 'POST' } = {}) {
  const body = typeof payloadOrRaw === 'string' ? payloadOrRaw : raw(payloadOrRaw);
  const signature = authorization ?? `Signature ${await computeXsollaSignature(body, secret)}`;
  return new Request('https://example.test/api/commerce/xsolla', {
    method,
    headers: { 'content-type': 'application/json', authorization: signature },
    body: method === 'POST' ? body : undefined,
  });
}

const userValidation = () => ({
  notification_type: 'user_validation',
  settings: { project_id: 18404, merchant_id: 2340 },
  user: {
    id: 'user-123',
    email: 'private@example.test',
    phone: 'secret-phone',
    ip: '127.0.0.1',
  },
});

const orderPaid = () => ({
  notification_type: 'order_paid',
  settings: { project_id: 18404, merchant_id: 2340 },
  user: {
    external_id: 'player-456',
    email: 'private@example.test',
  },
  order: { id: 9988, mode: 'sandbox', amount: '1000', currency: 'JPY' },
  items: [
    { sku: 'provider-sku-a', quantity: 2, price: '500' },
  ],
});

const orderCanceled = () => ({
  notification_type: 'order_canceled',
  settings: { project_id: 18404 },
  user: { external_id: 'player-456', email: 'private@example.test' },
  order: { id: 9988, mode: 'default' },
});

test('Xsolla signature is calculated from the exact raw body and changes when JSON bytes change', async () => {
  const compact = raw(orderPaid());
  const reformatted = JSON.stringify(orderPaid(), null, 2);
  const authorization = `Signature ${await computeXsollaSignature(compact, SECRET)}`;
  assert.equal(await verifyXsollaSignature({ rawBody: compact, authorization, secret: SECRET }), true);
  assert.equal(await verifyXsollaSignature({ rawBody: reformatted, authorization, secret: SECRET }), false);
});

test('missing or malformed signature fails closed before payload processing', async () => {
  for (const authorization of [null, 'Bearer nope', 'Signature xyz']) {
    const body = raw(orderPaid());
    const request = new Request('https://example.test/api/commerce/xsolla', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body,
    });
    const response = await handleXsollaWebhookRequest({ request, secret: SECRET, expectedProjectId: PROJECT_ID });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_SIGNATURE');
  }
});

test('configuration and method checks fail closed', async () => {
  const body = raw(orderPaid());
  const post = await signedRequest(body);
  assert.equal((await handleXsollaWebhookRequest({ request: post, secret: '', expectedProjectId: PROJECT_ID })).status, 503);

  const get = new Request('https://example.test/api/commerce/xsolla', { method: 'GET' });
  const getResponse = await handleXsollaWebhookRequest({ request: get, secret: SECRET, expectedProjectId: PROJECT_ID });
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get('allow'), 'POST');
});

test('verified user_validation copies only provider identity and drops PII', () => {
  const event = normalizeVerifiedXsollaWebhook(userValidation(), { expectedProjectId: PROJECT_ID });
  assert.equal(event.verificationState, XSOLLA_VERIFICATION_STATE);
  assert.equal(event.providerUserId, 'user-123');
  assert.equal(event.providerOrderId, null);
  for (const pii of ['email', 'phone', 'ip', 'name', 'country']) assert.equal(Object.hasOwn(event, pii), false);
  assert.equal(event.authorityGrantAllowed, false);
  assert.equal(event.saveMutationAllowed, false);
});

test('verified order_paid remains a provider fact, never an entitlement grant', () => {
  const event = normalizeVerifiedXsollaWebhook(orderPaid(), { expectedProjectId: PROJECT_ID });
  assert.equal(event.notificationType, 'order_paid');
  assert.equal(event.providerOrderId, '9988');
  assert.equal(event.providerEventKey, 'order_paid:9988');
  assert.deepEqual(event.providerItems, [{ providerSku: 'provider-sku-a', quantity: 2 }]);
  assert.equal(event.sandbox, true);
  assert.equal(event.authorityGrantAllowed, false);
  assert.equal(event.ownershipMutationAllowed, false);
  assert.equal(event.saveMutationAllowed, false);
  for (const forbidden of ['amount', 'currency', 'price', 'reward', 'ownership', 'entitlement']) {
    assert.equal(Object.hasOwn(event, forbidden), false);
  }
});

test('project mismatch, malformed JSON, and unsupported notification fail closed', async () => {
  assert.throws(
    () => normalizeVerifiedXsollaWebhook(orderPaid(), { expectedProjectId: '99999' }),
    /project identity mismatch/,
  );

  const malformedBody = '{"notification_type":"order_paid"';
  const malformed = await signedRequest(malformedBody);
  const malformedResponse = await handleXsollaWebhookRequest({
    request: malformed,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
  });
  assert.equal(malformedResponse.status, 400);
  assert.equal((await malformedResponse.json()).error.code, 'INVALID_PAYLOAD');

  const unknown = { ...orderPaid(), notification_type: 'payment' };
  const unknownRequest = await signedRequest(unknown);
  const unknownResponse = await handleXsollaWebhookRequest({
    request: unknownRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
  });
  assert.equal(unknownResponse.status, 400);
  assert.equal((await unknownResponse.json()).error.code, 'INVALID_PAYLOAD');
});

test('valid order_paid is not acknowledged when authoritative durable processing is absent', async () => {
  const request = await signedRequest(orderPaid());
  const response = await handleXsollaWebhookRequest({
    request,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'COMMERCE_AUTHORITY_UNAVAILABLE');
});

test('2xx acknowledgement requires explicit authority decision and evidence', async () => {
  const request = await signedRequest(orderPaid());
  const response = await handleXsollaWebhookRequest({
    request,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
    onVerifiedEvent: async (event) => {
      assert.equal(event.providerEventKey, 'order_paid:9988');
      return { decision: 'ACKNOWLEDGE', authorityEvidenceId: 'commit:evidence:9988' };
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-gameroad-commerce-evidence'), 'commit:evidence:9988');

  const missingEvidenceRequest = await signedRequest(orderPaid());
  const missingEvidence = await handleXsollaWebhookRequest({
    request: missingEvidenceRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
    onVerifiedEvent: async () => ({ decision: 'ACKNOWLEDGE', authorityEvidenceId: '' }),
  });
  assert.equal(missingEvidence.status, 503);
  assert.equal((await missingEvidence.json()).error.code, 'COMMERCE_AUTHORITY_INVALID_RESULT');
});

test('user validation can reject a user, while absence of authority never approves the purchase', async () => {
  const rejectedRequest = await signedRequest(userValidation());
  const rejected = await handleXsollaWebhookRequest({
    request: rejectedRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
    onVerifiedEvent: async () => ({ decision: 'INVALID_USER' }),
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error.code, 'INVALID_USER');

  const unavailableRequest = await signedRequest(userValidation());
  const unavailable = await handleXsollaWebhookRequest({
    request: unavailableRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
  });
  assert.equal(unavailable.status, 503);
});

test('order_canceled never auto-revokes and is only acknowledged after external authority confirms handling', async () => {
  const event = normalizeVerifiedXsollaWebhook(orderCanceled(), { expectedProjectId: PROJECT_ID });
  assert.equal(event.notificationType, 'order_canceled');
  assert.equal(event.reversalMutationAllowed, false);
  assert.equal(event.providerOrderId, '9988');

  const uncommittedRequest = await signedRequest(orderCanceled());
  const uncommitted = await handleXsollaWebhookRequest({
    request: uncommittedRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
    onVerifiedEvent: async () => ({ decision: 'RETRY' }),
  });
  assert.equal(uncommitted.status, 503);

  const committedRequest = await signedRequest(orderCanceled());
  const committed = await handleXsollaWebhookRequest({
    request: committedRequest,
    secret: SECRET,
    expectedProjectId: PROJECT_ID,
    onVerifiedEvent: async () => ({ decision: 'ACKNOWLEDGE', authorityEvidenceId: 'reversal:evidence:9988' }),
  });
  assert.equal(committed.status, 204);
});


test('Cloudflare Pages route remains fail-closed until a durable commerce authority is wired', async () => {
  const { onRequest } = await import('../functions/api/commerce/xsolla.js');
  const request = await signedRequest(orderPaid());
  const response = await onRequest({
    request,
    env: { XSOLLA_WEBHOOK_SECRET: SECRET, XSOLLA_PROJECT_ID: PROJECT_ID },
  });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.match(body, /COMMERCE_AUTHORITY_UNAVAILABLE/);
  assert.equal(body.includes(SECRET), false);
});

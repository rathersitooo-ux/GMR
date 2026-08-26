import { handleXsollaWebhookRequest } from '../../../commerce/xsolla-webhook.mjs';

export async function onRequest(context) {
  return handleXsollaWebhookRequest({
    request: context.request,
    secret: context.env.XSOLLA_WEBHOOK_SECRET,
    expectedProjectId: context.env.XSOLLA_PROJECT_ID,
    // Deliberately not acknowledged until GAMEROAD has a separate authoritative,
    // durable and idempotent entitlement/save processor wired here.
    onVerifiedEvent: null,
  });
}

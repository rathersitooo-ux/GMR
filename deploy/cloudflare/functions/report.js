const REPORT_DURABLE_OBJECT_NAME = 'gameroad.partner-report.authority.v1';

export async function onRequest(context) {
  const request = context.request;
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return new Response('WebSocket not supported', { status: 400 });
  }
  const id = context.env.GAMEROAD_ROOMS.idFromName(REPORT_DURABLE_OBJECT_NAME);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}

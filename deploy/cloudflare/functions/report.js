const REPORT_DURABLE_OBJECT_NAME = 'gameroad.partner-report.authority.v1';
const NORMAL_MATCH_QUEUE_RE = /^[A-Za-z0-9._:-]{8,160}$/;

export async function onRequest(context) {
  const request = context.request;
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return new Response('WebSocket not supported', { status: 400 });
  }

  const url = new URL(request.url);
  if (url.searchParams.has('battleEventOp')) {
    const queue = url.searchParams.get('queue') || '';
    if (!NORMAL_MATCH_QUEUE_RE.test(queue)) return new Response('Invalid normal-match queue', { status: 400 });
    const id = context.env.GAMEROAD_ROOMS.idFromName(`gameroad.normal.${queue}`);
    return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
  }

  const id = context.env.GAMEROAD_ROOMS.idFromName(REPORT_DURABLE_OBJECT_NAME);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}

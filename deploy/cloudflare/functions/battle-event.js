const QUEUE_RE = /^[A-Za-z0-9._:-]{8,160}$/;

export async function onRequest(context) {
  const request = context?.request;
  if (!request) return new Response('Request required', { status: 400 });
  const url = new URL(request.url);
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if ((url.searchParams.get('battleEventOp') || '') !== 'submit') {
    return new Response('Invalid battle event operation', { status: 404 });
  }
  const queue = url.searchParams.get('queue') || '';
  if (!QUEUE_RE.test(queue)) return new Response('Invalid normal-match queue', { status: 400 });
  const rooms = context?.env?.GAMEROAD_ROOMS;
  if (!rooms || typeof rooms.idFromName !== 'function' || typeof rooms.get !== 'function') {
    return new Response('Relay binding unavailable', { status: 503 });
  }
  const id = rooms.idFromName(`gameroad.normal.${queue}`);
  return rooms.get(id).fetch(request);
}

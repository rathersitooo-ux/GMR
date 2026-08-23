export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const isWebSocket = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';

  if (!isWebSocket && request.method === 'POST') {
    const matchOp = url.searchParams.get('matchOp') || '';
    if (matchOp === 'create' || matchOp === 'status' || matchOp === 'cancel') {
      const queue = url.searchParams.get('queue') || '';
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(queue)) {
        return new Response('Invalid normal-match queue', { status: 400 });
      }
      const id = context.env.GAMEROAD_ROOMS.idFromName(`gameroad.normal.${queue}`);
      return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
    }
  }

  if (!isWebSocket) {
    return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
  }
  const channel = url.searchParams.get('channel') || '';
  if (!channel || channel.length > 192) return new Response('Invalid channel', { status: 400 });
  const id = context.env.GAMEROAD_ROOMS.idFromName(channel);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}

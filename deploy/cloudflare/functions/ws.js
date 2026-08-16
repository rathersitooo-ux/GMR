export async function onRequest(context) {
  const request = context.request;
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426, headers: { Upgrade: 'websocket' } });
  }
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel') || '';
  if (!channel || channel.length > 192) return new Response('Invalid channel', { status: 400 });
  const id = context.env.GAMEROAD_ROOMS.idFromName(channel);
  return context.env.GAMEROAD_ROOMS.get(id).fetch(request);
}

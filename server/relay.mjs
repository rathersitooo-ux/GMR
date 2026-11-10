// GAMEROAD friend-room relay + static server (no dependencies).
// Serves ../browser over HTTP and relays WebSocket messages per channel at /ws.
// The game connects to ws(s)://<same host>/ws?channel=<room>&role=<host|guest>&clientId=<id>
// (see wsRelayBase in GAMEROAD.html). This server forwards every message to the
// other members of the same channel. It does not interpret game messages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'browser');
const port = Number(process.env.PORT || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/GAMEROAD.html' : url.pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- minimal WebSocket implementation (text/binary frames, ping/pong, close) ---
const channels = new Map(); // channel -> Set<socket>
function wsAccept(key) { return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); }
function wsFrame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) { head = Buffer.from([0x80 | opcode, len]); }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws' || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
  const channel = url.searchParams.get('channel') || 'default';
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + wsAccept(req.headers['sec-websocket-key']) + '\r\n\r\n');
  if (!channels.has(channel)) channels.set(channel, new Set());
  const members = channels.get(channel);
  members.add(socket);
  let buf = Buffer.alloc(0);
  const drop = () => { members.delete(socket); if (!members.size) channels.delete(channel); };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) { const mask = buf.subarray(maskOff, maskOff + 4); payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4])); }
      buf = buf.subarray(off + len);
      if (op === 0x8) { try { socket.end(wsFrame(0x8, Buffer.alloc(0))); } catch {} drop(); return; }
      if (op === 0x9) { try { socket.write(wsFrame(0xA, payload)); } catch {} continue; }
      if ((op === 0x1 || op === 0x2 || op === 0x0) && fin) {
        const frame = wsFrame(op, payload);
        for (const other of members) if (other !== socket) { try { other.write(frame); } catch {} }
      }
    }
  });
  socket.on('close', drop);
  socket.on('error', drop);
});
server.listen(port, () => console.log(`GAMEROAD relay+static on http://localhost:${port} (ws at /ws)`));

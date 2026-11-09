import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(root, '..', 'browser', 'GAMEROAD.html'), 'utf8');

test('spectator leave carries its client id so the host can drop it from the count', () => {
  // send() only stamps clientId for guests; a spectator leaving must stamp it
  // itself, otherwise the host sees cid '' and never deletes the spectator.
  assert.ok(
    html.includes("send({type:'spectate_leave',clientId:FR.clientId})"),
    'closeChannel must send spectate_leave with clientId'
  );
  assert.ok(
    html.includes("if(m.type==='spectate_leave'){if(FR.spectators[cid]){delete FR.spectators[cid]"),
    'host must delete the leaving spectator by client id'
  );
  const closeIdx = html.indexOf("send({type:'spectate_leave',clientId:FR.clientId})");
  const handlerIdx = html.indexOf("if(m.type==='spectate_leave'){if(FR.spectators[cid]){delete FR.spectators[cid]");
  assert.ok(closeIdx > -1 && handlerIdx > -1, 'both leave paths must exist');
});

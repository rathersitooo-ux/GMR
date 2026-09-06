import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  copyFriendRoomCode,
  normalizeVisibleFriendRoomCode,
} from '../browser/rogue-run-runtime-mount.mjs';

test('only a real seven-character visible room code is copyable', () => {
  assert.equal(normalizeVisibleFriendRoomCode(' ABC12DE '), 'ABC12DE');
  assert.equal(normalizeVisibleFriendRoomCode('abc12de'), 'ABC12DE');
  assert.equal(normalizeVisibleFriendRoomCode('-------'), null);
  assert.equal(normalizeVisibleFriendRoomCode('ABC123'), null);
  assert.equal(normalizeVisibleFriendRoomCode(''), null);
});

test('copy writes the exact current normalized code and reports success only after writeText resolves', async () => {
  const writes = [];
  const result = await copyFriendRoomCode({
    code: 'ab12cde',
    clipboard: { async writeText(value) { writes.push(value); } },
  });
  assert.deepEqual(writes, ['AB12CDE']);
  assert.deepEqual(result, { ok: true, reason: 'COPIED', code: 'AB12CDE' });
});

test('clipboard absence and rejection never produce fake success', async () => {
  assert.deepEqual(
    await copyFriendRoomCode({ code: 'ABC12DE', clipboard: null }),
    { ok: false, reason: 'CLIPBOARD_UNAVAILABLE', code: 'ABC12DE' },
  );
  assert.deepEqual(
    await copyFriendRoomCode({
      code: 'ABC12DE',
      clipboard: { async writeText() { throw new Error('denied'); } },
    }),
    { ok: false, reason: 'CLIPBOARD_REJECTED', code: 'ABC12DE' },
  );
  assert.deepEqual(
    await copyFriendRoomCode({ code: '-------', clipboard: { async writeText() {} } }),
    { ok: false, reason: 'NO_REAL_CODE' },
  );
});

test('copy consumer lives inside the already-packaged runtime seam without changing Friend Room authority', async () => {
  const runtime = await readFile(new URL('../browser/rogue-run-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /#friendRoomPanel/);
  assert.match(runtime, /\.friendCode > b/);
  assert.match(runtime, /min-height:44px/);
  assert.match(runtime, /aria-live/);
  assert.match(runtime, /autoMountFriendRoomShare\(\)/);
  assert.doesNotMatch(runtime, /friend-room-share-runtime\.mjs/);
  assert.doesNotMatch(runtime, /createRoom\(|joinRoom\(|toggleReady\(|hostStart\(|BroadcastChannel|WebSocket/);
});

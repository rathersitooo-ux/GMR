import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('Saasuna FanArt sleeve asset is byte-identified and stored as JPEG', async () => {
  const bytes = await readFile(new URL('../assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg', import.meta.url));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(bytes[2], 0xff);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '392309e2fe04e1096b2caf19bed072fe57db2895d369dda1f7488c0fd3e322c6');
  assert.ok(bytes.length > 1000);
});

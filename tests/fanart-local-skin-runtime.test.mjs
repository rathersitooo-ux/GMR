import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FANART_LOCAL_SKIN_CONTRACT,
  inspectLocalSkinImageHeader,
  installFanartLocalSkinCards,
  normalizeLocalSkinCardId,
  validateLocalSkinSource,
} from '../browser/fanart-local-skin-runtime.mjs';

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test('local skin contract preserves canonical identity and never owns network/ranked state', () => {
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.localOnly, true);
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.canonicalIdentityPreserved, true);
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.networkSync, false);
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.rankedStateMutation, false);
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.dbName, 'gameroad_local_card_creator_v1');
});

test('card id normalization accepts only exact bounded canonical tokens', () => {
  assert.equal(normalizeLocalSkinCardId('SP_A'), 'SP_A');
  assert.equal(normalizeLocalSkinCardId(' SP_A'), null);
  assert.equal(normalizeLocalSkinCardId(''), null);
  assert.equal(normalizeLocalSkinCardId('x'.repeat(161)), null);
});

test('PNG header inspection and source limits reuse the isolated creator safety envelope', () => {
  const bytes = pngHeader(1200, 1600);
  assert.deepEqual(inspectLocalSkinImageHeader(bytes), { type: 'image/png', width: 1200, height: 1600 });
  assert.deepEqual(validateLocalSkinSource({ bytes, size: bytes.length }), { ok: true, type: 'image/png', width: 1200, height: 1600 });
  assert.equal(validateLocalSkinSource({ bytes: pngHeader(5001, 1), size: 24 }).reason, 'SOURCE_DIMENSIONS');
  assert.equal(validateLocalSkinSource({ bytes, size: FANART_LOCAL_SKIN_CONTRACT.maxSourceBytes + 1 }).reason, 'SOURCE_SIZE');
});

test('runtime fails closed when there is no Cards document instead of inventing state', () => {
  const installation = installFanartLocalSkinCards({ document: null, window: null, indexedDB: null });
  assert.equal(typeof installation.destroy, 'function');
  assert.doesNotThrow(() => installation.destroy());
});

test('production local-skin runtime contains no transport or localStorage fallback', async () => {
  const source = await readFile(new URL('../browser/fanart-local-skin-runtime.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage']) {
    assert.equal(source.includes(forbidden), false, `forbidden transport/storage fallback: ${forbidden}`);
  }
  assert.equal(source.includes("gameroad_local_card_creator_v1"), true);
});

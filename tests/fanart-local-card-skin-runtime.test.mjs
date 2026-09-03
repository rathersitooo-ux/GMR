import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FANART_LOCAL_SKIN_CONTRACT,
  createLocalFanArtSkinStore,
  detectFanArtImageType,
  projectLocalFanArtSkins,
  validateFanArtImageBytes,
} from '../browser/fanart-local-card-skin-runtime.mjs';

function pngBytes(width = 640, height = 960) {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

test('local skin contract stays device-only and never becomes ranked authority', () => {
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.localOnly, true);
  assert.equal(FANART_LOCAL_SKIN_CONTRACT.rankedEligible, false);
  assert.deepEqual(FANART_LOCAL_SKIN_CONTRACT.allowedInput, ['image/png', 'image/jpeg']);
});

test('image validation uses file bytes and rejects oversized or unknown input', () => {
  const png = pngBytes();
  assert.equal(detectFanArtImageType(png), 'image/png');
  assert.deepEqual(validateFanArtImageBytes(png), { mime: 'image/png', width: 640, height: 960 });
  assert.throws(() => validateFanArtImageBytes(new Uint8Array(24)), /FANART_IMAGE_TYPE_INVALID/);
  assert.throws(() => validateFanArtImageBytes(pngBytes(5001, 100)), /FANART_IMAGE_DIMENSIONS_TOO_LARGE/);
  assert.throws(() => validateFanArtImageBytes(png, FANART_LOCAL_SKIN_CONTRACT.maxSourceBytes + 1), /FANART_IMAGE_TOO_LARGE/);
});

test('storage degrades to session memory instead of leaking into another persistence authority', async () => {
  const store = createLocalFanArtSkinStore({ window: {} });
  await assert.rejects(store.open(), /FANART_IDB_UNAVAILABLE/);
  const record = { baseCardId: 'CARD_7', blob: new Blob(['x']), localOnly: true, rankedEligible: false };
  await store.put(record);
  assert.equal(store.mode(), 'memory');
  assert.deepEqual(await store.list(), [record]);
  await store.remove('CARD_7');
  assert.deepEqual(await store.list(), []);
});

function fakeCard(id, { image = true } = {}) {
  const img = image ? { src: `canonical://${id}`, dataset: {} } : null;
  return {
    dataset: { id },
    style: { backgroundImage: '' },
    querySelector(selector) { return selector === 'img' ? img : null; },
    get image() { return img; },
  };
}

test('projection replaces only matching current card art and restores canonical art', () => {
  const cardA = fakeCard('A');
  const cardB = fakeCard('B');
  const urls = [];
  const revoked = [];
  const doc = { querySelectorAll: () => [cardA, cardB] };
  const win = { URL: {
    createObjectURL(blob) { const url = `blob:fanart-${urls.length + 1}`; urls.push([url, blob]); return url; },
    revokeObjectURL(url) { revoked.push(url); },
  } };
  const blob = new Blob(['fanart'], { type: 'image/png' });

  const projection = projectLocalFanArtSkins({
    document: doc,
    window: win,
    records: [{ baseCardId: 'A', blob, localOnly: true, rankedEligible: false }],
  });
  assert.equal(cardA.image.src, 'blob:fanart-1');
  assert.equal(cardA.dataset.fanartLocalSkin, '1');
  assert.equal(cardB.image.src, 'canonical://B');
  assert.equal(projection.count, 1);

  projectLocalFanArtSkins({ document: doc, window: win, records: [] });
  assert.equal(cardA.image.src, 'canonical://A');
  assert.equal(cardA.dataset.fanartLocalSkin, undefined);
  projection.dispose();
  assert.deepEqual(revoked, ['blob:fanart-1']);
});

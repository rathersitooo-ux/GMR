import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  ZE_KUU_FORMAL_CARD_ART,
  resolveZeKuuFormalCardArt,
} from '../browser/ze-kuu-formal-card-art-runtime.mjs';

const SOURCE_SHA256 = 'f95232b8f1f45154d8644ce350abeffff22e7f5c3fe777df58066841dd2b37d0';
const SOURCE_BYTES = 726664;

test('Ze-Kuu resolves only its authoritative formal card art', () => {
  assert.equal(ZE_KUU_FORMAL_CARD_ART.cardId, 'DCG_ZE_KUU');
  assert.equal(ZE_KUU_FORMAL_CARD_ART.name, 'ゼ・クウ');
  assert.equal(ZE_KUU_FORMAL_CARD_ART.generated, false);
  assert.equal(resolveZeKuuFormalCardArt('DCG_ZE_KUU')?.assetPath, '../assets/visual/cards/dcg-ze-kuu.jpg');
  assert.equal(resolveZeKuuFormalCardArt('DCG_SAASUNA'), null);
});

test('Ze-Kuu committed art is byte-identical to the supplied source', async () => {
  const assetPath = fileURLToPath(new URL('../assets/visual/cards/dcg-ze-kuu.jpg', import.meta.url));
  const bytes = await readFile(assetPath);
  assert.equal(bytes.byteLength, SOURCE_BYTES);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_SHA256);
});

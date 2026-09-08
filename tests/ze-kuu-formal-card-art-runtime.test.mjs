import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ZE_KUU_FORMAL_CARD_ART,
  resolveZeKuuFormalCardArt,
} from '../browser/ze-kuu-formal-card-art-runtime.mjs';

test('Ze-Kuu formal art contract is exact and non-generated', () => {
  assert.equal(ZE_KUU_FORMAL_CARD_ART.cardId, 'DCG_ZE_KUU');
  assert.equal(ZE_KUU_FORMAL_CARD_ART.name, 'ゼ・クウ');
  assert.equal(ZE_KUU_FORMAL_CARD_ART.source, 'user-provided-authoritative-art');
  assert.equal(ZE_KUU_FORMAL_CARD_ART.generated, false);
  assert.equal(resolveZeKuuFormalCardArt('OTHER'), null);
});

test('Ze-Kuu asset URL resolves in repo and public package layouts', () => {
  const sourceResolved = resolveZeKuuFormalCardArt('DCG_ZE_KUU', {
    moduleUrl: 'https://example.test/browser/ze-kuu-formal-card-art-runtime.mjs',
  });
  assert.equal(sourceResolved.assetUrl, 'https://example.test/assets/visual/cards/dcg-ze-kuu.jpg');
  const publicResolved = resolveZeKuuFormalCardArt('DCG_ZE_KUU', {
    moduleUrl: 'https://example.test/ze-kuu-formal-card-art-runtime.mjs',
  });
  assert.equal(publicResolved.assetUrl, 'https://example.test/assets/visual/cards/dcg-ze-kuu.jpg');
});

test('committed Ze-Kuu formal art remains byte-identical to supplied source', async () => {
  const assetUrl = new URL('../assets/visual/cards/dcg-ze-kuu.jpg', import.meta.url);
  const bytes = await readFile(fileURLToPath(assetUrl));
  assert.equal(bytes.byteLength, 726664);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'f95232b8f1f45154d8644ce350abeffff22e7f5c3fe777df58066841dd2b37d0',
  );
});

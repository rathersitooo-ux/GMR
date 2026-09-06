import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../browser/cards-deck-presentation.mjs', import.meta.url);

function findabilityStyleSource(source) {
  const start = source.indexOf("style.id = 'gameroad-cards-deck-findability-style'");
  const end = source.indexOf("let deckFilter = 'all';", start);
  assert.ok(start >= 0 && end > start, 'findability style block must exist');
  return source.slice(start, end);
}

test('Cards findability bar owns a local hit-access stacking context above card-local overlays', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const style = findabilityStyleSource(source);
  assert.match(style, /\[data-role=\\?"cards-deck-findability\\?"\]\{[^}]*position:relative/);
  assert.match(style, /\[data-role=\\?"cards-deck-findability\\?"\]\{[^}]*z-index:4/);
  assert.match(style, /\[data-role=\\?"cards-deck-findability\\?"\]\{[^}]*isolation:isolate/);
  assert.match(style, /\[data-role=\\?"cards-deck-findability\\?"\]\{[^}]*pointer-events:auto/);
});

test('Cards hit-access repair does not disable Collection card input surfaces', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const style = findabilityStyleSource(source);
  assert.equal(style.includes('#collectionGrid{pointer-events:none'), false);
  assert.equal(style.includes('#collectionGrid [data-id]{pointer-events:none'), false);
});

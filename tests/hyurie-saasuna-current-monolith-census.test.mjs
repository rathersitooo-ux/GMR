import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

function countOf(needle) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = html.indexOf(needle, cursor);
    if (index < 0) return count;
    count += 1;
    cursor = index + needle.length;
  }
}

function inspect(needle) {
  const index = html.indexOf(needle);
  return {
    needle,
    count: countOf(needle),
    index,
    context: index < 0
      ? null
      : html.slice(Math.max(0, index - 420), Math.min(html.length, index + needle.length + 900))
          .replace(/\s+/g, ' ')
          .slice(0, 1500),
  };
}

test('print direct current monolith census for illustration-independent canonical card registration', () => {
  const marker = inspect('window.__CARD_DATA__');
  assert.ok(marker.index >= 0, 'current Browser monolith must expose window.__CARD_DATA__');

  const report = {
    htmlBytes: Buffer.byteLength(html),
    marker,
    cards: [
      inspect('DCG_SAASUNA_HYURIE'),
      inspect('ヒュリー'),
      inspect('DCG_SAASUNA'),
      inspect('サースナー'),
      inspect('drawFromDeck'),
      inspect('drawAndReduceCost'),
    ],
  };

  console.log(`CARD_REGISTRY_CENSUS ${JSON.stringify(report)}`);
});

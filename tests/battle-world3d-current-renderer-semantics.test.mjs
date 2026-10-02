import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const htmlUrl = new URL('../browser/GAMEROAD.html', import.meta.url);
const html = fs.readFileSync(htmlUrl, 'utf8');

test('open live-world gates use an open frame while closed gates remain solid', () => {
  assert.match(html, /gate\.state==='OPEN_PASSABLE_FRAME'/);
  assert.equal((html.match(/'liveWorldGateFrame'/g) ?? []).length, 4);
  assert.match(html, /'liveWorldGateClosed'/);
});

test('actual built cards remain visually distinct from generic round cells', () => {
  assert.match(html, /'liveWorldCell'/);
  assert.match(html, /'liveWorldBuiltCardBase'/);
  assert.match(html, /'liveWorldBuiltCardFace'/);
});

test('legacy person-node square shadow is suppressed only under the live central world', () => {
  assert.match(
    html,
    /#battleMap\[data-central-world-live="1"\] #board \.node\.person\{box-shadow:none\}/
  );
});

test('presentation repair preserves current fieldProjection world-field path', () => {
  assert.match(html, /worldFieldRenderModel=\{fieldProjection,worldField\}/);
  assert.match(html, /fieldProjection=projected/);
});

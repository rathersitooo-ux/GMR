import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('Canvas fallback reads active road data in its own drawing scope', () => {
  const start = html.indexOf('function renderField3D(){');
  const end = html.indexOf('\nfunction renderRouteLine(', start);
  assert.ok(start >= 0 && end > start, 'renderField3D boundary should be present');
  const source = html.slice(start, end);
  assert.match(source, /rgba\(fieldPlayerColor\(owner,true\),activeNodes\(\)\.size\?0\.28:0\.18\)/);
  assert.doesNotMatch(source, /rgba\(fieldPlayerColor\(owner,true\),active\.size\?0\.28:0\.18\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../browser/battle-screen-runtime-mount.mjs', import.meta.url), 'utf8');

test('Battle progress guide is readable without changing gameplay authority', () => {
  assert.match(source, /width:min\(37vw,340px\)/);
  assert.match(source, /padding:5px 8px/);
  assert.match(source, /border-radius:12px/);
  assert.match(source, /opacity:\.96/);
  assert.match(source, /background:linear-gradient\(90deg,rgba\(3,19,18,\.74\)/);
  assert.match(source, /presentationOnly: true/);
  assert.match(source, /gameplayAuthority: false/);
  assert.match(source, /gameStateWrite: false/);
});

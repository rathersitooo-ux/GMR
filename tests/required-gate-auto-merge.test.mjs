import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

test('auto-merge broad BFI gate covers product evidence inputs but not the BFI workflow itself', () => {
  const source = read('.github/workflows/required-gate-auto-merge.yml');

  assert.match(source, /Browser Full Interaction Evidence/);
  assert.match(source, /browser\/GAMEROAD\.html/);
  assert.match(source, /tests\/browser-full-interaction\.spec\.mjs/);
  assert.match(source, /tests\/browser-full-interaction-state-sequence\.spec\.mjs/);
  assert.match(source, /playwright\.full-interaction\.config\.mjs/);

  const start = source.indexOf('bfi_required=false');
  const end = source.indexOf('bfi_json=', start);
  assert.ok(start >= 0 && end > start);
  const gate = source.slice(start, end);
  assert.doesNotMatch(gate, /\.github\/workflows\/browser-full-interaction\.yml/);
});

test('Required Gate validates BFI workflow edits with lint and a dedicated contract test', () => {
  const source = read('.github/workflows/gameroad-required-gate.yml');

  assert.match(source, /actionlint:1\.7\.7/);
  assert.match(source, /\.github\/workflows\/browser-full-interaction\.yml/);
  assert.match(source, /\.github\/workflows\/required-gate-auto-merge\.yml/);
  assert.match(source, /Run BFI gate contract tests when changed/);
  assert.match(source, /node --test tests\/required-gate-auto-merge\.test\.mjs/);
});

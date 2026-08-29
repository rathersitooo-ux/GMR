import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

const FORBIDDEN_HOME_COPY = Object.freeze([
  'HOME VISUAL',
  'GAMEROAD のホーム',
  'ホームから各機能へ移動できます',
]);

const FORBIDDEN_HOME_CONTAINERS = Object.freeze([
  'codexHomeCenterStage',
  'codexHomeLeftRail',
  'codexHomeRightRail',
]);

test('Home initial source contains none of the retired explanatory copy', () => {
  for (const text of FORBIDDEN_HOME_COPY) {
    assert.equal(
      html.includes(text),
      false,
      `retired Home copy must not exist in initial source: ${text}`,
    );
  }
});

test('Home initial source contains none of the retired explanatory panel hooks', () => {
  for (const token of FORBIDDEN_HOME_CONTAINERS) {
    assert.equal(
      html.includes(token),
      false,
      `retired Home panel hook must not exist in HTML/CSS/JS source: ${token}`,
    );
  }
});

test('regression guard checks source absence rather than CSS hiding', () => {
  const forbidden = [...FORBIDDEN_HOME_COPY, ...FORBIDDEN_HOME_CONTAINERS];
  assert.ok(forbidden.length > 0);
  for (const token of forbidden) {
    assert.equal(html.indexOf(token), -1);
  }
});

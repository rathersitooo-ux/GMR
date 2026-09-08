import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('R3 Home composition keeps the previous Home implementation behind a thin stable wrapper', () => {
  const wrapper = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  const base = fs.readFileSync(new URL('../browser/home-boot-runtime-base-r3.mjs', import.meta.url), 'utf8');
  assert.ok(wrapper.includes("export * from './home-boot-runtime-base-r3.mjs'"));
  assert.ok(wrapper.includes('mountStudyRunFromCurrentBrowser'));
  assert.ok(base.includes('mountRogueRunFromCurrentBrowser'));
  assert.ok(base.includes('mountHomeBootPresentation'));
  assert.equal(wrapper.includes('GAMEROAD.html'), false);
});

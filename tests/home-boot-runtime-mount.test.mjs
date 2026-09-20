import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Home runtime wrapper does not attach the independent Study or Rogue entries', () => {
  const source = fs.readFileSync(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("export * from './home-boot-runtime-base-r3.mjs'"));
  assert.equal(source.includes('study-run-runtime-mount'), false);
  assert.equal(source.includes('mountStudyRunFromCurrentBrowser'), false);
  assert.equal(source.includes('rogue-run-runtime-mount'), false);
  assert.equal(source.includes('mountRogueRunFromCurrentBrowser'), false);
  assert.equal(source.includes('DOMContentLoaded'), false);
});

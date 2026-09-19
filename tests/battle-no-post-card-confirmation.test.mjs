import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('card-plan submission does not show the retired success confirmation', () => {
  assert.doesNotMatch(html, /PLAN_ACCEPTED/);
  assert.doesNotMatch(html, /ctxSet\(['"]PLAN_ACCEPTED/);
});

test('later work-unit controls are not removed by this slice', () => {
  assert.match(html, /id="readyPlan"/);
  assert.match(html, /id="targetBox"/);
  assert.match(html, /id="confirmTarget"/);
  assert.match(html, /TARGET_ACCEPTED/);
  assert.match(html, /RESOLUTION_STOPPED/);
});

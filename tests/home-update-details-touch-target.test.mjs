import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Home update-details trigger preserves the shared 44px touch target without changing its link-like role', async () => {
  const source = await readFile(new URL('../browser/home-shell-presentation-core.mjs', import.meta.url), 'utf8');
  assert.match(source, /const TOUCH_TARGET_MIN_PX = 44;/);

  const triggerRule = source
    .split('\n')
    .find((line) => line.includes('.${UPDATE_DETAILS_TRIGGER_CLASS}{'));

  assert.ok(triggerRule, 'update-details trigger CSS must remain present');
  assert.match(triggerRule, /min-height:\$\{TOUCH_TARGET_MIN_PX\}px/);
  assert.match(triggerRule, /touch-action:manipulation/);
  assert.match(triggerRule, /background:none/);
  assert.match(triggerRule, /text-decoration:underline/);
});

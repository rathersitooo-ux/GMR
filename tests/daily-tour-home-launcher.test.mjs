import test from 'node:test';
import assert from 'node:assert/strict';

import { snapshot } from '../browser/daily-tour-home-launcher.mjs';

test('Daily Tour Home launcher starts optional and outside document flow', () => {
  const view = snapshot();
  assert.equal(view.mounted, false);
  assert.equal(view.open, false);
  assert.deepEqual(view.availableIds, []);
  assert.deepEqual(view.selectedIds, []);
  assert.equal(view.currentStop, null);
  assert.equal(view.planSummary, null);
  assert.equal(view.registryLoaded, false);
  assert.equal(view.layoutMode, 'fixed-no-flow');
  assert.equal(view.message, '');
});

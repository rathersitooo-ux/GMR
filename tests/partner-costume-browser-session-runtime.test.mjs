import assert from 'node:assert/strict';
import test from 'node:test';

import { createPartnerCostumeBrowserSessionRuntime } from '../browser/partner-costume-browser-session-runtime.mjs';

const catalog = {
  shoe_a: { category: 'shoes', setId: 'set_a', layers: [] },
  coord_a: { category: 'coord', setId: 'set_a', layers: [] },
  acc_a: { category: 'accessory', setId: 'set_a', layers: [] },
  shoe_b: { category: 'shoes', setId: 'set_b', layers: [] },
};

function snapshot(selection = { shoes: 'shoe_a', coord: null, accessory: null }) {
  return {
    selectedPartnerId: 'partner_a',
    partners: {
      partner_a: {
        ownedItemIds: ['shoe_a', 'coord_a', 'acc_a', 'shoe_b'],
        savedSelection: selection,
      },
      partner_b: {
        ownedItemIds: [],
        savedSelection: {},
      },
    },
  };
}

test('draft equip/detail/revert stay local and never call save authority', async () => {
  let saves = 0;
  const runtime = createPartnerCostumeBrowserSessionRuntime({
    catalog,
    loadAuthoritativeSnapshot: async () => snapshot(),
    saveAuthoritativeSelection: async () => { saves += 1; return snapshot(); },
  });

  await runtime.start();
  const equipped = runtime.equip('shoes', 'shoe_b');
  assert.equal(equipped.action, 'EQUIPPED');
  assert.equal(equipped.view.draftSelection.shoes, 'shoe_b');
  assert.equal(equipped.view.savedSelection.shoes, 'shoe_a');
  assert.equal(runtime.equip('shoes', 'shoe_b').action, 'DETAIL');
  assert.equal(saves, 0);
  assert.equal(runtime.revert().draftSelection.shoes, 'shoe_a');
  assert.equal(saves, 0);
});

test('recommended set uses only owned catalog items through existing core', async () => {
  const runtime = createPartnerCostumeBrowserSessionRuntime({
    catalog,
    loadAuthoritativeSnapshot: async () => snapshot(),
    saveAuthoritativeSelection: async () => snapshot(),
  });
  await runtime.start();
  const view = runtime.equipRecommendedSet({ shoes: 'shoe_a', coord: 'coord_a', accessory: 'acc_a' });
  assert.deepEqual(view.draftSelection, { shoes: 'shoe_a', coord: 'coord_a', accessory: 'acc_a' });
});

test('saved baseline advances only after authoritative save response confirms exact selection', async () => {
  const calls = [];
  const runtime = createPartnerCostumeBrowserSessionRuntime({
    catalog,
    loadAuthoritativeSnapshot: async () => snapshot(),
    saveAuthoritativeSelection: async (request) => {
      calls.push(request);
      return snapshot({ shoes: 'shoe_b', coord: 'coord_a', accessory: null });
    },
  });

  await runtime.start();
  runtime.equip('shoes', 'shoe_b');
  runtime.equip('coord', 'coord_a');
  const saved = await runtime.save({ requestId: 'save-1' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    partnerId: 'partner_a',
    selection: { shoes: 'shoe_b', coord: 'coord_a', accessory: null },
    requestId: 'save-1',
  });
  assert.deepEqual(saved.savedSelection, saved.draftSelection);
  assert.equal(saved.savedSelection.shoes, 'shoe_b');
});

test('failed or mismatched save keeps old saved baseline and current local draft', async () => {
  const runtime = createPartnerCostumeBrowserSessionRuntime({
    catalog,
    loadAuthoritativeSnapshot: async () => snapshot(),
    saveAuthoritativeSelection: async () => snapshot({ shoes: 'shoe_a', coord: null, accessory: null }),
  });

  await runtime.start();
  runtime.equip('shoes', 'shoe_b');
  await assert.rejects(runtime.save({ requestId: 'save-2' }), /does not confirm requested shoes selection/);
  const view = runtime.getView();
  assert.equal(view.savedSelection.shoes, 'shoe_a');
  assert.equal(view.draftSelection.shoes, 'shoe_b');
  assert.match(view.lastError, /does not confirm requested shoes selection/);
});

test('save failure and in-flight save cannot mutate another partner or confirm locally', async () => {
  let resolveSave;
  const pending = new Promise((resolve) => { resolveSave = resolve; });
  const runtime = createPartnerCostumeBrowserSessionRuntime({
    catalog,
    loadAuthoritativeSnapshot: async () => snapshot(),
    saveAuthoritativeSelection: async () => pending,
  });
  await runtime.start();
  runtime.equip('shoes', 'shoe_b');
  const saving = runtime.save({ requestId: 'save-3' });
  assert.equal(runtime.getView().saving, true);
  assert.throws(() => runtime.equip('coord', 'coord_a'), /save is in flight/);
  resolveSave({
    selectedPartnerId: 'partner_b',
    partners: {
      partner_a: { ownedItemIds: ['shoe_a', 'shoe_b'], savedSelection: { shoes: 'shoe_b' } },
      partner_b: { ownedItemIds: [], savedSelection: {} },
    },
  });
  await assert.rejects(saving, /changed selected partner/);
  const view = runtime.getView();
  assert.equal(view.partnerId, 'partner_a');
  assert.equal(view.savedSelection.shoes, 'shoe_a');
  assert.equal(view.draftSelection.shoes, 'shoe_b');
});

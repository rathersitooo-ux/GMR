import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTNER_COSTUME_CATEGORIES,
  buildPartnerCostumeLayers,
  createPartnerCostumeSession,
  createPartnerCostumeSnapshot,
  grantOwnedPartnerCostumeItems,
} from '../browser/partner-costume-core.mjs';

const catalog = {
  shoeA: { category: 'shoes', layers: [{ name: 'shoe-back', z: 20 }, { name: 'shoe-front', z: 80 }] },
  coordA: { category: 'coord', layers: [{ name: 'coord-back', z: 10 }, { name: 'coord-front', z: 70 }] },
  accessoryA: { category: 'accessory', layers: [{ name: 'acc', z: 90 }] },
  accessoryB: { category: 'accessory', layers: [{ name: 'acc-b', z: 95 }] },
};

function ownedSnapshot() {
  return {
    selectedPartnerId: 'naki',
    partners: {
      naki: { ownedItemIds: ['shoeA', 'coordA', 'accessoryA', 'accessoryB'] },
      saasuna: { ownedItemIds: ['accessoryB'] },
    },
  };
}

test('formal ownership categories stay shoes/coord/accessory', () => {
  assert.deepEqual([...PARTNER_COSTUME_CATEGORIES], ['shoes', 'coord', 'accessory']);
});

test('snapshot keeps costume state separated per stable partner id', () => {
  const snapshot = createPartnerCostumeSnapshot(ownedSnapshot());
  snapshot.partners.naki.savedSelection.accessory = 'accessoryA';
  assert.equal(snapshot.partners.saasuna.savedSelection.accessory, null);
});

test('grant records costume rights idempotently instead of recomputing display ownership', () => {
  const next = grantOwnedPartnerCostumeItems(ownedSnapshot(), 'naki', ['shoeA', 'shoeA', 'accessoryB']);
  assert.deepEqual(next.partners.naki.ownedItemIds, ['shoeA', 'coordA', 'accessoryA', 'accessoryB']);
});

test('one tap provisionally equips an owned item', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'naki', catalog });
  const result = session.equip('accessory', 'accessoryA');
  assert.equal(result.action, 'EQUIPPED');
  assert.equal(session.getDraftSelection().accessory, 'accessoryA');
  assert.equal(session.getSavedSelection().accessory, null);
});

test('tapping the already provisionally equipped card requests detail instead of toggling it off', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'naki', catalog });
  session.equip('accessory', 'accessoryA');
  const second = session.equip('accessory', 'accessoryA');
  assert.equal(second.action, 'DETAIL');
  assert.equal(session.getDraftSelection().accessory, 'accessoryA');
});

test('unowned costume items fail closed', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'saasuna', catalog });
  assert.throws(() => session.equip('accessory', 'accessoryA'), /not owned/);
});

test('wrong-category equip fails closed', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'naki', catalog });
  assert.throws(() => session.equip('coord', 'shoeA'), /belongs to shoes/);
});

test('recommended set equips three owned matching cards atomically', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'naki', catalog });
  const selection = session.equipRecommendedSet({ shoes: 'shoeA', coord: 'coordA', accessory: 'accessoryA' });
  assert.deepEqual(selection, { shoes: 'shoeA', coord: 'coordA', accessory: 'accessoryA' });
});

test('recommended set does not partially mutate when one entitlement is invalid', () => {
  const session = createPartnerCostumeSession({ snapshot: ownedSnapshot(), partnerId: 'saasuna', catalog });
  assert.throws(() => session.equipRecommendedSet({ accessory: 'accessoryB', shoes: 'shoeA' }), /not owned/);
  assert.deepEqual(session.getDraftSelection(), { shoes: null, coord: null, accessory: null });
});

test('revert returns to the opening saved state', () => {
  const snapshot = ownedSnapshot();
  snapshot.partners.naki.savedSelection = { shoes: null, coord: null, accessory: 'accessoryA' };
  const session = createPartnerCostumeSession({ snapshot, partnerId: 'naki', catalog });
  session.equip('accessory', 'accessoryB');
  assert.equal(session.revert().accessory, 'accessoryA');
});

test('save commits only the selected partner and preserves the other partner costume', () => {
  const snapshot = ownedSnapshot();
  snapshot.partners.saasuna.savedSelection = { shoes: null, coord: null, accessory: 'accessoryB' };
  const session = createPartnerCostumeSession({ snapshot, partnerId: 'naki', catalog });
  session.equip('accessory', 'accessoryA');
  const saved = session.save({ requestId: 'req-1', materialVersion: 'asset-v1' });
  assert.equal(saved.partners.naki.savedSelection.accessory, 'accessoryA');
  assert.equal(saved.partners.naki.lastSaveRequestId, 'req-1');
  assert.equal(saved.partners.naki.materialVersion, 'asset-v1');
  assert.equal(saved.partners.saasuna.savedSelection.accessory, 'accessoryB');
});

test('render layers preserve front/back z order without changing ownership categories', () => {
  const layers = buildPartnerCostumeLayers({
    baseLayers: [{ name: 'body', z: 50 }],
    catalog,
    selection: { shoes: 'shoeA', coord: 'coordA', accessory: 'accessoryA' },
  });
  assert.deepEqual(layers.map((layer) => layer.name), ['coord-back', 'shoe-back', 'body', 'coord-front', 'shoe-front', 'acc']);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_COSTUME_MAIN_SAVE_FIELD_MAP,
  createPartnerCostumeMainSaveProfileAdapter,
  projectPartnerCostumeSnapshotFromMainSave,
} from '../browser/partner-costume-main-save-profile-adapter.mjs';

function profiles() {
  return {
    'partner.naki': {
      equipment: {
        shoes: 'naki.shoes.1',
        coordinate: 'naki.coord.1',
        accessory: 'naki.accessory.1',
      },
    },
    'partner.saasuna': {
      equipment: { shoes: null, coordinate: null, accessory: null },
    },
  };
}

test('projects the existing main-save equipment fields into the three costume categories', () => {
  const snapshot = projectPartnerCostumeSnapshotFromMainSave({
    selectedPartnerId: 'partner.naki',
    partnerProfiles: profiles(),
    ownedItemIdsByPartner: {
      'partner.naki': ['naki.shoes.1', 'naki.coord.1', 'naki.accessory.1'],
    },
  });

  assert.equal(snapshot.selectedPartnerId, 'partner.naki');
  assert.deepEqual(snapshot.partners['partner.naki'].savedSelection, {
    shoes: 'naki.shoes.1',
    coord: 'naki.coord.1',
    accessory: 'naki.accessory.1',
  });
  assert.deepEqual(snapshot.partners['partner.naki'].ownedItemIds, [
    'naki.shoes.1',
    'naki.coord.1',
    'naki.accessory.1',
  ]);
  assert.deepEqual(PARTNER_COSTUME_MAIN_SAVE_FIELD_MAP, {
    shoes: 'shoes', coordinate: 'coord', accessory: 'accessory',
  });
});

test('does not infer ownership from saved equipment when entitlement input is absent', () => {
  const snapshot = projectPartnerCostumeSnapshotFromMainSave({
    selectedPartnerId: 'partner.naki',
    partnerProfiles: profiles(),
  });

  assert.deepEqual(snapshot.partners['partner.naki'].ownedItemIds, []);
  assert.equal(snapshot.partners['partner.naki'].savedSelection.coord, 'naki.coord.1');
});

test('save maps coord back to existing coordinate field and requires authoritative readback', async () => {
  let selectedPartnerId = 'partner.naki';
  const state = profiles();
  const writes = [];
  const adapter = createPartnerCostumeMainSaveProfileAdapter({
    getSelectedPartnerId: () => selectedPartnerId,
    getPartnerProfiles: () => state,
    getOwnedItemIdsByPartner: () => ({ 'partner.naki': ['naki.shoes.2', 'naki.coord.2'] }),
    persistPartnerEquipment: async (payload) => {
      writes.push(payload);
      state[payload.partnerId].equipment = { ...payload.equipment };
    },
  });

  const result = await adapter.saveAuthoritativeSelection({
    partnerId: 'partner.naki',
    selection: { shoes: 'naki.shoes.2', coord: 'naki.coord.2', accessory: null },
    requestId: 'save-1',
  });

  assert.deepEqual(writes, [{
    partnerId: 'partner.naki',
    equipment: { shoes: 'naki.shoes.2', coordinate: 'naki.coord.2', accessory: null },
    requestId: 'save-1',
  }]);
  assert.deepEqual(result.partners['partner.naki'].savedSelection, {
    shoes: 'naki.shoes.2', coord: 'naki.coord.2', accessory: null,
  });
  assert.equal(selectedPartnerId, 'partner.naki');
});

test('refuses cross-partner save and never calls persistence', async () => {
  let calls = 0;
  const adapter = createPartnerCostumeMainSaveProfileAdapter({
    getSelectedPartnerId: () => 'partner.naki',
    getPartnerProfiles: () => profiles(),
    getOwnedItemIdsByPartner: () => ({}),
    persistPartnerEquipment: async () => { calls += 1; },
  });

  await assert.rejects(
    adapter.saveAuthoritativeSelection({
      partnerId: 'partner.saasuna',
      selection: { shoes: null, coord: null, accessory: null },
      requestId: 'save-cross',
    }),
    /other than the selected partner/,
  );
  assert.equal(calls, 0);
});

test('fails closed when persistence does not round-trip the requested selection', async () => {
  const state = profiles();
  const adapter = createPartnerCostumeMainSaveProfileAdapter({
    getSelectedPartnerId: () => 'partner.naki',
    getPartnerProfiles: () => state,
    getOwnedItemIdsByPartner: () => ({}),
    persistPartnerEquipment: async () => {},
  });

  await assert.rejects(
    adapter.saveAuthoritativeSelection({
      partnerId: 'partner.naki',
      selection: { shoes: 'naki.shoes.2', coord: null, accessory: null },
      requestId: 'save-mismatch',
    }),
    /does not confirm requested costume selection/,
  );
});

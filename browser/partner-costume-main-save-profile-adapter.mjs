import { createPartnerCostumeSnapshot } from './partner-costume-core.mjs';

const PROFILE_TO_COSTUME = Object.freeze({
  shoes: 'shoes',
  coordinate: 'coord',
  accessory: 'accessory',
});

function fail(message) {
  throw new TypeError(message);
}

function requireFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function`);
  return value;
}

function requirePartnerId(value, label = 'partnerId') {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function requireProfiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('partnerProfiles must be an object');
  return value;
}

function normalizeOwnedItemIds(value, partnerId) {
  if (value === null || value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ownedItemIdsByPartner must be an object');
  const ids = value[partnerId];
  if (ids === null || ids === undefined) return [];
  if (!Array.isArray(ids)) fail(`owned item ids for ${partnerId} must be an array`);
  return [...new Set(ids.map((itemId) => {
    if (typeof itemId !== 'string' || itemId.trim().length === 0) fail('owned costume item id must be a non-empty string');
    return itemId.trim();
  }))];
}

function profileSelection(profile) {
  const equipment = profile && typeof profile === 'object' && !Array.isArray(profile)
    && profile.equipment && typeof profile.equipment === 'object' && !Array.isArray(profile.equipment)
    ? profile.equipment
    : {};
  return Object.freeze({
    shoes: typeof equipment.shoes === 'string' && equipment.shoes.length ? equipment.shoes : null,
    coord: typeof equipment.coordinate === 'string' && equipment.coordinate.length ? equipment.coordinate : null,
    accessory: typeof equipment.accessory === 'string' && equipment.accessory.length ? equipment.accessory : null,
  });
}

function selectionToProfileEquipment(selection = {}) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) fail('selection must be an object');
  const normalize = (value, label) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string or null`);
    return value.trim();
  };
  return Object.freeze({
    shoes: normalize(selection.shoes, 'selection.shoes'),
    coordinate: normalize(selection.coord, 'selection.coord'),
    accessory: normalize(selection.accessory, 'selection.accessory'),
  });
}

export function projectPartnerCostumeSnapshotFromMainSave({
  selectedPartnerId,
  partnerProfiles,
  ownedItemIdsByPartner = {},
} = {}) {
  const selected = requirePartnerId(selectedPartnerId, 'selectedPartnerId');
  const profiles = requireProfiles(partnerProfiles);
  const partners = {};
  for (const [rawPartnerId, profile] of Object.entries(profiles)) {
    const partnerId = requirePartnerId(rawPartnerId, 'partner profile id');
    partners[partnerId] = {
      ownedItemIds: normalizeOwnedItemIds(ownedItemIdsByPartner, partnerId),
      savedSelection: profileSelection(profile),
    };
  }
  if (!partners[selected]) {
    partners[selected] = {
      ownedItemIds: normalizeOwnedItemIds(ownedItemIdsByPartner, selected),
      savedSelection: profileSelection(null),
    };
  }
  return createPartnerCostumeSnapshot({ selectedPartnerId: selected, partners });
}

export function createPartnerCostumeMainSaveProfileAdapter({
  getSelectedPartnerId,
  getPartnerProfiles,
  getOwnedItemIdsByPartner,
  persistPartnerEquipment,
} = {}) {
  const readSelectedPartnerId = requireFunction(getSelectedPartnerId, 'getSelectedPartnerId');
  const readPartnerProfiles = requireFunction(getPartnerProfiles, 'getPartnerProfiles');
  const readOwnedItemIdsByPartner = requireFunction(getOwnedItemIdsByPartner, 'getOwnedItemIdsByPartner');
  const persistEquipment = requireFunction(persistPartnerEquipment, 'persistPartnerEquipment');

  function readSnapshot() {
    return projectPartnerCostumeSnapshotFromMainSave({
      selectedPartnerId: readSelectedPartnerId(),
      partnerProfiles: readPartnerProfiles(),
      ownedItemIdsByPartner: readOwnedItemIdsByPartner(),
    });
  }

  async function loadAuthoritativeSnapshot() {
    return readSnapshot();
  }

  async function saveAuthoritativeSelection({ partnerId, selection, requestId } = {}) {
    const wantedPartnerId = requirePartnerId(partnerId);
    const activePartnerId = requirePartnerId(readSelectedPartnerId(), 'selectedPartnerId');
    if (wantedPartnerId !== activePartnerId) fail('cannot save costume for a partner other than the selected partner');
    if (typeof requestId !== 'string' || requestId.trim().length === 0) fail('requestId must be a non-empty string');

    const equipment = selectionToProfileEquipment(selection);
    await persistEquipment(Object.freeze({
      partnerId: wantedPartnerId,
      equipment,
      requestId: requestId.trim(),
    }));

    const next = readSnapshot();
    if (next.selectedPartnerId !== wantedPartnerId) fail('authoritative save readback changed selected partner');
    const saved = next.partners[wantedPartnerId]?.savedSelection;
    if (!saved
      || saved.shoes !== equipment.shoes
      || saved.coord !== equipment.coordinate
      || saved.accessory !== equipment.accessory) {
      fail('authoritative save readback does not confirm requested costume selection');
    }
    return next;
  }

  return Object.freeze({
    loadAuthoritativeSnapshot,
    saveAuthoritativeSelection,
  });
}

export const PARTNER_COSTUME_MAIN_SAVE_FIELD_MAP = PROFILE_TO_COSTUME;

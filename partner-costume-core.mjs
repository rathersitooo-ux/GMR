const CATEGORY_ORDER = Object.freeze(['shoes', 'coord', 'accessory']);
const SNAPSHOT_SCHEMA = 'partner-costume-state-v1';

function fail(message) {
  throw new TypeError(message);
}

function requireId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be a non-empty string`);
  return value.trim();
}

function requireCategory(value) {
  if (!CATEGORY_ORDER.includes(value)) fail(`unsupported costume category: ${String(value)}`);
  return value;
}

function cloneSelection(selection = {}) {
  return Object.fromEntries(CATEGORY_ORDER.map((category) => [category, selection?.[category] ?? null]));
}

function clonePartnerState(state = {}) {
  return {
    ownedItemIds: [...new Set(Array.isArray(state.ownedItemIds) ? state.ownedItemIds.map((id) => requireId(id, 'owned item id')) : [])],
    savedSelection: cloneSelection(state.savedSelection),
    materialVersion: state.materialVersion ?? null,
    lastSaveRequestId: state.lastSaveRequestId ?? null,
  };
}

function requireCatalog(catalog = {}) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) fail('catalog must be an object keyed by costume item id');
  const normalized = {};
  for (const [rawId, item] of Object.entries(catalog)) {
    const id = requireId(rawId, 'catalog item id');
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`catalog item ${id} must be an object`);
    const category = requireCategory(item.category);
    const layers = Array.isArray(item.layers) ? item.layers.map((layer, index) => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) fail(`catalog item ${id} layer ${index} must be an object`);
      const z = Number.isFinite(layer.z) ? layer.z : 0;
      return Object.freeze({ ...layer, z, costumeItemId: id, costumeCategory: category });
    }) : [];
    normalized[id] = Object.freeze({ ...item, id, category, layers: Object.freeze(layers) });
  }
  return Object.freeze(normalized);
}

function assertOwnedAndCategorized({ partnerState, catalog, itemId, expectedCategory }) {
  const id = requireId(itemId, 'itemId');
  if (!partnerState.ownedItemIds.includes(id)) fail(`costume item is not owned by this partner: ${id}`);
  const item = catalog[id];
  if (!item) fail(`costume item is missing from catalog: ${id}`);
  if (item.category !== expectedCategory) fail(`costume item ${id} belongs to ${item.category}, not ${expectedCategory}`);
  return item;
}

export function createPartnerCostumeSnapshot({ selectedPartnerId = null, partners = {} } = {}) {
  if (!partners || typeof partners !== 'object' || Array.isArray(partners)) fail('partners must be an object');
  const normalizedPartners = {};
  for (const [rawPartnerId, state] of Object.entries(partners)) {
    normalizedPartners[requireId(rawPartnerId, 'partner id')] = clonePartnerState(state);
  }
  const selected = selectedPartnerId === null ? null : requireId(selectedPartnerId, 'selectedPartnerId');
  if (selected !== null && !normalizedPartners[selected]) normalizedPartners[selected] = clonePartnerState();
  return { schema: SNAPSHOT_SCHEMA, selectedPartnerId: selected, partners: normalizedPartners };
}

export function grantOwnedPartnerCostumeItems(snapshot, partnerId, itemIds) {
  const next = createPartnerCostumeSnapshot(snapshot);
  const id = requireId(partnerId, 'partnerId');
  if (!Array.isArray(itemIds)) fail('itemIds must be an array');
  const state = next.partners[id] ?? clonePartnerState();
  const granted = itemIds.map((itemId) => requireId(itemId, 'itemId'));
  state.ownedItemIds = [...new Set([...state.ownedItemIds, ...granted])];
  next.partners[id] = state;
  return next;
}

export function createPartnerCostumeSession({ snapshot, partnerId, catalog = {} } = {}) {
  const baseSnapshot = createPartnerCostumeSnapshot(snapshot);
  const id = requireId(partnerId ?? baseSnapshot.selectedPartnerId, 'partnerId');
  if (!baseSnapshot.partners[id]) baseSnapshot.partners[id] = clonePartnerState();
  baseSnapshot.selectedPartnerId = id;
  const normalizedCatalog = requireCatalog(catalog);
  const opening = cloneSelection(baseSnapshot.partners[id].savedSelection);
  let draft = cloneSelection(opening);

  function partnerState() {
    return baseSnapshot.partners[id];
  }

  function equip(category, itemId) {
    const wantedCategory = requireCategory(category);
    const item = assertOwnedAndCategorized({ partnerState: partnerState(), catalog: normalizedCatalog, itemId, expectedCategory: wantedCategory });
    if (draft[wantedCategory] === item.id) {
      return Object.freeze({ action: 'DETAIL', itemId: item.id, category: wantedCategory, selection: cloneSelection(draft) });
    }
    draft[wantedCategory] = item.id;
    return Object.freeze({ action: 'EQUIPPED', itemId: item.id, category: wantedCategory, selection: cloneSelection(draft) });
  }

  function clear(category) {
    draft[requireCategory(category)] = null;
    return cloneSelection(draft);
  }

  function equipRecommendedSet(set = {}) {
    if (!set || typeof set !== 'object' || Array.isArray(set)) fail('recommended set must be an object');
    const next = cloneSelection(draft);
    for (const category of CATEGORY_ORDER) {
      const itemId = set[category];
      if (itemId === null || itemId === undefined) continue;
      const item = assertOwnedAndCategorized({ partnerState: partnerState(), catalog: normalizedCatalog, itemId, expectedCategory: category });
      next[category] = item.id;
    }
    draft = next;
    return cloneSelection(draft);
  }

  function revert() {
    draft = cloneSelection(opening);
    return cloneSelection(draft);
  }

  function save({ requestId = null, materialVersion } = {}) {
    const state = partnerState();
    state.savedSelection = cloneSelection(draft);
    if (requestId !== null) state.lastSaveRequestId = requireId(requestId, 'requestId');
    if (materialVersion !== undefined) state.materialVersion = materialVersion;
    return createPartnerCostumeSnapshot(baseSnapshot);
  }

  function getDraftSelection() {
    return cloneSelection(draft);
  }

  function getSavedSelection() {
    return cloneSelection(partnerState().savedSelection);
  }

  return Object.freeze({
    partnerId: id,
    equip,
    clear,
    equipRecommendedSet,
    revert,
    save,
    getDraftSelection,
    getSavedSelection,
  });
}

export function buildPartnerCostumeLayers({ baseLayers = [], catalog = {}, selection = {} } = {}) {
  if (!Array.isArray(baseLayers)) fail('baseLayers must be an array');
  const normalizedCatalog = requireCatalog(catalog);
  const picked = cloneSelection(selection);
  const layers = baseLayers.map((layer, index) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) fail(`base layer ${index} must be an object`);
    return { ...layer, z: Number.isFinite(layer.z) ? layer.z : 0, source: layer.source ?? 'base', _order: index };
  });
  let order = layers.length;
  for (const category of CATEGORY_ORDER) {
    const itemId = picked[category];
    if (itemId === null) continue;
    const item = normalizedCatalog[requireId(itemId, `${category} selection`)];
    if (!item) fail(`selected costume item is missing from catalog: ${itemId}`);
    if (item.category !== category) fail(`selected costume item ${itemId} does not belong to ${category}`);
    for (const layer of item.layers) layers.push({ ...layer, source: 'costume', _order: order++ });
  }
  return layers
    .sort((left, right) => left.z - right.z || left._order - right._order)
    .map(({ _order, ...layer }) => Object.freeze(layer));
}

export const PARTNER_COSTUME_CATEGORIES = CATEGORY_ORDER;
export const PARTNER_COSTUME_SNAPSHOT_SCHEMA = SNAPSHOT_SCHEMA;

function fail(message) {
  throw new TypeError(message);
}

function requireFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function`);
  return value;
}

function requireStorageKey(storageKey) {
  if (typeof storageKey !== 'string' || storageKey.length === 0) fail('storageKey must be a non-empty caller-supplied string');
  return storageKey;
}

function requireStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) fail('store must be a caller-supplied object');
  return {
    getItem: requireFunction(store.getItem, 'store.getItem').bind(store),
    setItem: requireFunction(store.setItem, 'store.setItem').bind(store),
  };
}

function encode(snapshot) {
  let text;
  try {
    text = JSON.stringify(snapshot);
  } catch (error) {
    throw new TypeError(`partner costume snapshot is not JSON-serializable: ${error?.message ?? String(error)}`);
  }
  if (typeof text !== 'string') fail('partner costume snapshot must encode to JSON text');
  return text;
}

function requireText(value) {
  if (value === null || value === undefined) fail('partner costume snapshot is missing from durable store');
  if (typeof value !== 'string') fail('durable store must return partner costume snapshot bytes as a string');
  return value;
}

function decode(value) {
  try {
    return JSON.parse(requireText(value));
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('durable store')) throw error;
    if (error instanceof TypeError && error.message.startsWith('partner costume snapshot is missing')) throw error;
    throw new TypeError(`stored partner costume snapshot is not valid JSON: ${error?.message ?? String(error)}`);
  }
}

/**
 * Durable-string adapter only. The caller keeps production-key, auth, transport,
 * retry, encryption, ownership, and entitlement authority outside this module.
 */
export function createPartnerCostumeDurableStore({ store, storageKey } = {}) {
  const io = requireStore(store);
  const key = requireStorageKey(storageKey);

  async function saveSnapshot(snapshot) {
    const encoded = encode(snapshot);
    await io.setItem(key, encoded);
    const readback = requireText(await io.getItem(key));
    if (readback !== encoded) fail('durable store readback does not match the written partner costume snapshot');
    return snapshot;
  }

  async function loadSnapshot() {
    return decode(await io.getItem(key));
  }

  return Object.freeze({ saveSnapshot, loadSnapshot });
}

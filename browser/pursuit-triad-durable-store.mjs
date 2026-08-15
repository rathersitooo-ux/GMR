function fail(message) {
  throw new TypeError(message);
}

function requireFunction(value, label) {
  if (typeof value !== 'function') fail(`${label} must be a function`);
  return value;
}

function requireStorageKey(storageKey) {
  if (typeof storageKey !== 'string' || storageKey.length === 0) {
    fail('storageKey must be a non-empty caller-supplied string');
  }
  return storageKey;
}

function requireStore(store) {
  if (!store || typeof store !== 'object' || Array.isArray(store)) {
    fail('store must be a caller-supplied object');
  }
  return {
    getItem: requireFunction(store.getItem, 'store.getItem').bind(store),
    setItem: requireFunction(store.setItem, 'store.setItem').bind(store),
  };
}

function requireStoredText(value) {
  if (value === null || value === undefined) fail('pursuit snapshot is missing from durable store');
  if (typeof value !== 'string') fail('durable store must return snapshot bytes as a string');
  return value;
}

function encodeSnapshot(snapshot) {
  let encoded;
  try {
    encoded = JSON.stringify(snapshot);
  } catch (error) {
    throw new TypeError(`pursuit snapshot is not JSON-serializable: ${error?.message ?? String(error)}`);
  }
  if (typeof encoded !== 'string') fail('pursuit snapshot must encode to JSON text');
  return encoded;
}

function decodeSnapshot(encoded) {
  try {
    return JSON.parse(requireStoredText(encoded));
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('durable store')) throw error;
    throw new TypeError(`stored pursuit snapshot is not valid JSON: ${error?.message ?? String(error)}`);
  }
}

/**
 * Adapts caller-owned durable string storage to the R7 saveSnapshot/loadSnapshot
 * contract. This adapter deliberately owns no production key, auth, encryption,
 * TTL, retry schedule, network transport, or gameplay semantics.
 */
export function createPursuitDurableSnapshotStore({ store, storageKey } = {}) {
  const io = requireStore(store);
  const key = requireStorageKey(storageKey);

  async function saveSnapshot(snapshot) {
    const encoded = encodeSnapshot(snapshot);
    await io.setItem(key, encoded);
    const readback = requireStoredText(await io.getItem(key));
    if (readback !== encoded) fail('durable store readback does not match the written pursuit snapshot');
    return snapshot;
  }

  async function loadSnapshot() {
    return decodeSnapshot(await io.getItem(key));
  }

  return Object.freeze({ saveSnapshot, loadSnapshot });
}

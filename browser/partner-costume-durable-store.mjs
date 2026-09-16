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
    removeItem: store.removeItem == null ? null : requireFunction(store.removeItem, 'store.removeItem').bind(store),
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

function requireRestorablePreviousRaw(value) {
  if (value === null || value === undefined || typeof value === 'string') return value;
  fail('durable store must return previous partner costume snapshot bytes as a string or absence');
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

async function restorePreviousRaw(io, key, previousRaw) {
  try {
    const currentRaw = await io.getItem(key);

    if (typeof previousRaw === 'string') {
      if (currentRaw !== previousRaw) await io.setItem(key, previousRaw);
      const rollbackReadback = requireText(await io.getItem(key));
      if (rollbackReadback !== previousRaw) fail('durable store rollback readback does not match the previous partner costume snapshot');
      return;
    }

    if (previousRaw === null || previousRaw === undefined) {
      if (currentRaw === null || currentRaw === undefined) return;
      if (typeof io.removeItem !== 'function') fail('durable store cannot restore previous absence without store.removeItem');
      await io.removeItem(key);
      const rollbackReadback = await io.getItem(key);
      if (rollbackReadback !== null && rollbackReadback !== undefined) fail('durable store rollback readback does not restore previous partner costume snapshot absence');
      return;
    }

    fail('durable store rollback received an unsupported previous partner costume snapshot value');
  } catch (error) {
    throw new TypeError(`durable store rollback failed after partner costume snapshot save failure: ${error?.message ?? String(error)}`);
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
    const previousRaw = requireRestorablePreviousRaw(await io.getItem(key));

    try {
      await io.setItem(key, encoded);
      const readback = requireText(await io.getItem(key));
      if (readback !== encoded) fail('durable store readback does not match the written partner costume snapshot');
    } catch (error) {
      await restorePreviousRaw(io, key, previousRaw);
      throw error;
    }
    return snapshot;
  }

  async function loadSnapshot() {
    return decode(await io.getItem(key));
  }

  return Object.freeze({ saveSnapshot, loadSnapshot });
}

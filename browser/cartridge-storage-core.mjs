import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

export const CARTRIDGE_STORAGE_SCHEMA_VERSION = 'gameroad.cartridge-storage.v1';
const DEFAULT_QUOTA_BYTES = 256 * 1024;
const SAFE_KEY_RE = /^[A-Za-z0-9._/-]+$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeManifest(input) {
  const result = normalizeCartridgeManifest(input);
  if (!result.ok) throw new Error(`CARTRIDGE_MANIFEST_INVALID:${result.reasons.join(',')}`);
  return result.manifest;
}

function manifestContractInput(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    id: manifest.id,
    version: manifest.version,
    hostApi: manifest.hostApi,
    entry: { ...manifest.entry },
    capabilities: [...manifest.capabilities],
    payloadDigest: manifest.payloadDigest,
    ...(manifest.display ? { display: { ...manifest.display } } : {}),
  };
}

function safeKey(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 512 || value.includes('\u0000')) {
    throw new Error('CARTRIDGE_STORAGE_KEY_INVALID');
  }
  if (!SAFE_KEY_RE.test(value) || value.startsWith('/') || value.includes('\\')) throw new Error('CARTRIDGE_STORAGE_KEY_INVALID');
  if (value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) throw new Error('CARTRIDGE_STORAGE_KEY_INVALID');
  return value;
}

function assertPlainJson(value, path = 'value', seen = new WeakSet()) {
  const type = typeof value;
  if (value == null || type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}_non_finite_number`);
    return;
  }
  if (type !== 'object') throw new Error(`${path}_non_json_value`);
  if (seen.has(value)) throw new Error(`${path}_cyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPlainJson(child, `${path}[${index}]`, seen));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${path}_non_plain_object`);
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(`${path}_unsafe_key`);
    assertPlainJson(child, `${path}.${key}`, seen);
  }
}

function cloneJson(value) {
  assertPlainJson(value);
  return JSON.parse(JSON.stringify(value));
}

function bytes(value) {
  return new TextEncoder().encode(value).byteLength;
}

function assertBackend(backend) {
  for (const method of ['read', 'write', 'delete', 'listPrefix']) {
    if (typeof backend?.[method] !== 'function') throw new TypeError(`CARTRIDGE_STORAGE_BACKEND_${method.toUpperCase()}_REQUIRED`);
  }
}

export function createMemoryCartridgeStorageBackend() {
  const store = new Map();
  return Object.freeze({
    read(key) { return store.has(key) ? store.get(key) : null; },
    write(key, value) { store.set(key, value); },
    delete(key) { return store.delete(key); },
    listPrefix(prefix) { return [...store.keys()].filter((key) => key.startsWith(prefix)).sort(); },
  });
}

export function cartridgeStorageNamespace(manifestInput) {
  const manifest = normalizeManifest(manifestInput);
  return `${CARTRIDGE_STORAGE_SCHEMA_VERSION}/${manifest.id}/${manifest.version}/${manifest.payloadDigest}`;
}

export function createCartridgeStorage({ manifest: manifestInput, capabilityBroker, backend, quotaBytes = DEFAULT_QUOTA_BYTES } = {}) {
  const manifest = normalizeManifest(manifestInput);
  if (!capabilityBroker || typeof capabilityBroker.decide !== 'function') throw new TypeError('CARTRIDGE_STORAGE_CAPABILITY_BROKER_REQUIRED');
  const decision = capabilityBroker.decide(manifestContractInput(manifest), 'storage.local');
  if (!decision?.allowed) throw new Error(`CARTRIDGE_STORAGE_CAPABILITY_DENIED:${decision?.reason || 'unknown'}`);
  assertBackend(backend);
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 1 || quotaBytes > 16 * 1024 * 1024) throw new Error('CARTRIDGE_STORAGE_QUOTA_INVALID');

  const namespace = `${CARTRIDGE_STORAGE_SCHEMA_VERSION}/${manifest.id}/${manifest.version}/${manifest.payloadDigest}`;
  const prefix = `${namespace}/`;
  const physicalKey = (key) => `${prefix}${safeKey(key)}`;

  const list = () => backend.listPrefix(prefix).map((key) => key.slice(prefix.length)).filter(Boolean).sort();
  const usageBytes = () => list().reduce((total, key) => {
    const stored = backend.read(`${prefix}${key}`);
    return total + bytes(key) + bytes(typeof stored === 'string' ? stored : '');
  }, 0);

  const api = {
    schemaVersion: CARTRIDGE_STORAGE_SCHEMA_VERSION,
    namespace,
    quotaBytes,
    get(key) {
      const stored = backend.read(physicalKey(key));
      if (stored == null) return null;
      if (typeof stored !== 'string') throw new Error('CARTRIDGE_STORAGE_BACKEND_VALUE_INVALID');
      const parsed = JSON.parse(stored);
      assertPlainJson(parsed);
      return cloneJson(parsed);
    },
    set(key, value) {
      const normalizedKey = safeKey(key);
      const normalizedValue = cloneJson(value);
      const serialized = JSON.stringify(normalizedValue);
      const currentStored = backend.read(`${prefix}${normalizedKey}`);
      const currentCost = currentStored == null ? 0 : bytes(normalizedKey) + bytes(String(currentStored));
      const nextCost = bytes(normalizedKey) + bytes(serialized);
      const projected = usageBytes() - currentCost + nextCost;
      if (projected > quotaBytes) throw new Error('CARTRIDGE_STORAGE_QUOTA_EXCEEDED');
      backend.write(`${prefix}${normalizedKey}`, serialized);
      return deepFreeze({ key: normalizedKey, usageBytes: projected, quotaBytes });
    },
    delete(key) { return backend.delete(physicalKey(key)); },
    list,
    usageBytes,
    clear() {
      const keys = backend.listPrefix(prefix);
      for (const key of keys) backend.delete(key);
      return keys.length;
    },
    snapshot() {
      return deepFreeze({ schemaVersion: CARTRIDGE_STORAGE_SCHEMA_VERSION, namespace, keys: list(), usageBytes: usageBytes(), quotaBytes });
    },
  };
  return Object.freeze(api);
}

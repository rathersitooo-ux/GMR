import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

export const CARTRIDGE_ASSET_REGISTRY_SCHEMA_VERSION = 'gameroad.cartridge-asset-registry.v1';
const SHA256_RE = /^[a-f0-9]{64}$/i;
const ASSET_FIELDS = new Set(['digest', 'sizeBytes', 'locator']);

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

function normalizeDigest(value) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) throw new Error('CARTRIDGE_ASSET_DIGEST_INVALID');
  return value.toLowerCase();
}

function normalizeAssetInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CARTRIDGE_ASSET_INPUT_INVALID');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) throw new Error('CARTRIDGE_ASSET_INPUT_INVALID');
  const extras = Object.keys(input).filter((key) => !ASSET_FIELDS.has(key));
  if (extras.length) throw new Error(`CARTRIDGE_ASSET_UNEXPECTED_FIELD:${extras.sort()[0]}`);
  return input;
}

function normalizeMetadata({ sizeBytes = 0, locator = null } = {}) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 1024 * 1024 * 1024) throw new Error('CARTRIDGE_ASSET_SIZE_INVALID');
  if (locator != null && (typeof locator !== 'string' || !locator || locator !== locator.trim() || locator.length > 2048 || locator.includes('\u0000'))) {
    throw new Error('CARTRIDGE_ASSET_LOCATOR_INVALID');
  }
  return { sizeBytes, locator };
}

function ownerKey(manifest) {
  return `${manifest.id}\u0000${manifest.version}\u0000${manifest.payloadDigest}`;
}

export function createCartridgeAssetRegistry({ deleteAsset = async () => {} } = {}) {
  if (typeof deleteAsset !== 'function') throw new TypeError('CARTRIDGE_ASSET_DELETE_ADAPTER_REQUIRED');
  const records = new Map();

  const retain = (manifestInput, assetInput) => {
    const manifest = normalizeManifest(manifestInput);
    const asset = normalizeAssetInput(assetInput);
    const digest = normalizeDigest(asset.digest);
    const metadata = normalizeMetadata(asset);
    const owner = ownerKey(manifest);
    let record = records.get(digest);
    if (!record) {
      record = { digest, ...metadata, owners: new Set() };
      records.set(digest, record);
    } else if (record.sizeBytes !== metadata.sizeBytes || record.locator !== metadata.locator) {
      throw new Error('CARTRIDGE_ASSET_METADATA_CONFLICT');
    }
    const before = record.owners.size;
    record.owners.add(owner);
    return deepFreeze({ digest, retained: record.owners.size !== before, referenceCount: record.owners.size });
  };

  const release = (manifestInput, digestInput) => {
    const manifest = normalizeManifest(manifestInput);
    const digest = normalizeDigest(digestInput);
    const record = records.get(digest);
    if (!record) return deepFreeze({ digest, released: false, referenceCount: 0, collectable: false });
    const released = record.owners.delete(ownerKey(manifest));
    return deepFreeze({ digest, released, referenceCount: record.owners.size, collectable: record.owners.size === 0 });
  };

  const collectGarbage = async ({ digests = null } = {}) => {
    const requested = digests == null ? [...records.keys()] : digests.map(normalizeDigest);
    const unique = [...new Set(requested)].sort();
    const deleted = [];
    const retained = [];
    for (const digest of unique) {
      const record = records.get(digest);
      if (!record) continue;
      if (record.owners.size > 0) {
        retained.push(digest);
        continue;
      }
      await deleteAsset(digest, deepFreeze({ sizeBytes: record.sizeBytes, locator: record.locator }));
      records.delete(digest);
      deleted.push(digest);
    }
    return deepFreeze({ deleted, retained });
  };

  return Object.freeze({
    schemaVersion: CARTRIDGE_ASSET_REGISTRY_SCHEMA_VERSION,
    retain,
    release,
    releaseOwner(manifestInput) {
      const manifest = normalizeManifest(manifestInput);
      const owner = ownerKey(manifest);
      const collectable = [];
      for (const record of records.values()) {
        if (record.owners.delete(owner) && record.owners.size === 0) collectable.push(record.digest);
      }
      return Object.freeze(collectable.sort());
    },
    collectGarbage,
    snapshot() {
      return deepFreeze({
        schemaVersion: CARTRIDGE_ASSET_REGISTRY_SCHEMA_VERSION,
        assets: [...records.values()].sort((a, b) => a.digest.localeCompare(b.digest)).map((record) => ({
          digest: record.digest,
          sizeBytes: record.sizeBytes,
          locator: record.locator,
          referenceCount: record.owners.size,
        })),
      });
    },
  });
}

import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

export const CARTRIDGE_CATALOG_SCHEMA_VERSION = 'gameroad.cartridge-catalog.v1';
const REF_RE = /^[A-Za-z0-9._/-]+$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeManifestRef(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || !REF_RE.test(value) || value.startsWith('/') || value.includes('..') || value.includes('\\')) {
    throw new Error('catalog_manifest_ref_invalid');
  }
  return value;
}

export function buildCartridgeCatalog(inputs = []) {
  if (!Array.isArray(inputs)) throw new TypeError('catalog_inputs_must_be_array');
  const seen = new Set();
  const entries = inputs.map((input, index) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`catalog_input_invalid:${index}`);
    const manifestRef = normalizeManifestRef(input.manifestRef);
    const normalized = normalizeCartridgeManifest(input.manifest);
    if (!normalized.ok) throw new Error(`catalog_manifest_invalid:${manifestRef}:${normalized.reasons.join('|')}`);
    const manifest = normalized.manifest;
    const identity = `${manifest.id}@${manifest.version}`;
    if (seen.has(identity)) throw new Error(`catalog_duplicate_identity:${identity}`);
    seen.add(identity);
    return {
      id: manifest.id,
      version: manifest.version,
      hostApi: manifest.hostApi,
      manifestRef,
      entry: { ...manifest.entry },
      capabilities: [...manifest.capabilities],
      payloadDigest: manifest.payloadDigest,
      display: manifest.display ? { ...manifest.display } : null,
    };
  });
  entries.sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version) || a.manifestRef.localeCompare(b.manifestRef));
  return deepFreeze({ schemaVersion: CARTRIDGE_CATALOG_SCHEMA_VERSION, entries });
}

export function serializeCartridgeCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== CARTRIDGE_CATALOG_SCHEMA_VERSION || !Array.isArray(catalog.entries)) throw new TypeError('catalog_invalid');
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

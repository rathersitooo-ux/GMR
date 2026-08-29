import { isKnownCartridgeCapability } from './cartridge-host-contract.mjs';
import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function uniqueKnownCapabilities(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name}_must_be_array`);
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (!isKnownCartridgeCapability(value)) throw new Error(`${name}_unknown_capability:${String(value)}`);
    if (seen.has(value)) throw new Error(`${name}_duplicate_capability:${value}`);
    seen.add(value);
    out.push(value);
  }
  return out;
}

function grantKey({ cartridgeId, version, payloadDigest, capability }) {
  return `${cartridgeId}\u0000${version}\u0000${payloadDigest}\u0000${capability}`;
}

function normalizeGrant(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('grant_must_be_object');
  const allowed = new Set(['cartridgeId', 'version', 'payloadDigest', 'capability']);
  const extra = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extra.length) throw new Error(`grant_unexpected_field:${extra.sort()[0]}`);
  const manifestResult = normalizeCartridgeManifest({
    schemaVersion: 'gameroad.cartridge-manifest.v1',
    id: raw.cartridgeId,
    version: raw.version,
    hostApi: 'gameroad.cartridge-host.v1',
    entry: { kind: 'recipe', ref: 'grant-validation.json' },
    capabilities: [raw.capability],
    payloadDigest: raw.payloadDigest,
  });
  if (!manifestResult.ok) throw new Error(`grant_invalid:${manifestResult.reasons.join(',')}`);
  const { manifest } = manifestResult;
  return deepFreeze({
    cartridgeId: manifest.id,
    version: manifest.version,
    payloadDigest: manifest.payloadDigest,
    capability: raw.capability,
  });
}

export function createCartridgeCapabilityBroker({ hostCapabilities = [], grants = [] } = {}) {
  const supported = uniqueKnownCapabilities(hostCapabilities, 'hostCapabilities');
  if (!Array.isArray(grants)) throw new TypeError('grants_must_be_array');
  const normalizedGrants = grants.map(normalizeGrant);
  const supportedSet = new Set(supported);
  const grantSet = new Set(normalizedGrants.map(grantKey));

  const decide = (manifestInput, capability) => {
    if (!isKnownCartridgeCapability(capability)) {
      return deepFreeze({ allowed: false, reason: 'unknown_capability', cartridgeId: null, capability: String(capability ?? '') });
    }
    const normalized = normalizeCartridgeManifest(manifestInput);
    if (!normalized.ok) {
      return deepFreeze({ allowed: false, reason: 'manifest_invalid', cartridgeId: null, capability, manifestReasons: normalized.reasons });
    }
    const manifest = normalized.manifest;
    if (!manifest.capabilities.includes(capability)) {
      return deepFreeze({ allowed: false, reason: 'not_declared', cartridgeId: manifest.id, capability });
    }
    if (!supportedSet.has(capability)) {
      return deepFreeze({ allowed: false, reason: 'host_unsupported', cartridgeId: manifest.id, capability });
    }
    const key = grantKey({ cartridgeId: manifest.id, version: manifest.version, payloadDigest: manifest.payloadDigest, capability });
    if (!grantSet.has(key)) {
      return deepFreeze({ allowed: false, reason: 'not_explicitly_granted', cartridgeId: manifest.id, capability });
    }
    return deepFreeze({ allowed: true, reason: 'explicit_exact_identity_grant', cartridgeId: manifest.id, capability });
  };

  return deepFreeze({
    decide,
    snapshot: () => deepFreeze({
      hostCapabilities: [...supported],
      grants: normalizedGrants.map((grant) => ({ ...grant })),
      defaultPolicy: 'DENY',
      grantBinding: 'CARTRIDGE_ID_VERSION_PAYLOAD_DIGEST_CAPABILITY',
    }),
  });
}

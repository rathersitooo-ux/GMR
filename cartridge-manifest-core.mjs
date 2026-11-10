import {
  CARTRIDGE_HOST_API_VERSION,
  CARTRIDGE_MANIFEST_SCHEMA_VERSION,
  isKnownCartridgeCapability,
  validateCartridgeHostCompatibility,
} from './cartridge-host-contract.mjs';

const TOP_FIELDS = new Set(['schemaVersion', 'id', 'version', 'hostApi', 'entry', 'capabilities', 'payloadDigest', 'display']);
const ENTRY_FIELDS = new Set(['kind', 'ref']);
const DISPLAY_FIELDS = new Set(['name', 'description']);
const ENTRY_KINDS = new Set(['recipe', 'module', 'external']);
const ID_RE = /^[a-z0-9][a-z0-9._-]{2,95}$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;
const RELATIVE_REF_RE = /^[A-Za-z0-9._/-]+$/;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function unexpectedFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key)).sort();
}

function exactString(value, { max = 1024, allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value !== value.trim() || value.includes('\u0000') || value.length > max) return null;
  if (!allowEmpty && value.length === 0) return null;
  return value;
}

function safeRelativeRef(value) {
  const ref = exactString(value, { max: 512 });
  if (!ref || !RELATIVE_REF_RE.test(ref) || ref.startsWith('/') || ref.includes('\\') || ref.includes('://')) return null;
  const segments = ref.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return ref;
}

function safeExternalRef(value) {
  const ref = exactString(value, { max: 2048 });
  if (!ref) return null;
  try {
    const url = new URL(ref);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeDisplay(input, reasons) {
  if (input == null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reasons.push('display-invalid');
    return null;
  }
  for (const field of unexpectedFields(input, DISPLAY_FIELDS)) reasons.push(`display-unexpected-field:${field}`);
  const name = exactString(input.name, { max: 80 });
  if (!name) reasons.push('display-name-invalid');
  const description = input.description == null ? null : exactString(input.description, { max: 240, allowEmpty: true });
  if (input.description != null && description == null) reasons.push('display-description-invalid');
  return name ? { name, description } : null;
}

export function normalizeCartridgeManifest(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({ ok: false, reasons: ['manifest-invalid'], manifest: null });
  }

  for (const field of unexpectedFields(input, TOP_FIELDS)) reasons.push(`unexpected-field:${field}`);

  if (input.schemaVersion !== CARTRIDGE_MANIFEST_SCHEMA_VERSION) reasons.push('schemaVersion-invalid');
  const id = exactString(input.id, { max: 96 });
  if (!id || !ID_RE.test(id)) reasons.push('id-invalid');
  const version = exactString(input.version, { max: 80 });
  if (!version || !VERSION_RE.test(version)) reasons.push('version-invalid');
  const hostApi = exactString(input.hostApi, { max: 96 });
  if (!hostApi || !validateCartridgeHostCompatibility(hostApi).compatible) reasons.push('hostApi-incompatible');

  let entry = null;
  if (!input.entry || typeof input.entry !== 'object' || Array.isArray(input.entry)) {
    reasons.push('entry-invalid');
  } else {
    for (const field of unexpectedFields(input.entry, ENTRY_FIELDS)) reasons.push(`entry-unexpected-field:${field}`);
    const kind = exactString(input.entry.kind, { max: 32 });
    if (!ENTRY_KINDS.has(kind)) reasons.push('entry-kind-invalid');
    const ref = kind === 'external' ? safeExternalRef(input.entry.ref) : safeRelativeRef(input.entry.ref);
    if (!ref) reasons.push('entry-ref-invalid');
    if (ENTRY_KINDS.has(kind) && ref) entry = { kind, ref };
  }

  const capabilities = [];
  if (!Array.isArray(input.capabilities)) {
    reasons.push('capabilities-invalid');
  } else {
    const seen = new Set();
    for (const value of input.capabilities) {
      if (!isKnownCartridgeCapability(value)) {
        reasons.push(`capability-unknown:${String(value)}`);
        continue;
      }
      if (seen.has(value)) {
        reasons.push(`capability-duplicate:${value}`);
        continue;
      }
      seen.add(value);
      capabilities.push(value);
    }
  }

  const payloadDigest = exactString(input.payloadDigest, { max: 64 });
  if (!payloadDigest || !SHA256_RE.test(payloadDigest)) reasons.push('payloadDigest-invalid');
  const display = normalizeDisplay(input.display, reasons);

  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) return deepFreeze({ ok: false, reasons: uniqueReasons, manifest: null });

  return deepFreeze({
    ok: true,
    reasons: [],
    manifest: {
      schemaVersion: CARTRIDGE_MANIFEST_SCHEMA_VERSION,
      id,
      version,
      hostApi: CARTRIDGE_HOST_API_VERSION,
      entry,
      capabilities,
      payloadDigest: payloadDigest.toLowerCase(),
      display,
      capabilityAuthority: 'REQUEST_ONLY',
    },
  });
}

const RECEIPT_SCHEMA = 'gameroad.install-receipt.v1';
const UNINSTALL_PLAN_SCHEMA = 'gameroad.uninstall-plan.v1';
const RECEIPT_STATES = new Set(['OPEN', 'SEALED']);
const SHA256_RE = /^[a-f0-9]{64}$/i;
const ID_RE = /^[a-z0-9][a-z0-9._-]{2,95}$/;
const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RECEIPT_FIELDS = new Set(['schemaVersion', 'cartridgeId', 'version', 'payloadDigest', 'installedAt', 'state', 'undoOperations']);

const OPERATION_FIELDS = Object.freeze({
  'cache.delete': Object.freeze(['cacheName']),
  'idb.delete': Object.freeze(['databaseName']),
  'registry.remove': Object.freeze(['registry', 'key']),
  'asset.release': Object.freeze(['digest']),
  'subscription.remove': Object.freeze(['key']),
  'mount.detach': Object.freeze(['mountId']),
  'storage.deleteNamespace': Object.freeze(['namespace']),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactToken(value, name, max = 160) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || value.includes('\u0000')) {
    throw new Error(`${name}_invalid`);
  }
  return value;
}

function normalizeIso(value) {
  const token = exactToken(value, 'installedAt', 64);
  const timestamp = Date.parse(token);
  if (!Number.isFinite(timestamp)) throw new Error('installedAt_invalid');
  return new Date(timestamp).toISOString();
}

function assertPlainData(value, path = 'receipt') {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
    throw new Error(`${path}_non_data_value`);
  }
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPlainData(child, `${path}[${index}]`));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${path}_non_plain_object`);
  for (const [key, child] of Object.entries(value)) assertPlainData(child, `${path}.${key}`);
}

function normalizeOperation(input) {
  assertPlainData(input, 'operation');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('operation_must_be_object');
  const kind = exactToken(input.kind, 'operation.kind', 64);
  const requiredFields = OPERATION_FIELDS[kind];
  if (!requiredFields) throw new Error(`operation_kind_unsupported:${kind}`);
  const allowed = new Set(['kind', ...requiredFields]);
  const extras = Object.keys(input).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`operation_unexpected_field:${extras.sort()[0]}`);
  const out = { kind };
  for (const field of requiredFields) out[field] = exactToken(input[field], `operation.${field}`, field === 'digest' ? 64 : 240);
  if (kind === 'asset.release' && !SHA256_RE.test(out.digest)) throw new Error('operation.digest_invalid');
  return deepFreeze(out);
}

function normalizeReceipt(receipt, { requireState } = {}) {
  assertPlainData(receipt);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new TypeError('receipt_invalid');
  const extras = Object.keys(receipt).filter((key) => !RECEIPT_FIELDS.has(key));
  if (extras.length) throw new Error(`receipt_unexpected_field:${extras.sort()[0]}`);
  if (receipt.schemaVersion !== RECEIPT_SCHEMA) throw new TypeError('receipt_invalid');

  const cartridgeId = exactToken(receipt.cartridgeId, 'cartridgeId', 96);
  if (!ID_RE.test(cartridgeId)) throw new Error('cartridgeId_invalid');
  const version = exactToken(receipt.version, 'version', 80);
  if (!VERSION_RE.test(version)) throw new Error('version_invalid');
  const payloadDigest = exactToken(receipt.payloadDigest, 'payloadDigest', 64).toLowerCase();
  if (!SHA256_RE.test(payloadDigest)) throw new Error('payloadDigest_invalid');
  const installedAt = normalizeIso(receipt.installedAt);
  if (!RECEIPT_STATES.has(receipt.state)) throw new TypeError('receipt_invalid');
  if (requireState && receipt.state !== requireState) throw new Error(`receipt_state_must_be_${requireState}`);
  if (!Array.isArray(receipt.undoOperations)) throw new TypeError('receipt_undoOperations_invalid');
  const undoOperations = receipt.undoOperations.map(normalizeOperation);

  return deepFreeze({
    schemaVersion: RECEIPT_SCHEMA,
    cartridgeId,
    version,
    payloadDigest,
    installedAt,
    state: receipt.state,
    undoOperations,
  });
}

export function createInstallReceipt({ cartridgeId, version, payloadDigest, installedAt } = {}) {
  return normalizeReceipt({
    schemaVersion: RECEIPT_SCHEMA,
    cartridgeId,
    version,
    payloadDigest,
    installedAt,
    state: 'OPEN',
    undoOperations: [],
  }, { requireState: 'OPEN' });
}

export function appendInstallUndo(receipt, operation) {
  const current = normalizeReceipt(receipt, { requireState: 'OPEN' });
  const normalized = normalizeOperation(operation);
  return normalizeReceipt({ ...current, undoOperations: [...current.undoOperations, normalized] }, { requireState: 'OPEN' });
}

export function sealInstallReceipt(receipt) {
  const current = normalizeReceipt(receipt, { requireState: 'OPEN' });
  return normalizeReceipt({ ...current, state: 'SEALED', undoOperations: [...current.undoOperations] }, { requireState: 'SEALED' });
}

export function buildUninstallPlan(receipt) {
  const current = normalizeReceipt(receipt, { requireState: 'SEALED' });
  return deepFreeze({
    schemaVersion: UNINSTALL_PLAN_SCHEMA,
    cartridgeId: current.cartridgeId,
    version: current.version,
    payloadDigest: current.payloadDigest,
    sourceReceiptState: current.state,
    operations: [...current.undoOperations].reverse().map((operation) => ({ ...operation })),
  });
}

export function installReceiptOperationKinds() {
  return Object.freeze(Object.keys(OPERATION_FIELDS));
}

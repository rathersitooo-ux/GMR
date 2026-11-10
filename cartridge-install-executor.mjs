import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';
import { appendInstallUndo, buildUninstallPlan, createInstallReceipt, sealInstallReceipt } from './cartridge-install-receipt.mjs';
import { cartridgeStorageNamespace } from './cartridge-storage-core.mjs';

export const CARTRIDGE_INSTALL_PLAN_SCHEMA_VERSION = 'gameroad.install-plan.v1';
const SHA256_RE = /^[a-f0-9]{64}$/i;
const PLAN_FIELDS = new Set(['schemaVersion','cartridgeId','version','payloadDigest','operations']);
const INSTALL_OPERATION_FIELDS = Object.freeze({
  'storage.createNamespace': Object.freeze(['namespace']),
  'asset.retain': Object.freeze(['digest']),
  'registry.add': Object.freeze(['registry','key']),
  'subscription.add': Object.freeze(['key']),
});
const UNDO_KIND = Object.freeze({
  'storage.createNamespace': 'storage.deleteNamespace',
  'asset.retain': 'asset.release',
  'registry.add': 'registry.remove',
  'subscription.add': 'subscription.remove',
});
const UNDO_ADAPTER_KINDS = new Set([
  'cache.delete','idb.delete','registry.remove','asset.release','subscription.remove','mount.detach','storage.deleteNamespace',
]);

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

function assertPlainData(value, path = 'plan', seen = new WeakSet()) {
  const type = typeof value;
  if (value == null || type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}_non_finite_number`);
    return;
  }
  if (type !== 'object') throw new Error(`${path}_non_data_value`);
  if (seen.has(value)) throw new Error(`${path}_cyclic`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPlainData(child, `${path}[${index}]`, seen));
    return;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error(`${path}_non_plain_object`);
  for (const [key, child] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(`${path}_unsafe_key`);
    assertPlainData(child, `${path}.${key}`, seen);
  }
}

function token(value, name, max = 240) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || value.includes('\u0000')) throw new Error(`${name}_invalid`);
  return value;
}

function normalizeOperation(input, manifest, manifestForContract, capabilityBroker) {
  assertPlainData(input, 'operation');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CARTRIDGE_INSTALL_OPERATION_INVALID');
  if (input.kind === 'mount.attach') throw new Error('CARTRIDGE_INSTALL_MOUNT_DISABLED_IN_WAVE_B');
  const fields = INSTALL_OPERATION_FIELDS[input.kind];
  if (!fields) throw new Error(`CARTRIDGE_INSTALL_OPERATION_UNSUPPORTED:${String(input.kind)}`);
  const allowed = new Set(['kind', ...fields]);
  const extras = Object.keys(input).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`CARTRIDGE_INSTALL_OPERATION_UNEXPECTED_FIELD:${extras.sort()[0]}`);
  const out = { kind: input.kind };
  for (const field of fields) out[field] = token(input[field], `CARTRIDGE_INSTALL_${field}`, field === 'digest' ? 64 : 240);
  if (input.kind === 'asset.retain' && !SHA256_RE.test(out.digest)) throw new Error('CARTRIDGE_INSTALL_ASSET_DIGEST_INVALID');
  if (input.kind === 'storage.createNamespace') {
    if (out.namespace !== cartridgeStorageNamespace(manifestForContract)) throw new Error('CARTRIDGE_INSTALL_STORAGE_NAMESPACE_MISMATCH');
    if (!capabilityBroker || typeof capabilityBroker.decide !== 'function') throw new Error('CARTRIDGE_INSTALL_CAPABILITY_BROKER_REQUIRED');
    const decision = capabilityBroker.decide(manifestForContract, 'storage.local');
    if (!decision?.allowed) throw new Error(`CARTRIDGE_INSTALL_STORAGE_CAPABILITY_DENIED:${decision?.reason || 'unknown'}`);
  }
  return deepFreeze(out);
}

function normalizePlan(plan, manifest, capabilityBroker) {
  const manifestForContract = manifestContractInput(manifest);
  assertPlainData(plan);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('CARTRIDGE_INSTALL_PLAN_INVALID');
  const extras = Object.keys(plan).filter((key) => !PLAN_FIELDS.has(key));
  if (extras.length) throw new Error(`CARTRIDGE_INSTALL_PLAN_UNEXPECTED_FIELD:${extras.sort()[0]}`);
  if (plan.schemaVersion !== CARTRIDGE_INSTALL_PLAN_SCHEMA_VERSION) throw new Error('CARTRIDGE_INSTALL_PLAN_SCHEMA_INVALID');
  if (plan.cartridgeId !== manifest.id || plan.version !== manifest.version || String(plan.payloadDigest).toLowerCase() !== manifest.payloadDigest) {
    throw new Error('CARTRIDGE_INSTALL_PLAN_IDENTITY_MISMATCH');
  }
  if (!Array.isArray(plan.operations)) throw new Error('CARTRIDGE_INSTALL_PLAN_OPERATIONS_INVALID');
  const operations = plan.operations.map((operation) => normalizeOperation(operation, manifest, manifestForContract, capabilityBroker));
  const signatures = operations.map((operation) => JSON.stringify(operation));
  if (new Set(signatures).size !== signatures.length) throw new Error('CARTRIDGE_INSTALL_PLAN_DUPLICATE_OPERATION');
  return deepFreeze({
    schemaVersion: CARTRIDGE_INSTALL_PLAN_SCHEMA_VERSION,
    cartridgeId: manifest.id,
    version: manifest.version,
    payloadDigest: manifest.payloadDigest,
    operations,
  });
}

function undoFor(operation) {
  const kind = UNDO_KIND[operation.kind];
  if (!kind) throw new Error(`CARTRIDGE_INSTALL_UNDO_UNAVAILABLE:${operation.kind}`);
  if (kind === 'storage.deleteNamespace') return { kind, namespace: operation.namespace };
  if (kind === 'asset.release') return { kind, digest: operation.digest };
  if (kind === 'registry.remove') return { kind, registry: operation.registry, key: operation.key };
  if (kind === 'subscription.remove') return { kind, key: operation.key };
  throw new Error(`CARTRIDGE_INSTALL_UNDO_UNAVAILABLE:${operation.kind}`);
}

function sameIdentity(left, right) {
  return left.cartridgeId === right.cartridgeId && left.version === right.version && left.payloadDigest === right.payloadDigest;
}

function freezeErrorContext(context) {
  return deepFreeze(JSON.parse(JSON.stringify(context)));
}

export function buildCartridgeInstallPlan({ manifest: manifestInput, capabilityBroker, operations = [] } = {}) {
  const manifest = normalizeManifest(manifestInput);
  return normalizePlan({
    schemaVersion: CARTRIDGE_INSTALL_PLAN_SCHEMA_VERSION,
    cartridgeId: manifest.id,
    version: manifest.version,
    payloadDigest: manifest.payloadDigest,
    operations,
  }, manifest, capabilityBroker);
}

export function createCartridgeInstallExecutor({ capabilityBroker, adapters = {}, stateStore = new Map(), now = () => new Date().toISOString() } = {}) {
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) throw new TypeError('CARTRIDGE_INSTALL_ADAPTERS_INVALID');
  if (!stateStore || typeof stateStore.get !== 'function' || typeof stateStore.set !== 'function' || typeof stateStore.delete !== 'function') {
    throw new TypeError('CARTRIDGE_INSTALL_STATE_STORE_INVALID');
  }
  if (typeof now !== 'function') throw new TypeError('CARTRIDGE_INSTALL_CLOCK_INVALID');

  const invoke = async (kind, operation, manifestIdentity) => {
    const adapter = adapters[kind];
    if (typeof adapter !== 'function') throw new Error(`CARTRIDGE_INSTALL_ADAPTER_MISSING:${kind}`);
    return adapter(deepFreeze({ ...operation }), deepFreeze({ ...manifestIdentity }));
  };

  const rollback = async (undoOperations, identity) => {
    const errors = [];
    for (const operation of [...undoOperations].reverse()) {
      try { await invoke(operation.kind, operation, identity); }
      catch (error) { errors.push({ kind: operation.kind, message: String(error?.message || error) }); }
    }
    return errors;
  };

  return Object.freeze({
    async install({ manifest: manifestInput, plan: planInput } = {}) {
      const manifest = normalizeManifest(manifestInput);
      const plan = normalizePlan(planInput, manifest, capabilityBroker);
      const existing = stateStore.get(manifest.id);
      if (existing != null) {
        const existingPlan = buildUninstallPlan(existing);
        const identity = { cartridgeId: manifest.id, version: manifest.version, payloadDigest: manifest.payloadDigest };
        if (sameIdentity(existingPlan, identity)) return deepFreeze({ status: 'already_installed', receipt: existing });
        throw new Error('CARTRIDGE_INSTALL_IDENTITY_CONFLICT');
      }

      const identity = { cartridgeId: manifest.id, version: manifest.version, payloadDigest: manifest.payloadDigest };
      const undoOperations = plan.operations.map(undoFor);
      for (let index = 0; index < plan.operations.length; index += 1) {
        const installKind = plan.operations[index].kind;
        const undoKind = undoOperations[index].kind;
        if (typeof adapters[installKind] !== 'function') throw new Error(`CARTRIDGE_INSTALL_ADAPTER_MISSING:${installKind}`);
        if (typeof adapters[undoKind] !== 'function') throw new Error(`CARTRIDGE_INSTALL_ROLLBACK_ADAPTER_MISSING:${undoKind}`);
      }

      const installedAt = now();
      let receipt = createInstallReceipt({ cartridgeId: manifest.id, version: manifest.version, payloadDigest: manifest.payloadDigest, installedAt });
      const rollbackCandidates = [];
      try {
        for (let index = 0; index < plan.operations.length; index += 1) {
          const operation = plan.operations[index];
          const undo = undoOperations[index];
          rollbackCandidates.push(undo);
          await invoke(operation.kind, operation, identity);
          receipt = appendInstallUndo(receipt, undo);
        }
        const sealed = sealInstallReceipt(receipt);
        stateStore.set(manifest.id, sealed);
        return deepFreeze({ status: 'installed', receipt: sealed });
      } catch (error) {
        const rollbackErrors = await rollback(rollbackCandidates, identity);
        try { stateStore.delete(manifest.id); } catch (stateError) {
          rollbackErrors.push({ kind: 'state.delete', message: String(stateError?.message || stateError) });
        }
        const wrapped = new Error('CARTRIDGE_INSTALL_FAILED');
        wrapped.cause = error;
        wrapped.rollback = freezeErrorContext({ attempted: rollbackCandidates.length, errors: rollbackErrors });
        throw wrapped;
      }
    },

    async uninstall({ cartridgeId, manifest: manifestInput = null, receipt: witnessReceipt = null } = {}) {
      const id = token(cartridgeId, 'CARTRIDGE_UNINSTALL_ID', 96);
      const stored = stateStore.get(id);
      if (stored == null) return deepFreeze({ status: 'not_installed', cartridgeId: id });
      const plan = buildUninstallPlan(stored);
      if (plan.cartridgeId !== id) throw new Error('CARTRIDGE_UNINSTALL_STATE_IDENTITY_MISMATCH');
      if (manifestInput != null) {
        const manifest = normalizeManifest(manifestInput);
        if (!sameIdentity(plan, { cartridgeId: manifest.id, version: manifest.version, payloadDigest: manifest.payloadDigest })) {
          throw new Error('CARTRIDGE_UNINSTALL_EXPECTED_IDENTITY_MISMATCH');
        }
      }
      if (witnessReceipt != null) {
        const witnessPlan = buildUninstallPlan(witnessReceipt);
        if (JSON.stringify(witnessPlan) !== JSON.stringify(plan)) throw new Error('CARTRIDGE_UNINSTALL_RECEIPT_WITNESS_MISMATCH');
      }
      const identity = { cartridgeId: plan.cartridgeId, version: plan.version, payloadDigest: plan.payloadDigest };
      for (const operation of plan.operations) {
        if (!UNDO_ADAPTER_KINDS.has(operation.kind)) throw new Error(`CARTRIDGE_UNINSTALL_OPERATION_UNSUPPORTED:${operation.kind}`);
        if (typeof adapters[operation.kind] !== 'function') throw new Error(`CARTRIDGE_INSTALL_ADAPTER_MISSING:${operation.kind}`);
      }
      for (const operation of plan.operations) await invoke(operation.kind, operation, identity);
      stateStore.delete(id);
      return deepFreeze({ status: 'uninstalled', cartridgeId: id, operationCount: plan.operations.length });
    },

    snapshotInstalled() {
      const installed = [];
      if (typeof stateStore.entries !== 'function') throw new Error('CARTRIDGE_INSTALL_STATE_STORE_ENUMERATION_UNAVAILABLE');
      for (const [id, receipt] of stateStore.entries()) {
        const plan = buildUninstallPlan(receipt);
        installed.push({ cartridgeId: id, version: plan.version, payloadDigest: plan.payloadDigest, undoOperationCount: plan.operations.length });
      }
      return deepFreeze(installed.sort((a, b) => a.cartridgeId.localeCompare(b.cartridgeId)));
    },
  });
}

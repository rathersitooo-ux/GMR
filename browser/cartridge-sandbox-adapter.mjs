import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

export const CARTRIDGE_SANDBOX_SCHEMA_VERSION = 'gameroad.cartridge-sandbox.v1';
export const CARTRIDGE_SANDBOX_KIND = 'sandboxed-iframe';
export const CARTRIDGE_SANDBOX_ISOLATION = 'opaque-origin-sandboxed-iframe';
const SESSION_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DESCRIPTOR_BRAND = Symbol('gameroad.cartridge-sandbox.descriptor');

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

function normalizeSession(value) {
  if (typeof value !== 'string' || value !== value.trim() || !SESSION_RE.test(value)) throw new Error('CARTRIDGE_SANDBOX_SESSION_INVALID');
  return value;
}

export function createCartridgeSandboxDescriptor({ manifest: manifestInput, sessionId, runtimeKind = CARTRIDGE_SANDBOX_KIND } = {}) {
  const manifest = normalizeManifest(manifestInput);
  const normalizedSession = normalizeSession(sessionId);
  if (runtimeKind !== CARTRIDGE_SANDBOX_KIND) {
    if (runtimeKind === 'node-vm' || runtimeKind === 'same-realm') throw new Error('CARTRIDGE_SANDBOX_INSECURE_RUNTIME_FORBIDDEN');
    throw new Error('CARTRIDGE_SANDBOX_RUNTIME_UNSUPPORTED');
  }
  const descriptor = {
    schemaVersion: CARTRIDGE_SANDBOX_SCHEMA_VERSION,
    runtimeKind: CARTRIDGE_SANDBOX_KIND,
    isolationBoundary: CARTRIDGE_SANDBOX_ISOLATION,
    cartridgeId: manifest.id,
    version: manifest.version,
    payloadDigest: manifest.payloadDigest,
    entry: { ...manifest.entry },
    sessionId: normalizedSession,
    iframePolicy: {
      sandboxTokens: ['allow-scripts'],
      allowSameOrigin: false,
      allowTopNavigation: false,
      allowPopups: false,
      allowForms: false,
      allowModals: false,
      expectedMessageOrigin: 'null',
      outboundTargetOrigin: '*',
      outboundTargetOriginReason: 'opaque_origin_requires_exact_window_reference_plus_session_binding',
    },
    hostExposurePolicy: {
      injectHostGlobal: false,
      injectRawHostObjects: false,
      inProcessEval: false,
      nodeVmAllowed: false,
    },
  };
  Object.defineProperty(descriptor, DESCRIPTOR_BRAND, { value: true, enumerable: false, configurable: false });
  return deepFreeze(descriptor);
}

export function bindCartridgeSandboxRuntime({ descriptor, runtimeAdapter } = {}) {
  if (!descriptor || descriptor[DESCRIPTOR_BRAND] !== true) throw new Error('CARTRIDGE_SANDBOX_DESCRIPTOR_NOT_ISSUED');
  if (descriptor.schemaVersion !== CARTRIDGE_SANDBOX_SCHEMA_VERSION) throw new Error('CARTRIDGE_SANDBOX_DESCRIPTOR_INVALID');
  if (descriptor.runtimeKind !== CARTRIDGE_SANDBOX_KIND || descriptor.isolationBoundary !== CARTRIDGE_SANDBOX_ISOLATION) {
    throw new Error('CARTRIDGE_SANDBOX_DESCRIPTOR_ISOLATION_INVALID');
  }
  if (!runtimeAdapter || typeof runtimeAdapter !== 'object' || Array.isArray(runtimeAdapter)) throw new Error('CARTRIDGE_SANDBOX_ADAPTER_INVALID');
  const allowedFields = new Set(['runtimeKind','isolationBoundary','source','origin','postMessage','terminate']);
  const extras = Object.keys(runtimeAdapter).filter((key) => !allowedFields.has(key));
  if (extras.length) throw new Error(`CARTRIDGE_SANDBOX_ADAPTER_UNEXPECTED_FIELD:${extras.sort()[0]}`);
  if (runtimeAdapter.runtimeKind !== CARTRIDGE_SANDBOX_KIND || runtimeAdapter.isolationBoundary !== CARTRIDGE_SANDBOX_ISOLATION) {
    throw new Error('CARTRIDGE_SANDBOX_ADAPTER_ISOLATION_UNVERIFIED');
  }
  if ((typeof runtimeAdapter.source !== 'object' && typeof runtimeAdapter.source !== 'function') || runtimeAdapter.source == null) {
    throw new Error('CARTRIDGE_SANDBOX_ADAPTER_SOURCE_REQUIRED');
  }
  if (runtimeAdapter.origin !== 'null') throw new Error('CARTRIDGE_SANDBOX_ADAPTER_ORIGIN_NOT_OPAQUE');
  if (typeof runtimeAdapter.postMessage !== 'function' || typeof runtimeAdapter.terminate !== 'function') {
    throw new Error('CARTRIDGE_SANDBOX_ADAPTER_METHOD_REQUIRED');
  }

  let terminated = false;
  const source = runtimeAdapter.source;
  const postMessage = runtimeAdapter.postMessage.bind(runtimeAdapter);
  const terminate = runtimeAdapter.terminate.bind(runtimeAdapter);

  return Object.freeze({
    schemaVersion: CARTRIDGE_SANDBOX_SCHEMA_VERSION,
    cartridgeId: descriptor.cartridgeId,
    version: descriptor.version,
    payloadDigest: descriptor.payloadDigest,
    sessionId: descriptor.sessionId,
    expectedSource: source,
    expectedOrigin: 'null',
    send(envelope) {
      if (terminated) throw new Error('CARTRIDGE_SANDBOX_TERMINATED');
      postMessage(envelope, '*');
    },
    terminate() {
      if (terminated) return false;
      terminated = true;
      terminate();
      return true;
    },
    isTerminated() { return terminated; },
  });
}

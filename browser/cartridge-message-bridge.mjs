import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';

export const CARTRIDGE_MESSAGE_SCHEMA_VERSION = 'gameroad.cartridge-message.v1';
const ENVELOPE_FIELDS = new Set(['schemaVersion','sessionId','cartridgeId','version','payloadDigest','direction','type','messageId','sentAtMs','payload']);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const TYPE_RE = /^[a-z][a-z0-9._-]{1,63}$/;

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

function exactToken(value, name, regex = TOKEN_RE) {
  if (typeof value !== 'string' || value !== value.trim() || !regex.test(value)) throw new Error(`${name}_invalid`);
  return value;
}

function normalizeTypeSet(values, name) {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${name}_invalid`);
  const out = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !TYPE_RE.test(value)) throw new Error(`${name}_invalid_type:${String(value)}`);
    if (out.has(value)) throw new Error(`${name}_duplicate_type:${value}`);
    out.add(value);
  }
  return out;
}

function assertPlainJson(value, path = 'payload', seen = new WeakSet()) {
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

function clonePayload(value) {
  assertPlainJson(value);
  return JSON.parse(JSON.stringify(value));
}

function serializedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function normalizeOrigin(value) {
  if (value === 'null') return value;
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 2048) throw new Error('CARTRIDGE_BRIDGE_ORIGIN_INVALID');
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.origin !== value) throw new Error();
    return value;
  } catch {
    throw new Error('CARTRIDGE_BRIDGE_ORIGIN_INVALID');
  }
}

export function createCartridgeMessageBridge({
  manifest: manifestInput,
  sessionId,
  expectedSource,
  expectedOrigin,
  inboundTypes,
  outboundTypes,
  maxMessageBytes = 64 * 1024,
  maxAgeMs = 30_000,
  maxFutureSkewMs = 5_000,
  maxSeenMessageIds = 1024,
  now = () => Date.now(),
  messageIdFactory = () => globalThis.crypto?.randomUUID?.().replaceAll('-', '') || '',
} = {}) {
  const manifest = normalizeManifest(manifestInput);
  const normalizedSessionId = exactToken(sessionId, 'CARTRIDGE_BRIDGE_SESSION');
  if ((typeof expectedSource !== 'object' && typeof expectedSource !== 'function') || expectedSource == null) throw new Error('CARTRIDGE_BRIDGE_SOURCE_REQUIRED');
  const normalizedOrigin = normalizeOrigin(expectedOrigin);
  const inbound = normalizeTypeSet(inboundTypes, 'CARTRIDGE_BRIDGE_INBOUND_TYPES');
  const outbound = normalizeTypeSet(outboundTypes, 'CARTRIDGE_BRIDGE_OUTBOUND_TYPES');
  if (!Number.isSafeInteger(maxMessageBytes) || maxMessageBytes < 256 || maxMessageBytes > 1024 * 1024) throw new Error('CARTRIDGE_BRIDGE_MAX_BYTES_INVALID');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0 || !Number.isSafeInteger(maxFutureSkewMs) || maxFutureSkewMs < 0) throw new Error('CARTRIDGE_BRIDGE_TIME_POLICY_INVALID');
  if (!Number.isSafeInteger(maxSeenMessageIds) || maxSeenMessageIds < 1 || maxSeenMessageIds > 10_000) throw new Error('CARTRIDGE_BRIDGE_REPLAY_WINDOW_INVALID');
  if (typeof now !== 'function' || typeof messageIdFactory !== 'function') throw new TypeError('CARTRIDGE_BRIDGE_CLOCK_OR_ID_FACTORY_INVALID');

  const seen = new Map();

  const pruneExpiredSeen = (currentMs) => {
    const cutoff = currentMs - maxAgeMs;
    for (const [messageId, sentAtMs] of seen.entries()) {
      if (sentAtMs < cutoff) seen.delete(messageId);
    }
  };

  const normalizeEnvelope = (input, expectedDirection, allowedTypes, currentMs) => {
    assertPlainJson(input, 'message');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('CARTRIDGE_BRIDGE_MESSAGE_INVALID');
    const extras = Object.keys(input).filter((key) => !ENVELOPE_FIELDS.has(key));
    if (extras.length) throw new Error(`CARTRIDGE_BRIDGE_MESSAGE_UNEXPECTED_FIELD:${extras.sort()[0]}`);
    if (input.schemaVersion !== CARTRIDGE_MESSAGE_SCHEMA_VERSION) throw new Error('CARTRIDGE_BRIDGE_SCHEMA_MISMATCH');
    if (input.sessionId !== normalizedSessionId) throw new Error('CARTRIDGE_BRIDGE_SESSION_MISMATCH');
    if (input.cartridgeId !== manifest.id || input.version !== manifest.version || String(input.payloadDigest).toLowerCase() !== manifest.payloadDigest) {
      throw new Error('CARTRIDGE_BRIDGE_IDENTITY_MISMATCH');
    }
    if (input.direction !== expectedDirection) throw new Error('CARTRIDGE_BRIDGE_DIRECTION_MISMATCH');
    if (typeof input.type !== 'string' || !allowedTypes.has(input.type)) throw new Error('CARTRIDGE_BRIDGE_TYPE_DENIED');
    const messageId = exactToken(input.messageId, 'CARTRIDGE_BRIDGE_MESSAGE_ID');
    if (!Number.isSafeInteger(input.sentAtMs)) throw new Error('CARTRIDGE_BRIDGE_TIMESTAMP_INVALID');
    if (input.sentAtMs < currentMs - maxAgeMs) throw new Error('CARTRIDGE_BRIDGE_MESSAGE_STALE');
    if (input.sentAtMs > currentMs + maxFutureSkewMs) throw new Error('CARTRIDGE_BRIDGE_MESSAGE_FROM_FUTURE');
    const payload = clonePayload(input.payload);
    const envelope = {
      schemaVersion: CARTRIDGE_MESSAGE_SCHEMA_VERSION,
      sessionId: normalizedSessionId,
      cartridgeId: manifest.id,
      version: manifest.version,
      payloadDigest: manifest.payloadDigest,
      direction: expectedDirection,
      type: input.type,
      messageId,
      sentAtMs: input.sentAtMs,
      payload,
    };
    if (serializedBytes(envelope) > maxMessageBytes) throw new Error('CARTRIDGE_BRIDGE_MESSAGE_TOO_LARGE');
    return deepFreeze(envelope);
  };

  return Object.freeze({
    schemaVersion: CARTRIDGE_MESSAGE_SCHEMA_VERSION,
    acceptInboundEvent(event) {
      if (!event || event.source !== expectedSource) throw new Error('CARTRIDGE_BRIDGE_SOURCE_MISMATCH');
      if (event.origin !== normalizedOrigin) throw new Error('CARTRIDGE_BRIDGE_ORIGIN_MISMATCH');
      const currentMs = now();
      if (!Number.isSafeInteger(currentMs)) throw new Error('CARTRIDGE_BRIDGE_CLOCK_INVALID');
      const normalized = normalizeEnvelope(event.data, 'cartridge->host', inbound, currentMs);
      pruneExpiredSeen(currentMs);
      if (seen.has(normalized.messageId)) throw new Error('CARTRIDGE_BRIDGE_REPLAY_DETECTED');
      if (seen.size >= maxSeenMessageIds) throw new Error('CARTRIDGE_BRIDGE_REPLAY_WINDOW_EXHAUSTED');
      seen.set(normalized.messageId, normalized.sentAtMs);
      return normalized;
    },
    buildOutbound({ type, payload, messageId = null } = {}) {
      if (typeof type !== 'string' || !outbound.has(type)) throw new Error('CARTRIDGE_BRIDGE_TYPE_DENIED');
      const currentMs = now();
      if (!Number.isSafeInteger(currentMs)) throw new Error('CARTRIDGE_BRIDGE_CLOCK_INVALID');
      const resolvedMessageId = messageId == null ? messageIdFactory() : messageId;
      return normalizeEnvelope({
        schemaVersion: CARTRIDGE_MESSAGE_SCHEMA_VERSION,
        sessionId: normalizedSessionId,
        cartridgeId: manifest.id,
        version: manifest.version,
        payloadDigest: manifest.payloadDigest,
        direction: 'host->cartridge',
        type,
        messageId: resolvedMessageId,
        sentAtMs: currentMs,
        payload,
      }, 'host->cartridge', outbound, currentMs);
    },
    snapshot() {
      return deepFreeze({
        schemaVersion: CARTRIDGE_MESSAGE_SCHEMA_VERSION,
        cartridgeId: manifest.id,
        version: manifest.version,
        payloadDigest: manifest.payloadDigest,
        sessionId: normalizedSessionId,
        expectedOrigin: normalizedOrigin,
        inboundTypes: [...inbound].sort(),
        outboundTypes: [...outbound].sort(),
        maxMessageBytes,
        maxAgeMs,
        maxFutureSkewMs,
        replayWindow: maxSeenMessageIds,
      });
    },
  });
}
